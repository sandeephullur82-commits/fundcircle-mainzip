import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, getDoc, setDoc, query, where,
  getDocs, increment, Timestamp, orderBy, limit, runTransaction, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Collection, Loan, LoanInstallment, SavingsAccount, SavingsTransaction,
  Membership, AuditLog, AuditAction, AuditModule, AuditCategory, EMIPayment, Customer
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function membershipIdFor(organizationId: string, clerkUserId: string) {
  return `${organizationId}_${clerkUserId}`;
}

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

/** Generate account number: FC-{6-digit random} */
export function generateAccountNumber(): string {
  return "FC-" + Math.floor(100000 + Math.random() * 900000).toString();
}

/** Receipt number: FC-{ORGSLUG}-{YYYYMMDD}-{SEQ} */
async function generateReceiptNo(organizationId: string): Promise<string> {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const slug = organizationId.slice(-6).toUpperCase();
  // Use a daily counter stored in Firestore
  const counterRef = doc(db, "receiptCounters", `${organizationId}_${datePart}`);
  let seq = 1;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    if (snap.exists()) {
      seq = (snap.data().seq || 0) + 1;
    }
    tx.set(counterRef, { seq, organizationId, date: datePart }, { merge: true });
  });
  return `FC-${slug}-${datePart}-${seq.toString().padStart(4, "0")}`;
}

/** EMI formula: P × r × (1+r)^n / ((1+r)^n - 1) */
export function calculateEMI(principal: number, annualRatePercent: number, tenureMonths: number): number {
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

// ── Audit Logging ─────────────────────────────────────────────────────────────

export async function createAuditLog(params: {
  organizationId: string;
  actorId: string;
  actorRole: string;
  actorName?: string;
  action: AuditAction | string;
  module?: AuditModule;
  category?: AuditCategory;
  entityType: string;
  entityId: string;
  description?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  deviceInfo?: string;
  browserInfo?: string;
  platform?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, "audit_logs"), {
      organizationId:   params.organizationId,
      actorId:          params.actorId,
      actorRole:        params.actorRole,
      actorName:        params.actorName || "",
      action:           params.action,
      ...(params.module       ? { module:       params.module }       : {}),
      ...(params.category     ? { category:     params.category }     : {}),
      entityType:       params.entityType,
      entityId:         params.entityId,
      ...(params.description  ? { description:  params.description }  : {}),
      ...(params.oldValues    ? { oldValues:    params.oldValues }    : {}),
      ...(params.newValues    ? { newValues:    params.newValues }    : {}),
      metadata:         params.metadata || {},
      ...(params.deviceInfo   ? { deviceInfo:   params.deviceInfo }   : {}),
      ...(params.browserInfo  ? { browserInfo:  params.browserInfo }  : {}),
      ...(params.platform     ? { platform:     params.platform }     : {}),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("[AuditLog] Failed to write:", e);
  }
}

// ── Savings Accounts ──────────────────────────────────────────────────────────

export async function createSavingsAccountForCustomer(params: {
  customerId: string;
  organizationId: string;
  planType?: "DAILY" | "WEEKLY" | "MONTHLY";
  scheduledAmount?: number;
}): Promise<string> {
  const ref = doc(collection(db, "savings_accounts"));
  await setDoc(ref, {
    id: ref.id,
    customerId: params.customerId,
    organizationId: params.organizationId,
    planType: params.planType || "DAILY",
    scheduledAmount: params.scheduledAmount || 0,
    totalBalance: 0,
    startDate: serverTimestamp(),
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSavingsAccountByCustomer(customerId: string, organizationId: string): Promise<SavingsAccount | null> {
  const q = query(
    collection(db, "savings_accounts"),
    where("customerId", "==", customerId),
    where("organizationId", "==", organizationId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as SavingsAccount;
}

export async function updateSavingsAccountPlan(savingsAccountId: string, params: {
  planType: "DAILY" | "WEEKLY" | "MONTHLY";
  scheduledAmount: number;
}): Promise<void> {
  await updateDoc(doc(db, "savings_accounts", savingsAccountId), {
    planType: params.planType,
    scheduledAmount: params.scheduledAmount,
    updatedAt: serverTimestamp(),
  });
}

// ── General (Cash/UPI) Collection ─────────────────────────────────────────────

export interface GeneralCollectionResult {
  receiptNo: string;
  collectionId: string;
  organizationName: string;
}

/**
 * Record a general pigmy collection (cash/UPI) for any customer.
 * Does NOT require a savings account — writes only to the `collections` collection.
 */
export async function recordGeneralCollection(params: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  agentId: string;
  agentName: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  notes?: string;
  collectedByRole?: string;
  collectedById?: string;
}): Promise<GeneralCollectionResult> {
  if (!params.amount || params.amount <= 0) {
    throw new Error("Collection amount must be greater than zero.");
  }

  const receiptNo = await generateReceiptNo(params.organizationId);
  const _collectedByRole = params.collectedByRole || "AGENT";
  const _collectedById   = params.collectedById   || params.agentId;

  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _collectedById,
    customerId: params.customerId,
    collectionType: "GENERAL",
    amount: params.amount,
    paymentMode: params.paymentMode || "CASH",
    notes: params.notes || "",
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _collectedByRole,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _collectedById,
    actorRole: _collectedByRole,
    actorName: params.agentName,
    action: "GENERAL_COLLECTION_RECORDED",
    entityType: "Collection",
    entityId: collRef.id,
    metadata: { amount: params.amount, receiptNo, paymentMode: params.paymentMode || "CASH", customerId: params.customerId },
  });

  return { receiptNo, collectionId: collRef.id, organizationName: params.organizationName };
}

// ── Savings Collection (legacy — savings module removed from UI) ───────────────

export interface SavingsCollectionResult {
  receiptNo: string;
  newBalance: number;
  transactionId: string;
  collectionId: string;
  organizationName: string;
}

export async function recordSavingsCollection(params: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  agentId: string;
  agentName: string;
  amount: number;
  collectedByRole?: string;
  collectedById?: string;
}): Promise<SavingsCollectionResult> {
  if (!params.amount || params.amount <= 0) {
    throw new Error("Collection amount must be greater than zero.");
  }

  // Get savings account
  const savingsAccount = await getSavingsAccountByCustomer(params.customerId, params.organizationId);
  if (!savingsAccount) throw new Error("Savings account not found for this customer.");
  if (savingsAccount.status !== "ACTIVE") throw new Error("Savings account is not active.");

  const newBalance = savingsAccount.totalBalance + params.amount;
  const receiptNo = await generateReceiptNo(params.organizationId);

  // Create savings_transaction
  const txRef = doc(collection(db, "savings_transactions"));
  await setDoc(txRef, {
    id: txRef.id,
    savingsAccountId: savingsAccount.id,
    organizationId: params.organizationId,
    customerId: params.customerId,
    agentId: params.agentId,
    amount: params.amount,
    balanceAfter: newBalance,
    receiptNo,
    collectedByName: params.agentName,
    collectedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdBy: params.agentId,
    status: "COMPLETED",
  });

  // Update savings account balance
  await updateDoc(doc(db, "savings_accounts", savingsAccount.id), {
    totalBalance: newBalance,
    updatedAt: serverTimestamp(),
  });

  const _collectedByRole = params.collectedByRole || "AGENT";
  const _collectedById   = params.collectedById   || params.agentId;

  // Create master collections entry
  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _collectedById,
    customerId: params.customerId,
    collectionType: "SAVINGS",
    referenceId: txRef.id,
    amount: params.amount,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _collectedByRole,
    // Legacy compat
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
  });

  // Audit log
  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _collectedById,
    actorRole: _collectedByRole,
    actorName: params.agentName,
    action: "SAVINGS_COLLECTION_RECORDED",
    entityType: "SavingsTransaction",
    entityId: txRef.id,
    metadata: { amount: params.amount, receiptNo, newBalance, customerId: params.customerId },
  });

  return {
    receiptNo,
    newBalance,
    transactionId: txRef.id,
    collectionId: collRef.id,
    organizationName: params.organizationName,
  };
}

// ── Loan Management ───────────────────────────────────────────────────────────

export async function createLoan(params: {
  organizationId: string;
  customerId: string;
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  createdByActorId: string;
  createdByActorRole: string;
  createdByActorName: string;
  loanAssignedCollectorId?: string;
  loanAssignedCollectorName?: string;
  loanAssignedCollectorRole?: string;
  loanPurpose?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
}): Promise<string> {
  if (params.principalAmount <= 0) throw new Error("Principal must be greater than zero.");
  if (params.interestRate < 0) throw new Error("Interest rate cannot be negative.");
  if (params.tenureMonths <= 0) throw new Error("Tenure must be at least 1 month.");

  const emiAmount = calculateEMI(params.principalAmount, params.interestRate, params.tenureMonths);

  const loanRef = doc(collection(db, "loans"));
  await setDoc(loanRef, {
    id: loanRef.id,
    organizationId: params.organizationId,
    customerId: params.customerId,
    principalAmount: params.principalAmount,
    interestRate: params.interestRate,
    tenureMonths: params.tenureMonths,
    emiAmount: Math.round(emiAmount * 100) / 100,
    outstandingBalance: 0,
    disbursedAt: null,
    status: "PENDING",
    loanAssignedCollectorId: params.loanAssignedCollectorId || "",
    loanAssignedCollectorName: params.loanAssignedCollectorName || "",
    loanAssignedCollectorRole: params.loanAssignedCollectorRole || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Legacy compat
    principal: params.principalAmount,
    durationMonths: params.tenureMonths,
    balanceRemaining: 0,
    ...(params.loanPurpose ? { loanPurpose: params.loanPurpose } : {}),
    ...(params.nomineeName ? { nomineeName: params.nomineeName, nomineeRelation: params.nomineeRelation || "", nomineePhone: params.nomineePhone || "" } : {}),
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.createdByActorId,
    actorRole: params.createdByActorRole,
    actorName: params.createdByActorName,
    action: "LOAN_CREATED",
    entityType: "Loan",
    entityId: loanRef.id,
    metadata: {
      principalAmount: params.principalAmount,
      interestRate: params.interestRate,
      tenureMonths: params.tenureMonths,
      emiAmount: Math.round(emiAmount * 100) / 100,
      customerId: params.customerId,
    },
  });

  return loanRef.id;
}

export async function approveLoan(params: {
  loanId: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  approvedAmount?: number;
  firstEmiDate?: Date;
  disbursementDate?: Date;
  loanAccountNumber?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorRelation?: string;
  approvalChecklist?: string[];
  riskLevel?: string;
  approvalNotes?: string;
  disbursementMethod?: string;
  disbursementReference?: string;
  verificationStatus?: string;
  loanAssignedCollectorId?: string;
  loanAssignedCollectorName?: string;
  loanAssignedCollectorRole?: string;
}): Promise<void> {
  const loanRef = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;
  if (loan.status !== "PENDING") throw new Error("Only pending loans can be approved.");

  const requestedPrincipal = loan.principalAmount ?? loan.principal ?? 0;
  const effectivePrincipal = (params.approvedAmount && params.approvedAmount > 0)
    ? params.approvedAmount
    : requestedPrincipal;
  const rate = loan.interestRate ?? 2;
  const tenure = loan.tenureMonths ?? loan.durationMonths ?? 12;
  const emiAmount = calculateEMI(effectivePrincipal, rate, tenure);
  const totalInterest = emiAmount * tenure - effectivePrincipal;
  const outstandingBalance = Math.round((effectivePrincipal + totalInterest) * 100) / 100;

  const disbursedAt = params.disbursementDate
    ? Timestamp.fromDate(params.disbursementDate)
    : Timestamp.now();

  const firstEmiBase = params.firstEmiDate ?? (() => {
    const d = params.disbursementDate ? new Date(params.disbursementDate) : new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  })();

  const collectorUpdate: Record<string, any> = {};
  if (params.loanAssignedCollectorId !== undefined) {
    collectorUpdate.loanAssignedCollectorId = params.loanAssignedCollectorId;
    collectorUpdate.loanAssignedCollectorName = params.loanAssignedCollectorName || "";
    collectorUpdate.loanAssignedCollectorRole = params.loanAssignedCollectorRole || "";
  }

  const extraFields: Record<string, any> = {};
  if (params.approvedAmount) extraFields.approvedAmount = params.approvedAmount;
  if (params.loanAccountNumber) extraFields.loanAccountNumber = params.loanAccountNumber;
  if (params.disbursementDate) extraFields.disbursementDate = Timestamp.fromDate(params.disbursementDate);
  if (params.firstEmiDate) extraFields.firstEmiDate = Timestamp.fromDate(params.firstEmiDate);
  if (params.guarantorName) extraFields.guarantorName = params.guarantorName;
  if (params.guarantorPhone) extraFields.guarantorPhone = params.guarantorPhone;
  if (params.guarantorRelation) extraFields.guarantorRelation = params.guarantorRelation;
  if (params.approvalChecklist) extraFields.approvalChecklist = params.approvalChecklist;
  if (params.riskLevel) extraFields.riskLevel = params.riskLevel;
  if (params.approvalNotes !== undefined) extraFields.approvalNotes = params.approvalNotes;
  if (params.disbursementMethod) extraFields.disbursementMethod = params.disbursementMethod;
  if (params.disbursementReference !== undefined) extraFields.disbursementReference = params.disbursementReference;
  if (params.verificationStatus) extraFields.verificationStatus = params.verificationStatus;

  await updateDoc(loanRef, {
    status: "ACTIVE",
    emiAmount: Math.round(emiAmount * 100) / 100,
    outstandingBalance,
    disbursedAt,
    updatedAt: serverTimestamp(),
    balanceRemaining: outstandingBalance,
    approvedAt: serverTimestamp(),
    ...collectorUpdate,
    ...extraFields,
  });

  // Generate loan_installments starting from firstEmiBase
  const installmentPromises: Promise<any>[] = [];
  for (let i = 0; i < tenure; i++) {
    const dueDate = new Date(firstEmiBase);
    dueDate.setMonth(dueDate.getMonth() + i);
    const instRef = doc(collection(db, "loan_installments"));
    installmentPromises.push(
      setDoc(instRef, {
        id: instRef.id,
        loanId: params.loanId,
        organizationId: loan.organizationId,
        customerId: loan.customerId,
        installmentNo: i + 1,
        dueDate: Timestamp.fromDate(dueDate),
        emiAmount: Math.round(emiAmount * 100) / 100,
        paidAmount: 0,
        paidAt: null,
        status: "PENDING",
        receiptNo: null,
        collectedByAgentId: null,
        collectedByAgentName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.actorId,
      })
    );
  }
  await Promise.all(installmentPromises);

  await createAuditLog({
    organizationId: loan.organizationId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    actorName: params.actorName,
    action: "LOAN_APPROVED",
    entityType: "Loan",
    entityId: params.loanId,
    metadata: {
      requestedPrincipal,
      approvedAmount: effectivePrincipal,
      emiAmount: Math.round(emiAmount * 100) / 100,
      tenure,
      outstandingBalance,
      loanAccountNumber: params.loanAccountNumber || "",
      disbursementMethod: params.disbursementMethod || "CASH",
    },
  });

  // Write disbursement record
  try {
    const disbRef = doc(collection(db, "loan_disbursements"));
    await setDoc(disbRef, {
      id: disbRef.id,
      loanId: params.loanId,
      loanAccountNumber: params.loanAccountNumber || "",
      organizationId: loan.organizationId,
      customerId: loan.customerId,
      approvedAmount: effectivePrincipal,
      disbursementDate: disbursedAt,
      disbursementMethod: params.disbursementMethod || "CASH",
      disbursementReference: params.disbursementReference || "",
      recordedBy: params.actorId,
      recordedByName: params.actorName,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("[approveLoan] Failed to write disbursement record:", e);
  }

  // Sync nominee lock — loan is now ACTIVE, so lock the nominee
  try { await syncNomineeLock(loan.customerId, loan.organizationId); } catch (_) {}

  // Notify customer of loan approval
  try {
    await createNotification(
      loan.organizationId,
      loan.customerId,
      "Loan Approved",
      `Your loan of ₹${Math.round(effectivePrincipal).toLocaleString("en-IN")} has been approved and is now active.`,
      { type: "LOAN_APPROVED", category: "loans", metadata: { loanId: params.loanId, approvedAmount: effectivePrincipal } }
    );
  } catch (_) {}
}

export async function rejectLoan(params: {
  loanId: string;
  reason: string;
  actorId: string;
  actorRole: string;
  actorName: string;
}): Promise<void> {
  const loanRef = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;
  if (loan.status !== "PENDING") throw new Error("Only pending loans can be rejected.");

  await updateDoc(loanRef, {
    status: "REJECTED",
    rejectionReason: params.reason || "Rejected by owner",
    updatedAt: serverTimestamp(),
  });

  await createAuditLog({
    organizationId: loan.organizationId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    actorName: params.actorName,
    action: "LOAN_REJECTED",
    entityType: "Loan",
    entityId: params.loanId,
    metadata: { reason: params.reason, customerId: loan.customerId },
  });

  // Notify customer of rejection
  try {
    await createNotification(
      loan.organizationId,
      loan.customerId,
      "Loan Application Rejected",
      `Your loan application has been rejected. Reason: ${params.reason || "Not specified"}.`,
      { type: "LOAN_REJECTED", category: "loans", metadata: { loanId: params.loanId, reason: params.reason } }
    );
  } catch (_) {}
}

// ── Nominee Lock Sync ─────────────────────────────────────────────────────────

/**
 * Recalculates and syncs nomineeLocked / canApplyLoan / activeLoanCount
 * on the customer's organizationMembers (and customers) doc.
 * Called after loan approval and loan closure.
 */
export async function syncNomineeLock(customerId: string, organizationId: string): Promise<void> {
  const ACTIVE_STATUSES = ["ACTIVE", "OVERDUE", "PARTIALLY_PAID"];
  try {
    const loansSnap = await getDocs(
      query(
        collection(db, "loans"),
        where("customerId", "==", customerId),
        where("organizationId", "==", organizationId)
      )
    );
    const activeCount = loansSnap.docs.filter((d) =>
      ACTIVE_STATUSES.includes((d.data().status || "").toUpperCase())
    ).length;
    const locked = activeCount > 0;
    const update = {
      nomineeLocked: locked,
      activeLoanCount: activeCount,
      canApplyLoan: !locked,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, "organizationMembers", customerId), update);
    try { await updateDoc(doc(db, "customers", customerId), update); } catch (_) {}
  } catch (e) {
    console.error("[syncNomineeLock] Failed:", e);
  }
}

// ── EMI Collection ────────────────────────────────────────────────────────────

export interface EMICollectionResult {
  receiptNo: string;
  loanClosed: boolean;
  installmentId: string;
  collectionId: string;
}

// ── Installment Status Sync ───────────────────────────────────────────────────
/**
 * Syncs UPCOMING/DUE/OVERDUE statuses on all non-PAID/non-PARTIAL installments
 * for a given loan based on their dueDate relative to today.
 *   - dueDate < today (past)  → OVERDUE (was PENDING/DUE/UPCOMING)
 *   - dueDate === today       → DUE
 *   - dueDate > today (future)→ UPCOMING
 * Idempotent — safe to call anytime.
 */
export async function syncInstallmentStatuses(loanId: string): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(today);
    const tomorrowTs = Timestamp.fromDate(new Date(today.getTime() + 86_400_000));

    const snap = await getDocs(query(
      collection(db, "loan_installments"),
      where("loanId", "==", loanId)
    ));
    const updates: Promise<any>[] = [];
    for (const d of snap.docs) {
      const inst = d.data() as LoanInstallment;
      const st = (inst.status || "").toUpperCase();
      if (st === "PAID" || st === "PARTIAL") continue;

      const due = inst.dueDate;
      if (!due) continue;
      const dueSec = (due as any).seconds ?? 0;
      const todaySec   = todayTs.seconds;
      const tomorrowSec = tomorrowTs.seconds;

      let newStatus: LoanInstallment["status"];
      if (dueSec < todaySec) {
        newStatus = "OVERDUE";
      } else if (dueSec < tomorrowSec) {
        newStatus = "DUE";
      } else {
        newStatus = "UPCOMING";
      }
      if (newStatus !== st) {
        updates.push(updateDoc(d.ref, { status: newStatus, updatedAt: serverTimestamp() }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);
  } catch (e) {
    console.error("[syncInstallmentStatuses] Failed:", e);
  }
}

export async function recordEMICollection(params: {
  organizationId: string;
  organizationName: string;
  loanId: string;
  installmentId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  paymentReference?: string;
  collectedByRole?: string;
  collectedById?: string;
}): Promise<EMICollectionResult> {
  if (!params.amount || params.amount <= 0) throw new Error("EMI amount must be greater than zero.");

  const installmentRef = doc(db, "loan_installments", params.installmentId);
  const installmentSnap = await getDoc(installmentRef);
  if (!installmentSnap.exists()) throw new Error("Installment not found.");
  const installment = installmentSnap.data() as LoanInstallment;
  if (installment.status === "PAID") throw new Error("This installment has already been paid.");

  // Strict amount check: regular EMI must match scheduled emiAmount (±₹1 rounding tolerance)
  const emiAmt = installment.emiAmount ?? 0;
  if (emiAmt > 0 && Math.abs(params.amount - emiAmt) > 1) {
    throw new Error(
      `Regular EMI requires the exact EMI amount (₹${Math.round(emiAmt).toLocaleString("en-IN")}). ` +
      `Use Partial payment for a lesser amount or Advance for multiple EMIs.`
    );
  }

  const receiptNo = await generateReceiptNo(params.organizationId);
  const _emiCollectedByRole = params.collectedByRole || "AGENT";
  const _emiCollectedById   = params.collectedById   || params.agentId;

  // Mark installment as paid
  await updateDoc(installmentRef, {
    status: "PAID",
    paidAmount: params.amount,
    paidAt: serverTimestamp(),
    receiptNo,
    collectedByAgentId: _emiCollectedById,
    collectedByAgentName: params.agentName,
  });

  // Decrement outstanding balance on the loan
  const loanRef = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;
  const rawOutstanding = (loan.outstandingBalance ?? loan.balanceRemaining ?? 0) - params.amount;
  // Use a 5-paise (₹0.05) rounding tolerance so sub-cent floating-point residue
  // never prevents a fully-paid loan from closing automatically.
  const loanClosed = rawOutstanding <= 0.05;
  const newOutstanding = loanClosed ? 0 : Math.round(rawOutstanding * 100) / 100;

  await updateDoc(loanRef, {
    outstandingBalance: newOutstanding,
    balanceRemaining: newOutstanding,
    ...(loanClosed ? { status: "CLOSED" } : {}),
    updatedAt: serverTimestamp(),
  });

  // Create master collections entry
  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _emiCollectedById,
    customerId: params.customerId,
    collectionType: "LOAN_EMI",
    referenceId: params.installmentId,
    amount: params.amount,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _emiCollectedByRole,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
    paymentMode: params.paymentMode || "CASH",
    ...(params.paymentReference ? { paymentReference: params.paymentReference } : {}),
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _emiCollectedById,
    actorRole: _emiCollectedByRole,
    actorName: params.agentName,
    action: "EMI_COLLECTION_RECORDED",
    entityType: "LoanInstallment",
    entityId: params.installmentId,
    metadata: {
      amount: params.amount, receiptNo, loanId: params.loanId,
      newOutstanding, loanClosed, customerId: params.customerId,
    },
  });

  if (loanClosed) {
    await updateDoc(loanRef, { closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await createAuditLog({
      organizationId: params.organizationId,
      actorId: _emiCollectedById,
      actorRole: _emiCollectedByRole,
      actorName: params.agentName,
      action: "LOAN_CLOSED",
      entityType: "Loan",
      entityId: params.loanId,
      metadata: { customerId: params.customerId },
    });

    // Sync nominee lock — loan is now CLOSED, unlock if no other active loans
    try { await syncNomineeLock(params.customerId, params.organizationId); } catch (_) {}
  }

  // Sync installment statuses after payment
  try { await syncInstallmentStatuses(params.loanId); } catch (_) {}

  // Notify customer of EMI receipt
  try {
    await createNotification(
      params.organizationId,
      params.customerId,
      loanClosed ? "Loan Fully Repaid!" : "EMI Payment Received",
      loanClosed
        ? `Congratulations! Your loan is fully repaid. Final EMI of ₹${params.amount.toLocaleString("en-IN")} received. Receipt: ${receiptNo}.`
        : `EMI payment of ₹${params.amount.toLocaleString("en-IN")} received. Receipt: ${receiptNo}.`,
      { type: loanClosed ? "LOAN_CLOSED" : "EMI_COLLECTED", category: "loans", metadata: { loanId: params.loanId, amount: params.amount, receiptNo, loanClosed } }
    );
  } catch (_) {}

  return { receiptNo, loanClosed, installmentId: params.installmentId, collectionId: collRef.id };
}

// ── Partial Payment ───────────────────────────────────────────────────────────

export interface PartialPaymentResult {
  receiptNo: string;
  loanClosed: boolean;
  installmentId: string;
  collectionId: string;
  remainingAmount: number;
}

export async function recordPartialPayment(params: {
  organizationId: string;
  organizationName: string;
  loanId: string;
  installmentId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  collectedByRole?: string;
  collectedById?: string;
}): Promise<PartialPaymentResult> {
  if (!params.amount || params.amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const installmentRef = doc(db, "loan_installments", params.installmentId);
  const installmentSnap = await getDoc(installmentRef);
  if (!installmentSnap.exists()) throw new Error("Installment not found.");
  const installment = installmentSnap.data() as LoanInstallment;
  if (installment.status === "PAID") throw new Error("This installment has already been paid.");

  const loanRef = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;

  const outstanding = loan.outstandingBalance ?? loan.balanceRemaining ?? 0;
  if (params.amount > outstanding + 0.05) {
    throw new Error(`Collection exceeds outstanding balance of ₹${outstanding.toLocaleString("en-IN")}.`);
  }

  const alreadyPaid = installment.paidAmount || 0;
  const totalPaid   = alreadyPaid + params.amount;
  const remaining   = Math.max(0, (installment.emiAmount ?? 0) - totalPaid);
  const instClosed  = remaining <= 0.05;

  const receiptNo = await generateReceiptNo(params.organizationId);
  const _role = params.collectedByRole || "AGENT";
  const _id   = params.collectedById   || params.agentId;

  await updateDoc(installmentRef, {
    status: instClosed ? "PAID" : "PARTIAL",
    paidAmount: Math.round(totalPaid * 100) / 100,
    remainingAmount: instClosed ? 0 : Math.round(remaining * 100) / 100,
    paidAt: instClosed ? serverTimestamp() : null,
    receiptNo,
    collectedByAgentId: _id,
    collectedByAgentName: params.agentName,
    updatedAt: serverTimestamp(),
  });

  const rawOutstanding = outstanding - params.amount;
  const loanClosed     = rawOutstanding <= 0.05;
  const newOutstanding = loanClosed ? 0 : Math.round(rawOutstanding * 100) / 100;

  await updateDoc(loanRef, {
    outstandingBalance: newOutstanding,
    balanceRemaining: newOutstanding,
    ...(loanClosed ? { status: "CLOSED", closedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });

  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _id,
    customerId: params.customerId,
    collectionType: "LOAN_EMI",
    repaymentType: "PARTIAL",
    referenceId: params.installmentId,
    loanId: params.loanId,
    amount: params.amount,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _role,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
    paymentMode: params.paymentMode || "CASH",
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _id,
    actorRole: _role,
    actorName: params.agentName,
    action: "PARTIAL_PAYMENT_RECORDED",
    entityType: "LoanInstallment",
    entityId: params.installmentId,
    metadata: { amount: params.amount, receiptNo, loanId: params.loanId, remaining, newOutstanding, loanClosed },
  });

  if (loanClosed) {
    await createAuditLog({
      organizationId: params.organizationId, actorId: _id, actorRole: _role, actorName: params.agentName,
      action: "LOAN_CLOSED", entityType: "Loan", entityId: params.loanId,
      metadata: { customerId: params.customerId, via: "partial_payment" },
    });
    try { await syncNomineeLock(params.customerId, params.organizationId); } catch (_) {}
  }

  // Sync installment statuses after payment
  try { await syncInstallmentStatuses(params.loanId); } catch (_) {}

  return { receiptNo, loanClosed, installmentId: params.installmentId, collectionId: collRef.id, remainingAmount: remaining };
}

// ── Advance Payment ───────────────────────────────────────────────────────────

export interface AdvancePaymentResult {
  receiptNo: string;
  loanClosed: boolean;
  emisCleared: number;
  collectionId: string;
}

export async function recordAdvancePayment(params: {
  organizationId: string;
  organizationName: string;
  loanId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  collectedByRole?: string;
  collectedById?: string;
}): Promise<AdvancePaymentResult> {
  if (!params.amount || params.amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const loanRef  = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;

  const outstanding = loan.outstandingBalance ?? loan.balanceRemaining ?? 0;
  if (params.amount > outstanding + 0.05) {
    throw new Error(`Collection exceeds outstanding balance of ₹${outstanding.toLocaleString("en-IN")}.`);
  }

  // Fetch all unpaid installments sorted by installmentNo
  const instSnap = await getDocs(query(
    collection(db, "loan_installments"),
    where("loanId", "==", params.loanId)
  ));
  const unpaid = instSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as LoanInstallment) }))
    .filter((i) => (i.status || "").toUpperCase() !== "PAID")
    .sort((a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));

  if (unpaid.length === 0) throw new Error("No pending installments found.");

  const receiptNo = await generateReceiptNo(params.organizationId);
  const _role = params.collectedByRole || "AGENT";
  const _id   = params.collectedById   || params.agentId;

  let remaining = params.amount;
  let emisCleared = 0;
  const updatePromises: Promise<any>[] = [];

  for (const inst of unpaid) {
    if (remaining <= 0.05) break;
    const emiAmt = inst.emiAmount ?? 0;
    const alreadyPaid = inst.paidAmount || 0;
    const stillOwed = emiAmt - alreadyPaid;

    if (remaining >= stillOwed - 0.05) {
      // Fully pay this installment
      updatePromises.push(updateDoc(doc(db, "loan_installments", inst.id), {
        status: "PAID",
        paidAmount: Math.round((alreadyPaid + stillOwed) * 100) / 100,
        remainingAmount: 0,
        paidAt: serverTimestamp(),
        receiptNo,
        collectedByAgentId: _id,
        collectedByAgentName: params.agentName,
        updatedAt: serverTimestamp(),
      }));
      remaining -= stillOwed;
      emisCleared++;
    } else {
      // Partial on last installment
      const newPaid = alreadyPaid + remaining;
      updatePromises.push(updateDoc(doc(db, "loan_installments", inst.id), {
        status: "PARTIAL",
        paidAmount: Math.round(newPaid * 100) / 100,
        remainingAmount: Math.round((emiAmt - newPaid) * 100) / 100,
        receiptNo,
        collectedByAgentId: _id,
        collectedByAgentName: params.agentName,
        updatedAt: serverTimestamp(),
      }));
      remaining = 0;
      break;
    }
  }

  await Promise.all(updatePromises);

  const rawOutstanding = outstanding - params.amount;
  const loanClosed     = rawOutstanding <= 0.05;
  const newOutstanding = loanClosed ? 0 : Math.round(rawOutstanding * 100) / 100;

  await updateDoc(loanRef, {
    outstandingBalance: newOutstanding,
    balanceRemaining: newOutstanding,
    ...(loanClosed ? { status: "CLOSED", closedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });

  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _id,
    customerId: params.customerId,
    collectionType: "LOAN_EMI",
    repaymentType: "ADVANCE",
    loanId: params.loanId,
    amount: params.amount,
    emisCleared,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _role,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
    paymentMode: params.paymentMode || "CASH",
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _id, actorRole: _role, actorName: params.agentName,
    action: "ADVANCE_PAYMENT_RECORDED",
    entityType: "Loan", entityId: params.loanId,
    metadata: { amount: params.amount, receiptNo, emisCleared, newOutstanding, loanClosed, customerId: params.customerId },
  });

  if (loanClosed) {
    await createAuditLog({
      organizationId: params.organizationId, actorId: _id, actorRole: _role, actorName: params.agentName,
      action: "LOAN_CLOSED", entityType: "Loan", entityId: params.loanId,
      metadata: { customerId: params.customerId, via: "advance_payment" },
    });
    try { await syncNomineeLock(params.customerId, params.organizationId); } catch (_) {}
  }

  // Sync installment statuses after payment
  try { await syncInstallmentStatuses(params.loanId); } catch (_) {}

  return { receiptNo, loanClosed, emisCleared, collectionId: collRef.id };
}

// ── Foreclosure ───────────────────────────────────────────────────────────────

export interface ForeclosureResult {
  receiptNo: string;
  amountPaid: number;
  collectionId: string;
}

export async function recordForeclosure(params: {
  organizationId: string;
  organizationName: string;
  loanId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  collectedByRole?: string;
  collectedById?: string;
}): Promise<ForeclosureResult> {
  const loanRef  = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;
  if ((loan.status || "").toUpperCase() !== "ACTIVE") throw new Error("Only active loans can be foreclosed.");

  const outstanding = loan.outstandingBalance ?? loan.balanceRemaining ?? 0;
  if (outstanding <= 0) throw new Error("This loan has no outstanding balance.");

  // Mark all unpaid installments as PAID
  const instSnap = await getDocs(query(
    collection(db, "loan_installments"),
    where("loanId", "==", params.loanId)
  ));

  const receiptNo = await generateReceiptNo(params.organizationId);
  const _role = params.collectedByRole || "AGENT";
  const _id   = params.collectedById   || params.agentId;

  const updatePromises: Promise<any>[] = [];
  for (const d of instSnap.docs) {
    const inst = d.data() as LoanInstallment;
    if ((inst.status || "").toUpperCase() !== "PAID") {
      updatePromises.push(updateDoc(d.ref, {
        status: "PAID",
        paidAmount: inst.emiAmount ?? 0,
        remainingAmount: 0,
        paidAt: serverTimestamp(),
        receiptNo,
        collectedByAgentId: _id,
        collectedByAgentName: params.agentName,
        updatedAt: serverTimestamp(),
      }));
    }
  }
  await Promise.all(updatePromises);

  // Close the loan
  await updateDoc(loanRef, {
    outstandingBalance: 0,
    balanceRemaining: 0,
    status: "CLOSED",
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Collection record
  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _id,
    customerId: params.customerId,
    collectionType: "LOAN_EMI",
    repaymentType: "FORECLOSURE",
    loanId: params.loanId,
    amount: outstanding,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _role,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
    paymentMode: params.paymentMode || "CASH",
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _id, actorRole: _role, actorName: params.agentName,
    action: "FORECLOSURE_RECORDED",
    entityType: "Loan", entityId: params.loanId,
    metadata: { amountPaid: outstanding, receiptNo, customerId: params.customerId },
  });

  await createAuditLog({
    organizationId: params.organizationId, actorId: _id, actorRole: _role, actorName: params.agentName,
    action: "LOAN_CLOSED", entityType: "Loan", entityId: params.loanId,
    metadata: { customerId: params.customerId, via: "foreclosure" },
  });

  try { await syncNomineeLock(params.customerId, params.organizationId); } catch (_) {}

  // Notify org — loan foreclosed and closed
  try {
    await createNotification(
      params.organizationId,
      params.agentId,
      "Loan Foreclosed & Closed",
      `Loan fully settled via foreclosure. ₹${outstanding.toLocaleString("en-IN")} collected · Receipt ${receiptNo}`,
      { type: "LOAN_FORECLOSED", category: "loans", actorName: params.agentName, metadata: { loanId: params.loanId, customerId: params.customerId, amountPaid: outstanding, receiptNo } }
    );
  } catch (_) {}

  // Sync installment statuses after foreclosure (all should be PAID already)
  try { await syncInstallmentStatuses(params.loanId); } catch (_) {}

  return { receiptNo, amountPaid: outstanding, collectionId: collRef.id };
}

// ── Loan / Installment Helpers ────────────────────────────────────────────────

export async function getActiveLoanForCustomer(customerId: string, organizationId: string): Promise<Loan | null> {
  const q = query(
    collection(db, "loans"),
    where("customerId", "==", customerId),
    where("organizationId", "==", organizationId)
  );
  const snap = await getDocs(q);
  const ACTIVE = ["ACTIVE", "OVERDUE", "PARTIALLY_PAID"];
  const active = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Loan)
    .filter((l) => ACTIVE.includes((l.status || "").toUpperCase()));
  return active[0] || null;
}

export async function getNextPendingInstallment(loanId: string): Promise<LoanInstallment | null> {
  const q = query(collection(db, "loan_installments"), where("loanId", "==", loanId));
  const snap = await getDocs(q);
  const pending = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as LoanInstallment)
    .filter((i) => (i.status || "").toUpperCase() !== "PAID")
    .sort((a, b) => (a.installmentNo || 0) - (b.installmentNo || 0));
  return pending[0] || null;
}

// ── Combined Collection (SAVINGS + EMI in one receipt) ────────────────────────

export interface CombinedCollectionResult {
  receiptNo: string;
  savingsBalance: number;
  loanOutstanding: number;
  loanClosed: boolean;
  collectionId: string;
}

export async function recordCombinedCollection(params: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  agentId: string;
  agentName: string;
  savingsAmount: number;
  loanId: string;
  installmentId: string;
  emiAmount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  paymentReference?: string;
  collectedByRole?: string;
  collectedById?: string;
}): Promise<CombinedCollectionResult> {
  if (params.savingsAmount <= 0) throw new Error("Savings amount must be greater than zero.");
  if (params.emiAmount <= 0)     throw new Error("EMI amount must be greater than zero.");

  // Validate savings account
  const savingsAccount = await getSavingsAccountByCustomer(params.customerId, params.organizationId);
  if (!savingsAccount) throw new Error("Savings account not found for this customer.");
  if (savingsAccount.status !== "ACTIVE") throw new Error("Savings account is not active.");

  // Validate installment
  const installmentRef = doc(db, "loan_installments", params.installmentId);
  const installmentSnap = await getDoc(installmentRef);
  if (!installmentSnap.exists()) throw new Error("Installment not found.");
  const installment = installmentSnap.data() as LoanInstallment;
  if (installment.status === "PAID") throw new Error("This installment has already been paid.");

  // Validate loan
  const loanRef = doc(db, "loans", params.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found.");
  const loan = loanSnap.data() as Loan;

  // Generate ONE receipt for both
  const receiptNo = await generateReceiptNo(params.organizationId);

  const newSavingsBalance = savingsAccount.totalBalance + params.savingsAmount;
  const rawOutstanding    = (loan.outstandingBalance ?? loan.balanceRemaining ?? 0) - params.emiAmount;
  const loanClosed        = rawOutstanding <= 0.05;
  const newOutstanding    = loanClosed ? 0 : Math.round(rawOutstanding * 100) / 100;
  const totalAmount       = params.savingsAmount + params.emiAmount;

  const _combCollectedByRole = params.collectedByRole || "AGENT";
  const _combCollectedById   = params.collectedById   || params.agentId;

  // ── Write savings transaction ─────────────────────────────────────────────
  const txRef = doc(collection(db, "savings_transactions"));
  await setDoc(txRef, {
    id: txRef.id,
    savingsAccountId: savingsAccount.id,
    organizationId: params.organizationId,
    customerId: params.customerId,
    agentId: params.agentId,
    collectedById: _combCollectedById,
    amount: params.savingsAmount,
    balanceAfter: newSavingsBalance,
    receiptNo,
    collectedByName: params.agentName,
    collectedByRole: _combCollectedByRole,
    collectedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdBy: _combCollectedById,
    status: "COMPLETED",
    linkedCollectionType: "BOTH",
  });

  // ── Update savings account balance ────────────────────────────────────────
  await updateDoc(doc(db, "savings_accounts", savingsAccount.id), {
    totalBalance: newSavingsBalance,
    updatedAt: serverTimestamp(),
  });

  // ── Mark installment PAID ─────────────────────────────────────────────────
  await updateDoc(installmentRef, {
    status: "PAID",
    paidAmount: params.emiAmount,
    paidAt: serverTimestamp(),
    receiptNo,
    collectedByAgentId: _combCollectedById,
    collectedByAgentName: params.agentName,
  });

  // ── Update loan outstanding ───────────────────────────────────────────────
  await updateDoc(loanRef, {
    outstandingBalance: newOutstanding,
    balanceRemaining: newOutstanding,
    ...(loanClosed ? { status: "CLOSED" } : {}),
    updatedAt: serverTimestamp(),
  });

  // ── One combined collection entry ─────────────────────────────────────────
  const collRef = doc(collection(db, "collections"));
  await setDoc(collRef, {
    id: collRef.id,
    organizationId: params.organizationId,
    agentId: params.agentId,
    collectedById: _combCollectedById,
    customerId: params.customerId,
    collectionType: "BOTH",
    referenceId: txRef.id,
    amount: totalAmount,
    savingsAmount: params.savingsAmount,
    loanAmount: params.emiAmount,
    receiptNo,
    collectedAt: serverTimestamp(),
    collectedByName: params.agentName,
    collectedByRole: _combCollectedByRole,
    timestamp: serverTimestamp(),
    status: "completed",
    assigned_to_user_id: params.agentId,
    paymentMode: params.paymentMode || "CASH",
    ...(params.paymentReference ? { paymentReference: params.paymentReference } : {}),
  });

  // ── Audit log ─────────────────────────────────────────────────────────────
  await createAuditLog({
    organizationId: params.organizationId,
    actorId: _combCollectedById,
    actorRole: _combCollectedByRole,
    actorName: params.agentName,
    action: "COMBINED_COLLECTION_RECORDED",
    module: "COLLECTIONS",
    category: "CREATE",
    entityType: "Collection",
    entityId: collRef.id,
    metadata: {
      receiptNo, totalAmount,
      savingsAmount: params.savingsAmount,
      emiAmount: params.emiAmount,
      newSavingsBalance, newOutstanding,
      loanClosed, customerId: params.customerId,
      loanId: params.loanId,
    },
  });

  if (loanClosed) {
    await createAuditLog({
      organizationId: params.organizationId,
      actorId: _combCollectedById,
      actorRole: _combCollectedByRole,
      actorName: params.agentName,
      action: "LOAN_CLOSED",
      entityType: "Loan",
      entityId: params.loanId,
      metadata: { customerId: params.customerId, via: "combined_collection" },
    });
    try { await syncNomineeLock(params.customerId, params.organizationId); } catch (_) {}
  }

  return { receiptNo, savingsBalance: newSavingsBalance, loanOutstanding: newOutstanding, loanClosed, collectionId: collRef.id };
}

// ── Provisioning (existing, kept) ─────────────────────────────────────────────

// ── Direct Member Creation (no invitations) ───────────────────────────────────

export async function createDirectMember(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "AGENT" | "CUSTOMER";
  organizationId: string;
  organizationName: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedCollectorRole?: string;
  address?: string;
  notes?: string;
  employeeCode?: string;
  customerType?: "SAVINGS" | "LOAN" | "SAVINGS_LOAN";
  createdBy: string;
  actorName?: string;
  authToken?: string;
}): Promise<{ clerkUserId: string; generatedPassword: string; employeeCode?: string }> {
  const emailKey = params.email.trim().toLowerCase();
  const endpoint = params.role === "AGENT" ? "/api/create-agent" : "/api/create-customer";

  const payload = {
    firstName:            params.firstName.trim(),
    lastName:             params.lastName.trim(),
    email:                emailKey,
    phone:                params.phone?.trim() || "",
    organizationId:       params.organizationId,
    organizationName:     params.organizationName || "",
    createdBy:            params.createdBy,
    actorName:            params.actorName || "",
    assignedAgentId:      params.assignedAgentId || "",
    assignedAgentName:    params.assignedAgentName || "",
    assignedCollectorRole: params.assignedCollectorRole || "",
    customerType:         params.role === "CUSTOMER" ? (params.customerType || "SAVINGS_LOAN") : undefined,
    address:              params.address?.trim() || "",
    notes:                params.notes?.trim() || "",
    employeeCode:         params.employeeCode?.trim() || "",
  };

  console.log("[FC createDirectMember] ▶ Starting member creation");
  console.log("[FC createDirectMember]   Org ID  :", params.organizationId);
  console.log("[FC createDirectMember]   User ID :", params.createdBy);
  console.log("[FC createDirectMember]   Role    :", params.role);
  console.log("[FC createDirectMember]   Endpoint:", endpoint);
  console.log("[FC createDirectMember]   Payload :", JSON.stringify(payload));

  if (!params.organizationId) {
    throw new Error("No active organization selected. Please refresh and try again.");
  }
  if (!params.createdBy) {
    throw new Error("User identity not found. Please sign in again.");
  }
  if (!params.authToken) {
    throw new Error("Authentication token missing. Please sign in again.");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${params.authToken}`,
    },
    body: JSON.stringify(payload),
  });

  console.log("[FC createDirectMember]   HTTP status:", res.status, res.statusText);

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let errorMsg: string;
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => ({}));
      errorMsg = body.error || `Failed to create ${params.role.toLowerCase()} (HTTP ${res.status})`;
    } else {
      // Non-JSON response (HTML error page from proxy/server crash)
      const text = await res.text().catch(() => "");
      console.error("[FC createDirectMember] Non-JSON response body:", text.slice(0, 200));
      if (res.status === 404) {
        errorMsg = "API server unreachable. Please wait a moment and try again.";
      } else if (res.status === 502 || res.status === 503) {
        errorMsg = "Service temporarily unavailable. Please try again.";
      } else {
        errorMsg = `Failed to create ${params.role.toLowerCase()} (HTTP ${res.status})`;
      }
    }
    console.error("[FC createDirectMember] ✗ Error:", errorMsg);
    throw new Error(errorMsg);
  }

  const { userId: clerkUserId, generatedPassword, employeeCode } = await res.json();
  console.log("[FC createDirectMember] ✓ Server completed all writes. Clerk user:", clerkUserId);
  return { clerkUserId, generatedPassword, employeeCode };
}

export async function provisionUser(params: {
  firstName: string;
  lastName: string;
  email: string;
  role: "AGENT" | "CUSTOMER";
  organizationId: string;
  organizationName: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdBy: string;
  actorName?: string;
  phone?: string;
}): Promise<{ clerkUserId: string; setupUrl: string }> {
  const emailKey = params.email.trim().toLowerCase();

  const res = await fetch("/api/provision-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      email: emailKey,
      organizationId: params.organizationId,
      role: params.role,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Provisioning failed (HTTP ${res.status})`);
  }

  const { userId: clerkUserId, setupUrl } = await res.json();
  const membershipDocId = membershipIdFor(params.organizationId, clerkUserId);
  const fullName = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();

  const membershipData: any = {
    id: membershipDocId,
    clerkUserId,
    email: emailKey,
    fullName,
    name: fullName,
    firstName: params.firstName.trim(),
    lastName: params.lastName.trim(),
    role: params.role,
    clerkRole: params.role === "AGENT" ? "org:pigmy_collector" : "org:customer",
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    phone: params.phone?.trim() || "",
    address: "",
    assignedArea: "",
    assignedAgentId: params.assignedAgentId || "",
    assignedAgentName: params.assignedAgentName || "",
    profileCompleted: false,
    status: "PENDING_SETUP",
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "organizationMembers", membershipDocId), membershipData);

  if (params.role === "CUSTOMER") {
    // Create customer doc
    const accountNumber = generateAccountNumber();
    await setDoc(doc(db, "customers", membershipDocId), {
      ...membershipData,
      accountNumber,
      agentId: params.assignedAgentId || params.createdBy || "",
      assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
    });
    // Create savings account
    await createSavingsAccountForCustomer({
      customerId: membershipDocId,
      organizationId: params.organizationId,
    });
    try {
      await setDoc(doc(db, "organizations", params.organizationId), {
        "usage.activeCustomers": increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (_) {}
  }

  await setDoc(doc(db, "users", clerkUserId), {
    clerkUserId, id: clerkUserId,
    email: emailKey, name: fullName,
    status: "PENDING_SETUP",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.createdBy,
    actorRole: "OWNER",
    actorName: params.actorName || "",
    action: params.role === "AGENT" ? "AGENT_CREATED" : "CUSTOMER_CREATED",
    entityType: params.role === "AGENT" ? "Agent" : "Customer",
    entityId: membershipDocId,
    metadata: { email: emailKey, fullName, role: params.role },
  });

  return { clerkUserId, setupUrl };
}

export async function addMember(params: {
  fullName: string;
  email: string;
  phone: string;
  role: "AGENT" | "CUSTOMER";
  organizationId: string;
  organizationName: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  inviterUserId?: string;
  createdBy: string;
  actorName?: string;
}): Promise<{ isExistingUser: boolean; userId?: string }> {
  const emailKey = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();

  const res = await fetch("/api/add-member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailKey,
      organizationId: params.organizationId,
      role: params.role,
      inviterUserId: params.inviterUserId,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to add member (HTTP ${res.status})`);
  }

  const { userId, isExistingUser } = await res.json();

  if (isExistingUser && userId) {
    const membershipDocId = membershipIdFor(params.organizationId, userId);
    const nameParts = fullName.split(" ");
    const membershipData: any = {
      id: membershipDocId,
      clerkUserId: userId,
      email: emailKey,
      fullName,
      name: fullName,
      firstName: nameParts[0] || fullName,
      lastName: nameParts.slice(1).join(" ") || "",
      phone: params.phone?.trim() || "",
      role: params.role,
      clerkRole: params.role === "AGENT" ? "org:pigmy_collector" : "org:customer",
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      address: "",
      assignedArea: "",
      assignedAgentId: params.assignedAgentId || "",
      assignedAgentName: params.assignedAgentName || "",
      profileCompleted: false,
      status: "ACTIVE",
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "organizationMembers", membershipDocId), membershipData, { merge: true });
    await setDoc(doc(db, "memberships", membershipDocId), membershipData, { merge: true });

    if (params.role === "CUSTOMER") {
      const accountNumber = generateAccountNumber();
      await setDoc(doc(db, "customers", membershipDocId), {
        ...membershipData,
        accountNumber,
        agentId: params.assignedAgentId || params.createdBy || "",
        assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
      }, { merge: true });
      // Create savings account if none exists
      const existing = await getSavingsAccountByCustomer(membershipDocId, params.organizationId);
      if (!existing) {
        await createSavingsAccountForCustomer({ customerId: membershipDocId, organizationId: params.organizationId });
      }
      try {
        await setDoc(doc(db, "organizations", params.organizationId), {
          "usage.activeCustomers": increment(1),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (_) {}
    }

    await setDoc(doc(db, "users", userId), {
      clerkUserId: userId, id: userId,
      email: emailKey, name: fullName,
      status: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await createAuditLog({
      organizationId: params.organizationId,
      actorId: params.createdBy,
      actorRole: "OWNER",
      actorName: params.actorName || "",
      action: params.role === "AGENT" ? "AGENT_CREATED" : "CUSTOMER_CREATED",
      entityType: params.role === "AGENT" ? "Agent" : "Customer",
      entityId: membershipDocId,
      metadata: { email: emailKey, fullName, isExistingUser: true },
    });
  } else {
    // Invited new user
    const safeEmail = emailKey.replace(/[^a-z0-9]/g, "_");
    const membershipDocId = `${params.organizationId}_pending_${safeEmail}`;
    const nameParts = fullName.split(" ");
    const membershipData: any = {
      id: membershipDocId,
      clerkUserId: null,
      email: emailKey,
      fullName,
      name: fullName,
      firstName: nameParts[0] || fullName,
      lastName: nameParts.slice(1).join(" ") || "",
      phone: params.phone?.trim() || "",
      role: params.role,
      clerkRole: params.role === "AGENT" ? "org:pigmy_collector" : "org:customer",
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      address: "",
      assignedArea: "",
      assignedAgentId: params.assignedAgentId || "",
      assignedAgentName: params.assignedAgentName || "",
      profileCompleted: false,
      status: "PENDING_INVITED",
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "organizationMembers", membershipDocId), membershipData);
    await setDoc(doc(db, "memberships", membershipDocId), membershipData);

    if (params.role === "CUSTOMER") {
      const accountNumber = generateAccountNumber();
      await setDoc(doc(db, "customers", membershipDocId), {
        ...membershipData,
        accountNumber,
        agentId: params.assignedAgentId || params.createdBy || "",
        assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
      });
      await createSavingsAccountForCustomer({ customerId: membershipDocId, organizationId: params.organizationId });
    }
  }

  return { isExistingUser, userId };
}

// ── Validation helpers ────────────────────────────────────────────────────────

export async function validateAgentEmail(organizationId: string, email: string): Promise<void> {
  const emailKey = email.trim().toLowerCase();
  const snap = await getDocs(query(
    collection(db, "organizationMembers"),
    where("email", "==", emailKey),
    where("organizationId", "==", organizationId)
  ));
  for (const d of snap.docs) {
    const data = d.data();
    const role = (data.role || "").toUpperCase();
    if (role === "AGENT" || role === "PIGMY_COLLECTOR") throw new Error("This email already belongs to an agent.");
    if (role === "OWNER" || role === "ADMIN") throw new Error("This email belongs to an administrator account.");
    if (role === "CUSTOMER") throw new Error("A customer with this email already exists.");
  }
}

export async function validateCustomerEmail(organizationId: string, email: string, phone: string): Promise<void> {
  const emailKey = email.trim().toLowerCase();
  const snap = await getDocs(query(
    collection(db, "organizationMembers"),
    where("email", "==", emailKey),
    where("organizationId", "==", organizationId)
  ));
  for (const d of snap.docs) {
    const data = d.data();
    const role = (data.role || "").toUpperCase();
    if (role === "AGENT" || role === "PIGMY_COLLECTOR") throw new Error("This email already belongs to an agent.");
    if (role === "OWNER" || role === "ADMIN") throw new Error("This email belongs to an administrator account.");
    if (role === "CUSTOMER") throw new Error("A customer with this email already exists.");
  }
  if (phone) {
    const phoneSnap = await getDocs(query(
      collection(db, "organizationMembers"),
      where("phone", "==", phone.trim()),
      where("organizationId", "==", organizationId)
    ));
    if (!phoneSnap.empty) throw new Error("This phone number is already registered.");
  }
}

// ── Customer management ───────────────────────────────────────────────────────

export async function reassignCustomer(params: {
  customerId: string;
  newCollectorId: string;
  newCollectorName: string;
  oldCollectorId: string;
  oldCollectorName: string;
  changedBy: string;
  organizationId: string;
}) {
  await updateDoc(doc(db, "organizationMembers", params.customerId), {
    assignedAgentId: params.newCollectorId,
    assignedAgentName: params.newCollectorName,
    assigned_to_user_id: params.newCollectorId,
    updatedAt: serverTimestamp(),
  });
  const custSnap = await getDoc(doc(db, "customers", params.customerId));
  if (custSnap.exists()) {
    await updateDoc(doc(db, "customers", params.customerId), {
      agentId: params.newCollectorId,
      assignedAgentId: params.newCollectorId,
      assignedAgentName: params.newCollectorName,
      assigned_to_user_id: params.newCollectorId,
      updatedAt: serverTimestamp(),
    });
  }
  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.changedBy,
    actorRole: "OWNER",
    action: "CUSTOMER_REASSIGNED",
    entityType: "Customer",
    entityId: params.customerId,
    metadata: {
      oldCollectorId: params.oldCollectorId,
      oldCollectorName: params.oldCollectorName,
      newCollectorId: params.newCollectorId,
      newCollectorName: params.newCollectorName,
    },
  });
}

export async function activateProvisionedUser(clerkUserId: string, organizationId: string | null | undefined): Promise<void> {
  const constraints: any[] = [
    where("clerkUserId", "==", clerkUserId),
    where("status", "==", "PENDING_SETUP"),
  ];
  if (organizationId) constraints.push(where("organizationId", "==", organizationId));
  const snap = await getDocs(query(collection(db, "organizationMembers"), ...constraints));
  await Promise.all(snap.docs.map((d) =>
    updateDoc(d.ref, { status: "ACTIVE", activatedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  ));
  const userSnap = await getDoc(doc(db, "users", clerkUserId));
  if (userSnap.exists() && userSnap.data()?.status === "PENDING_SETUP") {
    await updateDoc(doc(db, "users", clerkUserId), {
      status: "ACTIVE",
      activatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function upsertAcceptedMembership(
  organizationId: string,
  clerkUserId: string,
  membershipData: Partial<Membership> & { role: Membership["role"]; email: string }
) {
  const ref = doc(db, "memberships", membershipIdFor(organizationId, clerkUserId));
  await setDoc(ref, {
    ...membershipData,
    id: membershipIdFor(organizationId, clerkUserId),
    organizationId,
    clerkUserId,
    email: membershipData.email.trim().toLowerCase(),
    status: "active",
    createdAt: serverTimestamp(),
  }, { merge: true });
  return ref;
}

export async function attachClerkIdToPendingUsers(email: string, clerkUserId: string) {
  const emailKey = email.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, "users"), where("email", "==", emailKey)));
  const updates = snap.docs.map((docSnap) => {
    const existing = docSnap.data() as any;
    if (!existing.clerkUserId) {
      return updateDoc(docSnap.ref, { clerkUserId, updatedAt: serverTimestamp() });
    }
    return Promise.resolve();
  });
  await Promise.all(updates);
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function createNotification(
  organizationId: string,
  userId: string,
  title: string,
  message: string,
  options?: {
    type?: string;
    category?: "collections" | "customers" | "collectors" | "loans" | "system";
    actorName?: string;
    metadata?: Record<string, any>;
  }
) {
  return await addDoc(collection(db, "notifications"), {
    organizationId,
    userId,
    title,
    message,
    read: false,
    type: options?.type || "GENERAL",
    category: options?.category || "system",
    actorName: options?.actorName || "",
    metadata: options?.metadata || {},
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(notificationId: string) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true, updatedAt: serverTimestamp() });
}

export async function markAllNotificationsRead(notificationIds: string[]) {
  if (!notificationIds.length) return;
  const batch = notificationIds.map(id =>
    updateDoc(doc(db, "notifications", id), { read: true, updatedAt: serverTimestamp() })
  );
  await Promise.all(batch);
}

export async function deleteNotification(notificationId: string) {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "notifications", notificationId));
}

export async function clearAllNotifications(notificationIds: string[]) {
  if (!notificationIds.length) return;
  const { deleteDoc } = await import("firebase/firestore");
  await Promise.all(notificationIds.map(id => deleteDoc(doc(db, "notifications", id))));
}

// ── Subscription / Upgrade requests ──────────────────────────────────────────

export async function requestPlanUpgrade(options: {
  organizationId: string; agentId: string; agentName: string; currentPlan: string;
}): Promise<string> {
  const existingQ = query(
    collection(db, "upgradeRequests"),
    where("organizationId", "==", options.organizationId),
    where("requestedBy", "==", options.agentId),
    where("status", "==", "PENDING"),
  );
  const existing = await getDocs(existingQ);
  if (!existing.empty) return existing.docs[0].id;
  const reqRef = doc(collection(db, "upgradeRequests"));
  await setDoc(reqRef, {
    id: reqRef.id,
    organizationId: options.organizationId,
    requestedBy: options.agentId,
    requestedByName: options.agentName,
    currentPlan: options.currentPlan,
    type: "CUSTOMER_LIMIT",
    status: "PENDING",
    createdAt: serverTimestamp(),
  });
  return reqRef.id;
}

export async function resolveUpgradeRequests(organizationId: string): Promise<void> {
  const q = query(
    collection(db, "upgradeRequests"),
    where("organizationId", "==", organizationId),
    where("status", "==", "PENDING"),
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) =>
    updateDoc(doc(db, "upgradeRequests", d.id), { status: "RESOLVED", resolvedAt: serverTimestamp() })
  ));
}

export async function ignoreUpgradeRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, "upgradeRequests", requestId), {
    status: "IGNORED",
    ignoredAt: serverTimestamp(),
  });
}

// ── Legacy stubs for backward compat ─────────────────────────────────────────

export async function addCustomer(organizationId: string, customerData: Partial<Membership>) {
  return await addDoc(collection(db, "memberships"), {
    ...customerData, organizationId, role: "customer", balance: 0,
    status: "active", createdAt: serverTimestamp(),
  });
}

export async function addAgent(organizationId: string, agentData: Partial<Membership>) {
  return await addDoc(collection(db, "memberships"), {
    ...agentData, organizationId, role: "agent",
    status: "active", createdAt: serverTimestamp(),
  });
}

/** Legacy savings collection (kept for backward compat) */
export async function recordCollection(
  organizationId: string,
  collectionData: { customerId: string; agentId: string; amount: number; status: string; collectedByRole?: string; collectedByUserId?: string; collectedByName?: string; assigned_to_user_id?: string }
) {
  return await addDoc(collection(db, "collections"), {
    ...collectionData, organizationId,
    collectionType: "SAVINGS",
    receiptNo: `LEGACY-${Date.now()}`,
    collectedAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  });
}

/** Legacy loan functions */
export async function applyForLoan(organizationId: string, loanData: { customerId: string; principal?: number; principalAmount?: number; durationMonths?: number; tenureMonths?: number }) {
  const principal = loanData.principal ?? loanData.principalAmount ?? 0;
  const tenure = loanData.durationMonths ?? loanData.tenureMonths ?? 12;
  return await createLoan({
    organizationId,
    customerId: loanData.customerId,
    principalAmount: principal,
    interestRate: 12,
    tenureMonths: tenure,
    createdByActorId: "system",
    createdByActorRole: "SYSTEM",
    createdByActorName: "System",
  });
}

export async function recordEMIPayment(organizationId: string, emiData: { loanId: string; customerId: string; agentId: string; amount: number }) {
  return await addDoc(collection(db, "emi_payments"), {
    ...emiData, organizationId, paid: true, timestamp: serverTimestamp(),
  });
}

export async function updateCustomerBalance(customerId: string, newBalance: number) {
  await updateDoc(doc(db, "users", customerId), { balance: newBalance });
}

// ════════════════════════════════════════════════════════════════════════════
// SAVINGS PLANS
// ════════════════════════════════════════════════════════════════════════════

export async function createSavingsPlan(params: {
  organizationId: string;
  planName: string;
  planType: string;
  minDeposit: number;
  maxDeposit: number;
  collectionFrequency: string;
  interestRate: number;
  penaltyAmount: number;
  graceDays: number;
  createdByActorId: string;
  createdByActorName: string;
}): Promise<string> {
  const ref = doc(collection(db, "savings_plans"));
  await setDoc(ref, {
    id: ref.id,
    organizationId: params.organizationId,
    planName: params.planName.trim(),
    planType: params.planType,
    minDeposit: params.minDeposit,
    maxDeposit: params.maxDeposit,
    collectionFrequency: params.collectionFrequency,
    interestRate: params.interestRate,
    penaltyAmount: params.penaltyAmount,
    graceDays: params.graceDays,
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.createdByActorId,
    actorRole: "OWNER",
    actorName: params.createdByActorName,
    action: "SAVINGS_PLAN_CREATED",
    entityType: "SavingsPlan",
    entityId: ref.id,
    metadata: { planName: params.planName, planType: params.planType },
  });
  return ref.id;
}

export async function updateSavingsPlan(planId: string, params: Partial<{
  planName: string;
  planType: string;
  minDeposit: number;
  maxDeposit: number;
  collectionFrequency: string;
  interestRate: number;
  penaltyAmount: number;
  graceDays: number;
  status: "ACTIVE" | "DISABLED";
}> & { organizationId: string; actorId: string; actorName: string }): Promise<void> {
  const { organizationId, actorId, actorName, ...fields } = params;
  await updateDoc(doc(db, "savings_plans", planId), { ...fields, updatedAt: serverTimestamp() });
  await createAuditLog({
    organizationId,
    actorId,
    actorRole: "OWNER",
    actorName,
    action: "SAVINGS_PLAN_UPDATED",
    entityType: "SavingsPlan",
    entityId: planId,
    metadata: fields,
  });
}

export async function deleteSavingsPlan(planId: string, organizationId: string, actorId: string, actorName: string): Promise<void> {
  await deleteDoc(doc(db, "savings_plans", planId));
  await createAuditLog({
    organizationId,
    actorId,
    actorRole: "OWNER",
    actorName,
    action: "SAVINGS_PLAN_DELETED",
    entityType: "SavingsPlan",
    entityId: planId,
    metadata: {},
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SAVINGS APPLICATIONS
// ════════════════════════════════════════════════════════════════════════════

export async function createSavingsApplication(params: {
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  planId: string;
  planName: string;
  planType: string;
  depositAmount: number;
  notes?: string;
}): Promise<string> {
  const ref = doc(collection(db, "savings_applications"));
  await setDoc(ref, {
    id: ref.id,
    organizationId: params.organizationId,
    customerId: params.customerId,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone || "",
    planId: params.planId,
    planName: params.planName,
    planType: params.planType,
    depositAmount: params.depositAmount,
    notes: params.notes || "",
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function approveSavingsApplication(params: {
  applicationId: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  planId: string;
  planName: string;
  planType: string;
  depositAmount: number;
  interestRate?: number;
  assignedAgentId: string;
  assignedAgentName: string;
  reviewedByActorId: string;
  reviewedByActorName: string;
}): Promise<string> {
  const accountNumber = generateAccountNumber();
  const accRef = doc(collection(db, "savings_accounts"));
  await setDoc(accRef, {
    id: accRef.id,
    accountNumber,
    customerId: params.customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone || "",
    organizationId: params.organizationId,
    planId: params.planId,
    planName: params.planName,
    planType: params.planType,
    scheduledAmount: params.depositAmount,
    totalBalance: 0,
    interestRate: params.interestRate ?? 0,
    assignedAgentId: params.assignedAgentId,
    assignedAgentName: params.assignedAgentName,
    startDate: serverTimestamp(),
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "savings_applications", params.applicationId), {
    status: "APPROVED",
    savingsAccountId: accRef.id,
    assignedAgentId: params.assignedAgentId,
    assignedAgentName: params.assignedAgentName,
    reviewedByActorId: params.reviewedByActorId,
    reviewedByActorName: params.reviewedByActorName,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.reviewedByActorId,
    actorRole: "OWNER",
    actorName: params.reviewedByActorName,
    action: "SAVINGS_APPLICATION_APPROVED",
    entityType: "SavingsAccount",
    entityId: accRef.id,
    metadata: { planName: params.planName, customerId: params.customerId, accountNumber, assignedAgent: params.assignedAgentName },
  });
  return accRef.id;
}

export async function rejectSavingsApplication(params: {
  applicationId: string;
  organizationId: string;
  reviewedByActorId: string;
  reviewedByActorName: string;
  rejectionReason: string;
}): Promise<void> {
  await updateDoc(doc(db, "savings_applications", params.applicationId), {
    status: "REJECTED",
    rejectionReason: params.rejectionReason,
    reviewedByActorId: params.reviewedByActorId,
    reviewedByActorName: params.reviewedByActorName,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await createAuditLog({
    organizationId: params.organizationId,
    actorId: params.reviewedByActorId,
    actorRole: "OWNER",
    actorName: params.reviewedByActorName,
    action: "SAVINGS_APPLICATION_REJECTED",
    entityType: "SavingsApplication",
    entityId: params.applicationId,
    metadata: { reason: params.rejectionReason },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SAVINGS ACCOUNT MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

export async function updateSavingsAccountStatus(
  accountId: string,
  status: "ACTIVE" | "FROZEN" | "CLOSED",
  organizationId: string,
  actorId: string,
  actorName: string
): Promise<void> {
  await updateDoc(doc(db, "savings_accounts", accountId), {
    status,
    updatedAt: serverTimestamp(),
  });
  await createAuditLog({
    organizationId,
    actorId,
    actorRole: "OWNER",
    actorName,
    action: status === "FROZEN" ? "SAVINGS_ACCOUNT_FROZEN" : status === "CLOSED" ? "SAVINGS_ACCOUNT_CLOSED" : "SAVINGS_ACCOUNT_OPENED",
    entityType: "SavingsAccount",
    entityId: accountId,
    metadata: { status },
  });
}

export async function transferSavingsAgent(
  accountId: string,
  agentId: string,
  agentName: string,
  organizationId: string,
  actorId: string,
  actorName: string
): Promise<void> {
  await updateDoc(doc(db, "savings_accounts", accountId), {
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    updatedAt: serverTimestamp(),
  });
  await createAuditLog({
    organizationId,
    actorId,
    actorRole: "OWNER",
    actorName,
    action: "SAVINGS_AGENT_TRANSFERRED",
    entityType: "SavingsAccount",
    entityId: accountId,
    metadata: { newAgentId: agentId, newAgentName: agentName },
  });
}

// ── One-time migration: fix assignedAgentId from membership doc IDs → Clerk user IDs ──
export async function migrateCustomerAssignments(organizationId: string): Promise<{
  checked: number;
  migrated: number;
  skipped: number;
  errors: string[];
}> {
  console.log("[FC Migration] Starting assignedAgentId migration for org:", organizationId);

  // 1. Load all agent + owner membership docs so we can map docId → clerkUserId
  const [agentSnap, ownerSnap] = await Promise.all([
    getDocs(query(collection(db, "organizationMembers"),
      where("organizationId", "==", organizationId),
      where("role", "==", "AGENT"),
    )),
    getDocs(query(collection(db, "organizationMembers"),
      where("organizationId", "==", organizationId),
      where("role", "==", "OWNER"),
    )),
  ]);

  // Map: membershipDocId → clerkUserId
  const docIdToClerk: Record<string, string> = {};
  [...agentSnap.docs, ...ownerSnap.docs].forEach((d) => {
    const data = d.data() as any;
    if (data.clerkUserId) {
      docIdToClerk[d.id] = data.clerkUserId;
    }
  });
  console.log("[FC Migration] Collector map built:", Object.keys(docIdToClerk).length, "entries");

  // 2. Load all customer membership docs for this org
  const customerSnap = await getDocs(query(
    collection(db, "organizationMembers"),
    where("organizationId", "==", organizationId),
    where("role", "==", "CUSTOMER"),
  ));

  let checked = 0;
  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process in batches of 500 (Firestore writeBatch limit)
  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let batchCount = 0;

  const flush = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  };

  for (const d of customerSnap.docs) {
    checked++;
    const data = d.data() as any;
    const stored: string = data.assignedAgentId || "";

    if (!stored) { skipped++; continue; }

    // Already a Clerk user ID — starts with "user_"
    if (stored.startsWith("user_")) { skipped++; continue; }

    let clerkUserId: string | undefined;

    // Path A: direct lookup by membership doc ID
    if (docIdToClerk[stored]) {
      clerkUserId = docIdToClerk[stored];
    }
    // Path B: extract from "${orgId}_user_xxx" format
    else if (stored.startsWith(organizationId + "_")) {
      const suffix = stored.slice(organizationId.length + 1);
      if (suffix.startsWith("user_")) {
        clerkUserId = suffix;
      }
    }

    if (!clerkUserId) {
      console.warn("[FC Migration] Cannot resolve:", stored, "for customer:", d.id);
      skipped++;
      continue;
    }

    console.log("[FC Migration] Fixing", d.id, ":", stored, "→", clerkUserId);
    batch.update(doc(db, "organizationMembers", d.id), {
      assignedAgentId: clerkUserId,
      assigned_to_user_id: clerkUserId,
      updatedAt: serverTimestamp(),
    });
    batchCount++;
    migrated++;

    if (batchCount >= BATCH_SIZE) {
      try { await flush(); } catch (e: any) { errors.push(`Batch flush: ${e.message}`); }
    }
  }

  try { await flush(); } catch (e: any) { errors.push(`Final flush: ${e.message}`); }

  console.log(`[FC Migration] Done — checked:${checked} migrated:${migrated} skipped:${skipped} errors:${errors.length}`);
  return { checked, migrated, skipped, errors };
}

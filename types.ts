import { Timestamp } from "firebase/firestore";

// ── Role types ────────────────────────────────────────────────────────────────
export type AppRole = "organization_owner" | "pigmy_collector" | "customer";
export type FirestoreRole = "OWNER" | "AGENT" | "CUSTOMER" | "PIGMY_COLLECTOR";
export type Role = AppRole | FirestoreRole | string;

// ── Helper type for Firestore timestamps ──────────────────────────────────────
export type FSTimestamp = Timestamp | number | Date | null | undefined;

// ── Organizations ─────────────────────────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  clerkOrgId?: string;
  slug?: string;
  phone?: string;
  address?: string;
  currency?: string;
  logoUrl?: string;
  ownerClerkUserId?: string;
  ownerEmail?: string;
  subscriptionPlanId?: string;
  status: "ACTIVE" | "SUSPENDED";
  limits?: { maxAgents: number; maxCustomers: number };
  usage?: { activeCustomers: number };
  createdAt: FSTimestamp;
  updatedAt: FSTimestamp;
}

// ── Organization Members (auth + role mapping) ────────────────────────────────
export interface Membership {
  id: string;
  organizationId: string;
  clerkUserId: string | null;
  clerkRole?: string;
  role: Role;
  // name fields
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  dateOfBirth?: string;
  gender?: string;
  profilePhotoUrl?: string;
  nominee?: {
    name?: string;
    relation?: string;
    phone?: string;
  };
  aadhaarLast4?: string;
  // Agent-specific
  assignedArea?: string;
  actsAsAgent?: boolean;
  collectorEnabled?: boolean;
  // Customer-specific
  agentId?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assigned_to_user_id?: string;
  notes?: string;
  customerType?: "SAVINGS" | "LOAN" | "SAVINGS_LOAN";
  // Meta
  profileCompleted?: boolean;
  invitationId?: string;
  status?: string;
  organizationName?: string;
  createdBy?: string;
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
  activatedAt?: FSTimestamp;
}

// ── Agents (separate collection, aligns with report) ─────────────────────────
export interface Agent {
  id: string;
  organizationId: string;
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  assignedArea?: string;
  status: "ACTIVE" | "DEACTIVATED";
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Customers ────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  organizationId: string;
  agentId: string;
  clerkUserId: string | null;
  email: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  customerType?: "SAVINGS" | "LOAN" | "SAVINGS_LOAN";
  status: "ACTIVE" | "DORMANT" | "CLOSED";
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Savings Plans ─────────────────────────────────────────────────────────────
export type SavingsPlanType = "DAILY_PIGMY" | "WEEKLY_PIGMY" | "MONTHLY_PIGMY" | "RECURRING_DEPOSIT" | "FIXED_DEPOSIT";
export type CollectionFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface SavingsPlan {
  id: string;
  organizationId: string;
  planName: string;
  planType: SavingsPlanType;
  minDeposit: number;
  maxDeposit: number;
  collectionFrequency: CollectionFrequency;
  interestRate: number;
  penaltyAmount: number;
  graceDays: number;
  status: "ACTIVE" | "DISABLED";
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Savings Applications (customer-initiated account opening) ─────────────────
export interface SavingsApplication {
  id: string;
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
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  reviewedByActorId?: string;
  reviewedByActorName?: string;
  reviewedAt?: FSTimestamp;
  savingsAccountId?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Savings Accounts ─────────────────────────────────────────────────────────
export interface SavingsAccount {
  id: string;
  accountNumber?: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  organizationId: string;
  planId?: string;
  planName?: string;
  planType: "DAILY" | "WEEKLY" | "MONTHLY" | "DAILY_PIGMY" | "WEEKLY_PIGMY" | "MONTHLY_PIGMY" | "RECURRING_DEPOSIT" | "FIXED_DEPOSIT";
  scheduledAmount: number;
  totalBalance: number;
  interestRate?: number;
  startDate: FSTimestamp;
  assignedAgentId?: string;
  assignedAgentName?: string;
  status: "ACTIVE" | "FROZEN" | "SUSPENDED" | "CLOSED";
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Savings Transactions ─────────────────────────────────────────────────────
export interface SavingsTransaction {
  id: string;
  savingsAccountId: string;
  organizationId: string;
  customerId: string;
  agentId: string;
  amount: number;
  balanceAfter: number;
  receiptNo: string;
  collectedAt: FSTimestamp;
  collectedByName?: string;
}

// ── Loans ─────────────────────────────────────────────────────────────────────
export interface Loan {
  id: string;
  organizationId: string;
  customerId: string;
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  emiAmount: number;
  disbursedAt: FSTimestamp;
  status: "PENDING" | "ACTIVE" | "CLOSED" | "REJECTED";
  outstandingBalance: number;
  rejectionReason?: string;
  loanAssignedCollectorId?: string;
  loanAssignedCollectorName?: string;
  loanAssignedCollectorRole?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  disbursementMethod?: "CASH" | "UPI" | "BANK_TRANSFER";
  disbursementReference?: string;
  approvalNotes?: string;
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
  // Legacy compat
  principal?: number;
  durationMonths?: number;
  balanceRemaining?: number;
}

// ── Loan Installments ────────────────────────────────────────────────────────
export interface LoanInstallment {
  id: string;
  loanId: string;
  organizationId: string;
  customerId: string;
  installmentNo: number;
  dueDate: FSTimestamp;
  emiAmount: number;
  paidAmount: number;
  paidAt: FSTimestamp;
  status: "PENDING" | "PAID" | "OVERDUE";
  receiptNo?: string;
  collectedByAgentId?: string;
  collectedByAgentName?: string;
}

// ── Collections (master ledger) ───────────────────────────────────────────────
export interface Collection {
  id: string;
  organizationId: string;
  agentId: string;
  customerId: string;
  collectionType: "SAVINGS" | "LOAN_EMI";
  referenceId: string; // savingsTransactionId or loanInstallmentId
  amount: number;
  receiptNo: string;
  collectedAt: FSTimestamp;
  collectedByName?: string;
  collectedByRole?: string;
  // Legacy compat
  timestamp?: FSTimestamp;
  status?: string;
  assigned_to_user_id?: string;
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
export type AuditAction =
  | "AGENT_CREATED" | "AGENT_DEACTIVATED" | "AGENT_REACTIVATED"
  | "CUSTOMER_CREATED" | "CUSTOMER_STATUS_CHANGED"
  | "SAVINGS_COLLECTION_RECORDED"
  | "SAVINGS_PLAN_CREATED" | "SAVINGS_PLAN_UPDATED" | "SAVINGS_PLAN_DELETED"
  | "SAVINGS_ACCOUNT_OPENED" | "SAVINGS_ACCOUNT_FROZEN" | "SAVINGS_ACCOUNT_CLOSED"
  | "SAVINGS_APPLICATION_APPROVED" | "SAVINGS_APPLICATION_REJECTED"
  | "SAVINGS_AGENT_TRANSFERRED"
  | "LOAN_CREATED" | "LOAN_APPROVED" | "LOAN_REJECTED" | "LOAN_CLOSED"
  | "EMI_COLLECTION_RECORDED"
  | "CUSTOMER_REASSIGNED"
  | "ORG_SETTINGS_UPDATED";

export interface AuditLog {
  id: string;
  organizationId: string;
  actorId: string;
  actorRole: string;
  actorName?: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  createdAt: FSTimestamp;
}

// ── Notification ──────────────────────────────────────────────────────────────
export type NotificationType =
  | "DEPOSIT_COLLECTED"
  | "EMI_DUE"
  | "EMI_OVERDUE"
  | "LOAN_APPROVED"
  | "LOAN_REJECTED"
  | "LOAN_DISBURSED"
  | "ACCOUNT_UPDATE"
  | "GENERAL";

export interface Notification {
  id: string;
  organizationId: string;
  userId: string;
  type?: NotificationType;
  title: string;
  message: string;
  read: boolean;
  timestamp: FSTimestamp;
  createdAt?: FSTimestamp;
}

// ── Support Ticket ────────────────────────────────────────────────────────────
export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SupportTicketCategory = "ACCOUNT" | "SAVINGS" | "LOAN" | "EMI" | "TECHNICAL" | "COMPLAINT" | "GENERAL";
export type SupportTicketPriority = "LOW" | "MEDIUM" | "HIGH";

export interface SupportTicket {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  agentResponse?: string;
  resolvedAt?: FSTimestamp;
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── Legacy / Misc ─────────────────────────────────────────────────────────────
export interface User {
  id: string;
  clerkUserId?: string;
  organizationId?: string;
  role?: Role;
  name: string;
  email: string;
  phone?: string;
  assignedArea?: string;
  agentId?: string;
  assigned_to_user_id?: string;
  balance?: number;
  invitationId?: string;
  status?: string;
  createdAt: FSTimestamp;
}

export interface Transaction {
  id: string;
  organizationId: string;
  customerId: string;
  agentId: string;
  amount: number;
  type: "deposit" | "withdrawal" | "emi_payment" | "loan_disbursement";
  timestamp: FSTimestamp;
  referenceId?: string;
}

export type SubscriptionPlanId = "starter" | "professional" | "enterprise";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "expired" | "cancelled" | "trial";
export type PaymentStatus = "success" | "failed" | "pending";

export interface Subscription {
  id: string;
  organizationId: string;
  planId: SubscriptionPlanId;
  planName: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  maxAgents: number;
  maxCustomers: number;
  startedAt: FSTimestamp;
  expiresAt?: FSTimestamp;
  createdAt: FSTimestamp;
  updatedAt: FSTimestamp;
}

export interface Payment {
  id: string;
  organizationId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  paymentStatus: PaymentStatus;
  paidAt: FSTimestamp;
  invoiceNumber: string;
  cardLast4?: string;
  createdAt: FSTimestamp;
}

export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  paymentId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  planName: string;
  billingCycle: BillingCycle;
  status: "paid" | "unpaid" | "cancelled";
  issuedAt: FSTimestamp;
  paidAt?: FSTimestamp;
  createdAt: FSTimestamp;
}

// ── Loan Applications (customer-submitted requests) ───────────────────────────
export interface LoanApplication {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  loanAmount: number;
  loanPurpose: string;
  tenureMonths: number;
  monthlyIncome: number;
  employmentType: string;
  address: string;
  notes: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED";
  rejectionReason?: string;
  reviewedByActorId?: string;
  reviewedByActorName?: string;
  reviewedAt?: FSTimestamp;
  loanId?: string;
  verificationStatus?: "PENDING" | "VERIFIED" | "REJECTED";
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  verificationNotes?: string;
  approvalNotes?: string;
  createdAt: FSTimestamp;
  updatedAt?: FSTimestamp;
}

// ── EMIPayment (legacy) ───────────────────────────────────────────────────────
export interface EMIPayment {
  id: string;
  organizationId: string;
  loanId: string;
  customerId: string;
  agentId: string;
  amount: number;
  timestamp: FSTimestamp;
}

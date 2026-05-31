import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc, query, where, getDocs, increment } from "firebase/firestore";
import { db } from "./firebase";
import { Collection, Loan, EMIPayment, Membership } from "../types";

// The organizationId must ALWAYS be provided to these services

export function membershipIdFor(organizationId: string, clerkUserId: string) {
  return `${organizationId}_${clerkUserId}`;
}

// ─────────────────────────────────────────────────────────────
// Admin provisioning — create a Clerk user and Firestore records
// directly. No invitation tickets involved.
// ─────────────────────────────────────────────────────────────

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
    role: params.role,
    clerkRole: params.role === "AGENT" ? "org:pigmy_collector" : "org:customer",
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    phone: "",
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
  await setDoc(doc(db, "memberships", membershipDocId), membershipData);

  if (params.role === "CUSTOMER") {
    await setDoc(doc(db, "customers", membershipDocId), {
      ...membershipData,
      assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
    });
    try {
      await setDoc(doc(db, "organizations", params.organizationId), {
        "usage.activeCustomers": increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (_) {}
  }

  await setDoc(doc(db, "users", clerkUserId), {
    clerkUserId,
    id: clerkUserId,
    email: emailKey,
    name: fullName,
    status: "PENDING_SETUP",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log("[FC provisionUser] ✓ User provisioned:", { clerkUserId, membershipDocId, role: params.role });
  return { clerkUserId, setupUrl };
}

// ─────────────────────────────────────────────────────────────
// Add member: existing Clerk user → direct org membership,
// new user → Clerk organisation invitation email.
// ─────────────────────────────────────────────────────────────

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
    const membershipData: any = {
      id: membershipDocId,
      clerkUserId: userId,
      email: emailKey,
      fullName,
      name: fullName,
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
      await setDoc(doc(db, "customers", membershipDocId), {
        ...membershipData,
        assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
      }, { merge: true });
      try {
        await setDoc(doc(db, "organizations", params.organizationId), {
          "usage.activeCustomers": increment(1),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (_) {}
    }

    await setDoc(doc(db, "users", userId), {
      clerkUserId: userId,
      id: userId,
      email: emailKey,
      name: fullName,
      status: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log("[FC addMember] ✓ Existing user added:", { userId, membershipDocId, role: params.role });
  } else {
    // New user (invited) — pending doc; clerkUserId is not yet known.
    // Use a deterministic email-based doc ID so re-inviting the same email is idempotent.
    const safeEmail = emailKey.replace(/[^a-z0-9]/g, "_");
    const membershipDocId = `${params.organizationId}_pending_${safeEmail}`;

    const membershipData: any = {
      id: membershipDocId,
      clerkUserId: null,
      email: emailKey,
      fullName,
      name: fullName,
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
      await setDoc(doc(db, "customers", membershipDocId), {
        ...membershipData,
        assigned_to_user_id: params.assignedAgentId || params.createdBy || "",
      });
    }

    console.log("[FC addMember] ✓ Invitation sent to new user:", { email: emailKey, membershipDocId, role: params.role });
  }

  return { isExistingUser, userId };
}

// ─────────────────────────────────────────────────────────────
// Pre-validation helpers (email collision checks)
// ─────────────────────────────────────────────────────────────

export async function validateAgentEmail(organizationId: string, email: string): Promise<void> {
  const emailKey = email.trim().toLowerCase();

  const membersSnap = await getDocs(query(
    collection(db, "organizationMembers"),
    where("email", "==", emailKey),
    where("organizationId", "==", organizationId)
  ));

  for (const d of membersSnap.docs) {
    const data = d.data();
    const role = (data.role || "").toUpperCase();
    if (role === "AGENT" || role === "PIGMY_COLLECTOR") throw new Error("This email already belongs to an agent.");
    if (role === "OWNER" || role === "ADMIN") throw new Error("This email belongs to an administrator account.");
    if (role === "CUSTOMER") throw new Error("A customer with this email already exists.");
  }
}

export async function validateCustomerEmail(organizationId: string, email: string, phone: string): Promise<void> {
  const emailKey = email.trim().toLowerCase();

  const membersSnap = await getDocs(query(
    collection(db, "organizationMembers"),
    where("email", "==", emailKey),
    where("organizationId", "==", organizationId)
  ));

  for (const d of membersSnap.docs) {
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

// ─────────────────────────────────────────────────────────────
// Mark a provisioned user as active after they set their password
// Called from AuthCallback after sign-in with a setup token
// ─────────────────────────────────────────────────────────────

export async function activateProvisionedUser(
  clerkUserId: string,
  organizationId: string | null | undefined
): Promise<void> {
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

// ─────────────────────────────────────────────────────────────
// Membership helpers used by redirect logic
// ─────────────────────────────────────────────────────────────

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
  const q = query(collection(db, "users"), where("email", "==", emailKey));
  const snapshot = await getDocs(q);

  const updatePromises = snapshot.docs.map((docSnap) => {
    const existing = docSnap.data() as any;
    if (!existing.clerkUserId) {
      return updateDoc(docSnap.ref, { clerkUserId, updatedAt: serverTimestamp() });
    }
    return Promise.resolve();
  });

  await Promise.all(updatePromises);
}

export async function addCustomer(organizationId: string, customerData: Partial<Membership>) {
  return await addDoc(collection(db, "memberships"), {
    ...customerData,
    organizationId,
    role: "customer",
    balance: 0,
    status: "active",
    createdAt: serverTimestamp(),
  });
}

export async function addAgent(organizationId: string, agentData: Partial<Membership>) {
  return await addDoc(collection(db, "memberships"), {
    ...agentData,
    organizationId,
    role: "agent",
    status: "active",
    createdAt: serverTimestamp(),
  });
}

export async function reassignCustomer(params: {
  customerId: string;
  newCollectorId: string;
  newCollectorName: string;
  oldCollectorId: string;
  oldCollectorName: string;
  changedBy: string;
  organizationId: string;
}) {
  const memberRef = doc(db, "organizationMembers", params.customerId);
  await updateDoc(memberRef, {
    assignedAgentId: params.newCollectorId,
    assignedAgentName: params.newCollectorName,
    updatedAt: serverTimestamp(),
  });
  const customerRef = doc(db, "customers", params.customerId);
  const custSnap = await getDoc(customerRef);
  if (custSnap.exists()) {
    await updateDoc(customerRef, {
      assignedAgentId: params.newCollectorId,
      assignedAgentName: params.newCollectorName,
      assigned_to_user_id: params.newCollectorId,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function recordCollection(organizationId: string, collectionData: Pick<Collection, "customerId" | "agentId" | "amount" | "status" | "collectedByRole" | "collectedByUserId" | "collectedByName"> & { assigned_to_user_id?: string }) {
  const membershipId = `${organizationId}_${collectionData.customerId}`;
  const memberSnap = await getDoc(doc(db, "organizationMembers", membershipId));
  if (!memberSnap.exists()) {
    throw new Error("Customer record not found in this organization.");
  }
  const memberStatus = (memberSnap.data()?.status || "").toString().toUpperCase();
  if (memberStatus !== "ACTIVE") {
    throw new Error("This customer has not activated their account yet.");
  }

  const collectedByRole = collectionData.collectedByRole || "OWNER";
  const collectedByUserId = collectionData.collectedByUserId || collectionData.agentId;
  const collectedByName = collectionData.collectedByName || "Collector";
  const assignedToUserId = collectionData.assigned_to_user_id || collectionData.agentId;

  const collRef = await addDoc(collection(db, "collections"), {
    ...collectionData,
    organizationId,
    collectedByRole,
    collectedByUserId,
    collectedByName,
    assigned_to_user_id: assignedToUserId,
    timestamp: serverTimestamp(),
  });

  await addDoc(collection(db, "transactions"), {
    organizationId,
    customerId: collectionData.customerId,
    agentId: collectionData.agentId,
    amount: collectionData.amount,
    type: "deposit",
    timestamp: serverTimestamp(),
    referenceId: collRef.id,
    collectedByRole,
    collectedByUserId,
    collectedByName,
    assigned_to_user_id: assignedToUserId,
  });

  if (collectionData.status === "completed") {
    const userRef = doc(db, "users", collectionData.customerId);
    const userSnap = await getDoc(userRef);
    const currentBalance = userSnap.data()?.balance || 0;
    await updateDoc(userRef, { balance: currentBalance + collectionData.amount });
  }

  return collRef;
}

export async function updateCustomerBalance(customerId: string, newBalance: number) {
  const userRef = doc(db, "users", customerId);
  await updateDoc(userRef, { balance: newBalance });
}

export async function applyForLoan(organizationId: string, loanData: Pick<Loan, "customerId" | "principal" | "durationMonths">) {
  const interestRate = 2;
  const totalInterest = loanData.principal * (interestRate / 100) * loanData.durationMonths;
  const totalComputed = loanData.principal + totalInterest;
  const emiAmount = totalComputed / loanData.durationMonths;

  return await addDoc(collection(db, "loans"), {
    ...loanData,
    organizationId,
    interestRate,
    status: "pending",
    emiAmount,
    totalComputed,
    balanceRemaining: totalComputed,
    createdAt: serverTimestamp(),
  });
}

export async function approveLoan(loanId: string) {
  const loanRef = doc(db, "loans", loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found");
  const loanData = loanSnap.data() as Loan;

  await updateDoc(loanRef, { status: "active", approvedAt: serverTimestamp() });

  for (let month = 1; month <= loanData.durationMonths; month++) {
    await addDoc(collection(db, "emi_payments"), {
      organizationId: loanData.organizationId,
      loanId,
      customerId: loanData.customerId,
      agentId: "",
      amount: loanData.emiAmount,
      monthNumber: month,
      dueDate: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000),
      paid: false,
      timestamp: serverTimestamp(),
    });
  }

  const userRef = doc(db, "users", loanData.customerId);
  const userSnap = await getDoc(userRef);
  const currentBalance = userSnap.data()?.balance || 0;
  await updateDoc(userRef, { balance: currentBalance + loanData.principal });

  await addDoc(collection(db, "transactions"), {
    organizationId: loanData.organizationId,
    customerId: loanData.customerId,
    agentId: "",
    amount: loanData.principal,
    type: "loan_disbursement",
    timestamp: serverTimestamp(),
    referenceId: loanId,
  });
}

export async function recordEMIPayment(organizationId: string, emiData: Pick<EMIPayment, "loanId" | "customerId" | "agentId" | "amount">) {
  const emiRef = await addDoc(collection(db, "emi_payments"), {
    ...emiData,
    organizationId,
    paid: true,
    timestamp: serverTimestamp(),
  });

  await addDoc(collection(db, "transactions"), {
    organizationId,
    customerId: emiData.customerId,
    agentId: emiData.agentId,
    amount: emiData.amount,
    type: "emi_payment",
    timestamp: serverTimestamp(),
    referenceId: emiRef.id,
  });

  const userRef = doc(db, "users", emiData.customerId);
  const userSnap = await getDoc(userRef);
  const currentBalance = userSnap.data()?.balance || 0;
  await updateDoc(userRef, { balance: Math.max(0, currentBalance - emiData.amount) });

  const loanRef = doc(db, "loans", emiData.loanId);
  const loanSnap = await getDoc(loanRef);
  if (loanSnap.exists()) {
    const currentRemaining = loanSnap.data().balanceRemaining || 0;
    const newRemaining = Math.max(0, currentRemaining - emiData.amount);
    await updateDoc(loanRef, {
      balanceRemaining: newRemaining,
      ...(newRemaining === 0 && { status: "completed" }),
    });
  }

  return emiRef;
}

export async function createNotification(organizationId: string, userId: string, title: string, message: string) {
  return await addDoc(collection(db, "notifications"), {
    organizationId,
    userId,
    title,
    message,
    read: false,
    timestamp: serverTimestamp(),
  });
}

export async function markNotificationRead(notificationId: string) {
  const nRef = doc(db, "notifications", notificationId);
  await updateDoc(nRef, { read: true });
}

// ─────────────────────────────────────────────────────────────
// Subscription upgrade request from agent
// ─────────────────────────────────────────────────────────────

export async function requestPlanUpgrade(options: {
  organizationId: string;
  agentId: string;
  agentName: string;
  currentPlan: string;
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
  const updates = snap.docs.map((d) =>
    updateDoc(doc(db, "upgradeRequests", d.id), { status: "RESOLVED", resolvedAt: serverTimestamp() })
  );
  await Promise.all(updates);
}

export async function ignoreUpgradeRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, "upgradeRequests", requestId), {
    status: "IGNORED",
    ignoredAt: serverTimestamp(),
  });
}

import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc, query, where, getDocs, increment } from "firebase/firestore";
import { db } from "./firebase";
import { Collection, Loan, EMIPayment, Membership } from "../types";

// The organizationId must ALWAYS be provided to these services

export function membershipIdFor(organizationId: string, clerkUserId: string) {
  return `${organizationId}_${clerkUserId}`;
}

export async function linkOrganizationMembershipByEmail(
  email: string,
  organizationId: string | null | undefined,
  clerkUserId: string,
  fullName?: string
) {
  const emailKey = email.trim().toLowerCase();
  const constraints: any[] = [where("email", "==", emailKey)];
  if (organizationId) {
    constraints.push(where("organizationId", "==", organizationId));
  }

  const q = query(collection(db, "organizationMembers"), ...constraints);
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return [];
  }

  const linked = await Promise.all(snapshot.docs.map(async (docSnap) => {
    const existing = docSnap.data() as any;
    const invitationOrgId = existing.organizationId || organizationId;
    if (!invitationOrgId) {
      return null;
    }

    const membershipDocId = membershipIdFor(invitationOrgId, clerkUserId);
    const targetRef = doc(db, "organizationMembers", membershipDocId);
    const finalStatus = existing.profileCompleted ? "ACTIVE" : "INVITED";
    const joinedAt = existing.joinedAt || serverTimestamp();

    const finalData = {
      ...existing,
      id: membershipDocId,
      organizationId: invitationOrgId,
      clerkUserId,
      fullName: fullName || existing.fullName || "",
      joinedAt,
      status: finalStatus,
      updatedAt: serverTimestamp(),
    } as any;

    await setDoc(targetRef, finalData, { merge: true });

    if (docSnap.id !== membershipDocId) {
      await deleteDoc(docSnap.ref);
    }

    const membershipRef = doc(db, "memberships", membershipDocId);
    await setDoc(membershipRef, finalData, { merge: true });

    if (existing.role?.toString().toUpperCase() === "CUSTOMER") {
      const customerRef = doc(db, "customers", membershipDocId);
      await setDoc(customerRef, finalData, { merge: true });
    }

    return finalData;
  }));

  return linked.filter(Boolean) as any[];
}

export async function createPendingInvite(
  organizationId: string,
  inviteData: {
    email: string;
    role: "owner" | "pigmy_collector" | "customer";
    clerkRole: "org:owner" | "org:pigmy_collector" | "org:customer";
    invitedBy: string;
    assignedArea?: string;
    agentId?: string;
    clerkOrganizationId?: string;
    organizationName?: string;
    profileCompleted?: boolean;
  }
) {
  const emailKey = inviteData.email.trim().toLowerCase();
  const docRef = await addDoc(collection(db, "pendingInvites"), {
    email: emailKey,
    role: inviteData.role,
    clerkRole: inviteData.clerkRole,
    invitedBy: inviteData.invitedBy,
    assignedArea: inviteData.assignedArea || "",
    agentId: inviteData.agentId || "",
    organizationId,
    clerkOrganizationId: inviteData.clerkOrganizationId || organizationId,
    organizationName: inviteData.organizationName || "",
    profileCompleted: inviteData.profileCompleted || false,
    status: "PENDING",
    createdAt: serverTimestamp(),
  });
  await setDoc(docRef, { id: docRef.id }, { merge: true });
  return docRef;
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

export async function inviteOrganizationMember(
  organization: any,
  organizationId: string,
  memberData: {
    name: string;
    email: string;
    role: "agent" | "customer";
    phone?: string;
    assignedArea?: string;
    agentId?: string;
  }
) {
  if (!organization?.id) {
    throw new Error("No active organization selected for invitation.");
  }

  const emailKey = memberData.email.trim().toLowerCase();

  if (!organization?.inviteMember) {
    throw new Error("This organization cannot create invitations at the moment.");
  }

  const invitation = await organization.inviteMember({
    emailAddress: emailKey,
    role: "org:member",
  });

  const docRef = await addDoc(collection(db, "users"), {
    clerkUserId: "",
    id: "",
    name: memberData.name,
    email: emailKey,
    role: memberData.role,
    phone: memberData.phone || "",
    assignedArea: memberData.assignedArea || "",
    agentId: memberData.agentId || "",
    organizationId,
    status: "pending",
    invitationId: invitation.id,
    createdAt: serverTimestamp(),
  });

  await setDoc(docRef, { id: docRef.id }, { merge: true });
  return invitation;
}

export async function inviteCustomer(organization: any, organizationId: string, customerData: {
  name: string;
  email: string;
  phone?: string;
  agentId: string;
}) {
  return inviteOrganizationMember(organization, organizationId, {
    ...customerData,
    role: "customer",
  });
}

export async function inviteAgent(organization: any, organizationId: string, agentData: {
  name: string;
  email: string;
  phone?: string;
  assignedArea?: string;
}) {
  return inviteOrganizationMember(organization, organizationId, {
    ...agentData,
    role: "agent",
  });
}

export async function attachClerkIdToPendingUsers(email: string, clerkUserId: string) {
  const emailKey = email.trim().toLowerCase();
  const q = query(collection(db, "users"), where("email", "==", emailKey));
  const snapshot = await getDocs(q);

  const updatePromises = snapshot.docs.map((docSnap) => {
    const existing = docSnap.data() as any;
    if (!existing.clerkUserId) {
      return updateDoc(docSnap.ref, {
        clerkUserId,
        updatedAt: serverTimestamp(),
      });
    }
    return Promise.resolve();
  });

  await Promise.all(updatePromises);
}

export async function reconcilePendingInviteMembership(
  email: string,
  organizationId: string | null | undefined,
  clerkUserId: string,
  fullName?: string
) {
  const emailKey = email.trim().toLowerCase();
  console.log("reconcilePendingInviteMembership: checking pending invite", {
    email: emailKey,
    organizationId,
    clerkUserId,
  });

  const linkedMembers = await linkOrganizationMembershipByEmail(
    emailKey,
    organizationId,
    clerkUserId,
    fullName
  );

  if (linkedMembers.length) {
    console.log("reconcilePendingInviteMembership: linked existing organization member", linkedMembers.length);

    const pendingConstraints: any[] = [
      where("email", "==", emailKey),
      where("status", "==", "PENDING"),
    ];
    if (organizationId) {
      pendingConstraints.push(where("organizationId", "==", organizationId));
    }
    const pendingQuery = query(collection(db, "pendingInvites"), ...pendingConstraints);
    const pendingSnapshot = await getDocs(pendingQuery);
    await Promise.all(pendingSnapshot.docs.map((docSnap) => updateDoc(docSnap.ref, {
      status: "ACTIVE",
      clerkUserId,
      updatedAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
      acceptedAt: serverTimestamp(),
    })));

    return linkedMembers;
  }

  const constraints: any[] = [
    where("email", "==", emailKey),
    where("status", "==", "PENDING"),
  ];
  if (organizationId) {
    constraints.push(where("organizationId", "==", organizationId));
  }

  const q = query(
    collection(db, "pendingInvites"),
    ...constraints
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.log("reconcilePendingInviteMembership: no pending invite found");
    return [];
  }

  const accepted = await Promise.all(snapshot.docs.map(async (docSnap) => {
    const pending = docSnap.data() as any;
    const joinedAt = serverTimestamp();
    const role = (pending.role || "customer").toString().toLowerCase();
    const resolvedName = fullName || pending.fullName || "";
    const clerkRole = pending.clerkRole || {
      owner: "org:owner",
      pigmy_collector: "org:pigmy_collector",
      customer: "org:customer",
    }[role];
    const invitationOrgId = pending.organizationId || organizationId;
    const membershipDocId = membershipIdFor(invitationOrgId, clerkUserId);

    console.log("reconcilePendingInviteMembership: pending invite found", {
      pendingId: docSnap.id,
      role,
      clerkRole,
      resolvedName,
      agentId: pending.agentId || null,
      assignedArea: pending.assignedArea || pending.area || null,
    });

    const membershipData = {
      id: membershipDocId,
      organizationId: invitationOrgId,
      clerkUserId,
      clerkOrganizationId: pending.clerkOrganizationId || invitationOrgId,
      clerkRole,
      role,
      organizationName: pending.organizationName || "",
      fullName: resolvedName,
      email: emailKey,
      phone: pending.phone || "",
      assignedArea: pending.assignedArea || pending.area || "",
      agentId: pending.agentId || "",
      invitedBy: pending.invitedBy || "",
      profileCompleted: pending.profileCompleted || false,
      joinedAt,
      status: "active",
      createdAt: pending.createdAt || joinedAt,
      updatedAt: serverTimestamp(),
    } as any;

    const membershipRef = doc(db, "memberships", membershipDocId);
    await setDoc(membershipRef, membershipData, { merge: true });
    console.log("reconcilePendingInviteMembership: membership created", membershipDocId);

    const orgMemberRef = doc(db, "organizationMembers", membershipDocId);
    await setDoc(orgMemberRef, membershipData, { merge: true });

    if (role === "customer") {
      const customerRef = doc(db, "customers", membershipDocId);
      await setDoc(customerRef, membershipData, { merge: true });
    }

    await updateDoc(doc(db, "pendingInvites", docSnap.id), {
      status: "ACTIVE",
      clerkUserId,
      updatedAt: serverTimestamp(),
      joinedAt,
      acceptedAt: serverTimestamp(),
    });

    return membershipData;
  }));

  console.log("reconcilePendingInviteMembership: completed", accepted.length, "invite(s)");
  return accepted;
}

export async function activatePendingInvite(email: string, organizationId: string, clerkUserId: string, fullName?: string) {
  const memberships = await reconcilePendingInviteMembership(email, organizationId, clerkUserId, fullName);
  if (!memberships.length) {
    console.log("activatePendingInvite: no active pending invite to reconcile");
    return memberships;
  }

  const emailKey = email.trim().toLowerCase();
  const activeMembership = memberships[0];
  const userRef = doc(db, "users", clerkUserId);
  await setDoc(userRef, {
    clerkUserId,
    id: clerkUserId,
    email: emailKey,
    name: fullName || activeMembership.fullName || "",
    role: activeMembership.role?.toString().toLowerCase() || "",    clerkRole: activeMembership.clerkRole || "org:customer",    organizationId: activeMembership.organizationId,
    status: "active",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });

  return memberships;
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

export async function recordCollection(organizationId: string, collectionData: Pick<Collection, "customerId" | "agentId" | "amount" | "status" | "collectedByRole" | "collectedByUserId" | "collectedByName">) {
  // First, add the collection record
  const collRef = await addDoc(collection(db, "collections"), {
    ...collectionData,
    organizationId,
    timestamp: serverTimestamp(),
  });

  // Then add to transactions log
  await addDoc(collection(db, "transactions"), {
    organizationId,
    customerId: collectionData.customerId,
    agentId: collectionData.agentId,
    amount: collectionData.amount,
    type: "deposit",
    timestamp: serverTimestamp(),
    referenceId: collRef.id,
    collectedByRole: collectionData.collectedByRole || "AGENT",
    collectedByUserId: collectionData.collectedByUserId || collectionData.agentId,
    collectedByName: collectionData.collectedByName || "Collector",
  });

  // If collection is completed, increment customer balance
  if (collectionData.status === "completed") {
    const userRef = doc(db, "users", collectionData.customerId);
    const userSnap = await getDoc(userRef);
    const currentBalance = userSnap.data()?.balance || 0;
    await updateDoc(userRef, {
      balance: currentBalance + collectionData.amount,
    });
  }
  
  return collRef;
}

export async function updateCustomerBalance(customerId: string, newBalance: number) {
  const userRef = doc(db, "users", customerId);
  await updateDoc(userRef, { balance: newBalance });
}

export async function applyForLoan(organizationId: string, loanData: Pick<Loan, "customerId" | "principal" | "durationMonths">) {
  // Hardcode interest calculation logic. Say 2% monthly.
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
  
  if (!loanSnap.exists()) {
    throw new Error("Loan not found");
  }

  const loanData = loanSnap.data() as Loan;

  // Update loan status to active
  await updateDoc(loanRef, {
    status: "active",
    approvedAt: serverTimestamp(),
  });

  // Generate EMI payment schedule
  for (let month = 1; month <= loanData.durationMonths; month++) {
    await addDoc(collection(db, "emi_payments"), {
      organizationId: loanData.organizationId,
      loanId: loanId,
      customerId: loanData.customerId,
      agentId: "", // Will be assigned when payment is recorded
      amount: loanData.emiAmount,
      monthNumber: month,
      dueDate: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000), // Approximately one month from now per month
      paid: false,
      timestamp: serverTimestamp(),
    });
  }

  // Add loan principal disbursement to customer balance
  const userRef = doc(db, "users", loanData.customerId);
  const userSnap = await getDoc(userRef);
  const currentBalance = userSnap.data()?.balance || 0;
  await updateDoc(userRef, {
    balance: currentBalance + loanData.principal,
  });

  // Record disbursement transaction
  await addDoc(collection(db, "transactions"), {
    organizationId: loanData.organizationId,
    customerId: loanData.customerId,
    agentId: "", // System transaction
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

  // Decrement customer balance by EMI amount
  const userRef = doc(db, "users", emiData.customerId);
  const userSnap = await getDoc(userRef);
  const currentBalance = userSnap.data()?.balance || 0;
  await updateDoc(userRef, {
    balance: Math.max(0, currentBalance - emiData.amount),
  });

  // Decrement loan balance remaining
  const loanRef = doc(db, "loans", emiData.loanId);
  const loanSnap = await getDoc(loanRef);
  if (loanSnap.exists()) {
    const currentRemaining = loanSnap.data().balanceRemaining || 0;
    const newRemaining = Math.max(0, currentRemaining - emiData.amount);
    
    await updateDoc(loanRef, {
      balanceRemaining: newRemaining,
      // If balance reaches 0, mark loan as completed
      ...(newRemaining === 0 && { status: "completed" })
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

/**
 * Comprehensive invitation workflow for agents and customers
 * Handles both Firestore and Clerk synchronization with detailed error handling
 */
export async function sendOrganizationInvitation(options: {
  organization: any;
  organizationId: string;
  email: string;
  role: "pigmy_collector" | "customer" | "owner";
  clerkRole: "org:pigmy_collector" | "org:customer" | "org:owner";
  invitedBy: string;
  invitedByEmail: string;
  assignedArea?: string;
  agentId?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
}): Promise<{ success: boolean; message: string; invitationId?: string }> {
  const {
    organization,
    organizationId,
    email,
    role,
    clerkRole,
    invitedBy,
    invitedByEmail,
    assignedArea,
    agentId,
    assignedAgentId,
    assignedAgentName,
  } = options;

  const emailKey = email.trim().toLowerCase();

  // Step 1: Validate inputs
  console.log("sendOrganizationInvitation: validating inputs", {
    organizationId,
    email: emailKey,
    role,
    clerkRole,
  });

  if (!organizationId || organizationId.trim() === "") {
    const err = "Organization ID is missing or invalid";
    console.error("AGENT_INVITE_ERROR: MISSING_ORG_ID", err);
    throw new Error(err);
  }

  if (!email || emailKey.length === 0) {
    const err = "Email address is required";
    console.error("AGENT_INVITE_ERROR: MISSING_EMAIL", err);
    throw new Error(err);
  }

  if (!organization || !organization.id) {
    const err = "Active organization not found in Clerk. Please refresh and try again.";
    console.error("AGENT_INVITE_ERROR: MISSING_CLERK_ORG", err);
    throw new Error(err);
  }

  if (organization.id !== organizationId) {
    const err = `Organization mismatch: Clerk org ${organization.id} does not match Firestore org ${organizationId}`;
    console.error("AGENT_INVITE_ERROR: ORG_MISMATCH", err);
    throw new Error(err);
  }

  if (!organization.inviteMember || typeof organization.inviteMember !== "function") {
    const err = "This organization does not support member invitations. Check Clerk configuration.";
    console.error("AGENT_INVITE_ERROR: NO_INVITE_METHOD", err);
    throw new Error(err);
  }

  // Step 2: Save to Firestore FIRST (creates invited org member and pending invite)
  console.log("sendOrganizationInvitation: saving to Firestore");

  let pendingInviteId: string;
  let organizationMemberId: string;
  try {
    const pendingRef = await addDoc(collection(db, "pendingInvites"), {
      email: emailKey,
      role,
      clerkRole,
      organizationId,
      clerkOrganizationId: organization.id,
      organizationName: organization.name || "",
      assignedArea: assignedArea || "",
      agentId: agentId || assignedAgentId || "",
      assignedAgentId: assignedAgentId || "",
      assignedAgentName: assignedAgentName || "",
      invitedBy,
      invitedByEmail,
      profileCompleted: false,
      status: "PENDING",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    pendingInviteId = pendingRef.id;
    await setDoc(pendingRef, { id: pendingRef.id }, { merge: true });
    console.log("sendOrganizationInvitation: pending invite created", pendingInviteId);

    const membershipRole = role === "pigmy_collector" ? "AGENT" : role === "customer" ? "CUSTOMER" : "OWNER";
    const orgMemberRef = await addDoc(collection(db, "organizationMembers"), {
      email: emailKey,
      organizationId,
      clerkOrganizationId: organization.id,
      organizationName: organization.name || "",
      role: membershipRole,
      clerkUserId: "",
      fullName: "",
      phone: "",
      address: "",
      assignedArea: assignedArea || "",
      assignedAgentId: assignedAgentId || "",
      assignedAgentName: assignedAgentName || "",
      profileCompleted: false,
      status: "INVITED",
      invitedAt: serverTimestamp(),
      joinedAt: null,
      createdBy: invitedBy,
      invitedByEmail,
      pendingInviteId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    organizationMemberId = orgMemberRef.id;
    await setDoc(orgMemberRef, { id: orgMemberRef.id }, { merge: true });
    console.log("sendOrganizationInvitation: organization member invite created", organizationMemberId);

    // For customer invitations, also write to the dedicated customers collection
    if (role === "customer") {
      await setDoc(doc(db, "customers", organizationMemberId), {
        id: organizationMemberId,
        organizationId,
        assignedAgentId: assignedAgentId || "",
        assignedAgentName: assignedAgentName || "",
        fullName: "",
        phone: "",
        address: "",
        email: emailKey,
        status: "INVITED",
        profileCompleted: false,
        invitedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("sendOrganizationInvitation: customer doc created", organizationMemberId);
    }

    await updateDoc(doc(db, "pendingInvites", pendingInviteId), {
      organizationMemberId,
      updatedAt: serverTimestamp(),
    });
  } catch (firestoreError) {
    console.error("AGENT_INVITE_ERROR: FIRESTORE_WRITE_FAILED", firestoreError);
    throw new Error(`Failed to save invitation to database: ${(firestoreError as any).message}`);
  }

  // Step 3: Send Clerk organization invitation
  console.log("sendOrganizationInvitation: sending Clerk invitation", {
    organizationId: organization.id,
    emailAddress: emailKey,
    role: clerkRole,
  });

  let clerkInvitationId: string;
  try {
    const invitation = await organization.inviteMember({
      emailAddress: emailKey,
      role: clerkRole,
    });

    if (!invitation || !invitation.id) {
      throw new Error("Clerk invitation created but no ID returned");
    }

    clerkInvitationId = invitation.id;
    console.log("sendOrganizationInvitation: Clerk invitation sent successfully", {
      clerkInvitationId,
      email: emailKey,
    });

    // Step 4: Update Firestore with Clerk invitation ID
    try {
      await updateDoc(doc(db, "pendingInvites", pendingInviteId), {
        clerkInvitationId,
        clerkSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("sendOrganizationInvitation: Firestore updated with Clerk invitation ID");
    } catch (updateError) {
      console.warn("sendOrganizationInvitation: failed to update Firestore with Clerk ID", updateError);
      // Non-fatal error - invitation still succeeded
    }
  } catch (clerkError: any) {
    console.error("AGENT_INVITE_ERROR: CLERK_INVITATION_FAILED", clerkError);

    // Extract meaningful error message from Clerk error
    let errorMessage = "Failed to send invitation via Clerk";

    if (clerkError?.message) {
      errorMessage = clerkError.message;
    } else if (clerkError?.errors?.[0]?.message) {
      errorMessage = clerkError.errors[0].message;
    }

    // Check for specific Clerk errors
    if (errorMessage.includes("role")) {
      errorMessage = `Invalid role "${clerkRole}". Ensure custom roles are configured in Clerk dashboard.`;
    } else if (errorMessage.includes("permission")) {
      errorMessage = "You don't have permission to invite members to this organization.";
    } else if (errorMessage.includes("organization")) {
      errorMessage = "The organization is invalid or has been deleted.";
    }

    // Mark invitation as failed in Firestore
    try {
      await updateDoc(doc(db, "pendingInvites", pendingInviteId), {
        status: "FAILED",
        clerkError: errorMessage,
        failedAt: serverTimestamp(),
      });
    } catch (markFailError) {
      console.warn("Failed to mark invitation as failed in Firestore", markFailError);
    }

    throw new Error(errorMessage);
  }

  // Increment org usage counter
  try {
    await setDoc(doc(db, "organizations", options.organizationId), {
      "usage.activeCustomers": increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (_) {}

  return {
    success: true,
    message: `Invitation sent to ${emailKey}. They will receive an email to join the organization.`,
    invitationId: pendingInviteId,
  };
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
  // Check for existing PENDING request from this agent to avoid duplicates
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


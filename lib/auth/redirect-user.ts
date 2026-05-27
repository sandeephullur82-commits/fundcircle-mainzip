import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor, reconcilePendingInviteMembership } from "@/lib/services";
import { getDashboardPath, normalizeClerkRole } from "./get-user-role";

export interface UserRedirectResult {
  path: string;
  profileIncomplete: boolean;
  role: string | null;
  membership: any | null;
  organizationId: string | null;
}

async function fetchMembershipForOrganization(userId: string, organizationId: string) {
  const membershipDoc = await getDoc(doc(db, "organizationMembers", membershipIdFor(organizationId, userId)));
  if (!membershipDoc.exists()) {
    return null;
  }
  return membershipDoc.data();
}

async function fetchAnyMembershipForUser(userId: string) {
  const membershipQuery = query(
    collection(db, "organizationMembers"),
    where("clerkUserId", "==", userId)
  );
  const snapshot = await getDocs(membershipQuery);
  if (snapshot.empty) {
    return null;
  }
  return snapshot.docs[0].data();
}

export async function resolveUserRedirectTarget(user: any | null, activeOrgId?: string | null): Promise<UserRedirectResult> {
  if (!user) {
    return {
      path: "/sign-in",
      profileIncomplete: false,
      role: null,
      membership: null,
      organizationId: null,
    };
  }

  const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || "";
  const fullName = user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim();

  if (email && activeOrgId) {
    try {
      await reconcilePendingInviteMembership(email, activeOrgId, user.id, fullName);
    } catch (error) {
      console.error("redirect-user: pending invite reconciliation failed", error);
    }
  }

  let membership = null;
  let membershipOrgId = activeOrgId || null;
  if (activeOrgId) {
    membership = await fetchMembershipForOrganization(user.id, activeOrgId);
  }

  if (!membership) {
    membership = await fetchAnyMembershipForUser(user.id);
    if (membership) {
      membershipOrgId = membership.organizationId || membershipOrgId;
    }
  }

  if (!membership) {
    return {
      path: "/organization/invitation",
      profileIncomplete: false,
      role: null,
      membership: null,
      organizationId: membershipOrgId,
    };
  }

  const role = membership.clerkRole || membership.role || null;
  const normalized = normalizeClerkRole(role);
  const profileCompleted = membership.profileCompleted !== false;
  const path = profileCompleted ? getDashboardPath(role) : "/complete-profile";

  return {
    path,
    profileIncomplete: !profileCompleted,
    role,
    membership,
    organizationId: membershipOrgId,
  };
}

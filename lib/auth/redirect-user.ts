import {
  collection, doc, getDoc, getDocs, query, where,
  setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import { getDashboardPath, normalizeClerkRole } from "./get-user-role";

export interface UserRedirectResult {
  path: string;
  profileIncomplete: boolean;
  role: string | null;
  membership: any | null;
  organizationId: string | null;
}

async function fetchMembershipForOrganization(userId: string, organizationId: string) {
  const docId = membershipIdFor(organizationId, userId);
  console.log("[FC STEP 9] fetchMembership — docId:", docId);
  const snap = await getDoc(doc(db, "organizationMembers", docId));
  if (!snap.exists()) {
    console.warn("[FC STEP 9] ✗ No membership doc at organizationMembers/" + docId);
    return null;
  }
  const data = snap.data();
  console.log("[FC STEP 9] ✓ Membership doc found:");
  console.log("[FC STEP 9]   role             :", data.clerkRole ?? data.role ?? "MISSING");
  console.log("[FC STEP 9]   status           :", data.status ?? "—");
  console.log("[FC STEP 9]   profileCompleted :", data.profileCompleted ?? "field absent");
  console.log("[FC STEP 9]   clerkUserId      :", data.clerkUserId ?? "MISSING — may block role resolution");
  console.log("[FC STEP 9]   organizationId   :", data.organizationId ?? "MISSING");
  console.log("[FC STEP 9]   email            :", data.email ?? "—");
  return data;
}

async function fetchAnyMembershipForUser(userId: string, email?: string | null) {
  console.log("[FC STEP 9] Searching ALL orgs for userId:", userId);
  const snap = await getDocs(
    query(collection(db, "organizationMembers"), where("clerkUserId", "==", userId))
  );
  if (!snap.empty) {
    const data = snap.docs[0].data();
    console.log("[FC STEP 9] ✓ Found membership in org:", data.organizationId ?? snap.docs[0].id);
    console.log("[FC STEP 9]   role:", data.clerkRole ?? data.role ?? "MISSING");
    console.log("[FC STEP 9]   status:", data.status ?? "—");
    return data;
  }

  // Reconcile PENDING_INVITED docs by email.
  // This happens when a newly-invited user accepts their Clerk invitation and
  // signs up — at that point we know their clerkUserId and can activate the doc.
  if (email) {
    console.log("[FC STEP 9] No clerkUserId match — searching PENDING_INVITED docs by email:", email);
    const emailSnap = await getDocs(
      query(
        collection(db, "organizationMembers"),
        where("email", "==", email),
        where("status", "==", "PENDING_INVITED"),
      )
    );
    if (!emailSnap.empty) {
      const pendingDoc = emailSnap.docs[0];
      const pendingData = pendingDoc.data();
      const orgId = pendingData.organizationId;

      console.log("[FC STEP 9] ✓ PENDING_INVITED doc found — reconciling for userId:", userId, "org:", orgId);

      const newDocId = membershipIdFor(orgId, userId);
      const reconciledData = {
        ...pendingData,
        id: newDocId,
        clerkUserId: userId,
        status: "ACTIVE",
        profileCompleted: false,
        activatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "organizationMembers", newDocId), reconciledData);
      await setDoc(doc(db, "memberships", newDocId), reconciledData);

      const role = (pendingData.role || "").toUpperCase();
      if (role === "CUSTOMER") {
        try {
          const oldCustSnap = await getDoc(doc(db, "customers", pendingDoc.id));
          if (oldCustSnap.exists()) {
            await setDoc(doc(db, "customers", newDocId), {
              ...oldCustSnap.data(),
              id: newDocId,
              clerkUserId: userId,
              status: "ACTIVE",
              updatedAt: serverTimestamp(),
            });
            await deleteDoc(doc(db, "customers", pendingDoc.id));
          }
        } catch (err) {
          console.warn("[FC STEP 9] Customer doc migration failed (non-fatal):", err);
        }
      }

      await deleteDoc(pendingDoc.ref);

      console.log("[FC STEP 9] ✓ Reconciliation complete → new doc:", newDocId);
      return reconciledData;
    }
  }

  console.warn("[FC STEP 9] ✗ No membership found anywhere for userId:", userId);
  return null;
}

export async function resolveUserRedirectTarget(
  user: any | null,
  activeOrgId?: string | null
): Promise<UserRedirectResult> {
  if (!user) {
    console.warn("[FC STEP 9] No user object — returning /auth/sign-in");
    return { path: "/auth/sign-in", profileIncomplete: false, role: null, membership: null, organizationId: null };
  }

  console.log("════════════════════════════════════════════════");
  console.log("[FC STEP 9] ▶ Role resolution");
  console.log("[FC STEP 9]   userId     :", user.id);
  console.log("[FC STEP 9]   activeOrgId:", activeOrgId ?? "null");
  console.log("════════════════════════════════════════════════");

  const email: string | null =
    user.primaryEmailAddress?.emailAddress?.toLowerCase() ||
    user.emailAddresses?.[0]?.emailAddress?.toLowerCase() ||
    null;

  let membership: any = null;
  let membershipOrgId = activeOrgId || null;

  if (activeOrgId) {
    membership = await fetchMembershipForOrganization(user.id, activeOrgId);
  }

  if (!membership) {
    console.log("[FC STEP 9] No membership for active org — searching all orgs…");
    membership = await fetchAnyMembershipForUser(user.id, email);
    if (membership) {
      membershipOrgId = membership.organizationId || membershipOrgId;
    }
  }

  if (!membership) {
    console.warn("[FC STEP 9] ✗ No Firestore membership found anywhere — routing to /onboarding");
    return { path: "/onboarding", profileIncomplete: false, role: null, membership: null, organizationId: membershipOrgId };
  }

  const rawRole = membership.clerkRole || membership.role || null;
  const normalized = normalizeClerkRole(rawRole);
  const profileCompleted = membership.profileCompleted !== false;
  const path = profileCompleted ? getDashboardPath(rawRole) : "/complete-profile";

  console.log("[FC STEP 9] ✓ Role resolved:");
  console.log("[FC STEP 9]   rawRole         :", rawRole ?? "NULL — CRITICAL: no role stored in Firestore doc");
  console.log("[FC STEP 9]   normalizedRole  :", normalized ?? "null (UNRECOGNIZED)");
  console.log("[FC STEP 9]   profileCompleted:", profileCompleted);
  console.log("[FC STEP 10]   → destination  :", path);

  return { path, profileIncomplete: !profileCompleted, role: rawRole, membership, organizationId: membershipOrgId };
}

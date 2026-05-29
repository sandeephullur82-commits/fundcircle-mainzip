import { useEffect, useRef, useState } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { resolveUserRedirectTarget } from "@/lib/auth/redirect-user";
import { membershipIdFor } from "@/lib/services";
import { normalizeClerkRole, getDashboardPath } from "@/lib/auth/get-user-role";
import { Loader2 } from "lucide-react";

const CALLBACK_TIMEOUT_MS = 5000;

// ─── Step-by-step verification logger ───────────────────────────────────────
async function runDiagnostics(
  user: any,
  activeOrgId: string | null,
  clerkMemberships: any[],
  clerkInvitations: any[]
) {
  console.log("════════════════════════════════════════════");
  console.log("[FC AuthCallback Diagnostics] START");
  console.log("════════════════════════════════════════════");

  // 1 ── Clerk user verification ────────────────────────────────────────────
  console.group("[FC Diag] 1. Clerk user");
  console.log("  id          :", user?.id ?? "MISSING");
  console.log("  email       :", user?.primaryEmailAddress?.emailAddress ?? "MISSING");
  console.log("  firstName   :", user?.firstName ?? "—");
  console.log("  lastName    :", user?.lastName ?? "—");
  console.log("  createdAt   :", user?.createdAt ? new Date(user.createdAt).toISOString() : "—");
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";
  console.log("  emailVerified:", emailVerified ? "✓ yes" : "✗ NO — may block sign-in!");
  console.groupEnd();

  // 2 ── Clerk organisation membership ──────────────────────────────────────
  console.group("[FC Diag] 2. Clerk org memberships");
  console.log("  count        :", clerkMemberships.length);
  clerkMemberships.forEach((m, i) => {
    console.log(`  [${i}] orgId: ${m.organization?.id} | orgName: ${m.organization?.name} | clerkRole: ${m.role}`);
  });
  if (!clerkMemberships.length) console.warn("  ⚠ No Clerk org memberships — invited user may not have used ticket during sign-up");
  console.log("  activeOrgId  :", activeOrgId ?? "null");
  console.groupEnd();

  // 3 ── Clerk pending invitations ───────────────────────────────────────────
  console.group("[FC Diag] 3. Clerk pending invitations");
  console.log("  count        :", clerkInvitations.length);
  clerkInvitations.forEach((inv, i) => {
    console.log(`  [${i}] orgId: ${inv.publicOrganizationData?.id} | role: ${inv.role} | status: ${inv.status}`);
  });
  console.groupEnd();

  // 4 ── Firestore membership doc ────────────────────────────────────────────
  console.group("[FC Diag] 4. Firestore membership");
  let firestoreDoc: any = null;
  if (user?.id && activeOrgId) {
    const docId = membershipIdFor(activeOrgId, user.id);
    console.log("  docId        :", docId);
    try {
      const snap = await getDoc(doc(db, "organizationMembers", docId));
      if (snap.exists()) {
        firestoreDoc = snap.data();
        console.log("  exists       : ✓ yes");
        console.log("  role         :", firestoreDoc.clerkRole ?? firestoreDoc.role ?? "MISSING — check Firestore doc");
        console.log("  profileCompleted:", firestoreDoc.profileCompleted ?? "field absent (treated as true)");
        console.log("  email        :", firestoreDoc.email ?? "—");
        console.log("  clerkUserId  :", firestoreDoc.clerkUserId ?? "MISSING");
      } else {
        console.warn("  exists       : ✗ NOT FOUND");
        console.warn("  ⚠ Firestore membership doc missing — owner may not have pre-created the collector record");
        console.warn("  Expected doc at: organizationMembers/", docId);
      }
    } catch (err) {
      console.error("  Firestore read error:", err);
    }
  } else {
    console.warn("  Skipped — no userId or activeOrgId");
  }
  console.groupEnd();

  // 5 ── Role resolution ─────────────────────────────────────────────────────
  console.group("[FC Diag] 5. Role resolution");
  const rawRole = firestoreDoc?.clerkRole ?? firestoreDoc?.role ?? null;
  const normalizedRole = normalizeClerkRole(rawRole);
  const clerkRole = clerkMemberships.find(m => m.organization?.id === activeOrgId)?.role ?? null;
  const normalizedClerkRole = normalizeClerkRole(clerkRole);
  console.log("  Firestore rawRole      :", rawRole ?? "null");
  console.log("  Firestore normalizedRole:", normalizedRole ?? "null (unrecognized — check normalizeClerkRole())");
  console.log("  Clerk rawRole          :", clerkRole ?? "null");
  console.log("  Clerk normalizedRole   :", normalizedClerkRole ?? "null");
  if (!normalizedRole && !normalizedClerkRole) {
    console.error("  ✗ NEITHER Firestore nor Clerk has a recognized role!");
    console.error("  Valid roles: OWNER, AGENT, CUSTOMER (Firestore) | org:owner, org:pigmy_collector, org:customer (Clerk)");
  }
  console.groupEnd();

  // 6 ── Onboarding completion ───────────────────────────────────────────────
  console.group("[FC Diag] 6. Onboarding / profile");
  const profileCompleted = firestoreDoc ? (firestoreDoc.profileCompleted !== false) : null;
  console.log("  profileCompleted:", profileCompleted === null ? "unknown (no Firestore doc)" : profileCompleted ? "✓ yes" : "✗ NO — will redirect to /complete-profile");
  console.groupEnd();

  // 7 ── Expected redirect ───────────────────────────────────────────────────
  console.group("[FC Diag] 7. Expected redirect");
  const effectiveRole = normalizedRole ?? normalizedClerkRole;
  let expectedPath = "unknown";
  if (!firestoreDoc && !clerkMemberships.length && clerkInvitations.length) {
    expectedPath = "/organization/invitation";
  } else if (!firestoreDoc && !clerkMemberships.length) {
    expectedPath = "/onboarding";
  } else if (firestoreDoc && !profileCompleted) {
    expectedPath = "/complete-profile";
  } else if (effectiveRole) {
    expectedPath = getDashboardPath(effectiveRole);
  } else {
    expectedPath = "/onboarding (role unknown fallback)";
  }
  console.log("  Effective role :", effectiveRole ?? "none");
  console.log("  → Expected path:", expectedPath);
  console.groupEnd();

  // 8 ── Redirect loop check ─────────────────────────────────────────────────
  console.group("[FC Diag] 8. Redirect loop risks");
  const loopRisks: string[] = [];
  if (!clerkMemberships.length && !clerkInvitations.length && normalizedRole === "pigmy_collector") {
    loopRisks.push("Firestore says pigmy_collector but Clerk has no org membership — /dashboard/agent may redirect back to /router");
  }
  if (!emailVerified) {
    loopRisks.push("Email not verified — sign-in may fail silently");
  }
  if (firestoreDoc && !firestoreDoc.organizationId) {
    loopRisks.push("Firestore membership doc missing organizationId field — setActive() will fail");
  }
  if (loopRisks.length) {
    loopRisks.forEach(r => console.warn("  ⚠", r));
  } else {
    console.log("  ✓ No obvious redirect loop risks detected");
  }
  console.groupEnd();

  console.log("════════════════════════════════════════════");
  console.log("[FC AuthCallback Diagnostics] END");
  console.log("════════════════════════════════════════════");
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AuthCallbackPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: orgListLoaded, setActive, userMemberships, userInvitations } =
    useOrganizationList({ userMemberships: true, userInvitations: true });
  const navigate = useNavigate();
  const [status, setStatus] = useState("Checking your session…");
  const [timedOut, setTimedOut] = useState(false);
  const redirectedRef = useRef(false);

  // Hard timeout — if Firestore/Clerk takes >5s, fall back gracefully
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!redirectedRef.current) {
        console.warn("[FC AuthCallback] Timeout reached (5s) — falling back to /router");
        setTimedOut(true);
      }
    }, CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Timeout fallback
  useEffect(() => {
    if (!timedOut || redirectedRef.current) return;
    redirectedRef.current = true;
    toast.error("Taking longer than expected. Retrying…");
    navigate("/router", { replace: true });
  }, [timedOut, navigate]);

  useEffect(() => {
    if (!isLoaded || !orgListLoaded) return;

    const performRedirect = async () => {
      // ── Not signed in ────────────────────────────────────────────────────
      if (!isSignedIn || !user) {
        console.log("[FC AuthCallback] Not signed in — redirecting to /auth/sign-in");
        redirectedRef.current = true;
        navigate("/auth/sign-in", { replace: true });
        return;
      }

      setStatus("Verifying your account…");
      console.log("────────────────────────────────────────────");
      console.log("[FC AuthCallback] ▶ performRedirect()");
      console.log("[FC AuthCallback]   userId  :", user.id);
      console.log("[FC AuthCallback]   email   :", user.primaryEmailAddress?.emailAddress ?? "none");
      console.log("[FC AuthCallback]   orgId   :", organization?.id ?? "none (no active org yet)");
      console.log("[FC AuthCallback]   memberships from Clerk:", userMemberships?.data?.length ?? 0);
      console.log("[FC AuthCallback]   pending invitations   :", userInvitations?.data?.length ?? 0);

      try {
        // ── Activate first org if none active ────────────────────────────
        if (!organization?.id && userMemberships?.data?.length && setActive) {
          const firstOrgId = userMemberships.data[0].organization.id;
          console.log("[FC AuthCallback]   Activating first Clerk org:", firstOrgId);
          setStatus("Activating your organisation…");
          await setActive({ organization: firstOrgId });
          console.log("[FC AuthCallback]   setActive() complete for org:", firstOrgId);
        }

        const activeOrgId =
          organization?.id ||
          userMemberships?.data?.[0]?.organization?.id ||
          null;

        console.log("[FC AuthCallback]   activeOrgId resolved:", activeOrgId ?? "null");

        // ── Run diagnostics (always, so we can see what's happening) ─────
        setStatus("Preparing your workspace…");
        await runDiagnostics(
          user,
          activeOrgId,
          userMemberships?.data ?? [],
          userInvitations?.data ?? []
        );

        // ── Resolve redirect target ───────────────────────────────────────
        const redirect = await resolveUserRedirectTarget(user, activeOrgId);
        console.log("[FC AuthCallback]   resolveUserRedirectTarget() →", {
          path: redirect.path,
          role: redirect.role,
          hasMembership: !!redirect.membership,
          organizationId: redirect.organizationId,
          profileIncomplete: redirect.profileIncomplete,
        });

        if (redirectedRef.current) return;
        redirectedRef.current = true;

        // ── No Firestore membership → try Clerk invitations ──────────────
        if (!redirect.membership) {
          if (userInvitations?.data?.length) {
            console.log("[FC AuthCallback]   → No Firestore membership but has Clerk invite — /organization/invitation");
            navigate("/organization/invitation", { replace: true });
            return;
          }
          // Has Clerk org membership but no Firestore doc yet?
          if (userMemberships?.data?.length && activeOrgId) {
            const clerkRole = userMemberships.data[0].role;
            const normalized = normalizeClerkRole(clerkRole);
            const fallbackPath = getDashboardPath(normalized);
            console.warn("[FC AuthCallback]   No Firestore doc but has Clerk membership — Clerk role fallback:", clerkRole, "→", fallbackPath);
            navigate(fallbackPath, { replace: true });
            return;
          }
          console.log("[FC AuthCallback]   → No membership anywhere — /onboarding");
          navigate("/onboarding", { replace: true });
          return;
        }

        // ── Activate the org for this membership ─────────────────────────
        if (redirect.organizationId && setActive && organization?.id !== redirect.organizationId) {
          console.log("[FC AuthCallback]   Activating org from membership:", redirect.organizationId);
          try { await setActive({ organization: redirect.organizationId }); } catch (e) {
            console.warn("[FC AuthCallback]   setActive() failed (non-fatal):", e);
          }
        }

        console.log("[FC AuthCallback]   → Final redirect:", redirect.path);
        navigate(redirect.path, { replace: true });

      } catch (error: any) {
        console.error("[FC AuthCallback]   Error during redirect resolution:", error);
        if (redirectedRef.current) return;
        redirectedRef.current = true;
        toast.error(error?.message ?? "Unable to finish authentication.");
        navigate("/router", { replace: true });
      }
    };

    performRedirect();
  }, [
    isLoaded, isSignedIn, user,
    orgListLoaded, organization?.id,
    setActive,
    userMemberships?.data,
    userInvitations?.data,
    navigate,
  ]);

  return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-4 relative overflow-x-hidden">
      <div className="pointer-events-none absolute -top-48 -left-40 h-[650px] w-[650px] rounded-full bg-violet-700/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[550px] w-[550px] rounded-full bg-blue-600/18 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3 mb-2">
          <img
            src="/fundcircle-logo.png"
            alt="FundCircle"
            className="h-12 w-12 rounded-2xl object-cover object-top shadow-2xl shadow-violet-900/60 ring-1 ring-white/10"
          />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">FundCircle</h1>
            <p className="text-[11px] text-white/35 font-medium tracking-[0.15em] uppercase mt-0.5">Micro-Savings Platform</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] px-10 py-8 backdrop-blur-2xl shadow-2xl shadow-black/50 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
          <p className="text-sm font-medium text-white/50">{status}</p>
        </div>
      </div>
    </div>
  );
}

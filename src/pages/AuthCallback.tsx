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

async function runDiagnostics(
  user: any,
  activeOrgId: string | null,
  clerkMemberships: any[]
) {
  console.log("════════════════════════════════════════════");
  console.log("[FC AuthCallback Diagnostics] START");
  console.log("════════════════════════════════════════════");

  console.group("[FC Diag] 1. Clerk user");
  console.log("  id          :", user?.id ?? "MISSING");
  console.log("  email       :", user?.primaryEmailAddress?.emailAddress ?? "MISSING");
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";
  console.log("  emailVerified:", emailVerified ? "✓ yes" : "✗ NO");
  console.groupEnd();

  console.group("[FC Diag] 2. Clerk org memberships");
  console.log("  count        :", clerkMemberships.length);
  clerkMemberships.forEach((m, i) => {
    console.log(`  [${i}] orgId: ${m.organization?.id} | role: ${m.role}`);
  });
  console.log("  activeOrgId  :", activeOrgId ?? "null");
  console.groupEnd();

  console.group("[FC Diag] 3. Firestore membership");
  if (user?.id && activeOrgId) {
    const docId = membershipIdFor(activeOrgId, user.id);
    try {
      const snap = await getDoc(doc(db, "organizationMembers", docId));
      if (snap.exists()) {
        const d = snap.data();
        console.log("  exists       : ✓ yes");
        console.log("  role         :", d.clerkRole ?? d.role ?? "MISSING");
        console.log("  status       :", d.status ?? "—");
        console.log("  profileCompleted:", d.profileCompleted ?? "field absent");
      } else {
        console.warn("  exists       : ✗ NOT FOUND at organizationMembers/" + docId);
      }
    } catch (err) {
      console.error("  Firestore read error:", err);
    }
  } else {
    console.warn("  Skipped — no userId or activeOrgId");
  }
  console.groupEnd();

  console.log("════════════════════════════════════════════");
  console.log("[FC AuthCallback Diagnostics] END");
  console.log("════════════════════════════════════════════");
}

export default function AuthCallbackPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: orgListLoaded, setActive, userMemberships } =
    useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();
  const [status, setStatus] = useState("Checking your session…");
  const [timedOut, setTimedOut] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!redirectedRef.current) {
        console.warn("[FC AuthCallback] Timeout reached (5s) — falling back to /router");
        setTimedOut(true);
      }
    }, CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!timedOut || redirectedRef.current) return;
    redirectedRef.current = true;
    toast.error("Taking longer than expected. Retrying…");
    navigate("/router", { replace: true });
  }, [timedOut, navigate]);

  useEffect(() => {
    // ── Wait for Clerk to fully propagate ────────────────────────────────────
    // setActive() activates the session synchronously in Clerk's internals, but
    // the React context (isSignedIn / user) updates one render cycle later.
    // Without this guard, performRedirect() fires on the intermediate render
    // where isLoaded=true + orgListLoaded=true but isSignedIn=false, causing it
    // to immediately navigate("/auth/sign-in") and lock redirectedRef permanently.
    if (!isLoaded || !orgListLoaded) return;
    if (!isSignedIn || !user) return; // session not propagated yet — wait for next render

    const performRedirect = async () => {
      // Safety: this can no longer fire when !isSignedIn, but keep for type narrowing.
      if (!user) return;

      setStatus("Verifying your account…");
      console.log("[FC AuthCallback] ▶ performRedirect() userId:", user.id);

      try {
        const memberships = userMemberships?.data ?? [];

        const isMultiOrgNonOwner =
          !organization?.id &&
          memberships.length > 1 &&
          memberships[0]?.role !== "org:admin" &&
          memberships[0]?.role !== "org:owner";

        if (isMultiOrgNonOwner) {
          redirectedRef.current = true;
          navigate("/org-select", { replace: true });
          return;
        }

        if (!organization?.id && memberships.length && setActive) {
          const firstOrgId = memberships[0].organization.id;
          setStatus("Activating your organisation…");
          await setActive({ organization: firstOrgId });
        }

        const activeOrgId =
          organization?.id ||
          userMemberships?.data?.[0]?.organization?.id ||
          null;

        setStatus("Preparing your workspace…");
        await runDiagnostics(user, activeOrgId, memberships);

        const redirect = await resolveUserRedirectTarget(user, activeOrgId);
        console.log("[FC AuthCallback] resolveUserRedirectTarget() →", redirect.path);

        if (redirectedRef.current) return;
        redirectedRef.current = true;

        if (!redirect.membership) {
          if (memberships.length && activeOrgId) {
            const clerkRole = memberships[0].role;
            const normalized = normalizeClerkRole(clerkRole);
            const fallbackPath = getDashboardPath(normalized);
            console.warn("[FC AuthCallback] No Firestore doc — Clerk role fallback:", clerkRole, "→", fallbackPath);
            navigate(fallbackPath, { replace: true });
            return;
          }
          navigate("/onboarding", { replace: true });
          return;
        }

        if (redirect.organizationId && setActive && organization?.id !== redirect.organizationId) {
          try { await setActive({ organization: redirect.organizationId }); } catch (e) {
            console.warn("[FC AuthCallback] setActive() failed (non-fatal):", e);
          }
        }

        navigate(redirect.path, { replace: true });

      } catch (error: any) {
        console.error("[FC AuthCallback] Error:", error);
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

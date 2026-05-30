import React, { useEffect, useState, useRef, Suspense } from "react";
import { ClerkProvider, SignedIn, useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import AuthSyncService from "./components/FirestoreUserSync";
import AuthRedirectManager from "./components/AuthRedirectManager";
import ScrollToTop from "@/components/ScrollToTop";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { membershipIdFor } from "@/lib/services";
import { getDashboardPath, normalizeClerkRole } from "@/lib/auth/get-user-role";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { getCached, setCached } from "@/lib/authCache";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallPrompt, OfflineToast } from "@/src/components/pwa";

import LandingPage from "./pages/LandingPage";
import AuthCallbackPage from "./pages/AuthCallback";
import CompleteProfilePage from "./pages/CompleteProfilePage";
import NotFoundPage from "./pages/NotFoundPage";

import CustomSignInPage from "./pages/auth/SignInPage";
import CustomSignUpPage from "./pages/auth/SignUpPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";

import OrgDashboard from "./pages/organization/OrgDashboard";
import OwnerOnboarding from "./pages/organization/OwnerOnboarding";
import AgentDashboard from "./pages/agent/AgentDashboard";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import OrgCreate from "./pages/organization/OrgCreate";
import OrgInvitation from "./pages/organization/OrgInvitation";
import OrgSelectorPage from "./pages/OrgSelectorPage";
import UserProfilePage from "./pages/UserProfilePage";
import WorkspaceSelectionPage from "./pages/WorkspaceSelectionPage";
import DebugUserDoc from "./components/DebugUserDoc";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Error Boundary ────────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; error: Error | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[FundCircle] ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full rounded-2xl border border-red-100 bg-white p-8 shadow-lg text-center">
            <div className="mb-4 mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-red-50">
              <span className="text-red-500 text-xl font-bold">!</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 mb-6">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
              className="rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-6 py-2.5 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Loading shimmer (shown while chunks or auth load) ─────────────────────
function DashboardShimmer() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-screen">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-2.5 w-20 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-3 space-y-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
        <div className="p-3 border-t border-slate-100">
          <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-white border border-slate-100 animate-pulse" />
      </div>
    </div>
  );
}

function LoadingWorkspace({
  message = "Loading…",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  if (onRetry) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 mx-auto">
            <span className="text-red-500 text-lg font-bold">!</span>
          </div>
          <p className="text-slate-500 text-sm">{message}</p>
          <button
            onClick={onRetry}
            className="mt-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-5 py-2.5 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  return <DashboardShimmer />;
}

// ─── ProtectedRoute: shows shimmer while Clerk loads; redirects if not signed in ──
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <DashboardShimmer />;
  if (!isSignedIn) return <Navigate to="/auth/sign-in" replace />;
  return <>{children}</>;
}

// ─── RoleProtectedRoute ────────────────────────────────────────────────────
const ROLE_TIMEOUT_MS = 5000;

function RoleProtectedRoute({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: isOrgListLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  const navOrgId: string | null =
    (location.state as any)?.orgId ||
    sessionStorage.getItem("fc_onboarding_org_id") ||
    null;

  const activeOrgId =
    organization?.id ||
    userMemberships?.data?.[0]?.organization?.id ||
    navOrgId ||
    null;

  useEffect(() => {
    if (!isOrgListLoaded || organization?.id || !userMemberships?.data?.length || !setActive) return;
    // Multi-org non-owners must choose via OrgSelectorPage — never auto-activate for them
    const members = userMemberships.data;
    if (members.length > 1 && members[0]?.role !== "org:admin" && members[0]?.role !== "org:owner") return;
    setActive({ organization: members[0].organization.id }).catch(() => undefined);
  }, [isOrgListLoaded, organization?.id, userMemberships?.data, setActive]);

  const membershipId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>("organizationMembers", membershipId);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("[FC RoleProtectedRoute] Firestore timeout — using Clerk role fallback");
      setTimedOut(true);
    }, ROLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Cache the role when we get it from Firestore — keyed by userId+orgId
  useEffect(() => {
    if (membershipDoc && user?.id && activeOrgId) {
      const role = membershipDoc.clerkRole || membershipDoc.role || null;
      if (role) {
        console.log("[FC RoleProtectedRoute] Role detected from Firestore:", role);
        setCached(`role_${user.id}_${activeOrgId}`, role);
      }
    }
  }, [membershipDoc, user?.id, activeOrgId]);

  // KEY FIX: also wait when doc is null but we haven't timed out — Firestore with
  // persistentLocalCache fires onSnapshot immediately with null on a cache miss
  // (brand-new doc not yet in IndexedDB). The real server response arrives shortly
  // after. If we redirect on that first null we loop forever. Wait for timeout instead.
  const isLoading =
    !isLoaded ||
    (!isOrgListLoaded && !timedOut) ||
    (membershipId !== null && membershipDocLoading && !timedOut) ||
    (membershipId !== null && !membershipDoc && !timedOut);

  if (isLoading) return <DashboardShimmer />;
  if (!isSignedIn || !user) return <Navigate to="/auth/sign-in" replace />;

  if (!membershipDoc && timedOut && membershipId) {
    const cachedRole = getCached<string>(`role_${user.id}_${activeOrgId}`);
    if (cachedRole) {
      const normalizedCached = normalizeClerkRole(cachedRole);
      console.log("[FC RoleProtectedRoute] Using cached role:", cachedRole);
      if (normalizedCached && allowedRoles.includes(normalizedCached)) return <>{children}</>;
    }
    const clerkMembership = userMemberships?.data?.find(
      (m) => m.organization?.id === activeOrgId
    );
    const clerkRole = clerkMembership?.role;
    console.log("[FC RoleProtectedRoute] Clerk role fallback:", clerkRole);
    const normalizedClerkRole = normalizeClerkRole(clerkRole);
    if (normalizedClerkRole && allowedRoles.includes(normalizedClerkRole)) {
      return <>{children}</>;
    }
    // Both Firestore and Clerk role checks failed (poor connectivity or first login).
    // Rather than showing a blank screen, render the requested dashboard as a fallback.
    // A non-owner who somehow reached this route will see nothing useful without data.
    console.log("[FC RoleProtectedRoute] All fallbacks exhausted — rendering as last resort");
    return <>{children}</>;
  }

  const normalizedRole = normalizeClerkRole(membershipDoc.clerkRole || membershipDoc.role || null);
  console.log("[FC RoleProtectedRoute] Normalized role:", normalizedRole, "allowed:", allowedRoles);
  if (!normalizedRole || !allowedRoles.includes(normalizedRole)) return <Navigate to="/router" replace />;

  return <>{children}</>;
}

// ─── RoleRouter ────────────────────────────────────────────────────────────
function RoleRouter() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: isOrgListLoaded, userMemberships, userInvitations, setActive } =
    useOrganizationList({ userMemberships: true, userInvitations: true });
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);
  const loggedRef = useRef(false);

  const navOrgId: string | null =
    (location.state as any)?.orgId ||
    sessionStorage.getItem("fc_onboarding_org_id") ||
    null;

  const memberships = userMemberships?.data || [];

  // Agents/customers with multiple orgs must pick via OrgSelectorPage — don't auto-select
  const isMultiOrgNonOwner =
    isOrgListLoaded &&
    !organization?.id &&
    memberships.length > 1 &&
    memberships[0]?.role !== "org:admin";

  const activeOrgId = isMultiOrgNonOwner
    ? null
    : (organization?.id ||
       memberships[0]?.organization?.id ||
       navOrgId ||
       null);

  const membershipDocId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } =
    useDocumentRealtime<any>("organizationMembers", membershipDocId);

  // Activate the first available org if none is active yet (skip for multi-org non-owners)
  useEffect(() => {
    if (!user || !isOrgListLoaded || organization?.id || !memberships.length || !setActive) return;
    // Multi-org agents/customers go to OrgSelectorPage — don't auto-activate
    if (memberships.length > 1 && memberships[0]?.role !== "org:admin") return;
    const firstOrgId = memberships[0].organization.id;
    console.log("[FC RoleRouter] Auto-activating first Clerk org:", firstOrgId);
    setActive({ organization: firstOrgId }).catch(err =>
      console.warn("[FC RoleRouter] setActive() failed:", err)
    );
  }, [user, isOrgListLoaded, organization?.id, memberships, setActive]);

  // Firestore hard timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      console.warn("[FC RoleRouter] Firestore timeout (5s) — falling back to Clerk role");
      setTimedOut(true);
    }, ROLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Cache resolved Firestore role — keyed by userId+orgId for org-scoped roles
  useEffect(() => {
    if (membershipDoc && user?.id && activeOrgId) {
      const role = membershipDoc.clerkRole || membershipDoc.role || null;
      if (role) {
        console.log("[FC RoleRouter] Caching Firestore role:", role, "for user:", user.id, "org:", activeOrgId);
        setCached(`role_${user.id}_${activeOrgId}`, role);
      }
    }
  }, [membershipDoc, user?.id, activeOrgId]);

  // Log the full state once per render cycle (after data loads)
  useEffect(() => {
    if (!user || !isOrgListLoaded) return;
    if (loggedRef.current) return;
    loggedRef.current = true;

    console.log("────────────────────────────────────────────");
    console.log("[FC RoleRouter] ▶ State snapshot");
    console.log("[FC RoleRouter]   userId          :", user.id);
    console.log("[FC RoleRouter]   activeOrgId     :", activeOrgId ?? "null");
    console.log("[FC RoleRouter]   membershipDocId :", membershipDocId ?? "null (no org)");
    console.log("[FC RoleRouter]   membershipDoc   :", membershipDoc
      ? `found — role: ${membershipDoc.clerkRole ?? membershipDoc.role ?? "MISSING"}, profileCompleted: ${membershipDoc.profileCompleted ?? "absent"}`
      : "null"
    );
    console.log("[FC RoleRouter]   Clerk memberships:", userMemberships?.data?.map(m => `${m.organization?.id}:${m.role}`) ?? []);
    console.log("[FC RoleRouter]   Clerk invitations:", userInvitations?.data?.map(i => `${i.publicOrganizationData?.id}:${i.role}`) ?? []);
    console.log("[FC RoleRouter]   timedOut        :", timedOut);
  });

  // ── No user → sign-in ────────────────────────────────────────────────────
  if (!user) {
    console.log("[FC RoleRouter] No user → /auth/sign-in");
    return <Navigate to="/auth/sign-in" replace />;
  }

  // ── Multiple orgs for agent/customer → org selector ──────────────────────
  if (isMultiOrgNonOwner) {
    console.log("[FC RoleRouter] Multi-org non-owner → /org-select");
    return <Navigate to="/org-select" replace />;
  }

  // ── Cached role fast-path (only after Firestore timeout with no doc) ──────
  if (!membershipDoc && !membershipDocLoading && timedOut && activeOrgId) {
    const cachedRole = getCached<string>(`role_${user.id}_${activeOrgId}`);
    if (cachedRole) {
      const normalizedRole = normalizeClerkRole(cachedRole);
      const dashPath = getDashboardPath(normalizedRole);
      console.log("[FC RoleRouter] Cached role fast-path:", cachedRole, "→", dashPath);
      return <Navigate to={dashPath} replace />;
    }
  }

  // ── Still loading Firestore ───────────────────────────────────────────────
  // Treat "null doc but not timed out" as loading to prevent premature /onboarding
  // redirect on Firestore cache miss (new device / new org / first login).
  const isLoading =
    (!isOrgListLoaded ||
      (membershipDocId !== null && membershipDocLoading) ||
      (membershipDocId !== null && !membershipDoc)) &&
    !timedOut;

  if (isLoading) return <DashboardShimmer />;

  // ── Firestore membership found ────────────────────────────────────────────
  if (membershipDoc) {
    const rawRole      = membershipDoc.clerkRole || membershipDoc.role || null;
    const normalizedRole = normalizeClerkRole(rawRole);
    const profileCompleted = membershipDoc.profileCompleted !== false;
    const dashPath     = getDashboardPath(normalizedRole);

    console.log("[FC RoleRouter] ────────────────────────────────────────────");
    console.log("[FC RoleRouter] Auth redirect decision (Firestore):");
    console.log("[FC RoleRouter]   userId          :", user.id);
    console.log("[FC RoleRouter]   orgId           :", activeOrgId ?? "null");
    console.log("[FC RoleRouter]   membershipDocId :", membershipDocId);
    console.log("[FC RoleRouter]   rawRole         :", rawRole ?? "MISSING — check Firestore doc");
    console.log("[FC RoleRouter]   normalizedRole  :", normalizedRole ?? "null (UNRECOGNIZED — check normalizeClerkRole())");
    console.log("[FC RoleRouter]   profileCompleted:", profileCompleted);
    console.log("[FC RoleRouter]   → destination   :", !profileCompleted && (normalizedRole === "pigmy_collector" || normalizedRole === "customer") ? "/complete-profile" : dashPath);
    console.log("[FC RoleRouter] ────────────────────────────────────────────");

    if (!normalizedRole) {
      console.error("[FC RoleRouter] ✗ Role '", rawRole, "' not recognized.");
      console.error("[FC RoleRouter]   Valid Firestore values: OWNER, AGENT, CUSTOMER");
      console.error("[FC RoleRouter]   Valid Clerk values: org:admin, org:pigmy_collector, org:customer");
    }

    if (!profileCompleted && (normalizedRole === "pigmy_collector" || normalizedRole === "customer")) {
      return <Navigate to="/complete-profile" replace />;
    }

    sessionStorage.removeItem("fc_onboarding_org_id");
    return <Navigate to={dashPath} replace />;
  }

  // ── Clerk membership fallback (Firestore slow or missing) ────────────────
  if (isOrgListLoaded && userMemberships?.data?.length) {
    const firstMembership = userMemberships.data[0];
    const clerkRole       = firstMembership.role;
    const orgId           = firstMembership.organization?.id || navOrgId;
    const normalizedClerkRole = normalizeClerkRole(clerkRole);

    console.log("[FC RoleRouter] Clerk membership fallback:");
    console.log("[FC RoleRouter]   clerkRole          :", clerkRole);
    console.log("[FC RoleRouter]   normalizedClerkRole:", normalizedClerkRole ?? "UNRECOGNIZED");
    console.log("[FC RoleRouter]   orgId              :", orgId ?? "null");
    console.log("[FC RoleRouter]   Note: Firestore doc missing — owner may not have pre-created the collector record OR Firestore is slow");

    // Use getDashboardPath as single source of truth for all role→path mapping
    if (normalizedClerkRole && orgId) {
      const dashPath = getDashboardPath(normalizedClerkRole);
      if (dashPath !== "/onboarding") {
        console.log("[FC RoleRouter] ────────────────────────────────────────────");
        console.log("[FC RoleRouter] Auth redirect decision (Clerk fallback):");
        console.log("[FC RoleRouter]   userId    :", user.id);
        console.log("[FC RoleRouter]   orgId     :", orgId);
        console.log("[FC RoleRouter]   clerkRole :", clerkRole, "(raw)");
        console.log("[FC RoleRouter]   normalized:", normalizedClerkRole);
        console.log("[FC RoleRouter]   → destination:", dashPath);
        console.log("[FC RoleRouter] ────────────────────────────────────────────");
        return <Navigate to={dashPath} replace state={{ orgId }} />;
      }
    }

    // Clerk role not recognized — wait if Firestore hasn't timed out yet
    if (!timedOut) {
      console.log("[FC RoleRouter]   Role unrecognized + Firestore still loading — showing shimmer");
      return <DashboardShimmer />;
    }

    // Hard fallback: has org, role unclear → owner dashboard
    if (orgId) {
      console.warn("[FC RoleRouter]   Role unclear after timeout — defaulting to /dashboard/owner for orgId:", orgId);
      return <Navigate to="/dashboard/owner" replace state={{ orgId }} />;
    }

    return (
      <LoadingWorkspace
        message="Workspace data not found. Please try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  // ── No Clerk membership — check for pending invitations ──────────────────
  if (isOrgListLoaded && userInvitations?.data?.length) {
    console.log("[FC RoleRouter] No membership but has pending Clerk invitation(s) →  /organization/invitation");
    return <Navigate to="/organization/invitation" replace />;
  }

  // ── No membership, no invitations — new owner who hasn't created an org ──
  // LOOP GUARD: if we've been here before (check sessionStorage counter), show
  // a hard-stop rather than looping /router → /onboarding → /router infinitely.
  const routerVisits = parseInt(sessionStorage.getItem("fc_router_visits") ?? "0", 10) + 1;
  sessionStorage.setItem("fc_router_visits", String(routerVisits));
  if (routerVisits > 3) {
    sessionStorage.removeItem("fc_router_visits");
    console.error("[FC RoleRouter] ✗ Redirect loop detected (visited /router", routerVisits, "times) — showing recovery UI");
    return (
      <LoadingWorkspace
        message="Unable to determine your workspace. Please sign out and try again."
        onRetry={() => { sessionStorage.clear(); window.location.href = "/auth/sign-in"; }}
      />
    );
  }

  console.log("[FC RoleRouter] No org + no invitations → /onboarding (visit #", routerVisits, ")");
  return <Navigate to="/onboarding" replace />;
}

// ─── Preserve query params on legacy redirects (critical for __clerk_ticket) ──
function QueryPreservingRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  console.log(`[FC Redirect] ${window.location.pathname}${search} → ${to}${search}`);
  return <Navigate to={`${to}${search}`} replace />;
}

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  if (!clerkPubKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-red-50 p-6 rounded-2xl text-red-900 border border-red-200 shadow-lg">
          <h1 className="text-lg font-bold mb-2">Clerk API Key Missing</h1>
          <p className="text-sm">Please configure VITE_CLERK_PUBLISHABLE_KEY in your environment variables.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={clerkPubKey}
        signInUrl="/auth/sign-in"
        signUpUrl="/auth/sign-up"
        fallbackRedirectUrl="/auth/callback"
      >
        <BrowserRouter>
          <ScrollToTop />
          <AuthRedirectManager />
          <Suspense fallback={<DashboardShimmer />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />

              {/* Auth pages */}
              <Route path="/auth/sign-in" element={<CustomSignInPage />} />
              <Route path="/auth/sign-up" element={<CustomSignUpPage />} />
              <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
              <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              {/* Legacy sign-in redirects — QueryPreservingRedirect keeps __clerk_ticket intact */}
              <Route path="/sign-in/*" element={<QueryPreservingRedirect to="/auth/sign-in" />} />
              <Route path="/sign-up/*" element={<QueryPreservingRedirect to="/auth/sign-up" />} />
              <Route path="/organization/signin/*" element={<QueryPreservingRedirect to="/auth/sign-in" />} />
              <Route path="/organization/signup/*" element={<QueryPreservingRedirect to="/auth/sign-up" />} />
              <Route path="/agent/login/*" element={<QueryPreservingRedirect to="/auth/sign-in" />} />
              <Route path="/customer/signin/*" element={<QueryPreservingRedirect to="/auth/sign-in" />} />

              <Route path="/workspace-selection" element={<WorkspaceSelectionPage />} />

              {/* Protected pages — use ProtectedRoute (shows shimmer, not blank) */}
              <Route path="/onboarding" element={<ProtectedRoute><OwnerOnboarding /></ProtectedRoute>} />
              <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />
              <Route path="/auth/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />

              <Route path="/organization/create" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={["organization_owner"]}><OrgCreate /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/organization/invitation" element={<ProtectedRoute><OrgInvitation /></ProtectedRoute>} />
              <Route path="/org-select" element={<ProtectedRoute><OrgSelectorPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />

              {/* Role router — ProtectedRoute prevents blank-page flash during session propagation */}
              <Route path="/router" element={<ProtectedRoute><RoleRouter /></ProtectedRoute>} />

              {/* Dashboards */}
              <Route path="/dashboard/owner/*"     element={<ProtectedRoute><RoleProtectedRoute allowedRoles={["organization_owner"]}><OrgDashboard /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/dashboard/agent/*"     element={<ProtectedRoute><RoleProtectedRoute allowedRoles={["pigmy_collector"]}><AgentDashboard /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/dashboard/customer/*"  element={<ProtectedRoute><RoleProtectedRoute allowedRoles={["customer"]}><CustomerDashboard /></RoleProtectedRoute></ProtectedRoute>} />
              {/* Aliases → canonical paths */}
              <Route path="/dashboard/collector/*" element={<Navigate to="/dashboard/agent"  replace />} />
              <Route path="/dashboard/operator/*"  element={<Navigate to="/dashboard/owner"  replace />} />
              {/* Fallback: unknown /dashboard/* → router to re-detect role */}
              <Route path="/dashboard/*"           element={<Navigate to="/router"           replace />} />

              <Route path="/debug-user" element={<ProtectedRoute><DebugUserDoc /></ProtectedRoute>} />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <SignedIn><AuthSyncService /></SignedIn>
        <Toaster />
        <OfflineToast />
        <PWAInstallPrompt />
      </ClerkProvider>
    </ErrorBoundary>
  );
}

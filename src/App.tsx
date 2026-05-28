import React, { useEffect, useState } from "react";
import { ClerkProvider, SignedIn, useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import AuthSyncService from "./components/FirestoreUserSync";
import AuthRedirectManager from "./components/AuthRedirectManager";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { membershipIdFor } from "@/lib/services";
import { getDashboardPath, normalizeClerkRole } from "@/lib/auth/get-user-role";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { getCached, setCached } from "@/lib/authCache";
import { Toaster } from "@/components/ui/sonner";

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
import UserProfilePage from "./pages/UserProfilePage";
import WorkspaceSelectionPage from "./pages/WorkspaceSelectionPage";
import DebugUserDoc from "./components/DebugUserDoc";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <DashboardShimmer />;
  if (!isSignedIn) return <Navigate to="/auth/sign-in" replace />;
  return <>{children}</>;
}

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
    setActive({ organization: userMemberships.data[0].organization.id }).catch(() => undefined);
  }, [isOrgListLoaded, organization?.id, userMemberships?.data, setActive]);

  const membershipId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>("organizationMembers", membershipId);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Cache the role when we get it from Firestore
  useEffect(() => {
    if (membershipDoc && user?.id) {
      const role = membershipDoc.clerkRole || membershipDoc.role || null;
      if (role) setCached(`role_${user.id}`, role);
    }
  }, [membershipDoc, user?.id]);

  const isLoading =
    !isLoaded ||
    (!isOrgListLoaded && !timedOut) ||
    (membershipId !== null && membershipDocLoading && !timedOut);

  if (isLoading) return <DashboardShimmer />;
  if (!isSignedIn || !user) return <Navigate to="/auth/sign-in" replace />;

  if (!membershipDoc && timedOut && membershipId) {
    // Try cached role first
    const cachedRole = getCached<string>(`role_${user.id}`);
    if (cachedRole) {
      const normalizedCached = normalizeClerkRole(cachedRole);
      if (allowedRoles.includes(normalizedCached!)) return <>{children}</>;
    }
    const clerkMembership = userMemberships?.data?.find(
      (m) => m.organization?.id === activeOrgId
    );
    const clerkRole = clerkMembership?.role;
    if (clerkRole === "org:admin" && allowedRoles.includes("organization_owner")) {
      return <>{children}</>;
    }
    return (
      <LoadingWorkspace
        message="Could not load workspace data. Please check your connection."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!membershipDoc) return <Navigate to="/router" replace />;

  const normalizedRole = normalizeClerkRole(membershipDoc.clerkRole || membershipDoc.role || null);
  if (!allowedRoles.includes(normalizedRole)) return <Navigate to="/router" replace />;

  return <>{children}</>;
}

function RoleRouter() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: isOrgListLoaded, userMemberships, userInvitations, setActive } = useOrganizationList({ userMemberships: true, userInvitations: true });
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

  const membershipDocId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>("organizationMembers", membershipDocId);

  useEffect(() => {
    if (!user || !isOrgListLoaded || organization?.id || !userMemberships?.data?.length || !setActive) return;
    setActive({ organization: userMemberships.data[0].organization.id }).catch(() => {});
  }, [user, isOrgListLoaded, organization?.id, userMemberships?.data, setActive]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Cache role when resolved
  useEffect(() => {
    if (membershipDoc && user?.id) {
      const role = membershipDoc.clerkRole || membershipDoc.role || null;
      if (role) setCached(`role_${user.id}`, role);
    }
  }, [membershipDoc, user?.id]);

  if (!user) return <Navigate to="/auth/sign-in" replace />;

  // Instant redirect using cached role
  if (user && !membershipDoc && !membershipDocLoading) {
    const cachedRole = getCached<string>(`role_${user.id}`);
    if (cachedRole) {
      const normalizedRole = normalizeClerkRole(cachedRole);
      return <Navigate to={getDashboardPath(normalizedRole)} replace />;
    }
  }

  const isLoading =
    (!isOrgListLoaded || (membershipDocId !== null && membershipDocLoading)) && !timedOut;

  if (isLoading) return <DashboardShimmer />;

  if (membershipDoc) {
    const normalizedRole = normalizeClerkRole(membershipDoc.clerkRole || membershipDoc.role || null);
    const profileCompleted = membershipDoc.profileCompleted !== false;
    if (!profileCompleted && (normalizedRole === "pigmy_collector" || normalizedRole === "customer")) {
      return <Navigate to="/complete-profile" replace />;
    }
    sessionStorage.removeItem("fc_onboarding_org_id");
    return <Navigate to={getDashboardPath(normalizedRole)} replace />;
  }

  if (isOrgListLoaded && userMemberships?.data?.length) {
    const firstMembership = userMemberships.data[0];
    const clerkRole = firstMembership.role;
    const orgId = firstMembership.organization?.id || navOrgId;

    if (clerkRole === "org:admin" && orgId) {
      return <Navigate to="/dashboard/owner" replace state={{ orgId }} />;
    }

    if (!timedOut) return <DashboardShimmer />;

    return (
      <LoadingWorkspace
        message="Workspace data not found. Please try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (userInvitations?.data?.length) return <Navigate to="/organization/invitation" replace />;
  return <Navigate to="/onboarding" replace />;
}

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
    <ClerkProvider publishableKey={clerkPubKey} fallbackRedirectUrl="/auth/callback">
      <BrowserRouter>
        <AuthRedirectManager />
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/auth/sign-in" element={<CustomSignInPage />} />
          <Route path="/auth/sign-up" element={<CustomSignUpPage />} />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route path="/sign-in/*" element={<Navigate to="/auth/sign-in" replace />} />
          <Route path="/sign-up/*" element={<Navigate to="/auth/sign-up" replace />} />
          <Route path="/organization/signin/*" element={<Navigate to="/auth/sign-in" replace />} />
          <Route path="/organization/signup/*" element={<Navigate to="/auth/sign-up" replace />} />
          <Route path="/agent/login/*" element={<Navigate to="/auth/sign-in" replace />} />
          <Route path="/customer/signin/*" element={<Navigate to="/auth/sign-in" replace />} />

          <Route path="/workspace-selection" element={<WorkspaceSelectionPage />} />

          <Route path="/onboarding" element={<ProtectedRoute><OwnerOnboarding /></ProtectedRoute>} />
          <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />
          <Route path="/auth/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />

          <Route path="/organization/create" element={<SignedIn><RoleProtectedRoute allowedRoles={["organization_owner"]}><OrgCreate /></RoleProtectedRoute></SignedIn>} />
          <Route path="/organization/invitation" element={<ProtectedRoute><OrgInvitation /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
          <Route path="/router" element={<SignedIn><RoleRouter /></SignedIn>} />

          <Route path="/dashboard/owner/*" element={<SignedIn><RoleProtectedRoute allowedRoles={["organization_owner"]}><OrgDashboard /></RoleProtectedRoute></SignedIn>} />
          <Route path="/dashboard/agent/*" element={<SignedIn><RoleProtectedRoute allowedRoles={["pigmy_collector"]}><AgentDashboard /></RoleProtectedRoute></SignedIn>} />
          <Route path="/dashboard/customer/*" element={<SignedIn><RoleProtectedRoute allowedRoles={["customer"]}><CustomerDashboard /></RoleProtectedRoute></SignedIn>} />
          <Route path="/dashboard/operator/*" element={<Navigate to="/dashboard/owner" replace />} />
          <Route path="/dashboard/collector/*" element={<Navigate to="/dashboard/agent" replace />} />
          <Route path="/dashboard/*" element={<Navigate to="/router" replace />} />

          <Route path="/debug-user" element={<SignedIn><ProtectedRoute><DebugUserDoc /></ProtectedRoute></SignedIn>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <SignedIn><AuthSyncService /></SignedIn>
      <Toaster />
    </ClerkProvider>
  );
}

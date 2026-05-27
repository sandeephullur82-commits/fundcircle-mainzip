/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { ClerkProvider, SignedIn, useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import AuthSyncService from "./components/FirestoreUserSync";
import AuthRedirectManager from "./components/AuthRedirectManager";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { membershipIdFor } from "@/lib/services";
import { getDashboardPath, normalizeClerkRole } from "@/lib/auth/get-user-role";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import AuthCallbackPage from "./pages/AuthCallback";
import CompleteProfilePage from "./pages/CompleteProfilePage";
import OrgDashboard from "./pages/organization/OrgDashboard";
import AgentDashboard from "./pages/agent/AgentDashboard";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import OrgCreate from "./pages/organization/OrgCreate";
import OrgInvitation from "./pages/organization/OrgInvitation";
import UserProfilePage from "./pages/UserProfilePage";
import WorkspaceSelectionPage from "./pages/WorkspaceSelectionPage";
import DebugUserDoc from "./components/DebugUserDoc";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}

function RoleProtectedRoute({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: isOrgListLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOrgListLoaded) return;
    if (organization?.id) {
      setActiveOrgId(organization.id);
      return;
    }

    if (userMemberships?.data?.length) {
      const firstOrgId = userMemberships.data[0].organization.id;
      setActiveOrgId(firstOrgId);
      if (setActive) {
        setActive({ organization: firstOrgId }).catch(() => undefined);
      }
    }
  }, [isOrgListLoaded, organization?.id, userMemberships?.data, setActive]);

  const membershipId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>("organizationMembers", membershipId);

  if (!isLoaded || !isOrgListLoaded || membershipDocLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600 mx-auto mb-4" /><p className="text-slate-500 text-sm">Loading your workspace...</p></div></div>;
  }

  if (!isSignedIn || !user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!membershipDoc) {
    return <Navigate to="/router" replace />;
  }

  const normalizedRole = normalizeClerkRole(membershipDoc.clerkRole || membershipDoc.role || null);
  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to="/router" replace />;
  }

  return <>{children}</>;
}

function RoleRouter() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: isOrgListLoaded, userMemberships, userInvitations, setActive } = useOrganizationList({ userMemberships: true, userInvitations: true });
  const [firestoreMembershipRole, setFirestoreMembershipRole] = useState<string | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const selectedOrgs = userMemberships?.data || [];
  const activeOrgId = organization?.id || selectedOrgs?.[0]?.organization?.id;
  const membershipDocId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>("organizationMembers", membershipDocId);

  useEffect(() => {
    const loadMembershipRole = async () => {
      if (!user) {
        setFirestoreMembershipRole(null);
        setMembershipLoading(false);
        return;
      }

      if (!activeOrgId) {
        setFirestoreMembershipRole(null);
        setMembershipLoading(false);
        return;
      }

      if (membershipDoc) {
        setFirestoreMembershipRole((membershipDoc.clerkRole || membershipDoc.role || null)?.toString() || null);
      } else {
        setFirestoreMembershipRole(null);
      }
      setMembershipLoading(false);
    };

    const ensureActiveOrganization = async () => {
      if (!user || !isOrgListLoaded || organization?.id || !selectedOrgs?.length || !setActive) return;
      try {
        await setActive({ organization: selectedOrgs[0].organization.id });
      } catch (err) {
        console.error("Failed to set active organization:", err);
      }
    };

    if (isOrgListLoaded) {
      setMembershipLoading(true);
      ensureActiveOrganization()
        .then(loadMembershipRole)
        .catch((err) => {
          console.error(err);
          loadMembershipRole();
        });
    }
  }, [user, activeOrgId, isOrgListLoaded, selectedOrgs, setActive, membershipDoc]);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (!isOrgListLoaded || membershipLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600 mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Loading your workspace...</p>
      </div>
    </div>
  );

  const activeRole = normalizeClerkRole(
    firestoreMembershipRole || (user?.publicMetadata as any)?.role || null
  );

  if (!membershipDoc && userInvitations?.data?.length) {
    return <Navigate to="/organization/invitation" replace />;
  }

  if (!membershipDoc) {
    return <Navigate to="/sign-in" replace />;
  }

  const profileCompleted = membershipDoc.profileCompleted !== false;
  if (!profileCompleted && (activeRole === "pigmy_collector" || activeRole === "customer")) {
    return <Navigate to="/complete-profile" replace />;
  }

  return <Navigate to={getDashboardPath(activeRole)} replace />;
}

export default function App() {
  if (!clerkPubKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-red-50 p-6 rounded-2xl text-red-900 border border-red-200 shadow-lg">
          <h1 className="text-lg font-bold mb-2">Clerk API Key Missing</h1>
          <p className="text-sm">Please configure the VITE_CLERK_PUBLISHABLE_KEY in your environment variables to use this application.</p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey} fallbackRedirectUrl="/router">
      <BrowserRouter>
        <AuthRedirectManager />
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/workspace-selection" element={<WorkspaceSelectionPage />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />
          <Route path="/organization/signin/*" element={<Navigate to="/sign-in" replace />} />
          <Route path="/organization/signup/*" element={<Navigate to="/sign-up" replace />} />
          <Route path="/agent/login/*" element={<Navigate to="/sign-in" replace />} />
          <Route path="/customer/signin/*" element={<Navigate to="/sign-in" replace />} />

          <Route path="/organization/create" element={
            <SignedIn>
              <RoleProtectedRoute allowedRoles={["organization_owner"]}>
                <OrgCreate />
              </RoleProtectedRoute>
            </SignedIn>
          } />
          <Route path="/organization/invitation" element={<ProtectedRoute><OrgInvitation /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />

          <Route path="/router" element={<SignedIn><RoleRouter /></SignedIn>} />

          <Route path="/dashboard/owner/*" element={
            <SignedIn>
              <RoleProtectedRoute allowedRoles={["organization_owner"]}>
                <OrgDashboard />
              </RoleProtectedRoute>
            </SignedIn>
          } />
          <Route path="/dashboard/agent/*" element={
            <SignedIn>
              <RoleProtectedRoute allowedRoles={["pigmy_collector"]}>
                <AgentDashboard />
              </RoleProtectedRoute>
            </SignedIn>
          } />
          <Route path="/dashboard/customer/*" element={
            <SignedIn>
              <RoleProtectedRoute allowedRoles={["customer"]}>
                <CustomerDashboard />
              </RoleProtectedRoute>
            </SignedIn>
          } />
          <Route path="/dashboard/operator/*" element={<Navigate to="/dashboard/owner" replace />} />
          <Route path="/dashboard/collector/*" element={<Navigate to="/dashboard/agent" replace />} />
          <Route path="/dashboard/*" element={<Navigate to="/dashboard/owner" replace />} />

          <Route path="/debug-user" element={
            <SignedIn>
              <ProtectedRoute>
                <DebugUserDoc />
              </ProtectedRoute>
            </SignedIn>
          } />
        </Routes>
      </BrowserRouter>
      <SignedIn>
        <AuthSyncService />
      </SignedIn>
      <Toaster />
    </ClerkProvider>
  );
}

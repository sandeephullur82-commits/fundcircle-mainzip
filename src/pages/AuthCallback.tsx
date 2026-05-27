import { useEffect, useState } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import { resolveUserRedirectTarget } from "@/lib/auth/redirect-user";
import { useLanguage } from "@/lib/languageContext";

const OWNER_ORG_SETUP_KEY = "fundcircle_owner_org";

export default function AuthCallbackPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: orgListLoaded, createOrganization, setActive, userMemberships, userInvitations } = useOrganizationList({ userMemberships: true, userInvitations: true });
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [status, setStatus] = useState("Checking authentication state...");

  useEffect(() => {
    if (!isLoaded || !orgListLoaded) {
      return;
    }

    const performRedirect = async () => {
      if (!isSignedIn || !user) {
        navigate("/sign-in", { replace: true });
        return;
      }

      setStatus("Preparing your workspace...");
      const pendingOrgData = typeof window !== "undefined"
        ? window.sessionStorage.getItem(OWNER_ORG_SETUP_KEY)
        : null;

      try {
        if (pendingOrgData && createOrganization) {
          const parsed = JSON.parse(pendingOrgData || "{}");
          if (parsed.name && parsed.slug) {
            setStatus(language === "kn" ? "ಕಂಪನಿ workspace ಅನ್ನು ಸಮಸ್ಯೆ ಮೋಡಿಸುತ್ತದೆ..." : "Creating your organization workspace...");
            const org = await createOrganization({ name: parsed.name, slug: parsed.slug });
            await setDoc(doc(db, "organizations", org.id), {
              id: org.id,
              organizationId: org.id,
              name: parsed.name,
              slug: parsed.slug,
              ownerClerkUserId: user.id,
              ownerEmail: user.primaryEmailAddress?.emailAddress || "",
              createdAt: serverTimestamp(),
            }, { merge: true });

            const membershipDocId = membershipIdFor(org.id, user.id);
            const membership = {
              id: membershipDocId,
              organizationId: org.id,
              clerkUserId: user.id,
              clerkRole: "org:owner",
              role: "OWNER",
              organizationName: parsed.name,
              email: user.primaryEmailAddress?.emailAddress || "",
              fullName: user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
              status: "ACTIVE",
              profileCompleted: true,
              joinedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            } as any;

            await setDoc(doc(db, "organizationMembers", membershipDocId), membership, { merge: true });
            await setDoc(doc(db, "memberships", membershipDocId), membership, { merge: true });

            if (setActive) {
              await setActive({ organization: org.id });
            }

            window.sessionStorage.removeItem(OWNER_ORG_SETUP_KEY);
          }
        }

        if (!organization?.id && userMemberships?.data?.length && setActive) {
          await setActive({ organization: userMemberships.data[0].organization.id });
        }

        const activeOrgId = organization?.id || userMemberships?.data?.[0]?.organization?.id || null;
        const redirect = await resolveUserRedirectTarget(user, activeOrgId);

        if (!redirect.membership) {
          if (userInvitations?.data?.length) {
            navigate("/organization/invitation", { replace: true });
            return;
          }
          navigate("/sign-in", { replace: true });
          return;
        }

        if (redirect.organizationId && setActive && organization?.id !== redirect.organizationId) {
          try {
            await setActive({ organization: redirect.organizationId });
          } catch {
            // ignore failure; we still need to navigate
          }
        }

        navigate(redirect.path, { replace: true });
      } catch (error: any) {
        console.error("Auth callback failed:", error);
        toast.error(error?.message || "Unable to finish authentication.");
        navigate("/sign-in", { replace: true });
      }
    };

    performRedirect();
  }, [isLoaded, isSignedIn, user, orgListLoaded, organization?.id, createOrganization, setActive, userMemberships?.data, userInvitations?.data, navigate, language]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
        <div className="mb-4 text-slate-500 text-sm uppercase tracking-[0.3em]">Auth Callback</div>
        <h1 className="text-2xl font-bold text-slate-900">Finalizing your sign-in</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{status}</p>
      </div>
    </div>
  );
}

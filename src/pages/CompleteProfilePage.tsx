import { FormEvent, useEffect, useMemo, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import { normalizeClerkRole, getDashboardPath, isAgentRole, isCustomerRole } from "@/lib/auth/get-user-role";

export default function CompleteProfilePage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const { isLoaded: orgListLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedArea, setAssignedArea] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeOrgId = organization?.id || userMemberships?.data?.[0]?.organization?.id || null;
  const membershipId = user && activeOrgId ? membershipIdFor(activeOrgId, user.id) : null;
  const { data: membershipDoc, loading: membershipLoading } = useDocumentRealtime<any>("organizationMembers", membershipId);

  const role = useMemo(() => {
    return normalizeClerkRole(membershipDoc?.clerkRole || membershipDoc?.role || null);
  }, [membershipDoc]);

  useEffect(() => {
    if (!isLoaded || !orgListLoaded) return;
    if (!organization?.id && userMemberships?.data?.length && setActive) {
      setActive({ organization: userMemberships.data[0].organization.id }).catch(() => undefined);
    }
  }, [organization?.id, userMemberships?.data, setActive, isLoaded, orgListLoaded]);

  useEffect(() => {
    if (!membershipDoc) return;
    if (membershipDoc.profileCompleted !== false) {
      navigate("/router", { replace: true });
      return;
    }
    setFullName(membershipDoc.fullName || user?.fullName || "");
    setPhone(membershipDoc.phone || "");
    setAssignedArea(membershipDoc.assignedArea || membershipDoc.address || "");
  }, [membershipDoc, navigate, user?.fullName]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      navigate("/sign-in", { replace: true });
    }
  }, [isLoaded, isSignedIn, user, navigate]);

  const userRoleLabel = isAgentRole(role) ? "Assigned Area" : isCustomerRole(role) ? "Address" : "Profile Field";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !membershipId || !membershipDoc) return;
    setIsSaving(true);

    const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || "";
    const profileValues = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      assignedArea: assignedArea.trim(),
      address: assignedArea.trim(),
      profileCompleted: true,
      status: "ACTIVE",
      updatedAt: serverTimestamp(),
    } as any;

    try {
      await setDoc(doc(db, "organizationMembers", membershipId), profileValues, { merge: true });
      await setDoc(doc(db, "memberships", membershipId), profileValues, { merge: true });

      // Sync customers collection on profile completion
      if (isCustomerRole(role)) {
        await setDoc(doc(db, "customers", membershipId), {
          fullName: fullName.trim(),
          phone: phone.trim(),
          address: assignedArea.trim(),
          profileCompleted: true,
          status: "ACTIVE",
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      await setDoc(doc(db, "users", user.id), {
        clerkUserId: user.id,
        id: user.id,
        email,
        name: fullName.trim() || user.fullName || "",
        role: isAgentRole(role) ? "pigmy_collector" : isCustomerRole(role) ? "customer" : "customer",
        phone: phone.trim(),
        assignedArea: assignedArea.trim(),
        address: assignedArea.trim(),
        status: "ACTIVE",
        profileCompleted: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast.success("Profile completed successfully.");
      navigate(getDashboardPath(role), { replace: true });
    } catch (error: any) {
      console.error("CompleteProfilePage save error:", error);
      toast.error(error?.message || "Failed to complete profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoaded || !orgListLoaded || membershipLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Loading your profile workflow...</div>
      </div>
    );
  }

  if (!membershipDoc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-slate-900">Unable to load profile workflow</h1>
          <p className="mt-3 text-sm text-slate-600">Your account does not appear to have an active organization membership yet.</p>
          <button
            onClick={() => navigate("/router", { replace: true })}
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Return to app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="space-y-3 pb-6 border-b border-slate-200">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Complete your workspace profile</p>
          <h1 className="text-3xl font-bold text-slate-900">Finish your account setup</h1>
          <p className="text-sm leading-6 text-slate-600">
            Complete your profile before you can access collections and customer dashboards.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Full name</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Phone number</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">{userRoleLabel}</label>
            <textarea
              value={assignedArea}
              onChange={(event) => setAssignedArea(event.target.value)}
              className="w-full min-h-[110px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              placeholder={isAgentRole(role) ? "Enter your assigned area or collection zone" : "Enter your address"}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Complete profile"}
          </button>
        </form>
      </div>
    </div>
  );
}

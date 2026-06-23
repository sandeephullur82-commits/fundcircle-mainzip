import React, { useState, useEffect } from "react";
import { useOrganizationList, useUser } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Building2, ArrowRight, RefreshCw, Sparkles, Shield, AlertTriangle } from "lucide-react";
import BackToHomeButton from "@/components/BackToHomeButton";
import { useLanguage } from "@/lib/languageContext";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName } from "@/lib/validation";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import { setCached } from "@/lib/authCache";

export default function OrgCreate() {
  const { isLoaded, createOrganization, setActive } = useOrganizationList();
  const { user } = useUser();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [orgNameError, setOrgNameError] = useState("");

  const [existingOrgName, setExistingOrgName] = useState<string | null>(null);
  const [ownershipChecked, setOwnershipChecked] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    const checkOwnership = async () => {
      try {
        const q = query(
          collection(db, "organizationMembers"),
          where("clerkUserId", "==", user.id),
          where("role", "==", "OWNER")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setExistingOrgName(data.organizationName || "your organization");
        }
      } catch (err) {
        console.warn("[FC OrgCreate] Ownership check failed:", err);
      } finally {
        setOwnershipChecked(true);
      }
    };
    checkOwnership();
  }, [isLoaded, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existingOrgName) return;
    const trimmedName = orgName.trim();
    if (!trimmedName) { setOrgNameError("Organization name is required."); return; }
    if (trimmedName.length < 3) { setOrgNameError("Name must be at least 3 characters."); return; }
    if (trimmedName.length > 100) { setOrgNameError("Name cannot exceed 100 characters."); return; }
    setOrgNameError("");

    setIsLoading(true);
    try {
      if (!createOrganization) {
        return toast.error("You do not have administrative permission to establish organizations.");
      }

      const cleanName = sanitizeName(orgName);
      const org = await createOrganization({ name: cleanName });

      await setDoc(doc(db, "organizations", org.id), {
        id: org.id,
        organizationId: org.id,
        name: cleanName,
        ownerClerkUserId: user?.id || "",
        ownerEmail: user?.primaryEmailAddress?.emailAddress || "",
        createdAt: serverTimestamp(),
      }, { merge: true });

      if (user) {
        await setDoc(doc(db, "users", user.id), {
          name: user.fullName || "Owner",
          email: user.primaryEmailAddress?.emailAddress || "",
          updatedAt: serverTimestamp(),
        }, { merge: true });

        const ownerDocId = membershipIdFor(org.id, user.id);
        const ownerMembership = {
          id: ownerDocId,
          organizationId: org.id,
          clerkUserId: user.id,
          clerkRole: "org:owner",
          role: "OWNER",
          organizationName: cleanName,
          fullName: user.fullName || "Owner",
          name: user.fullName || "Owner",
          email: user.primaryEmailAddress?.emailAddress || "",
          status: "active",
          actsAsAgent: true,
          collectorEnabled: true,
          assignedArea: "Main Area",
          createdAt: serverTimestamp(),
        };

        await setDoc(doc(db, "memberships", ownerDocId), ownerMembership, { merge: true });
        await setDoc(doc(db, "organizationMembers", ownerDocId), ownerMembership, { merge: true });

        setCached(`role_${user.id}_${org.id}`, "org:owner");
      }

      if (setActive) {
        await setActive({ organization: org.id });
      }

      sessionStorage.setItem("fc_onboarding_org_id", org.id);

      toast.success("Organization directory created successfully!");
      navigate("/dashboard/owner", { replace: true, state: { orgId: org.id } });
    } catch (err: any) {
      console.error(err);
      toast.error(err.errors?.[0]?.message || err.message || "Failed to create organization");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded || !ownershipChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 font-semibold animate-pulse uppercase tracking-wider text-xs">
          Loading Directory Settings...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">

        <div className="flex justify-between items-center px-2">
          <Link to="/" className="flex items-center gap-2 group border-0 focus:outline-none">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
              FC
            </div>
            <span className="font-extrabold text-xl text-slate-900 tracking-tight">FundCircle</span>
          </Link>
          <div className="text-xs font-semibold text-slate-400">Pigmy Operator Setup</div>
        </div>
        <div>
          <BackToHomeButton dark={false} />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-xl space-y-6"
        >
          {existingOrgName ? (
            <div className="space-y-5">
              <div className="space-y-1.5 pb-4 border-b border-slate-100">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5" /> Organization Limit Reached
                </div>
                <h1 className="text-xl font-bold text-slate-800 pt-1">
                  You already own an organization
                </h1>
                <p className="text-xs text-slate-500">
                  Each owner account can only manage one organization.
                </p>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50/60 border border-amber-200/70 rounded-2xl">
                <Building2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-800">{existingOrgName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Your active organization</p>
                </div>
              </div>

              <button
                onClick={() => navigate("/dashboard/owner")}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 pb-4 border-b border-slate-100">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  <Sparkles className="w-3.5 h-3.5" /> Direct Operator Account Creator
                </div>
                <h1 className="text-xl font-bold text-slate-800 pt-1">
                  Setup Your Pigmy Operator Bank
                </h1>
                <p className="text-xs text-slate-500">
                  Create a secure workspace context for your agents, depositors, and accounting records.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="org-name-input" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Organization / Bank Name
                  </label>
                  <div className="relative" style={{ marginBottom: 0 }}>
                    <Building2 className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      id="org-name-input"
                      type="text"
                      placeholder="e.g. Mandya Pigmy Co-operative Bank"
                      value={orgName}
                      onChange={(e) => {
                        setOrgName(e.target.value);
                        const v = e.target.value.trim();
                        if (!v) setOrgNameError("Organization name is required.");
                        else if (v.length < 3) setOrgNameError("Minimum 3 characters.");
                        else if (v.length > 100) setOrgNameError("Maximum 100 characters.");
                        else setOrgNameError("");
                      }}
                      maxLength={100}
                      className={`h-12 w-full pl-11 pr-4 rounded-xl border ${orgNameError ? "border-red-400 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"} bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:bg-white text-sm transition-all focus:outline-none focus:ring-4`}
                    />
                  </div>
                  <FieldError error={orgNameError} />
                </div>

                <button
                  id="org-create-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-md shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  {isLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Create Organization</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex gap-2 items-start">
                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Upon workspace initialization, you will be designated as the **Primary Operator Trustee**. You can add field collection agents directly to your organization.
                </p>
              </div>
            </>
          )}
        </motion.div>

        <div className="text-center">
          <Link
            id="org-create-back-link"
            to="/router"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 focus:outline-none"
          >
            Back to Workspace Router
          </Link>
        </div>

      </div>
    </div>
  );
}

import { useOrganizationList, useUser, SignOutButton } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Building2, ChevronRight, LogOut, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { BrandMark } from "@/components/BrandLogo";
import { normalizeClerkRole, getDashboardPath } from "@/lib/auth/get-user-role";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgSelectorPage() {
  const { user } = useUser();
  const { userMemberships, setActive, isLoaded } = useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (orgId: string, clerkRole: string) => {
    if (!setActive || selecting) return;
    setSelecting(orgId);
    try {
      await setActive({ organization: orgId });
      sessionStorage.setItem("fc_onboarding_org_id", orgId);
      const normalizedRole = normalizeClerkRole(clerkRole);
      const dashPath = getDashboardPath(normalizedRole);
      navigate(dashPath, { replace: true, state: { orgId } });
    } catch (err) {
      console.error("[FC OrgSelector] Failed to set active org:", err);
      setSelecting(null);
    }
  };

  const memberships = userMemberships?.data || [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between px-1">
          <BrandMark />
          <SignOutButton>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-700 gap-1.5 h-8 text-xs">
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>
          </SignOutButton>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl space-y-5"
        >
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900">Select Organization</h1>
            <p className="text-sm text-slate-500">
              You belong to multiple organizations. Choose one to continue.
            </p>
          </div>

          <div className="space-y-2">
            {!isLoaded ? (
              <>
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </>
            ) : memberships.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No organizations found.
              </div>
            ) : (
              memberships.map((m: any) => {
                const orgId = m.organization?.id;
                const orgName = m.organization?.name || orgId;
                const isSelecting = selecting === orgId;
                const roleLabel =
                  m.role === "org:admin"
                    ? "Owner"
                    : m.role === "org:pigmy_collector"
                    ? "Collector"
                    : "Customer";

                return (
                  <button
                    key={orgId}
                    onClick={() => handleSelect(orgId, m.role)}
                    disabled={!!selecting}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all text-left group disabled:opacity-60"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{orgName}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{roleLabel}</p>
                    </div>
                    {isSelecting ? (
                      <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-1 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              Signed in as{" "}
              <span className="font-semibold text-slate-600">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

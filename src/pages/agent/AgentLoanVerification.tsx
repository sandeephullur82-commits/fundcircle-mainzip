import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { LoanApplication, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ShieldCheck, Home, CreditCard, Briefcase, Users, FileText,
  Search, CheckCircle, XCircle, Clock, Loader2, ChevronRight,
} from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

type CheckStatus = "PENDING" | "PASS" | "FAIL";

interface VerificationChecks {
  residence: CheckStatus;
  identity: CheckStatus;
  income: CheckStatus;
  business: CheckStatus;
  references: CheckStatus;
}

const CHECK_ITEMS: { key: keyof VerificationChecks; label: string; icon: React.ReactNode; description: string }[] = [
  { key: "residence", label: "Residence Verification", icon: <Home className="w-4 h-4" />, description: "Verify the applicant's home address" },
  { key: "identity", label: "Identity Verification", icon: <CreditCard className="w-4 h-4" />, description: "Check Aadhaar, PAN, or other ID proof" },
  { key: "income", label: "Income Verification", icon: <FileText className="w-4 h-4" />, description: "Review salary slips or income proofs" },
  { key: "business", label: "Business Verification", icon: <Briefcase className="w-4 h-4" />, description: "Verify business registration and operations" },
  { key: "references", label: "Reference Check", icon: <Users className="w-4 h-4" />, description: "Verify provided references" },
];

export default function AgentLoanVerification() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const agentId = user?.id || "";
  const orgId = organization?.id || "";

  // Only fetch apps where verificationStatus is PENDING or not set
  const { data: allApps, loading } = useCollectionRealtime<LoanApplication>("loanApplications", [
    where("status", "==", "PENDING"),
  ]);
  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers");

  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);
  const [checks, setChecks] = useState<VerificationChecks>({
    residence: "PENDING", identity: "PENDING", income: "PENDING", business: "PENDING", references: "PENDING",
  });
  const [verificationNotes, setVerificationNotes] = useState("");
  const [overallStatus, setOverallStatus] = useState<"PENDING" | "VERIFIED" | "REJECTED">("PENDING");
  const [submitting, setSubmitting] = useState(false);

  // Scope to only this agent's assigned customers
  const myCustomerIds = new Set(
    allMembers
      .filter((m) => m.assignedAgentId === agentId || (m as any).assigned_to_user_id === agentId)
      .flatMap((m) => [m.id, m.clerkUserId].filter(Boolean) as string[])
  );

  const filtered = allApps.filter((app) => {
    const name = app.customerName || "";
    const isMyCustomer = myCustomerIds.size === 0 || myCustomerIds.has(app.customerId);
    return isMyCustomer && (!search || name.toLowerCase().includes(search.toLowerCase()));
  });

  const getStatusColor = (s: CheckStatus) => {
    if (s === "PASS") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (s === "FAIL") return "bg-red-100 text-red-700 border-red-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  const getStatusIcon = (s: CheckStatus) => {
    if (s === "PASS") return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    if (s === "FAIL") return <XCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-amber-500" />;
  };

  const handleOpenApp = (app: LoanApplication) => {
    setSelectedApp(app);
    setChecks({ residence: "PENDING", identity: "PENDING", income: "PENDING", business: "PENDING", references: "PENDING" });
    setVerificationNotes(app.verificationNotes || "");
    setOverallStatus(app.verificationStatus || "PENDING");
  };

  const allChecksComplete = Object.values(checks).every((v) => v !== "PENDING");

  const handleSubmit = async () => {
    if (!selectedApp || !user?.id) return;
    setSubmitting(true);
    try {
      const checksPassed = Object.values(checks).filter((v) => v === "PASS").length;
      const totalChecks = Object.keys(checks).length;
      await updateDoc(doc(db, "loanApplications", selectedApp.id), {
        verificationStatus: overallStatus,
        verificationNotes,
        verificationChecks: checks,
        verifiedByAgentId: agentId,
        verifiedByAgentName: user.fullName || user.primaryEmailAddress?.emailAddress || "Agent",
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        verificationSummary: `${checksPassed}/${totalChecks} checks passed`,
      });
      toast.success("Verification report submitted successfully.");
      setSelectedApp(null);
      setVerificationNotes("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit verification report.");
    } finally { setSubmitting(false); }
  };

  const verificationStatusConfig = {
    PENDING: { label: "Pending Verification", className: "bg-amber-50 text-amber-700 border-amber-200" },
    VERIFIED: { label: "Verified", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    REJECTED: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200" },
  };

  const pendingCount = filtered.filter((a) => !a.verificationStatus || a.verificationStatus === "PENDING").length;
  const verifiedCount = allApps.filter((a) => a.verificationStatus === "VERIFIED").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Loan Verification</h2>
        <p className="text-slate-500 text-sm">Verify loan applications before owner approval.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-amber-900">{pendingCount}</p>
            <p className="text-xs text-amber-700 mt-0.5">Pending Verification</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-emerald-900">{verifiedCount}</p>
            <p className="text-xs text-emerald-700 mt-0.5">Verified by You</p>
          </CardContent>
        </Card>
      </div>

      {/* Application List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Applications Pending Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name…" className="pl-9 h-10" />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pending applications to verify.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((app) => {
                const vStatus = app.verificationStatus || "PENDING";
                const cfg = verificationStatusConfig[vStatus] || verificationStatusConfig.PENDING;
                return (
                  <button key={app.id} onClick={() => handleOpenApp(app)}
                    className="w-full p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm text-left transition-all">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{app.customerName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ₹{Number(app.loanAmount).toLocaleString()} · {app.tenureMonths}mo · {app.loanPurpose}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Applied: {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.className}`}>{cfg.label}</span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={(o) => !o && setSelectedApp(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" /> Verification Report
            </DialogTitle>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4 mt-2">
              {/* Application summary */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-slate-900">{selectedApp.customerName}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Amount</span><p className="font-semibold">₹{Number(selectedApp.loanAmount).toLocaleString()}</p></div>
                  <div><span className="text-slate-500">Tenure</span><p className="font-semibold">{selectedApp.tenureMonths} months</p></div>
                  <div><span className="text-slate-500">Purpose</span><p className="font-semibold">{selectedApp.loanPurpose}</p></div>
                  <div><span className="text-slate-500">Income</span><p className="font-semibold">₹{Number(selectedApp.monthlyIncome).toLocaleString()}/mo</p></div>
                </div>
                {selectedApp.notes && <p className="text-xs text-slate-500 mt-1 italic">"{selectedApp.notes}"</p>}
              </div>

              {/* Verification checklist */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Verification Checklist</p>
                {CHECK_ITEMS.map(({ key, label, icon, description }) => (
                  <div key={key} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${getStatusColor(checks[key])}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center shrink-0">{icon}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs opacity-75">{description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {getStatusIcon(checks[key])}
                      <div className="flex gap-1">
                        {(["PASS", "FAIL", "PENDING"] as CheckStatus[]).map((s) => (
                          <button key={s} type="button"
                            onClick={() => setChecks((prev) => ({ ...prev, [key]: s }))}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${checks[key] === s
                              ? s === "PASS" ? "bg-emerald-600 text-white border-emerald-600"
                                : s === "FAIL" ? "bg-red-600 text-white border-red-600"
                                : "bg-amber-500 text-white border-amber-500"
                              : "bg-white text-slate-500 border-slate-300"}`}>
                            {s === "PENDING" ? "N/A" : s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall verification status */}
              <div className="space-y-1.5">
                <Label>Overall Verification Status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PENDING", "VERIFIED", "REJECTED"] as const).map((s) => {
                    const cls = {
                      PENDING: overallStatus === s ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200",
                      VERIFIED: overallStatus === s ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200",
                      REJECTED: overallStatus === s ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200",
                    }[s];
                    return (
                      <button key={s} type="button" onClick={() => setOverallStatus(s)}
                        className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${cls}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Verification notes */}
              <div className="space-y-1.5">
                <Label>Verification Notes</Label>
                <textarea value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)}
                  rows={3} placeholder="Describe your findings — residence confirmed, ID checked, references contacted…"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none" />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedApp(null)}>Cancel</Button>
                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit} disabled={submitting || !verificationNotes.trim()}>
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "Submit Report"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

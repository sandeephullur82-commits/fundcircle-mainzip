import React, { useState } from "react";
import { Send, TrendingUp, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDoc, collection as fsCol, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { format } from "date-fns";
import type { LoanApplication } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

const EMPLOYMENT_TYPES = [
  "Salaried", "Self-Employed", "Business Owner", "Farmer",
  "Daily Wage", "Pensioner", "Other",
];

const LOAN_PURPOSES = [
  "Home Renovation", "Medical Emergency", "Education", "Business Expansion",
  "Agriculture", "Vehicle Purchase", "Wedding", "Debt Consolidation", "Other",
];

interface Props {
  orgId: string;
  membershipId: string | null;
  user: any;
  loanApplications: LoanApplication[];
}

export default function ApplyLoanTab({ orgId, membershipId, user, loanApplications }: Props) {
  const [loanAmount, setLoanAmount] = useState("");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [loanAddress, setLoanAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const sortedApps = [...loanApplications].sort(
    (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
  );
  const hasPending = sortedApps.some((a) => a.status === "PENDING");
  const hasNone = sortedApps.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !membershipId || !user) return toast.error("Organization not loaded.");
    if (Number(loanAmount) <= 0) return toast.error("Loan amount must be greater than 0.");
    if (!loanPurpose) return toast.error("Please select a loan purpose.");
    if (!employmentType) return toast.error("Please select your employment type.");
    if (Number(monthlyIncome) <= 0) return toast.error("Please enter your monthly income.");

    setSubmitting(true);
    try {
      await addDoc(fsCol(db, "loanApplications"), {
        organizationId: orgId,
        customerId: membershipId,
        customerName: user?.fullName || user?.firstName || "Customer",
        customerEmail: user?.primaryEmailAddress?.emailAddress || "",
        loanAmount: Number(loanAmount),
        loanPurpose,
        tenureMonths: Number(tenureMonths),
        monthlyIncome: Number(monthlyIncome),
        employmentType,
        address: loanAddress,
        notes,
        status: "PENDING",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(fsCol(db, "notifications"), {
        organizationId: orgId,
        userId: "owner",
        type: "GENERAL",
        title: "New Loan Application",
        message: `${user?.fullName || "A customer"} has applied for a ₹${Number(loanAmount).toLocaleString()} loan (${tenureMonths} months).`,
        read: false,
        timestamp: serverTimestamp(),
      });

      toast.success("Application submitted! The owner will review it shortly.");
      setLoanAmount(""); setLoanPurpose(""); setTenureMonths("12");
      setMonthlyIncome(""); setEmploymentType(""); setLoanAddress(""); setNotes("");
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  const appStatusStyles: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
    REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400",
    DISBURSED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
    DRAFT: "bg-slate-100 text-slate-500 border-slate-200",
  };

  const appStatusIcon = (status: string) => {
    if (status === "PENDING") return <Clock className="w-4 h-4 text-amber-500" />;
    if (status === "APPROVED" || status === "DISBURSED") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (status === "REJECTED") return <XCircle className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="space-y-4">
      {/* My Applications */}
      {sortedApps.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              My Applications
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {sortedApps.map((app) => (
                <div key={app.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{appStatusIcon(app.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          ₹{Number(app.loanAmount).toLocaleString()} · {app.tenureMonths} months
                        </p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${appStatusStyles[app.status] ?? appStatusStyles.PENDING}`}>
                          {app.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {app.loanPurpose} · {toDate(app.createdAt).getTime() > 0
                          ? format(toDate(app.createdAt), "MMM d, yyyy")
                          : "—"}
                      </p>
                      {app.employmentType && (
                        <p className="text-xs text-slate-400">{app.employmentType} · ₹{Number(app.monthlyIncome).toLocaleString()}/mo income</p>
                      )}
                      {app.status === "REJECTED" && app.rejectionReason && (
                        <div className="mt-1.5 bg-red-50 dark:bg-red-950/30 rounded-lg px-2.5 py-1.5">
                          <p className="text-xs text-red-600 dark:text-red-400 italic">
                            Reason: {app.rejectionReason}
                          </p>
                        </div>
                      )}
                      {app.status === "APPROVED" && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                          ✓ Approved — check the Loans tab for your active loan.
                        </p>
                      )}
                      {app.status === "DISBURSED" && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                          ✓ Disbursed — funds have been released.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending warning */}
      {hasPending && !showForm && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Application under review</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                You have a pending application. Please wait for it to be reviewed before submitting another.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-2 text-xs text-amber-700 dark:text-amber-300 underline font-semibold"
              >
                Submit another anyway →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Application Form */}
      {(hasNone || showForm || (!hasPending)) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              New Loan Application
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Fill in the details below and submit for review.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Loan Amount (₹) *">
                  <input
                    type="number" min="1000" step="100" required value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="e.g. 50,000"
                    className="fc-input"
                  />
                </Field>

                <Field label="Loan Purpose *">
                  <select required value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} className="fc-input">
                    <option value="">Select purpose…</option>
                    {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tenure *">
                    <select value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} className="fc-input">
                      {[3, 6, 12, 18, 24, 36, 48, 60].map((m) => (
                        <option key={m} value={m}>{m} months</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monthly Income (₹) *">
                    <input
                      type="number" min="0" required value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      placeholder="e.g. 25,000"
                      className="fc-input"
                    />
                  </Field>
                </div>

                <Field label="Employment Type *">
                  <select required value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="fc-input">
                    <option value="">Select type…</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>

                <Field label="Address">
                  <input
                    type="text" value={loanAddress}
                    onChange={(e) => setLoanAddress(e.target.value)}
                    placeholder="Your current address"
                    className="fc-input"
                  />
                </Field>

                <Field label="Remarks / Additional Info">
                  <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional information about your loan request…"
                    rows={3}
                    className="fc-input resize-none"
                  />
                </Field>
              </div>

              {/* EMI Estimate */}
              {loanAmount && tenureMonths && Number(loanAmount) > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Estimated EMI (approx.)</p>
                  <p className="text-lg font-black text-emerald-800 dark:text-emerald-300">
                    ₹{Math.round(Number(loanAmount) / Number(tenureMonths)).toLocaleString()}/month
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">
                    Actual EMI may vary based on interest rate set by the organization.
                  </p>
                </div>
              )}

              <button
                type="submit" disabled={submitting}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit Application
                  </>
                )}
              </button>

              {showForm && hasPending && (
                <button type="button" onClick={() => setShowForm(false)}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 font-semibold">
                  Cancel
                </button>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-blue-800 dark:text-blue-300">How it works</p>
        <div className="space-y-1.5">
          {[
            "Fill and submit the application form",
            "Organization reviews your request",
            "Approval/rejection notification sent",
            "Upon approval, loan is disbursed",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 h-5 bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="text-xs text-blue-700 dark:text-blue-300">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

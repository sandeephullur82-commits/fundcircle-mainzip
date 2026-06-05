import React, { useState, useRef, useEffect } from "react";
import { useUser, useOrganization, useOrganizationList, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, CreditCard, History, ChevronDown, Check, Building2,
  PiggyBank, FileText, CalendarDays, AlertTriangle, CheckCircle, Clock,
  User, Edit3, Save, X, Download, Plus, Phone, MapPin, Shield,
  Camera, Eye, EyeOff, Send, Inbox, RefreshCw, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollectionRealtime, useDocumentRealtime, useCollectionRealtimeRaw } from "@/lib/firestore-hooks";
import {
  Collection, Loan, LoanApplication, LoanInstallment,
  Membership, SavingsAccount, SavingsTransaction,
} from "@/types";
import { format, isBefore, startOfDay } from "date-fns";
import {
  where, doc, updateDoc, addDoc, collection as fsCol,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function initials(name?: string | null): string {
  if (!name) return "C";
  return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
}

type Tab = "savings" | "passbook" | "loans" | "apply_loan" | "emi_schedule" | "receipts" | "profile";

const EMPLOYMENT_TYPES = ["Salaried", "Self-Employed", "Business Owner", "Farmer", "Daily Wage", "Pensioner", "Other"];

const LOAN_PURPOSES = [
  "Home Renovation", "Medical Emergency", "Education", "Business Expansion",
  "Agriculture", "Vehicle Purchase", "Wedding", "Debt Consolidation", "Other",
];

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CustomerDashboard() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });

  const [activeTab, setActiveTab] = useState<Tab>("savings");
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  const orgId = organization?.id || "";
  const clerkUserId = user?.id || "";
  const membershipId = orgId && clerkUserId ? `${orgId}_${clerkUserId}` : null;
  const orgName = organization?.name || "My Organization";
  const orgs = userMemberships?.data || [];

  // ── Firestore realtime data ──────────────────────────────────────────────────
  const { data: membershipDoc } = useDocumentRealtime<Membership>(
    "organizationMembers", membershipId
  );

  const { data: collections } = useCollectionRealtimeRaw<Collection>("collections", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);
  const { data: savingsAccounts } = useCollectionRealtimeRaw<SavingsAccount>("savings_accounts", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);
  const { data: savingsTxs } = useCollectionRealtimeRaw<SavingsTransaction>("savings_transactions", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);
  const { data: loans } = useCollectionRealtimeRaw<Loan>("loans", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);
  const { data: installments } = useCollectionRealtimeRaw<LoanInstallment>("loan_installments", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);
  const { data: loanApplications } = useCollectionRealtimeRaw<LoanApplication>("loanApplications", [
    where("customerId", "==", membershipId ?? "__none__"),
  ]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const savingsAccount = savingsAccounts[0] || null;
  const totalSavings = savingsAccount?.totalBalance || 0;
  const activeLoans = loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE");
  const totalOutstanding = activeLoans.reduce((s, l) => s + (l.outstandingBalance ?? (l as any).balanceRemaining ?? 0), 0);
  const today = startOfDay(new Date());
  const allInstallmentsSorted = [...installments].sort((a, b) => a.installmentNo - b.installmentNo);
  const pendingInstallments = allInstallmentsSorted.filter((i) => i.status !== "PAID");
  const overdueInstallments = pendingInstallments.filter((i) => isBefore(toDate(i.dueDate), today));
  const nextDue = pendingInstallments[0] || null;
  const sortedTxs = [...savingsTxs].sort((a, b) => toDate(b.collectedAt).valueOf() - toDate(a.collectedAt).valueOf());
  const sortedCollections = [...collections].sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf());
  const sortedLoanApps = [...loanApplications].sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
  const pendingApplications = loanApplications.filter((a) => a.status === "PENDING");

  const TABS: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "savings", label: "Savings", icon: PiggyBank },
    { id: "passbook", label: "Passbook", icon: History },
    { id: "loans", label: "Loans", icon: CreditCard },
    { id: "apply_loan", label: "Apply Loan", icon: Plus, badge: pendingApplications.length || undefined },
    { id: "emi_schedule", label: "EMI Schedule", icon: CalendarDays },
    { id: "receipts", label: "Receipts", icon: FileText },
    { id: "profile", label: "Profile", icon: User },
  ];

  // ─── Statement download ────────────────────────────────────────────────────
  const downloadStatement = () => {
    const rows = [
      ["Date", "Time", "Receipt No", "Amount (₹)", "Balance After (₹)", "Collected By"],
      ...sortedTxs.map((tx) => {
        const d = toDate(tx.collectedAt);
        return [
          d.getTime() > 0 ? format(d, "yyyy-MM-dd") : "—",
          d.getTime() > 0 ? format(d, "HH:mm") : "—",
          tx.receiptNo || "",
          tx.amount.toString(),
          tx.balanceAfter.toString(),
          tx.collectedByName || "Agent",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `savings-statement-${orgName.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Statement downloaded");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button
          onClick={() => setActiveTab("profile")}
          className="flex items-center gap-3 group cursor-pointer min-w-0"
        >
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="Profile" className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-200 group-hover:ring-emerald-400 transition-all shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold shrink-0 group-hover:bg-emerald-700 transition-colors">
              {initials(user?.fullName)}
            </div>
          )}
          <div className="min-w-0 text-left">
            <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{user?.fullName || "Customer"}</p>
            <p className="text-xs text-slate-500 truncate">{orgName}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {orgs.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
              >
                <Building2 className="w-3 h-3" />
                <span className="hidden sm:inline max-w-[100px] truncate">{orgName}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showOrgSwitcher && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-[200px] py-1">
                  {orgs.map((mem) => (
                    <button
                      key={mem.organization.id}
                      onClick={async () => { await setActive?.({ organization: mem.organization.id }); setShowOrgSwitcher(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      {mem.organization.id === orgId && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                      <span className="truncate">{mem.organization.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <SignOutButton>
            <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </SignOutButton>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Summary Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div onClick={() => setActiveTab("savings")} className="bg-emerald-600 rounded-2xl p-5 text-white cursor-pointer hover:bg-emerald-700 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <p className="text-emerald-100 text-sm font-medium">Total Savings</p>
              <PiggyBank className="w-5 h-5 text-emerald-200" />
            </div>
            <p className="text-3xl font-black">₹{totalSavings.toLocaleString()}</p>
            <p className="text-emerald-200 text-xs mt-1">{sortedTxs.length} deposits</p>
          </div>
          <div onClick={() => setActiveTab("loans")} className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-sm font-medium">Loan Outstanding</p>
              <CreditCard className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-3xl font-black text-slate-900">₹{totalOutstanding.toLocaleString()}</p>
            <p className="text-slate-400 text-xs mt-1">{activeLoans.length} active loan{activeLoans.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* ── Overdue / Next EMI alert ──────────────────────────────────────── */}
        {nextDue && (
          <div
            onClick={() => setActiveTab("emi_schedule")}
            className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer ${overdueInstallments.length > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}
          >
            {overdueInstallments.length > 0 ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${overdueInstallments.length > 0 ? "text-red-800" : "text-amber-800"}`}>
                {overdueInstallments.length > 0 ? `${overdueInstallments.length} EMI overdue!` : "Next EMI due"}
              </p>
              <p className={`text-xs mt-0.5 ${overdueInstallments.length > 0 ? "text-red-600" : "text-amber-600"}`}>
                ₹{Number(nextDue.emiAmount).toLocaleString()} · {toDate(nextDue.dueDate).getTime() > 0 ? format(toDate(nextDue.dueDate), "MMM d, yyyy") : "—"}
              </p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${overdueInstallments.length > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              #{nextDue.installmentNo}
            </span>
          </div>
        )}

        {/* ── Tab navigation ────────────────────────────────────────────────── */}
        <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit min-w-full">
            {TABS.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge != null && badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SAVINGS TAB                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "savings" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Savings Account Balance</p>
                    <p className="text-4xl font-black text-slate-900 mt-1">₹{totalSavings.toLocaleString()}</p>
                  </div>
                  <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center">
                    <PiggyBank className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
                {savingsAccount && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Plan Type</p>
                      <p className="font-semibold text-slate-900 text-sm mt-0.5">{savingsAccount.planType || "DAILY"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Status</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${savingsAccount.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {savingsAccount.status || "ACTIVE"}
                      </span>
                    </div>
                    {savingsAccount.scheduledAmount > 0 && (
                      <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                        <p className="text-xs text-slate-500">Scheduled Deposit</p>
                        <p className="font-semibold text-slate-900 text-sm mt-0.5">
                          ₹{savingsAccount.scheduledAmount.toLocaleString()} / {(savingsAccount.planType || "DAILY").toLowerCase()}
                        </p>
                      </div>
                    )}
                    {savingsAccount.startDate && (
                      <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                        <p className="text-xs text-slate-500">Account Opened</p>
                        <p className="font-semibold text-slate-900 text-sm mt-0.5">
                          {toDate(savingsAccount.startDate).getTime() > 0 ? format(toDate(savingsAccount.startDate), "MMMM d, yyyy") : "—"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {sortedTxs.length > 0 && (
                  <button
                    onClick={downloadStatement}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-sm hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Statement (CSV)
                  </button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-sm">Recent Deposits</CardTitle></CardHeader>
              <CardContent className="p-0 mt-3">
                {sortedTxs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No deposits yet.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {sortedTxs.slice(0, 5).map((tx) => {
                      const d = toDate(tx.collectedAt);
                      return (
                        <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Savings Deposit</p>
                            <p className="text-xs text-slate-500 mt-0.5">{tx.collectedByName || "Agent"} · {d.getTime() > 0 ? format(d, "MMM d, h:mm a") : "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-600">+₹{tx.amount.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">Bal: ₹{tx.balanceAfter.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                    {sortedTxs.length > 5 && (
                      <button onClick={() => setActiveTab("passbook")} className="w-full py-3 text-xs font-semibold text-emerald-600 hover:text-emerald-700 text-center">
                        View all {sortedTxs.length} transactions in Passbook →
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PASSBOOK TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "passbook" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Savings Passbook</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Complete deposit history with running balance.</p>
                </div>
                {sortedTxs.length > 0 && (
                  <button
                    onClick={downloadStatement}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sortedTxs.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No transactions yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Receipt</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {sortedTxs.map((tx) => {
                        const d = toDate(tx.collectedAt);
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-slate-600">{d.getTime() > 0 ? format(d, "MMM d, yyyy") : "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{tx.receiptNo}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">+₹{tx.amount.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-900">₹{tx.balanceAfter.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-emerald-50/50 border-t border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-slate-500">Total ({sortedTxs.length} deposits)</td>
                        <td className="px-4 py-2.5 text-right font-black text-emerald-700">
                          ₹{sortedTxs.reduce((s, t) => s + t.amount, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-slate-900">₹{totalSavings.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LOANS TAB                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "loans" && (
          <div className="space-y-4">
            {sortedLoanApps.length > 0 && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Inbox className="w-4 h-4 text-amber-500" /> My Loan Applications
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 mt-3">
                  <div className="divide-y divide-slate-50">
                    {sortedLoanApps.map((app) => {
                      const st = app.status;
                      return (
                        <div key={app.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">₹{Number(app.loanAmount).toLocaleString()} · {app.tenureMonths}m</p>
                            <p className="text-xs text-slate-500 mt-0.5">{app.loanPurpose} · {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}</p>
                            {st === "REJECTED" && app.rejectionReason && (
                              <p className="text-xs text-red-500 mt-0.5 italic">Reason: {app.rejectionReason}</p>
                            )}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            st === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200"
                            : st === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-700 border-red-200"
                          }`}>{st}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {loans.length === 0 && sortedLoanApps.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-slate-400">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No loans on your account.</p>
                  <button
                    onClick={() => setActiveTab("apply_loan")}
                    className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Apply for a Loan
                  </button>
                </CardContent>
              </Card>
            ) : (
              loans.map((loan) => {
                const st = (loan.status || "").toUpperCase();
                const principal = loan.principalAmount ?? (loan as any).principal ?? 0;
                const outstanding = loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0;
                const tenure = loan.tenureMonths ?? (loan as any).durationMonths ?? 0;
                const paidInstallments = installments.filter((i) => i.loanId === loan.id && i.status === "PAID").length;
                return (
                  <Card key={loan.id}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">Loan Account</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{loan.id.slice(-12)}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          st === "ACTIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : st === "CLOSED" ? "bg-slate-100 text-slate-500 border-slate-200"
                          : st === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-100"
                          : "bg-red-50 text-red-700 border-red-100"
                        }`}>{st}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500">Principal</p>
                          <p className="font-bold text-slate-900">₹{Number(principal).toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500">Monthly EMI</p>
                          <p className="font-bold text-slate-900">₹{Number(loan.emiAmount ?? 0).toFixed(2)}</p>
                        </div>
                        <div className={`rounded-xl p-3 ${outstanding > 0 ? "bg-orange-50" : "bg-emerald-50"}`}>
                          <p className={`text-xs ${outstanding > 0 ? "text-orange-600" : "text-emerald-600"}`}>Outstanding</p>
                          <p className={`font-bold ${outstanding > 0 ? "text-orange-700" : "text-emerald-700"}`}>
                            {outstanding > 0 ? `₹${Number(outstanding).toLocaleString()}` : "Fully Paid ✓"}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500">Progress</p>
                          <p className="font-bold text-slate-900">{paidInstallments}/{tenure} EMIs</p>
                        </div>
                      </div>
                      {outstanding > 0 && tenure > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>Repayment progress</span>
                            <span>{Math.round((paidInstallments / tenure) * 100)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (paidInstallments / tenure) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}

            <button
              onClick={() => setActiveTab("apply_loan")}
              className="w-full py-3 border-2 border-dashed border-emerald-200 rounded-2xl text-emerald-600 font-semibold text-sm hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Apply for a New Loan
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* APPLY LOAN TAB                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "apply_loan" && (
          <ApplyLoanTab
            orgId={orgId}
            membershipId={membershipId}
            user={user}
            sortedApplications={sortedLoanApps}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* EMI SCHEDULE TAB                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "emi_schedule" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">EMI Schedule</CardTitle>
              <p className="text-xs text-slate-500">All installments across your loans.</p>
            </CardHeader>
            <CardContent className="p-0">
              {allInstallmentsSorted.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No installments yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {allInstallmentsSorted.map((inst) => {
                    const dueDate = toDate(inst.dueDate);
                    const isOverdue = inst.status !== "PAID" && isBefore(dueDate, today);
                    const isPaid = inst.status === "PAID";
                    return (
                      <div key={inst.id} className={`flex items-center justify-between px-4 py-3 ${isOverdue ? "bg-red-50" : isPaid ? "bg-emerald-50/30" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isPaid ? "bg-emerald-100" : isOverdue ? "bg-red-100" : "bg-slate-100"}`}>
                            {isPaid ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : isOverdue ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-slate-400" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">EMI #{inst.installmentNo}</p>
                            <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                              {isOverdue ? "Overdue · " : isPaid ? "Paid · " : "Due · "}
                              {dueDate.getTime() > 0 ? format(dueDate, "MMM d, yyyy") : "—"}
                            </p>
                            {isPaid && inst.receiptNo && <p className="text-[10px] text-slate-400 font-mono">{inst.receiptNo}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-sm ${isPaid ? "text-emerald-600" : isOverdue ? "text-red-600" : "text-slate-900"}`}>
                            ₹{Number(inst.emiAmount).toFixed(2)}
                          </p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isPaid ? "bg-emerald-100 text-emerald-700" : isOverdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                            {isPaid ? "PAID" : isOverdue ? "OVERDUE" : "DUE"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* RECEIPTS TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "receipts" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Payment Receipts</CardTitle>
              <p className="text-xs text-slate-500">All savings deposits and EMI payment receipts.</p>
            </CardHeader>
            <CardContent className="p-0">
              {sortedCollections.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No receipts yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {sortedCollections.map((col) => {
                    const d = toDate(col.collectedAt || col.timestamp);
                    const isSavings = col.collectionType !== "LOAN_EMI";
                    return (
                      <div key={col.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSavings ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                              {isSavings ? "SAVINGS" : "EMI"}
                            </span>
                            <span className="font-mono text-xs text-slate-400">{col.receiptNo || "—"}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {col.collectedByName || "Agent"} · {d.getTime() > 0 ? format(d, "MMM d, yyyy · h:mm a") : "—"}
                          </p>
                        </div>
                        <p className="font-bold text-emerald-600 text-sm">₹{Number(col.amount).toLocaleString()}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PROFILE TAB                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "profile" && (
          <ProfileTab
            user={user}
            membershipId={membershipId}
            membershipDoc={membershipDoc}
          />
        )}
      </div>
    </div>
  );
}

// ─── Apply Loan Tab ────────────────────────────────────────────────────────────
function ApplyLoanTab({ orgId, membershipId, user, sortedApplications }: {
  orgId: string;
  membershipId: string | null;
  user: any;
  sortedApplications: LoanApplication[];
}) {
  const [loanAmount, setLoanAmount] = useState("");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [loanAddress, setLoanAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(sortedApplications.length === 0);

  const hasPending = sortedApplications.some((a) => a.status === "PENDING");

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
        title: "New Loan Application",
        message: `${user?.fullName || "A customer"} has applied for a ₹${Number(loanAmount).toLocaleString()} loan (${tenureMonths} months).`,
        read: false,
        timestamp: serverTimestamp(),
      });

      toast.success("Loan application submitted! The owner will review it shortly.");
      setLoanAmount(""); setLoanPurpose(""); setTenureMonths("12");
      setMonthlyIncome(""); setEmploymentType(""); setLoanAddress(""); setNotes("");
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {sortedApplications.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> My Applications
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-3">
            <div className="divide-y divide-slate-50">
              {sortedApplications.map((app) => {
                const st = app.status;
                return (
                  <div key={app.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        ₹{Number(app.loanAmount).toLocaleString()} · {app.tenureMonths} months
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        st === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200"
                        : st === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-700 border-red-200"
                      }`}>{st}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {app.loanPurpose} · {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}
                    </p>
                    {st === "REJECTED" && app.rejectionReason && (
                      <p className="text-xs text-red-500 italic">Reason: {app.rejectionReason}</p>
                    )}
                    {st === "APPROVED" && (
                      <p className="text-xs text-emerald-600 font-medium">✓ Approved — check your Loans tab for the active loan.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {hasPending && !showForm ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
          <p className="text-sm font-semibold text-amber-800">You have a pending application.</p>
          <p className="text-xs text-amber-600 mt-1">Wait for the owner to review before submitting another.</p>
          <button onClick={() => setShowForm(true)} className="mt-2 text-xs text-amber-700 underline font-semibold">
            Submit another anyway
          </button>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" /> New Loan Application
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Fill in the details and we'll review your request.</p>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Loan Amount (₹) *</label>
                  <input
                    type="number" min="1000" step="100" required value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Loan Purpose *</label>
                  <select
                    required value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  >
                    <option value="">Select purpose…</option>
                    {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tenure (months) *</label>
                  <select
                    value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  >
                    {[3, 6, 12, 18, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} months</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Monthly Income (₹) *</label>
                  <input
                    type="number" min="0" required value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Employment Type *</label>
                  <select
                    required value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  >
                    <option value="">Select type…</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Address</label>
                  <input
                    type="text" value={loanAddress} onChange={(e) => setLoanAddress(e.target.value)}
                    placeholder="Your current address"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Additional Notes</label>
                  <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    rows={2} placeholder="Any additional information about your loan request…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 resize-none"
                  />
                </div>
              </div>
              {loanAmount && tenureMonths && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-xs text-emerald-700 font-semibold">Requested: ₹{Number(loanAmount).toLocaleString()} over {tenureMonths} months</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Final EMI and interest rate will be set by the organization on approval.</p>
                </div>
              )}
              <button
                type="submit" disabled={submitting}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? "Submitting…" : "Submit Application"}
              </button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ user, membershipId, membershipDoc }: {
  user: any;
  membershipId: string | null;
  membershipDoc: Membership | null;
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("");
  const [nomineePhone, setNomineePhone] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurr, setShowCurr] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);

  useEffect(() => {
    if (membershipDoc) {
      setPhone((membershipDoc as any).phone || "");
      setAddress((membershipDoc as any).address || "");
      const nd = (membershipDoc as any).nomineeDetails || {};
      setNomineeName(nd.name || "");
      setNomineeRelation(nd.relation || "");
      setNomineePhone(nd.phone || "");
      setAadhaarLast4((membershipDoc as any).aadhaarLast4 || "");
    }
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
  }, [membershipDoc, user?.firstName, user?.lastName]);

  const handleSaveProfile = async () => {
    if (!membershipId) return;
    setSaving(true);
    try {
      await user?.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await updateDoc(doc(db, "organizationMembers", membershipId), {
        phone: phone.trim(),
        address: address.trim(),
        nomineeDetails: { name: nomineeName.trim(), relation: nomineeRelation.trim(), phone: nomineePhone.trim() },
        aadhaarLast4: aadhaarLast4.replace(/\D/g, "").slice(-4),
        fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile updated successfully");
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await user?.setProfileImage({ file });
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || "Failed to update photo");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) return toast.error("Passwords don't match");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    setChangingPw(true);
    try {
      await user?.updatePassword({ currentPassword, newPassword });
      toast.success("Password updated successfully");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setShowPwForm(false);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || "Failed to update password");
    } finally {
      setChangingPw(false);
    }
  };

  const nominee = (membershipDoc as any)?.nomineeDetails || {};
  const memberPhone = (membershipDoc as any)?.phone || "";
  const memberAddress = (membershipDoc as any)?.address || "";
  const memberAadhaar = (membershipDoc as any)?.aadhaarLast4 || "";

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <Card>
        <CardContent className="p-5 space-y-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="Profile" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-slate-200" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-2xl font-black">
                  {initials(user?.fullName)}
                </div>
              )}
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
                title="Change photo"
              >
                <Camera className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-lg">{user?.fullName || "Customer"}</p>
              <p className="text-sm text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
              {memberPhone && <p className="text-sm text-slate-500">{memberPhone}</p>}
            </div>
            <button
              onClick={() => editMode ? handleSaveProfile() : setEditMode(true)}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${editMode ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : editMode ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : editMode ? "Save" : "Edit"}
            </button>
          </div>

          {editMode && (
            <button onClick={() => setEditMode(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel editing
            </button>
          )}

          {/* Fields */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <ProfileField
              label="First Name" value={firstName} editMode={editMode}
              onChange={setFirstName} placeholder="First name"
            />
            <ProfileField
              label="Last Name" value={lastName} editMode={editMode}
              onChange={setLastName} placeholder="Last name"
            />
            <ProfileField
              label="Phone Number" value={editMode ? phone : memberPhone} editMode={editMode}
              onChange={setPhone} placeholder="+91 98765 43210" icon={<Phone className="w-4 h-4 text-slate-400" />}
            />
            <ProfileField
              label="Address" value={editMode ? address : memberAddress} editMode={editMode}
              onChange={setAddress} placeholder="Your full address" icon={<MapPin className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Nominee details */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" /> Nominee Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <ProfileField label="Nominee Name" value={editMode ? nomineeName : (nominee.name || "")} editMode={editMode} onChange={setNomineeName} placeholder="Full name of nominee" />
          <ProfileField label="Relation" value={editMode ? nomineeRelation : (nominee.relation || "")} editMode={editMode} onChange={setNomineeRelation} placeholder="e.g. Spouse, Parent, Child" />
          <ProfileField label="Nominee Phone" value={editMode ? nomineePhone : (nominee.phone || "")} editMode={editMode} onChange={setNomineePhone} placeholder="+91 98765 43210" />
        </CardContent>
      </Card>

      {/* ID Details */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">Identity Document</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aadhaar (Last 4 digits)</p>
            {editMode ? (
              <input
                type="text" maxLength={4} value={aadhaarLast4}
                onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="XXXX"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 font-mono tracking-widest"
              />
            ) : (
              <p className="text-slate-900 font-mono text-sm">{memberAadhaar ? `XXXX XXXX XXXX ${memberAadhaar}` : "—"}</p>
            )}
          </div>
          {editMode && (
            <p className="text-[10px] text-slate-400">Only the last 4 digits are stored for security.</p>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Password</p>
              <p className="text-xs text-slate-500 mt-0.5">Update your account password</p>
            </div>
            <button
              onClick={() => setShowPwForm(!showPwForm)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
            >
              {showPwForm ? "Cancel" : "Change"}
            </button>
          </div>
          {showPwForm && (
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
              <PasswordInput
                label="Current Password" value={currentPassword}
                onChange={setCurrentPassword} show={showCurr} onToggle={() => setShowCurr(!showCurr)}
              />
              <PasswordInput
                label="New Password" value={newPassword}
                onChange={setNewPassword} show={showNew} onToggle={() => setShowNew(!showNew)}
              />
              <PasswordInput
                label="Confirm New Password" value={confirmPassword}
                onChange={setConfirmPassword} show={showNew} onToggle={() => setShowNew(!showNew)}
              />
              <button
                type="submit" disabled={changingPw}
                className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {changingPw ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {changingPw ? "Updating…" : "Update Password"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Logout */}
      <SignOutButton>
        <button className="w-full h-12 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </SignOutButton>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function ProfileField({ label, value, editMode, onChange, placeholder, icon }: {
  label: string; value: string; editMode: boolean;
  onChange: (v: string) => void; placeholder?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      {editMode ? (
        <div className="relative">
          {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
          <input
            type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className={`w-full h-10 ${icon ? "pl-9" : "pl-3"} pr-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400`}
          />
        </div>
      ) : (
        <p className="text-slate-900 text-sm">{value || <span className="text-slate-400">—</span>}</p>
      )}
    </div>
  );
}

function PasswordInput({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <div className="relative">
        <input
          type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          required minLength={8} placeholder="••••••••"
          className="w-full h-10 pl-3 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

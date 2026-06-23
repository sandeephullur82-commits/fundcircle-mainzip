import { useState, useMemo } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Collection, Loan, LoanInstallment, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, startOfMonth, subMonths, isBefore, startOfDay, differenceInDays } from "date-fns";
import { AlertTriangle, TrendingUp, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCollectionsReport } from "@/lib/exportExcel";
import { createAuditLog } from "@/lib/services";
import { toast } from "sonner";
import { useOrganization, useUser } from "@clerk/clerk-react";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function fmt(n: number) {
  return `₹${Number(Math.round(n)).toLocaleString("en-IN")}`;
}

const TABS = [
  { id: "overview",    label: "Overview"    },
  { id: "loan_report", label: "Loans"       },
  { id: "emi_aging",   label: "EMI Aging"   },
  { id: "outstanding", label: "Outstanding" },
  { id: "closed",      label: "Closed"      },
  { id: "collector",   label: "Collector"   },
] as const;
type TabId = typeof TABS[number]["id"];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   "bg-emerald-50 text-emerald-700",
  PENDING:  "bg-amber-50 text-amber-700",
  CLOSED:   "bg-slate-100 text-slate-600",
  REJECTED: "bg-red-50 text-red-700",
};

export default function OrgReports() {
  const { data: collections } = useCollectionRealtime<Collection>("collections");
  const { data: loans } = useCollectionRealtime<Loan>("loans");
  const { data: installments } = useCollectionRealtime<LoanInstallment>("loan_installments");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts");
  const { organization } = useOrganization();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [exporting, setExporting] = useState(false);

  const now = new Date();
  const today = startOfDay(now);

  const getCustName = (loan: Loan) => {
    const m = members.find(x => x.id === loan.customerId || (x as any).clerkUserId === loan.customerId);
    return (m as any)?.fullName || (m as any)?.name || loan.customerId?.slice(-8) || "—";
  };

  const activeLoans  = useMemo(() => loans.filter(l => (l.status || "").toUpperCase() === "ACTIVE"),  [loans]);
  const pendingLoans = useMemo(() => loans.filter(l => (l.status || "").toUpperCase() === "PENDING"), [loans]);
  const closedLoans  = useMemo(() => loans.filter(l => (l.status || "").toUpperCase() === "CLOSED"),  [loans]);

  const monthlyCollections = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(now, 11 - i));
    const monthEnd   = startOfMonth(subMonths(now, 10 - i));
    const cols = collections.filter(c => {
      const d = toDate(c.collectedAt || c.timestamp);
      return d >= monthStart && d < monthEnd;
    });
    return {
      month: format(monthStart, "MMM 'yy"),
      emi:   cols.filter(c => c.collectionType === "LOAN_EMI").reduce((s, c) => s + Number(c.amount), 0),
      other: cols.filter(c => c.collectionType !== "LOAN_EMI").reduce((s, c) => s + Number(c.amount), 0),
      total: cols.reduce((s, c) => s + Number(c.amount), 0),
    };
  }), [collections]);

  const emiAging = useMemo(() => {
    const overdueInsts = installments.filter(inst => inst.status !== "PAID" && isBefore(toDate(inst.dueDate), today));
    const buckets: Record<string, number> = { "1–30 days": 0, "31–60 days": 0, "61–90 days": 0, "90+ days": 0 };
    overdueInsts.forEach(inst => {
      const days = differenceInDays(today, toDate(inst.dueDate));
      if (days <= 30) buckets["1–30 days"] += inst.emiAmount;
      else if (days <= 60) buckets["31–60 days"] += inst.emiAmount;
      else if (days <= 90) buckets["61–90 days"] += inst.emiAmount;
      else buckets["90+ days"] += inst.emiAmount;
    });
    return Object.entries(buckets).map(([range, amount]) => ({
      range, amount,
      count: overdueInsts.filter(i => {
        const d = differenceInDays(today, toDate(i.dueDate));
        if (range === "1–30 days")  return d >= 1  && d <= 30;
        if (range === "31–60 days") return d >= 31 && d <= 60;
        if (range === "61–90 days") return d >= 61 && d <= 90;
        return d > 90;
      }).length,
    }));
  }, [installments, today]);

  const totalOverdue = emiAging.reduce((s, b) => s + b.amount, 0);

  const outstandingLoans = useMemo(() =>
    activeLoans
      .map(l => ({
        loan: l,
        name: getCustName(l),
        outstanding: l.outstandingBalance ?? (l as any).balanceRemaining ?? 0,
        principal: l.principalAmount ?? (l as any).principal ?? 0,
      }))
      .filter(x => x.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding),
    [activeLoans, members]
  );

  const totalOutstanding = outstandingLoans.reduce((s, x) => s + x.outstanding, 0);

  const closedLoanRows = useMemo(() =>
    closedLoans
      .map(l => ({
        loan: l,
        name: getCustName(l),
        principal: l.principalAmount ?? (l as any).principal ?? 0,
        emi: l.emiAmount ?? 0,
        tenure: l.tenureMonths ?? (l as any).durationMonths ?? 0,
        closedAt: toDate((l as any).closedAt),
      }))
      .sort((a, b) => b.closedAt.valueOf() - a.closedAt.valueOf()),
    [closedLoans, members]
  );

  const collectorStats = useMemo(() => {
    const map: Record<string, { name: string; active: number; closed: number; totalCollected: number; count: number }> = {};
    for (const l of loans) {
      const name = l.loanAssignedCollectorName || "Unassigned";
      if (!map[name]) map[name] = { name, active: 0, closed: 0, totalCollected: 0, count: 0 };
      const st = (l.status || "").toUpperCase();
      if (st === "ACTIVE") map[name].active++;
      if (st === "CLOSED") map[name].closed++;
      map[name].count++;
    }
    for (const c of collections) {
      if (c.collectionType !== "LOAN_EMI") continue;
      const name = (c as any).collectedByName || "Unknown";
      if (!map[name]) map[name] = { name, active: 0, closed: 0, totalCollected: 0, count: 0 };
      map[name].totalCollected += Number(c.amount) || 0;
    }
    return Object.values(map)
      .filter(x => x.count > 0 || x.totalCollected > 0)
      .sort((a, b) => b.totalCollected - a.totalCollected);
  }, [loans, collections]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await exportCollectionsReport({
        orgName: organization?.name || "FundCircle Organization",
        collections, members, loans, installments, savingsAccounts,
      });
      toast.success("Excel report downloaded successfully!");
      if (organization?.id && user?.id) {
        createAuditLog({
          organizationId: organization.id,
          actorId: user.id,
          actorRole: "OWNER",
          actorName: user.fullName || user.firstName || "",
          action: "EXCEL_EXPORTED",
          module: "REPORTS",
          category: "EXPORT",
          entityType: "Report",
          entityId: organization.id,
          description: `${user.fullName || "Owner"} downloaded Excel report`,
          metadata: { tab: activeTab, exportedAt: new Date().toISOString() },
        }).catch(() => {});
      }
    } catch {
      toast.error("Failed to export report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reports & Analytics</h2>
          <p className="text-slate-500 text-sm">Loan reports, EMI aging, outstanding, closed loans & collector performance.</p>
        </div>
        <Button
          onClick={handleExportExcel}
          disabled={exporting}
          variant="outline"
          className="gap-2 shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
        >
          {exporting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
            : <><Download className="w-4 h-4" /> Export Excel</>
          }
        </Button>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Collected (12m)", value: fmt(monthlyCollections.reduce((s, m) => s + m.total, 0)) },
              { label: "EMI Collected (12m)",   value: fmt(monthlyCollections.reduce((s, m) => s + m.emi, 0))   },
              { label: "Total Loans",           value: loans.length.toString() },
              { label: "Active Loans",          value: activeLoans.length.toString() },
            ].map(stat => (
              <Card key={stat.label} className="bg-slate-50 border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xl font-black text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" /> Monthly Collections — Last 12 Months
              </CardTitle>
              <CardDescription>EMI vs other collections over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyCollections} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [`₹${value.toLocaleString()}`, name === "emi" ? "EMI" : "Other"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Bar dataKey="other" name="Other" fill="#10b981" maxBarSize={30} />
                  <Bar dataKey="emi"   name="EMI"   fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Loan Report ── */}
      {activeTab === "loan_report" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Loans", value: loans.length,        color: "text-slate-900" },
              { label: "Active",      value: activeLoans.length,  color: "text-emerald-700" },
              { label: "Pending",     value: pendingLoans.length, color: "text-amber-700" },
              { label: "Closed",      value: closedLoans.length,  color: "text-slate-500" },
            ].map(s => (
              <Card key={s.label} className="bg-slate-50 border-slate-200">
                <CardContent className="p-4">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Loan #", "Customer", "Principal", "Rate", "Tenure", "EMI", "Status", "Created"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loans.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">No loans yet.</td></tr>
                    ) : (
                      [...loans]
                        .sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf())
                        .map(l => {
                          const st = (l.status || "PENDING").toUpperCase();
                          const principal = l.principalAmount ?? (l as any).principal ?? 0;
                          return (
                            <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-xs font-mono text-slate-500">
                                {l.loanAccountNumber || l.id.slice(-8).toUpperCase()}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-slate-900">{getCustName(l)}</td>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900">{fmt(principal)}</td>
                              <td className="px-4 py-3 text-sm text-slate-600">{l.interestRate ?? "—"}%</td>
                              <td className="px-4 py-3 text-sm text-slate-600">{l.tenureMonths ?? (l as any).durationMonths ?? "—"}m</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{l.emiAmount ? fmt(l.emiAmount) : "—"}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[st] || "bg-slate-100 text-slate-500"}`}>
                                  {st}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {toDate(l.createdAt).getTime() > 0 ? format(toDate(l.createdAt), "dd MMM yyyy") : "—"}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── EMI Aging ── */}
      {activeTab === "emi_aging" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-semibold text-red-800 text-sm">Total Overdue EMIs: {fmt(totalOverdue)}</p>
              <p className="text-xs text-red-600">Outstanding EMI installments past their due date.</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">EMI Aging Analysis</CardTitle>
              <CardDescription>Overdue EMI amounts bucketed by days past due</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={emiAging} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                  <Tooltip
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, "Overdue Amount"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Bar dataKey="amount" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Aging Bucket</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Installments</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Overdue Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emiAging.map(bucket => (
                    <tr key={bucket.range} className={bucket.range === "90+ days" ? "bg-red-50" : ""}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{bucket.range}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{bucket.count}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">₹{bucket.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td className="px-4 py-3 font-black text-slate-900">Total</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-900">{emiAging.reduce((s, b) => s + b.count, 0)}</td>
                    <td className="px-4 py-3 text-right font-black text-red-700">₹{totalOverdue.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Outstanding ── */}
      {activeTab === "outstanding" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-2xl">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <p className="font-semibold text-orange-800 text-sm">Total Outstanding: {fmt(totalOutstanding)}</p>
              <p className="text-xs text-orange-600">{outstandingLoans.length} active loan{outstandingLoans.length !== 1 ? "s" : ""} with pending balance.</p>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Customer", "Loan #", "Principal", "Outstanding", "Progress", "Rate"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outstandingLoans.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No outstanding loans.</td></tr>
                    ) : outstandingLoans.map(({ loan, name, outstanding, principal }) => {
                      const pct = principal > 0 ? Math.round(((principal - outstanding) / principal) * 100) : 0;
                      return (
                        <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-slate-900">{name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">
                            {loan.loanAccountNumber || loan.id.slice(-8).toUpperCase()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{fmt(principal)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-orange-600">{fmt(outstanding)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 shrink-0">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{loan.interestRate ?? "—"}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {outstandingLoans.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 font-black text-slate-900">Total</td>
                        <td className="px-4 py-3 font-black text-orange-700">{fmt(totalOutstanding)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Closed Loans ── */}
      {activeTab === "closed" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Closed Loans",       value: closedLoanRows.length.toString() },
              { label: "Total Principal",     value: fmt(closedLoanRows.reduce((s, x) => s + x.principal, 0)) },
              { label: "Total Repaid (est.)", value: fmt(closedLoanRows.reduce((s, x) => s + (x.emi * x.tenure), 0)) },
            ].map(s => (
              <Card key={s.label} className="bg-slate-50 border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xl font-black text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Loan #", "Customer", "Principal", "Total Repaid (est.)", "Closed Date"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closedLoanRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No closed loans yet.</td></tr>
                    ) : closedLoanRows.map(({ loan, name, principal, emi, tenure, closedAt }) => (
                      <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">
                          {loan.loanAccountNumber || loan.id.slice(-8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{fmt(principal)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">{fmt(Math.round(emi * tenure))}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {closedAt.getTime() > 0 ? format(closedAt, "dd MMM yyyy") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Collector ── */}
      {activeTab === "collector" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Collector Performance</CardTitle>
              <CardDescription>Loans managed and EMI collected per collector (all time)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Collector", "Total Loans", "Active", "Closed", "EMI Collected"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {collectorStats.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No collector data yet.</td></tr>
                    ) : collectorStats.map(c => (
                      <tr key={c.name} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{c.name}</td>
                        <td className="px-4 py-3 text-sm text-center text-slate-600">{c.count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{c.active}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{c.closed}</span>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">{fmt(c.totalCollected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

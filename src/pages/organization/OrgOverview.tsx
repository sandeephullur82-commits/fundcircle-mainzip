import React from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Collection, Loan, Membership, LoanInstallment, LoanApplication } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, CreditCard, TrendingUp, IndianRupee,
  UserCheck, AlertTriangle, Archive,
  Wallet, FileText, Activity, BarChart2,
} from "lucide-react";
import { format, startOfDay, startOfMonth, subMonths, isBefore } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

export default function OrgOverview() {
  const { data: collections, loading: collLoading } = useCollectionRealtime<Collection>("collections");
  const { data: members, loading: membersLoading } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loans, loading: loansLoading } = useCollectionRealtime<Loan>("loans");
  const { data: installments, loading: instLoading } = useCollectionRealtime<LoanInstallment>("loan_installments");
  const { data: loanApps, loading: appsLoading } = useCollectionRealtime<LoanApplication>("loanApplications");

  const isLoading = collLoading || membersLoading || loansLoading || instLoading || appsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 w-48 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-slate-200 rounded-2xl" />
          <div className="h-64 bg-slate-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  const customers = members.filter((u) => ["CUSTOMER", "customer"].includes(u.role as string));
  const agents = members.filter((u) => ["AGENT", "PIGMY_COLLECTOR", "agent"].includes(u.role as string));
  const activeAgents = agents.filter((a: any) => (a.status || "").toUpperCase() === "ACTIVE");
  const activeCustomers = customers.filter((c: any) => (c.status || "").toUpperCase() === "ACTIVE");

  const today = startOfDay(new Date());

  // Collections
  const todayCollections = collections.filter((c) => toDate(c.collectedAt || c.timestamp) >= today);
  const todayEMICollections = todayCollections.filter((c) => c.collectionType === "LOAN_EMI");
  const todayTotal = todayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const todayEMITotal = todayEMICollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // Loans
  const activeLoans = loans.filter((l) => l.status === "ACTIVE" || (l.status as string) === "active");
  const pendingLoans = loans.filter((l) => l.status === "PENDING" || (l.status as string) === "pending");
  const totalLoanPortfolio = loans.reduce((s, l) => s + (l.principalAmount ?? (l as any).principal ?? 0), 0);
  const totalLoanOutstanding = activeLoans.reduce((s, l) => s + (l.outstandingBalance ?? (l as any).balanceRemaining ?? 0), 0);

  // Pending applications
  const pendingApps = loanApps.filter((a) => a.status === "PENDING" || a.status === "DRAFT");

  // Overdue loans
  const overdueLoansCount = new Set(
    installments
      .filter((inst) => inst.status !== "PAID" && isBefore(toDate(inst.dueDate), today))
      .map((inst) => inst.loanId)
  ).size;

  const closedLoansCount = loans.filter((l) => (l.status || "").toUpperCase() === "CLOSED").length;

  const now = new Date();

  // Monthly collection data (last 12 months)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(now, 11 - i));
    const monthEnd = startOfMonth(subMonths(now, 10 - i));
    const general = collections
      .filter((c) => {
        const d = toDate(c.collectedAt || c.timestamp);
        return d >= monthStart && d < monthEnd && c.collectionType !== "LOAN_EMI";
      })
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const emi = collections
      .filter((c) => {
        const d = toDate(c.collectedAt || c.timestamp);
        return d >= monthStart && d < monthEnd && c.collectionType === "LOAN_EMI";
      })
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { month: format(monthStart, "MMM"), general, emi, total: general + emi };
  });

  // Loan portfolio trend (loans created per month)
  const loanPortfolioData = Array.from({ length: 6 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(now, 5 - i));
    const monthEnd = startOfMonth(subMonths(now, 4 - i));
    const count = loans.filter((l) => {
      const d = toDate(l.createdAt);
      return d >= monthStart && d < monthEnd;
    }).length;
    const amount = loans
      .filter((l) => {
        const d = toDate(l.createdAt);
        return d >= monthStart && d < monthEnd;
      })
      .reduce((s, l) => s + (l.principalAmount ?? 0), 0);
    return { month: format(monthStart, "MMM"), loans: count, amount };
  });

  const recentCollections = [...collections]
    .sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf())
    .slice(0, 8);

  // Recent activities (loans + collections mixed)
  const recentActivities = [
    ...recentCollections.map((c) => ({
      id: c.id,
      type: c.collectionType === "LOAN_EMI" ? "emi" : "savings",
      amount: c.amount,
      name: "",
      customerId: c.customerId,
      time: toDate(c.collectedAt || c.timestamp),
      receiptNo: c.receiptNo,
    })),
  ].sort((a, b) => b.time.valueOf() - a.time.valueOf()).slice(0, 8);

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Dashboard Overview</h2>
        <p className="text-slate-500 text-sm">Real-time operational intelligence for your organization.</p>
      </div>

      {/* 12 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Total Customers" value={activeCustomers.length.toString()}
          icon={<Users className="w-5 h-5 text-violet-600" />}
          trend={`${customers.length} total registered`} bg="bg-violet-50" />
        <MetricCard title="Total Agents" value={activeAgents.length.toString()}
          icon={<UserCheck className="w-5 h-5 text-sky-600" />}
          trend={`${agents.length} total collectors`} bg="bg-sky-50" />
        <MetricCard title="Loan Portfolio" value={`₹${totalLoanPortfolio.toLocaleString()}`}
          icon={<BarChart2 className="w-5 h-5 text-blue-600" />}
          trend={`${activeLoans.length} active loans`} bg="bg-blue-50" />
        <MetricCard title="Outstanding Loans" value={`₹${totalLoanOutstanding.toLocaleString()}`}
          icon={<CreditCard className="w-5 h-5 text-orange-600" />}
          trend="Total remaining balance" bg="bg-orange-50" />
        <MetricCard title="Today's Collections" value={`₹${todayTotal.toLocaleString()}`}
          icon={<IndianRupee className="w-5 h-5 text-blue-600" />}
          trend={`${todayCollections.length} transactions`} bg="bg-blue-50" />
        <MetricCard title="Today's EMI" value={`₹${todayEMITotal.toLocaleString()}`}
          icon={<Activity className="w-5 h-5 text-indigo-600" />}
          trend={`${todayEMICollections.length} EMI collected`} bg="bg-indigo-50" />
        <MetricCard title="Pending Applications" value={(pendingApps.length + pendingLoans.length).toString()}
          icon={<FileText className="w-5 h-5 text-teal-600" />}
          trend="Loans awaiting approval" bg="bg-teal-50" />
        <MetricCard title="Overdue Loans" value={overdueLoansCount.toString()}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          trend="Loans with missed EMIs" bg="bg-red-50" />
        <MetricCard title="Closed Loans" value={closedLoansCount.toString()}
          icon={<Archive className="w-5 h-5 text-slate-600" />}
          trend="Fully repaid loans" bg="bg-slate-50" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              Collection Performance — Last 12 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} width={48} />
                <Tooltip formatter={(value: number, name: string) => [`₹${value.toLocaleString()}`, name === "general" ? "Collection" : "EMI"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend formatter={(v) => v === "general" ? "Collection" : "EMI"} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="general" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={36} />
                <Bar dataKey="emi" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Loan Portfolio Trend */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              Loan Disbursements — Last 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={loanPortfolioData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} width={48} />
                <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, "Disbursed"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="amount" stroke="#6366f1" fill="#e0e7ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader><CardTitle className="text-base">Recent Activity Feed</CardTitle></CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No activity yet.</div>
            ) : (
              <div className="space-y-2">
                {recentActivities.map((act) => {
                  const customer = members.find((m) => m.id === act.customerId || m.clerkUserId === act.customerId);
                  const name = (customer as any)?.fullName || (customer as any)?.name || act.customerId?.slice(-6) || "Customer";
                  const isEMI = act.type === "emi";
                  return (
                    <div key={act.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isEMI ? "bg-indigo-100" : "bg-emerald-100"}`}>
                          {isEMI ? <CreditCard className="w-4 h-4 text-indigo-600" /> : <Wallet className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">{name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isEMI ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {isEMI ? "EMI" : "COLLECTION"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {act.time.getTime() > 0 ? format(act.time, "MMM d, h:mm a") : "—"}
                            </span>
                            {act.receiptNo && <span className="text-xs text-slate-300 font-mono hidden sm:inline">{act.receiptNo}</span>}
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm shrink-0 ml-2">+₹{Number(act.amount).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, trend, bg }: {
  title: string; value: string; icon: React.ReactNode; trend: string; bg: string;
}) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-500 leading-tight pr-1">{title}</h3>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
        </div>
        <p className="text-xl md:text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-[10px] text-slate-400 mt-1 leading-tight">{trend}</p>
      </CardContent>
    </Card>
  );
}

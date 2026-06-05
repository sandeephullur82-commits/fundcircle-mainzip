import React, { useMemo } from "react";
import {
  PiggyBank, CreditCard, CalendarDays, TrendingUp,
  FileText, CheckCircle, AlertTriangle, Clock, ArrowUpRight,
  Wallet, BarChart3, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, isBefore, startOfDay, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type {
  SavingsAccount, SavingsTransaction, Loan, LoanInstallment, Collection, Notification,
} from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface Props {
  savingsAccount: SavingsAccount | null;
  savingsTxs: SavingsTransaction[];
  loans: Loan[];
  installments: LoanInstallment[];
  collections: Collection[];
  notifications: Notification[];
  onNavigate: (tab: string) => void;
}

export default function DashboardTab({
  savingsAccount, savingsTxs, loans, installments, collections, notifications, onNavigate,
}: Props) {
  const today = startOfDay(new Date());

  const totalSavings = savingsAccount?.totalBalance ?? 0;
  const totalDeposits = savingsTxs.reduce((s, t) => s + t.amount, 0);
  const totalReceipts = collections.length;

  const activeLoans = loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE");
  const totalOutstanding = activeLoans.reduce(
    (s, l) => s + (l.outstandingBalance ?? (l as any).balanceRemaining ?? 0), 0
  );

  const allInstallmentsSorted = [...installments].sort((a, b) => a.installmentNo - b.installmentNo);
  const pendingInstallments = allInstallmentsSorted.filter((i) => i.status !== "PAID");
  const overdueInstallments = pendingInstallments.filter((i) => isBefore(toDate(i.dueDate), today));
  const nextDue = pendingInstallments[0] ?? null;

  const accountStatus = savingsAccount?.status ?? (savingsTxs.length > 0 ? "ACTIVE" : "NEW");

  const unreadNotifications = notifications.filter((n) => !n.read);

  const monthlySavings = useMemo(() => {
    const months: { month: string; amount: number; balance: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const amount = savingsTxs
        .filter((t) => {
          const ts = toDate(t.collectedAt).getTime();
          return ts >= start && ts <= end;
        })
        .reduce((s, t) => s + t.amount, 0);
      const lastTxInMonth = [...savingsTxs]
        .filter((t) => toDate(t.collectedAt).getTime() <= end)
        .sort((a, b) => toDate(b.collectedAt).getTime() - toDate(a.collectedAt).getTime())[0];
      months.push({
        month: format(d, "MMM"),
        amount,
        balance: lastTxInMonth?.balanceAfter ?? 0,
      });
    }
    return months;
  }, [savingsTxs]);

  const recentTxs = [...savingsTxs]
    .sort((a, b) => toDate(b.collectedAt).getTime() - toDate(a.collectedAt).getTime())
    .slice(0, 4);

  const recentReceipts = [...collections]
    .sort((a, b) => toDate(b.collectedAt ?? b.timestamp).getTime() - toDate(a.collectedAt ?? a.timestamp).getTime())
    .slice(0, 3);

  const summaryCards = [
    {
      label: "Total Savings",
      value: `₹${totalSavings.toLocaleString()}`,
      sub: `${savingsTxs.length} deposits`,
      icon: PiggyBank,
      color: "bg-emerald-500",
      textColor: "text-white",
      onClick: () => onNavigate("savings"),
    },
    {
      label: "Loan Outstanding",
      value: `₹${totalOutstanding.toLocaleString()}`,
      sub: `${activeLoans.length} active loan${activeLoans.length !== 1 ? "s" : ""}`,
      icon: CreditCard,
      color: "bg-orange-500",
      textColor: "text-white",
      onClick: () => onNavigate("loans"),
    },
    {
      label: "Next EMI",
      value: nextDue ? `₹${Number(nextDue.emiAmount).toLocaleString()}` : "None due",
      sub: nextDue
        ? (overdueInstallments.length > 0
            ? `${overdueInstallments.length} overdue!`
            : toDate(nextDue.dueDate).getTime() > 0
              ? format(toDate(nextDue.dueDate), "MMM d")
              : "—")
        : "All clear",
      icon: overdueInstallments.length > 0 ? AlertTriangle : CalendarDays,
      color: overdueInstallments.length > 0 ? "bg-red-500" : nextDue ? "bg-amber-500" : "bg-slate-400",
      textColor: "text-white",
      onClick: () => onNavigate("emi_schedule"),
    },
    {
      label: "Total Deposits",
      value: `₹${totalDeposits.toLocaleString()}`,
      sub: "All time",
      icon: TrendingUp,
      color: "bg-blue-500",
      textColor: "text-white",
      onClick: () => onNavigate("passbook"),
    },
    {
      label: "Total Receipts",
      value: totalReceipts.toString(),
      sub: "Transactions",
      icon: FileText,
      color: "bg-purple-500",
      textColor: "text-white",
      onClick: () => onNavigate("receipts"),
    },
    {
      label: "Account Status",
      value: accountStatus,
      sub: savingsAccount ? `Plan: ${savingsAccount.planType}` : "No account",
      icon: accountStatus === "ACTIVE" ? CheckCircle : Activity,
      color: accountStatus === "ACTIVE" ? "bg-teal-500" : "bg-slate-400",
      textColor: "text-white",
      onClick: () => onNavigate("savings"),
    },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200">{label}</p>
          <p className="text-emerald-600 font-semibold">₹{payload[0]?.value?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {summaryCards.map((card) => (
          <button
            key={card.label}
            onClick={card.onClick}
            className={`${card.color} rounded-2xl p-4 text-left transition-transform active:scale-95 hover:opacity-90 group`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/80 text-xs font-medium leading-tight">{card.label}</p>
              <card.icon className="w-4 h-4 text-white/70 shrink-0" />
            </div>
            <p className="text-white text-xl font-black leading-tight truncate">{card.value}</p>
            <p className="text-white/70 text-[11px] mt-1 truncate">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* Overdue alert */}
      {overdueInstallments.length > 0 && (
        <button
          onClick={() => onNavigate("emi_schedule")}
          className="w-full flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-left"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800 dark:text-red-300 text-sm">
              {overdueInstallments.length} EMI{overdueInstallments.length > 1 ? "s" : ""} overdue
            </p>
            <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
              Tap to view your EMI schedule and avoid penalties
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-red-400 shrink-0 ml-auto mt-0.5" />
        </button>
      )}

      {/* Savings Growth Chart */}
      {savingsTxs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                Savings Growth
              </CardTitle>
              <span className="text-xs text-slate-400">Last 6 months</span>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-4 pr-4">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={monthlySavings} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5}
                  fill="url(#savingsGrad)" dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Loan repayment chart */}
      {activeLoans.length > 0 && (() => {
        const loan = activeLoans[0];
        const principal = loan.principalAmount ?? (loan as any).principal ?? 0;
        const outstanding = loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0;
        const paid = Math.max(0, principal - outstanding);
        const pct = principal > 0 ? Math.round((paid / principal) * 100) : 0;
        const tenure = loan.tenureMonths ?? (loan as any).durationMonths ?? 0;
        const paidInstalls = installments.filter((i) => i.loanId === loan.id && i.status === "PAID").length;
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-orange-500" />
                Loan Repayment Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Paid: ₹{paid.toLocaleString()}</span>
                    <span className="font-semibold text-slate-700">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-orange-400 to-emerald-500 h-3 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>{paidInstalls}/{tenure} EMIs paid</span>
                    <span>Remaining: ₹{outstanding.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-slate-500">Principal</p>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">₹{Number(principal).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-slate-500">EMI/mo</p>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">₹{Number(loan.emiAmount ?? 0).toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/40 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-orange-500">Outstanding</p>
                  <p className="font-bold text-orange-700 dark:text-orange-400 text-sm">₹{Number(outstanding).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Monthly deposit bar chart */}
      {monthlySavings.some((m) => m.amount > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Monthly Deposits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-4 pr-4">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlySavings} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      {recentTxs.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent Deposits</CardTitle>
              <button onClick={() => onNavigate("passbook")} className="text-xs text-emerald-600 font-semibold">
                View all
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {recentTxs.map((tx) => {
                const d = toDate(tx.collectedAt);
                return (
                  <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                        <PiggyBank className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Savings Deposit</p>
                        <p className="text-xs text-slate-400">
                          {tx.collectedByName || "Agent"} · {d.getTime() > 0 ? format(d, "MMM d") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600 text-sm">+₹{tx.amount.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">₹{tx.balanceAfter.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Receipts */}
      {recentReceipts.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent Receipts</CardTitle>
              <button onClick={() => onNavigate("receipts")} className="text-xs text-emerald-600 font-semibold">
                View all
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {recentReceipts.map((col) => {
                const d = toDate(col.collectedAt ?? col.timestamp);
                const isSavings = col.collectionType !== "LOAN_EMI";
                return (
                  <div key={col.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSavings ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-indigo-50 dark:bg-indigo-950/40"}`}>
                        <FileText className={`w-4 h-4 ${isSavings ? "text-emerald-600" : "text-indigo-600"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {isSavings ? "Savings" : "EMI Payment"}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{col.receiptNo || "—"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600 text-sm">₹{Number(col.amount).toLocaleString()}</p>
                      <p className="text-xs text-slate-400">{d.getTime() > 0 ? format(d, "MMM d") : "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications preview */}
      {unreadNotifications.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                {unreadNotifications.length} New Notification{unreadNotifications.length > 1 ? "s" : ""}
              </CardTitle>
              <button onClick={() => onNavigate("notifications")} className="text-xs text-emerald-600 font-semibold">
                View all
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {unreadNotifications.slice(0, 2).map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{n.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {savingsTxs.length === 0 && loans.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="w-12 h-12 mx-auto mb-3 text-emerald-200" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">Welcome to FundCircle!</p>
            <p className="text-sm text-slate-400 mt-1">Your savings and loan activity will appear here.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

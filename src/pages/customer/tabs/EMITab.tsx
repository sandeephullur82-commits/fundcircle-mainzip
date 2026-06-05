import React, { useMemo, useState } from "react";
import {
  CalendarDays, CheckCircle, Clock, AlertTriangle, CreditCard,
  BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, isBefore, startOfDay, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { LoanInstallment, Loan } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface Props {
  installments: LoanInstallment[];
  loans: Loan[];
}

type FilterType = "ALL" | "UPCOMING" | "PAID" | "OVERDUE";

export default function EMITab({ installments, loans }: Props) {
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const today = startOfDay(new Date());

  const sorted = useMemo(() =>
    [...installments].sort((a, b) => a.installmentNo - b.installmentNo),
    [installments]
  );

  const paid = sorted.filter((i) => i.status === "PAID");
  const pending = sorted.filter((i) => i.status !== "PAID");
  const overdue = pending.filter((i) => isBefore(toDate(i.dueDate), today));
  const upcoming = pending.filter((i) => !isBefore(toDate(i.dueDate), today));
  const nextDue = upcoming[0] ?? null;

  const filtered = useMemo(() => {
    if (filter === "PAID") return paid;
    if (filter === "OVERDUE") return overdue;
    if (filter === "UPCOMING") return upcoming;
    return sorted;
  }, [filter, sorted, paid, overdue, upcoming]);

  const totalPaid = paid.reduce((s, i) => s + Number(i.paidAmount || i.emiAmount), 0);
  const totalDue = pending.reduce((s, i) => s + Number(i.emiAmount), 0);

  // Monthly EMI data
  const monthlyEMI = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const paidAmount = paid
        .filter((inst) => {
          const ts = toDate(inst.paidAt).getTime();
          return ts >= start && ts <= end;
        })
        .reduce((s, inst) => s + Number(inst.paidAmount || inst.emiAmount), 0);
      months.push({ month: format(d, "MMM"), paid: paidAmount });
    }
    return months;
  }, [paid]);

  const loanMap = useMemo(() => {
    const m: Record<string, Loan> = {};
    loans.forEach((l) => { m[l.id] = l; });
    return m;
  }, [loans]);

  const groupedByLoan = useMemo(() => {
    const groups: Record<string, LoanInstallment[]> = {};
    filtered.forEach((inst) => {
      if (!groups[inst.loanId]) groups[inst.loanId] = [];
      groups[inst.loanId].push(inst);
    });
    return groups;
  }, [filtered]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200">{label}</p>
          <p className="text-indigo-600 font-semibold">₹{payload[0]?.value?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button onClick={() => setFilter("UPCOMING")} className={`rounded-xl p-3 text-left transition-all border ${filter === "UPCOMING" ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40" : "border-transparent bg-blue-50 dark:bg-blue-950/20"}`}>
          <p className="text-[10px] text-blue-600 font-medium">Upcoming</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-400">{upcoming.length}</p>
          <p className="text-[10px] text-blue-500">₹{totalDue.toLocaleString()}</p>
        </button>
        <button onClick={() => setFilter("OVERDUE")} className={`rounded-xl p-3 text-left transition-all border ${filter === "OVERDUE" ? "border-red-300 bg-red-50 dark:bg-red-950/40" : "border-transparent bg-red-50 dark:bg-red-950/20"}`}>
          <p className="text-[10px] text-red-600 font-medium">Overdue</p>
          <p className="text-xl font-black text-red-700 dark:text-red-400">{overdue.length}</p>
          <p className="text-[10px] text-red-500">EMIs missed</p>
        </button>
        <button onClick={() => setFilter("PAID")} className={`rounded-xl p-3 text-left transition-all border ${filter === "PAID" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40" : "border-transparent bg-emerald-50 dark:bg-emerald-950/20"}`}>
          <p className="text-[10px] text-emerald-600 font-medium">Paid</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{paid.length}</p>
          <p className="text-[10px] text-emerald-500">₹{totalPaid.toLocaleString()}</p>
        </button>
        <button onClick={() => setFilter("ALL")} className={`rounded-xl p-3 text-left transition-all border ${filter === "ALL" ? "border-slate-300 bg-slate-100 dark:bg-slate-800" : "border-transparent bg-slate-50 dark:bg-slate-800/50"}`}>
          <p className="text-[10px] text-slate-500 font-medium">Total</p>
          <p className="text-xl font-black text-slate-700 dark:text-slate-300">{sorted.length}</p>
          <p className="text-[10px] text-slate-400">All EMIs</p>
        </button>
      </div>

      {/* Next EMI alert */}
      {nextDue && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
          overdue.length > 0
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        }`}>
          {overdue.length > 0
            ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            : <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
          <div>
            <p className={`font-bold text-sm ${overdue.length > 0 ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
              {overdue.length > 0
                ? `${overdue.length} EMI${overdue.length > 1 ? "s" : ""} overdue — please pay immediately`
                : "Next EMI due"}
            </p>
            <p className={`text-xs mt-0.5 ${overdue.length > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
              EMI #{nextDue.installmentNo} · ₹{Number(nextDue.emiAmount).toLocaleString()} ·{" "}
              {toDate(nextDue.dueDate).getTime() > 0 ? format(toDate(nextDue.dueDate), "MMM d, yyyy") : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Payment progress bar */}
      {sorted.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overall EMI Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>{paid.length} of {sorted.length} paid</span>
              <span className="font-semibold">{Math.round((paid.length / sorted.length) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-3 rounded-full transition-all"
                style={{ width: `${(paid.length / sorted.length) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1.5">
              <span>Paid: ₹{totalPaid.toLocaleString()}</span>
              <span>Remaining: ₹{totalDue.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly EMI chart */}
      {paid.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Monthly EMI Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-4 pr-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={monthlyEMI} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="paid" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* EMI List */}
      {installments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No installments yet</p>
            <p className="text-sm text-slate-400 mt-1">Your EMI schedule will appear here once a loan is active.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByLoan).map(([loanId, insts]) => {
          const loan = loanMap[loanId];
          const isExpanded = expandedLoan === loanId || Object.keys(groupedByLoan).length === 1;
          return (
            <Card key={loanId}>
              <CardHeader className="pb-0">
                <button
                  onClick={() => setExpandedLoan(isExpanded ? null : loanId)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-500" />
                    <div className="text-left">
                      <CardTitle className="text-sm">
                        {loan ? `₹${Number(loan.principalAmount ?? (loan as any).principal ?? 0).toLocaleString()} Loan` : "Loan"}
                      </CardTitle>
                      <p className="text-xs text-slate-400 font-mono">{loanId.slice(-12)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{insts.length} EMIs</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
              </CardHeader>
              {isExpanded && (
                <CardContent className="p-0 mt-3">
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {insts.map((inst) => {
                      const dueDate = toDate(inst.dueDate);
                      const isPaid = inst.status === "PAID";
                      const isOv = !isPaid && isBefore(dueDate, today);
                      return (
                        <div
                          key={inst.id}
                          className={`flex items-center justify-between px-4 py-3 transition-colors ${
                            isOv ? "bg-red-50/50 dark:bg-red-950/20"
                            : isPaid ? "bg-emerald-50/30 dark:bg-emerald-950/10"
                            : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                              isPaid ? "bg-emerald-100 dark:bg-emerald-900/40"
                              : isOv ? "bg-red-100 dark:bg-red-900/40"
                              : "bg-slate-100 dark:bg-slate-800"
                            }`}>
                              {isPaid
                                ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                                : isOv
                                  ? <AlertTriangle className="w-4 h-4 text-red-600" />
                                  : <Clock className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">EMI #{inst.installmentNo}</p>
                              <p className={`text-xs mt-0.5 ${isOv ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                                {isOv ? "Overdue · " : isPaid ? "Paid · " : "Due · "}
                                {dueDate.getTime() > 0 ? format(dueDate, "MMM d, yyyy") : "—"}
                              </p>
                              {isPaid && inst.receiptNo && (
                                <p className="text-[10px] text-slate-400 font-mono">{inst.receiptNo}</p>
                              )}
                              {isPaid && inst.collectedByAgentName && (
                                <p className="text-[10px] text-slate-400">{inst.collectedByAgentName}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${isPaid ? "text-emerald-600" : isOv ? "text-red-600" : "text-slate-900 dark:text-white"}`}>
                              ₹{Number(inst.emiAmount).toLocaleString()}
                            </p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              isPaid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              : isOv ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}>
                              {isPaid ? "PAID" : isOv ? "OVERDUE" : "DUE"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

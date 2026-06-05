import React, { useState } from "react";
import {
  CreditCard, Plus, CheckCircle, Clock, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, TrendingDown, Calendar, Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, isBefore, startOfDay } from "date-fns";
import type { Loan, LoanInstallment, LoanApplication } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface Props {
  loans: Loan[];
  installments: LoanInstallment[];
  loanApplications: LoanApplication[];
  onApplyLoan: () => void;
}

export default function LoansTab({ loans, installments, loanApplications, onApplyLoan }: Props) {
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "CLOSED">("ALL");
  const today = startOfDay(new Date());

  const sortedApps = [...loanApplications].sort(
    (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
  );

  const filteredLoans = loans.filter((l) => {
    if (activeFilter === "ALL") return true;
    return (l.status || "").toUpperCase() === activeFilter;
  });

  const activeLoans = loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE");
  const closedLoans = loans.filter((l) => (l.status || "").toUpperCase() === "CLOSED");
  const totalOutstanding = activeLoans.reduce(
    (s, l) => s + (l.outstandingBalance ?? (l as any).balanceRemaining ?? 0), 0
  );

  const statusIcon = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s === "ACTIVE") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (s === "CLOSED") return <CheckCircle className="w-4 h-4 text-slate-400" />;
    if (s === "PENDING") return <Clock className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const statusBadge = (status: string) => {
    const s = (status || "").toUpperCase();
    const styles: Record<string, string> = {
      ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200",
      CLOSED: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border-slate-200",
      PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200",
      REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200",
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[s] ?? styles.PENDING}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {loans.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
            <p className="text-[10px] text-emerald-600 font-medium">Active</p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{activeLoans.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 font-medium">Closed</p>
            <p className="text-xl font-black text-slate-700 dark:text-slate-300">{closedLoans.length}</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-3 text-center">
            <p className="text-[10px] text-orange-600 font-medium">Outstanding</p>
            <p className="text-lg font-black text-orange-700 dark:text-orange-400 leading-tight">
              ₹{totalOutstanding >= 1000 ? `${(totalOutstanding / 1000).toFixed(1)}k` : totalOutstanding.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Loan Applications */}
      {sortedApps.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">My Applications</CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {sortedApps.map((app) => {
                const appStatusStyles: Record<string, string> = {
                  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
                  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
                  REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400",
                  DISBURSED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
                  DRAFT: "bg-slate-100 text-slate-500 border-slate-200",
                };
                return (
                  <div key={app.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        ₹{Number(app.loanAmount).toLocaleString()} · {app.tenureMonths}m
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${appStatusStyles[app.status] ?? appStatusStyles.PENDING}`}>
                        {app.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {app.loanPurpose} · {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}
                    </p>
                    {app.status === "REJECTED" && app.rejectionReason && (
                      <p className="text-xs text-red-500 mt-1 italic">Reason: {app.rejectionReason}</p>
                    )}
                    {app.status === "APPROVED" && (
                      <p className="text-xs text-emerald-600 mt-1 font-medium">✓ Approved — check Loans for active loan.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      {loans.length > 0 && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(["ALL", "ACTIVE", "CLOSED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeFilter === f
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Loan cards */}
      {filteredLoans.length === 0 && loanApplications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No loans on your account</p>
            <p className="text-sm text-slate-400 mt-1">Apply for a loan to get started</p>
            <button
              onClick={onApplyLoan}
              className="mt-4 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              Apply for a Loan
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLoans.map((loan) => {
            const st = (loan.status || "").toUpperCase();
            const principal = loan.principalAmount ?? (loan as any).principal ?? 0;
            const outstanding = loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0;
            const tenure = loan.tenureMonths ?? (loan as any).durationMonths ?? 0;
            const loanInstalls = installments.filter((i) => i.loanId === loan.id);
            const paidInstalls = loanInstalls.filter((i) => i.status === "PAID").length;
            const pct = tenure > 0 ? Math.round((paidInstalls / tenure) * 100) : 0;
            const nextInstall = loanInstalls
              .filter((i) => i.status !== "PAID")
              .sort((a, b) => a.installmentNo - b.installmentNo)[0];
            const isExpanded = expandedLoan === loan.id;
            const overdueCount = loanInstalls.filter(
              (i) => i.status !== "PAID" && isBefore(toDate(i.dueDate), today)
            ).length;

            return (
              <Card key={loan.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        st === "ACTIVE" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-slate-100 dark:bg-slate-800"
                      }`}>
                        {statusIcon(st)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">Loan Account</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{loan.id.slice(-12)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(st)}
                      <button
                        onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>
                    </div>
                  </div>

                  {overdueCount > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                        {overdueCount} EMI{overdueCount > 1 ? "s" : ""} overdue
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500">Principal</p>
                      <p className="font-bold text-slate-900 dark:text-white">₹{Number(principal).toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500">EMI / Month</p>
                      <p className="font-bold text-slate-900 dark:text-white">₹{Number(loan.emiAmount ?? 0).toLocaleString()}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${outstanding > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}`}>
                      <p className={`text-[10px] ${outstanding > 0 ? "text-orange-600" : "text-emerald-600"}`}>Outstanding</p>
                      <p className={`font-bold ${outstanding > 0 ? "text-orange-700 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {outstanding > 0 ? `₹${Number(outstanding).toLocaleString()}` : "Fully Paid ✓"}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500">Progress</p>
                      <p className="font-bold text-slate-900 dark:text-white">{paidInstalls}/{tenure} EMIs</p>
                    </div>
                  </div>

                  {tenure > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Repayment</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-orange-400 to-emerald-500 h-2 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {nextInstall && st === "ACTIVE" && (
                    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2">
                      <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        Next EMI #{nextInstall.installmentNo}: <span className="font-bold">
                          ₹{Number(nextInstall.emiAmount).toLocaleString()}
                        </span> · {toDate(nextInstall.dueDate).getTime() > 0
                          ? format(toDate(nextInstall.dueDate), "MMM d, yyyy")
                          : "—"}
                      </p>
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                      {loan.interestRate > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Percent className="w-3.5 h-3.5" /> Interest Rate
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">{loan.interestRate}% p.a.</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Tenure</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{tenure} months</span>
                      </div>
                      {loan.disbursedAt && toDate(loan.disbursedAt).getTime() > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Disbursed On</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {format(toDate(loan.disbursedAt), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Amount Repaid</span>
                        <span className="font-semibold text-emerald-600">
                          ₹{Math.max(0, Number(principal) - Number(outstanding)).toLocaleString()}
                        </span>
                      </div>
                      {/* Installment mini list */}
                      {loanInstalls.length > 0 && (
                        <div className="mt-2 bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 pt-2.5 pb-1.5">
                            Recent Installments
                          </p>
                          <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            {[...loanInstalls]
                              .sort((a, b) => a.installmentNo - b.installmentNo)
                              .slice(-5)
                              .map((inst) => {
                                const isPaid = inst.status === "PAID";
                                const isOv = !isPaid && isBefore(toDate(inst.dueDate), today);
                                return (
                                  <div key={inst.id} className="flex items-center justify-between px-3 py-2">
                                    <span className="text-xs text-slate-600 dark:text-slate-300">
                                      EMI #{inst.installmentNo}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                      isPaid ? "bg-emerald-100 text-emerald-700"
                                      : isOv ? "bg-red-100 text-red-700"
                                      : "bg-slate-100 text-slate-600"
                                    }`}>
                                      {isPaid ? "PAID" : isOv ? "OVERDUE" : "DUE"}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                      ₹{Number(inst.emiAmount).toLocaleString()}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Apply CTA */}
      <button
        onClick={onApplyLoan}
        className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-600 dark:text-emerald-400 font-semibold text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Apply for a New Loan
      </button>
    </div>
  );
}

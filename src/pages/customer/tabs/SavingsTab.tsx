import React, { useMemo, useState } from "react";
import {
  PiggyBank, Download, TrendingUp, Calendar, Search, Filter,
  BarChart3, ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { SavingsAccount, SavingsTransaction } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface Props {
  savingsAccount: SavingsAccount | null;
  savingsTxs: SavingsTransaction[];
  orgName: string;
}

type SubTab = "history" | "analytics" | "statement";

export default function SavingsTab({ savingsAccount, savingsTxs, orgName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("history");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const totalBalance = savingsAccount?.totalBalance ?? 0;
  const totalDeposits = savingsTxs.reduce((s, t) => s + t.amount, 0);

  const sortedTxs = useMemo(() => {
    return [...savingsTxs].sort(
      (a, b) => toDate(b.collectedAt).getTime() - toDate(a.collectedAt).getTime()
    );
  }, [savingsTxs]);

  const lastCollection = sortedTxs[0];

  const filteredTxs = useMemo(() => {
    return sortedTxs.filter((tx) => {
      const d = toDate(tx.collectedAt);
      const matchSearch =
        !search ||
        (tx.receiptNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (tx.collectedByName || "").toLowerCase().includes(search.toLowerCase());
      const matchFrom = !dateFrom || d >= new Date(dateFrom);
      const matchTo = !dateTo || d <= new Date(dateTo + "T23:59:59");
      return matchSearch && matchFrom && matchTo;
    });
  }, [sortedTxs, search, dateFrom, dateTo]);

  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const amount = savingsTxs
        .filter((t) => {
          const ts = toDate(t.collectedAt).getTime();
          return ts >= start && ts <= end;
        })
        .reduce((s, t) => s + t.amount, 0);
      const count = savingsTxs.filter((t) => {
        const ts = toDate(t.collectedAt).getTime();
        return ts >= start && ts <= end;
      }).length;
      months.push({ month: format(d, "MMM"), amount, count });
    }
    return months;
  }, [savingsTxs]);

  const balanceHistory = useMemo(() => {
    return [...sortedTxs]
      .reverse()
      .slice(-30)
      .map((tx, i) => ({
        day: i + 1,
        balance: tx.balanceAfter,
        date: format(toDate(tx.collectedAt), "MMM d"),
      }));
  }, [sortedTxs]);

  const downloadCSV = () => {
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
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200">{label || payload[0]?.payload?.date}</p>
          <p className="text-emerald-600 font-semibold">₹{payload[0]?.value?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Account Summary Card */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Savings Balance</p>
            <p className="text-4xl font-black mt-1">₹{totalBalance.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <PiggyBank className="w-7 h-7 text-white" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-xl p-2.5">
            <p className="text-emerald-100 text-[10px] font-medium">Plan Type</p>
            <p className="text-white font-bold text-sm mt-0.5">{savingsAccount?.planType ?? "—"}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-2.5">
            <p className="text-emerald-100 text-[10px] font-medium">Deposits</p>
            <p className="text-white font-bold text-sm mt-0.5">{savingsTxs.length}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-2.5">
            <p className="text-emerald-100 text-[10px] font-medium">Status</p>
            <p className="text-white font-bold text-sm mt-0.5">{savingsAccount?.status ?? "—"}</p>
          </div>
        </div>
        {savingsAccount?.scheduledAmount && savingsAccount.scheduledAmount > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-emerald-100" />
            <p className="text-emerald-100 text-xs">
              Scheduled: <span className="font-bold text-white">
                ₹{savingsAccount.scheduledAmount.toLocaleString()} / {(savingsAccount.planType || "DAILY").toLowerCase()}
              </span>
            </p>
          </div>
        )}
        {lastCollection && (
          <div className="mt-2 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <TrendingUp className="w-4 h-4 text-emerald-100" />
            <p className="text-emerald-100 text-xs">
              Last collection: <span className="font-bold text-white">
                {toDate(lastCollection.collectedAt).getTime() > 0
                  ? format(toDate(lastCollection.collectedAt), "MMM d, yyyy")
                  : "—"}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Deposited</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">₹{totalDeposits.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Account Since</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {savingsAccount?.startDate && toDate(savingsAccount.startDate).getTime() > 0
                ? format(toDate(savingsAccount.startDate), "MMM yyyy")
                : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Member since</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        {(["history", "analytics", "statement"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
              subTab === t
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "history" ? "Deposits" : t === "analytics" ? "Analytics" : "Statement"}
          </button>
        ))}
      </div>

      {/* History sub-tab */}
      {subTab === "history" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by receipt or agent…"
                className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
            <input
              type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
            {(search || dateFrom || dateTo) && (
              <button
                onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
                className="px-3 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredTxs.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <PiggyBank className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No deposits found.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredTxs.map((tx) => {
                      const d = toDate(tx.collectedAt);
                      return (
                        <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">Deposit</p>
                              <p className="text-xs text-slate-400">
                                {tx.collectedByName || "Agent"} · {d.getTime() > 0 ? format(d, "MMM d, yyyy · h:mm a") : "—"}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">{tx.receiptNo}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-600">+₹{tx.amount.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">Bal: ₹{tx.balanceAfter.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 flex justify-between items-center">
                    <p className="text-xs text-slate-500">{filteredTxs.length} records</p>
                    <p className="text-sm font-black text-emerald-700">
                      Total: ₹{filteredTxs.reduce((s, t) => s + t.amount, 0).toLocaleString()}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analytics sub-tab */}
      {subTab === "analytics" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                Monthly Savings (12 months)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-4 pr-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {balanceHistory.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Balance Growth (Last 30 Deposits)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-4 pr-4">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={balanceHistory} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2}
                      fill="url(#balGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Avg Deposit</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                  ₹{savingsTxs.length > 0 ? Math.round(totalDeposits / savingsTxs.length).toLocaleString() : "0"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Per transaction</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">This Month</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                  ₹{monthlyData[monthlyData.length - 1]?.amount.toLocaleString() ?? "0"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{monthlyData[monthlyData.length - 1]?.count ?? 0} deposits</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Statement sub-tab */}
      {subTab === "statement" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Download Statement</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Export your complete savings history</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Account</span>
                <span className="font-semibold text-slate-900 dark:text-white">{orgName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-900 dark:text-white">{savingsAccount?.planType ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total Deposits</span>
                <span className="font-semibold text-slate-900 dark:text-white">{savingsTxs.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total Amount</span>
                <span className="font-bold text-emerald-600">₹{totalDeposits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Current Balance</span>
                <span className="font-bold text-emerald-700">₹{totalBalance.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={downloadCSV}
              disabled={savingsTxs.length === 0}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download CSV Statement
            </button>
            <p className="text-xs text-slate-400 text-center">
              Opens as a spreadsheet file in Excel or Google Sheets
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-bold text-slate-700 dark:text-slate-200">{label || payload[0]?.payload?.date}</p>
        <p className="text-emerald-600 font-semibold">₹{payload[0]?.value?.toLocaleString()}</p>
      </div>
    );
  }
  return null;
}

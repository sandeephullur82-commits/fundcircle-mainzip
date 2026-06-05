import React, { useMemo, useState } from "react";
import { FileText, Search, Download, Printer, PiggyBank, CreditCard, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import ReceiptModal, { type ReceiptData } from "@/components/ReceiptModal";
import type { Collection, SavingsTransaction, Loan } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface Props {
  collections: Collection[];
  savingsTxs: SavingsTransaction[];
  loans: Loan[];
  orgName: string;
  customerName: string;
}

type TypeFilter = "ALL" | "SAVINGS" | "LOAN_EMI";

export default function ReceiptsTab({
  collections, savingsTxs, loans, orgName, customerName,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewReceipt, setViewReceipt] = useState<ReceiptData | null>(null);

  const sortedCollections = useMemo(() => {
    return [...collections].sort(
      (a, b) => toDate(b.collectedAt ?? b.timestamp).getTime() - toDate(a.collectedAt ?? a.timestamp).getTime()
    );
  }, [collections]);

  const filtered = useMemo(() => {
    return sortedCollections.filter((col) => {
      const d = toDate(col.collectedAt ?? col.timestamp);
      const matchType = typeFilter === "ALL" || col.collectionType === typeFilter;
      const matchSearch =
        !search ||
        (col.receiptNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (col.collectedByName || "").toLowerCase().includes(search.toLowerCase());
      const matchFrom = !dateFrom || d >= new Date(dateFrom);
      const matchTo = !dateTo || d <= new Date(dateTo + "T23:59:59");
      return matchType && matchSearch && matchFrom && matchTo;
    });
  }, [sortedCollections, typeFilter, search, dateFrom, dateTo]);

  const totalSavingsReceipts = collections.filter((c) => c.collectionType !== "LOAN_EMI").length;
  const totalEMIReceipts = collections.filter((c) => c.collectionType === "LOAN_EMI").length;

  const handleViewReceipt = (col: Collection) => {
    const isSavings = col.collectionType !== "LOAN_EMI";
    const date = toDate(col.collectedAt ?? col.timestamp);
    if (date.getTime() === 0) return;

    const tx = isSavings ? savingsTxs.find((t) => t.id === col.referenceId) : null;
    const loan = !isSavings ? loans.find((l) => l.id === col.referenceId) : null;

    setViewReceipt({
      receiptNo: col.receiptNo || "—",
      organizationName: orgName,
      customerName,
      amount: col.amount,
      newBalance: isSavings && tx ? tx.balanceAfter : undefined,
      collectionType: isSavings ? "SAVINGS" : "LOAN_EMI",
      agentName: col.collectedByName || "Agent",
      collectedAt: date,
      loanId: !isSavings ? col.referenceId : undefined,
      loanOutstanding: loan ? (loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0) : undefined,
    });
  };

  const downloadCSV = () => {
    const rows = [
      ["Date", "Time", "Type", "Receipt No", "Amount (₹)", "Collector"],
      ...filtered.map((col) => {
        const d = toDate(col.collectedAt ?? col.timestamp);
        return [
          d.getTime() > 0 ? format(d, "yyyy-MM-dd") : "—",
          d.getTime() > 0 ? format(d, "HH:mm") : "—",
          col.collectionType === "LOAN_EMI" ? "EMI Payment" : "Savings Deposit",
          col.receiptNo || "",
          col.amount.toString(),
          col.collectedByName || "Agent",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${orgName.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setTypeFilter("ALL")} className={`rounded-xl p-3 text-left border transition-all ${typeFilter === "ALL" ? "border-slate-300 bg-slate-100 dark:bg-slate-800" : "border-transparent bg-slate-50 dark:bg-slate-800/50"}`}>
          <p className="text-[10px] text-slate-500 font-medium">Total</p>
          <p className="text-xl font-black text-slate-700 dark:text-slate-300">{collections.length}</p>
          <p className="text-[10px] text-slate-400">All receipts</p>
        </button>
        <button onClick={() => setTypeFilter("SAVINGS")} className={`rounded-xl p-3 text-left border transition-all ${typeFilter === "SAVINGS" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40" : "border-transparent bg-emerald-50 dark:bg-emerald-950/20"}`}>
          <p className="text-[10px] text-emerald-600 font-medium">Savings</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{totalSavingsReceipts}</p>
          <p className="text-[10px] text-emerald-500">Deposits</p>
        </button>
        <button onClick={() => setTypeFilter("LOAN_EMI")} className={`rounded-xl p-3 text-left border transition-all ${typeFilter === "LOAN_EMI" ? "border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40" : "border-transparent bg-indigo-50 dark:bg-indigo-950/20"}`}>
          <p className="text-[10px] text-indigo-600 font-medium">EMI</p>
          <p className="text-xl font-black text-indigo-700 dark:text-indigo-400">{totalEMIReceipts}</p>
          <p className="text-[10px] text-indigo-500">Payments</p>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt, collector…"
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>
          <button
            onClick={downloadCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none" />
          {(search || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
              className="px-3 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-semibold">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Receipt list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No receipts found.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((col) => {
                const d = toDate(col.collectedAt ?? col.timestamp);
                const isSavings = col.collectionType !== "LOAN_EMI";
                return (
                  <div key={col.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSavings
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : "bg-indigo-50 dark:bg-indigo-950/30"
                      }`}>
                        {isSavings
                          ? <PiggyBank className="w-4.5 h-4.5 text-emerald-600" />
                          : <CreditCard className="w-4.5 h-4.5 text-indigo-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSavings
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400"
                          }`}>
                            {isSavings ? "SAVINGS" : "EMI"}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">
                            {col.receiptNo || "—"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {col.collectedByName || "Agent"} · {d.getTime() > 0 ? format(d, "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          ₹{Number(col.amount).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {d.getTime() > 0 ? format(d, "h:mm a") : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleViewReceipt(col)}
                        className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="View Receipt"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {filtered.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 flex justify-between">
              <p className="text-xs text-slate-500">{filtered.length} receipts</p>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                ₹{filtered.reduce((s, c) => s + Number(c.amount), 0).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Modal */}
      {viewReceipt && (
        <ReceiptModal receipt={viewReceipt} onClose={() => setViewReceipt(null)} />
      )}
    </div>
  );
}

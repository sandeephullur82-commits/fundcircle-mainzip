import React, { useMemo, useState } from "react";
import { BookOpen, Download, Search, ArrowUpRight, CreditCard, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import type { SavingsTransaction, Collection, Loan } from "@/types";

const PAGE_SIZE = 50;

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface PassbookRow {
  id: string;
  date: Date;
  type: "SAVINGS" | "LOAN_EMI";
  amount: number;
  collector: string;
  receiptNo: string;
  balanceAfter?: number;
}

interface Props {
  savingsTxs: SavingsTransaction[];
  collections: Collection[];
  loans: Loan[];
  orgName: string;
}

export default function PassbookTab({ savingsTxs, collections, loans, orgName }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SAVINGS" | "LOAN_EMI">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const rows: PassbookRow[] = useMemo(() => {
    const txRows: PassbookRow[] = savingsTxs.map((tx) => ({
      id: tx.id,
      date: toDate(tx.collectedAt),
      type: "SAVINGS",
      amount: tx.amount,
      collector: tx.collectedByName || "Agent",
      receiptNo: tx.receiptNo || "—",
      balanceAfter: tx.balanceAfter,
    }));

    const emiRows: PassbookRow[] = collections
      .filter((c) => c.collectionType === "LOAN_EMI")
      .map((c) => ({
        id: c.id,
        date: toDate(c.collectedAt ?? c.timestamp),
        type: "LOAN_EMI",
        amount: c.amount,
        collector: c.collectedByName || "Agent",
        receiptNo: c.receiptNo || "—",
      }));

    return [...txRows, ...emiRows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [savingsTxs, collections]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchType = typeFilter === "ALL" || r.type === typeFilter;
      const matchSearch =
        !search ||
        r.receiptNo.toLowerCase().includes(search.toLowerCase()) ||
        r.collector.toLowerCase().includes(search.toLowerCase());
      const matchFrom = !dateFrom || r.date >= new Date(dateFrom);
      const matchTo = !dateTo || r.date <= new Date(dateTo + "T23:59:59");
      return matchType && matchSearch && matchFrom && matchTo;
    });
  }, [rows, typeFilter, search, dateFrom, dateTo]);

  const totalFiltered = filtered.reduce((s, r) => s + r.amount, 0);
  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filtered.length;

  const handleFilterChange = (fn: () => void) => { fn(); setPage(1); };

  const downloadCSV = () => {
    const headers = ["Date", "Time", "Type", "Amount (₹)", "Balance After (₹)", "Collector", "Receipt No"];
    const csvRows = filtered.map((r) => [
      r.date.getTime() > 0 ? format(r.date, "yyyy-MM-dd") : "—",
      r.date.getTime() > 0 ? format(r.date, "HH:mm") : "—",
      r.type === "SAVINGS" ? "Savings Deposit" : "EMI Payment",
      r.amount.toString(),
      r.balanceAfter?.toString() ?? "—",
      r.collector,
      r.receiptNo,
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `passbook-${orgName.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `
      <!DOCTYPE html><html><head><title>Passbook — ${orgName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 13px; color: #666; margin-bottom: 16px; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
        .amount { text-align: right; font-weight: bold; color: #059669; }
        .emi { color: #6366f1; }
        .balance { text-align: right; }
        tfoot td { font-weight: bold; border-top: 2px solid #e5e7eb; }
        .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; text-align: center; }
      </style></head><body>
      <h1>FundCircle Digital Passbook</h1>
      <h2>${orgName} · Generated ${format(new Date(), "dd MMM yyyy, hh:mm a")}</h2>
      <table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>Receipt No</th><th>Collector</th>
          <th style="text-align:right">Amount</th><th style="text-align:right">Balance</th>
        </tr></thead>
        <tbody>
          ${filtered.map((r) => `<tr>
            <td>${r.date.getTime() > 0 ? format(r.date, "dd MMM yyyy") : "—"}</td>
            <td class="${r.type === "LOAN_EMI" ? "emi" : ""}">${r.type === "SAVINGS" ? "Savings" : "EMI"}</td>
            <td style="font-family:monospace;font-size:10px">${r.receiptNo}</td>
            <td>${r.collector}</td>
            <td class="amount">₹${r.amount.toLocaleString()}</td>
            <td class="balance">${r.balanceAfter !== undefined ? "₹" + r.balanceAfter.toLocaleString() : "—"}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="4">Total (${filtered.length} records)</td>
          <td class="amount">₹${totalFiltered.toLocaleString()}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <div class="footer">This is a digitally generated passbook. Powered by FundCircle.</div>
      </body></html>`;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            Digital Passbook
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Complete transaction history</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={downloadPrint}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => handleFilterChange(() => setSearch(e.target.value))}
            placeholder="Search receipt, collector…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex-1">
            {(["ALL", "SAVINGS", "LOAN_EMI"] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleFilterChange(() => setTypeFilter(t))}
                className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  typeFilter === t
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {t === "LOAN_EMI" ? "EMI" : t === "ALL" ? "All" : "Savings"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={(e) => handleFilterChange(() => setDateFrom(e.target.value))}
            className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
          <input type="date" value={dateTo} onChange={(e) => handleFilterChange(() => setDateTo(e.target.value))}
            className="flex-1 h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
          {(search || dateFrom || dateTo || typeFilter !== "ALL") && (
            <button
              onClick={() => handleFilterChange(() => { setSearch(""); setDateFrom(""); setDateTo(""); setTypeFilter("ALL"); })}
              className="px-3 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-semibold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No transactions found.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Receipt</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Collector</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {paginated.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                          {r.date.getTime() > 0 ? format(r.date, "dd MMM yyyy") : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            r.type === "SAVINGS"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400"
                          }`}>
                            {r.type === "SAVINGS" ? "SAV" : "EMI"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">{r.receiptNo}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{r.collector}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 text-sm">
                          +₹{r.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-white text-sm">
                          {r.balanceAfter !== undefined ? `₹${r.balanceAfter.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/50 dark:bg-emerald-950/20 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-500">
                        Showing {paginated.length} of {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right font-black text-emerald-700 dark:text-emerald-400">
                        ₹{totalFiltered.toLocaleString()}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    Load {Math.min(PAGE_SIZE, filtered.length - paginated.length)} more
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

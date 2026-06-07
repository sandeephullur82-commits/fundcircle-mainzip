import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { Collection, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { Search, Download, Receipt, PiggyBank, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { where } from "firebase/firestore";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

type Period = "ALL" | "TODAY" | "WEEK" | "MONTH";
type TypeFilter = "ALL" | "SAVINGS" | "LOAN_EMI";

export default function AgentHistory() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const agentId = user?.id || "";

  const { data: myCollections, loading } = useCollectionRealtime<Collection>(
    "collections",
    agentId ? [where("agentId", "==", agentId)] : []
  );
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");

  const [period, setPeriod] = useState<Period>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");

  const now = new Date();
  const filtered = myCollections.filter((col) => {
    const d = toDate(col.collectedAt || col.timestamp);

    // Period filter
    if (period === "TODAY" && d < startOfDay(now)) return false;
    if (period === "WEEK" && d < startOfWeek(now, { weekStartsOn: 1 })) return false;
    if (period === "MONTH" && d < startOfMonth(now)) return false;

    // Type filter
    if (typeFilter === "SAVINGS" && col.collectionType === "LOAN_EMI") return false;
    if (typeFilter === "LOAN_EMI" && col.collectionType !== "LOAN_EMI") return false;

    // Search
    if (search) {
      const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
      const custName = (cust as any)?.fullName || (cust as any)?.name || "";
      const receiptNo = col.receiptNo || "";
      if (!custName.toLowerCase().includes(search.toLowerCase()) && !receiptNo.includes(search)) return false;
    }

    return true;
  }).sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf());

  const totalAmount = filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const savingsTotal = filtered.filter((c) => c.collectionType !== "LOAN_EMI").reduce((s, c) => s + Number(c.amount), 0);
  const emiTotal = filtered.filter((c) => c.collectionType === "LOAN_EMI").reduce((s, c) => s + Number(c.amount), 0);

  const exportCSV = () => {
    const header = "Receipt No,Customer,Type,Amount,Date\n";
    const rows = filtered.map((col) => {
      const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
      const d = toDate(col.collectedAt || col.timestamp);
      return [
        col.receiptNo || "",
        (cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-6),
        col.collectionType || "SAVINGS",
        col.amount,
        d.getTime() > 0 ? format(d, "yyyy-MM-dd HH:mm") : "",
      ].join(",");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "my_collections.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Collection History</h2>
          <p className="text-slate-500 text-sm">All your savings and EMI collections.</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2 shrink-0">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-slate-900">₹{totalAmount.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Total ({filtered.length})</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-emerald-700">₹{savingsTotal.toLocaleString()}</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Savings</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-indigo-700">₹{emiTotal.toLocaleString()}</p>
          <p className="text-[10px] text-indigo-600 mt-0.5">EMI</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or receipt number…"
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["ALL", "TODAY", "WEEK", "MONTH"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${period === p ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {p === "ALL" ? "All Time" : p === "TODAY" ? "Today" : p === "WEEK" ? "This Week" : "This Month"}
            </button>
          ))}
          <div className="w-px bg-slate-200 self-stretch mx-1" />
          {(["ALL", "SAVINGS", "LOAN_EMI"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${typeFilter === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {t === "ALL" ? "All Types" : t === "SAVINGS" ? "Savings" : "EMI"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No collections found.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map((col) => {
                const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
                const name = (cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-8) || "Customer";
                const d = toDate(col.collectedAt || col.timestamp);
                const isSavings = col.collectionType !== "LOAN_EMI";
                return (
                  <div key={col.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isSavings ? "bg-emerald-100" : "bg-indigo-100"}`}>
                        {isSavings ? <PiggyBank className="w-4 h-4 text-emerald-600" /> : <CreditCard className="w-4 h-4 text-indigo-600" />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold ${isSavings ? "text-emerald-600" : "text-indigo-600"}`}>
                            {isSavings ? "SAVINGS" : "EMI"}
                          </span>
                          <span className="text-xs text-slate-400">{d.getTime() > 0 ? format(d, "MMM d, h:mm a") : "—"}</span>
                          {col.receiptNo && <span className="text-xs text-slate-300 font-mono hidden sm:block">{col.receiptNo}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600 text-sm">₹{Number(col.amount).toLocaleString()}</p>
                      {col.receiptNo && <p className="font-mono text-[10px] text-slate-300 sm:hidden">{col.receiptNo}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useUser } from "@clerk/clerk-react";
import { Collection, Membership } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { format, startOfDay, startOfYesterday, endOfYesterday, isToday, isYesterday } from "date-fns";
import { Receipt, PiggyBank, CreditCard, Layers, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { where } from "firebase/firestore";
import { toDate } from "@/components/agent/CollectDialog";

type TypeFilter = "ALL" | "SAVINGS" | "EMI" | "COMBINED";

function CollectionEntry({ col, getCustName }: { col: Collection; getCustName: (col: Collection) => string; key?: React.Key }) {
  const colType = getCollectionType(col);
  const d       = toDate(col.collectedAt || (col as any).timestamp);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
          colType === "EMI"      ? "bg-indigo-100"
          : colType === "COMBINED" ? "bg-violet-100"
          : "bg-emerald-100"
        }`}>
          {colType === "EMI"      && <CreditCard className="w-4 h-4 text-indigo-600" />}
          {colType === "COMBINED" && <Layers     className="w-4 h-4 text-violet-600" />}
          {colType === "SAVINGS"  && <PiggyBank  className="w-4 h-4 text-emerald-600" />}
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm">{getCustName(col)}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold ${
              colType === "EMI"      ? "text-indigo-600"
              : colType === "COMBINED" ? "text-violet-600"
              : "text-emerald-600"
            }`}>
              {colType === "EMI" ? "EMI" : colType === "COMBINED" ? "S+L" : "SAVINGS"}
            </span>
            <span className="text-xs text-slate-400">
              {d.getTime() > 0 ? format(d, "h:mm a") : "—"}
            </span>
            {col.receiptNo && (
              <span className="text-xs text-slate-300 font-mono hidden sm:block">{col.receiptNo}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-emerald-600 text-sm">+₹{Number(col.amount).toLocaleString()}</p>
        {col.receiptNo && (
          <p className="font-mono text-[10px] text-slate-300 sm:hidden">{col.receiptNo}</p>
        )}
      </div>
    </div>
  );
}

const TYPE_FILTER_TABS: { id: TypeFilter; label: string }[] = [
  { id: "ALL",      label: "All"      },
  { id: "SAVINGS",  label: "Savings"  },
  { id: "EMI",      label: "EMI"      },
  { id: "COMBINED", label: "Combined" },
];

const PAGE_SIZE = 30;

function getCollectionType(col: Collection): TypeFilter {
  const t = col.collectionType || "SAVINGS";
  if (t === "LOAN_EMI") return "EMI";
  if (t === "BOTH")     return "COMBINED";
  return "SAVINGS";
}

export default function AgentHistory() {
  const { user } = useUser();
  const agentId  = user?.id || "";

  const { data: myCollections, loading } = useCollectionRealtime<Collection>(
    "collections",
    agentId ? [where("agentId", "==", agentId)] : []
  );
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [page,       setPage]       = useState(1);

  const getCustName = (col: Collection) => {
    const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
    return (cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-6) || "Customer";
  };

  const filtered = myCollections
    .filter((col) => {
      if (typeFilter === "ALL") return true;
      return getCollectionType(col) === typeFilter;
    })
    .sort((a, b) => toDate(b.collectedAt || (b as any).timestamp).valueOf() - toDate(a.collectedAt || (a as any).timestamp).valueOf());

  const totalAmount    = filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const savingsTotal   = filtered.filter((c) => getCollectionType(c) === "SAVINGS").reduce((s, c) => s + Number(c.amount || 0), 0);
  const emiTotal       = filtered.filter((c) => getCollectionType(c) === "EMI").reduce((s, c) => s + Number(c.amount || 0), 0);
  const combinedTotal  = filtered.filter((c) => getCollectionType(c) === "COMBINED").reduce((s, c) => s + Number(c.amount || 0), 0);

  const todayItems     = filtered.filter((c) => isToday(toDate(c.collectedAt || (c as any).timestamp)));
  const yesterdayItems = filtered.filter((c) => isYesterday(toDate(c.collectedAt || (c as any).timestamp)));
  const olderItems     = filtered.filter((c) => {
    const d = toDate(c.collectedAt || (c as any).timestamp);
    return d.getTime() > 0 && !isToday(d) && !isYesterday(d);
  });

  const paginated = olderItems.slice(0, page * PAGE_SIZE);
  const hasMore   = page * PAGE_SIZE < olderItems.length;

  const exportCSV = () => {
    const header = "Receipt No,Customer,Type,Amount,Date\n";
    const rows = filtered.map((col) => {
      const d = toDate(col.collectedAt || (col as any).timestamp);
      return [
        col.receiptNo || "",
        getCustName(col),
        col.collectionType || "SAVINGS",
        col.amount,
        d.getTime() > 0 ? format(d, "yyyy-MM-dd HH:mm") : "",
      ].join(",");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "my_collections.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Collection History</h2>
          <p className="text-slate-500 text-sm">{filtered.length} records · ₹{totalAmount.toLocaleString()} total</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2 shrink-0">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-base font-black text-slate-900">₹{totalAmount.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Total</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-base font-black text-emerald-700">₹{savingsTotal.toLocaleString()}</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Savings</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-base font-black text-indigo-700">₹{emiTotal.toLocaleString()}</p>
          <p className="text-[10px] text-indigo-600 mt-0.5">EMI</p>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {TYPE_FILTER_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { setTypeFilter(id); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors ${
              typeFilter === id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date-wise groups */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No collections found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Today */}
          {todayItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Today</p>
                <p className="text-xs text-emerald-600 font-semibold">
                  ₹{todayItems.reduce((s, c) => s + Number(c.amount || 0), 0).toLocaleString()} · {todayItems.length} txn{todayItems.length > 1 ? "s" : ""}
                </p>
              </div>
              <Card>
                <CardContent className="p-0 divide-y divide-slate-50">
                  {todayItems.map((col) => <CollectionEntry key={col.id} col={col} getCustName={getCustName} />)}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Yesterday */}
          {yesterdayItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Yesterday</p>
                <p className="text-xs text-slate-500 font-semibold">
                  ₹{yesterdayItems.reduce((s, c) => s + Number(c.amount || 0), 0).toLocaleString()} · {yesterdayItems.length} txn{yesterdayItems.length > 1 ? "s" : ""}
                </p>
              </div>
              <Card>
                <CardContent className="p-0 divide-y divide-slate-50">
                  {yesterdayItems.map((col) => <CollectionEntry key={col.id} col={col} getCustName={getCustName} />)}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Older */}
          {olderItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Older</p>
                <p className="text-xs text-slate-400 font-semibold">
                  {olderItems.length} record{olderItems.length > 1 ? "s" : ""}
                </p>
              </div>
              <Card>
                <CardContent className="p-0 divide-y divide-slate-50">
                  {paginated.map((col) => <CollectionEntry key={col.id} col={col} getCustName={getCustName} />)}
                </CardContent>
              </Card>
              {hasMore && (
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                  Load {Math.min(PAGE_SIZE, olderItems.length - paginated.length)} more
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

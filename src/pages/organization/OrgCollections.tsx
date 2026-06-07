import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Collection, Membership } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { format, startOfDay, subDays, isAfter } from "date-fns";
import { Search, Download, IndianRupee, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

type CollectionTypeFilter = "ALL" | "SAVINGS" | "LOAN_EMI";
type DateRangeFilter = "ALL" | "TODAY" | "WEEK" | "MONTH";

export default function OrgCollections() {
  const { data: collections, loading } = useCollectionRealtime<Collection>("collections");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CollectionTypeFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>("ALL");
  const [agentFilter, setAgentFilter] = useState("");
  const [page, setPage] = useState(1);

  const handleFilterChange = (fn: () => void) => { fn(); setPage(1); };

  const agents = members.filter((m) => ["AGENT", "PIGMY_COLLECTOR", "agent"].includes(m.role as string));

  const filtered = collections.filter((col) => {
    // type filter
    if (typeFilter !== "ALL") {
      if (typeFilter === "SAVINGS" && col.collectionType !== "SAVINGS") return false;
      if (typeFilter === "LOAN_EMI" && col.collectionType !== "LOAN_EMI") return false;
    }

    // date filter
    const d = toDate(col.collectedAt || col.timestamp);
    const today = startOfDay(new Date());
    if (dateFilter === "TODAY" && !isAfter(d, today)) return false;
    if (dateFilter === "WEEK" && !isAfter(d, subDays(today, 7))) return false;
    if (dateFilter === "MONTH" && !isAfter(d, subDays(today, 30))) return false;

    // agent filter
    if (agentFilter && col.agentId !== agentFilter) return false;

    // search
    if (search) {
      const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
      const custName = (cust as any)?.fullName || (cust as any)?.name || "";
      const receiptNo = col.receiptNo || "";
      if (!custName.toLowerCase().includes(search.toLowerCase()) && !receiptNo.includes(search)) return false;
    }

    return true;
  }).sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf());

  const totalAmount = filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const savingsTotal = filtered.filter((c) => c.collectionType !== "LOAN_EMI").reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const emiTotal = filtered.filter((c) => c.collectionType === "LOAN_EMI").reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filtered.length;

  const exportCSV = () => {
    const header = "Receipt No,Customer,Type,Agent,Amount,Date\n";
    const rows = filtered.map((col) => {
      const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
      const agent = members.find((m) => m.id === col.agentId || m.clerkUserId === col.agentId);
      const d = toDate(col.collectedAt || col.timestamp);
      return [
        col.receiptNo || "",
        (cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-6),
        col.collectionType || "SAVINGS",
        (agent as any)?.fullName || (agent as any)?.name || col.collectedByName || "",
        col.amount,
        d.getTime() > 0 ? format(d, "yyyy-MM-dd HH:mm") : "",
      ].join(",");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "collections.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Collections Ledger</h2>
          <p className="text-slate-500 text-sm">All savings deposits and EMI payments — searchable, filterable.</p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2 shrink-0">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-slate-900">₹{totalAmount.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Total ({filtered.length} transaction{filtered.length !== 1 ? "s" : ""})</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-emerald-700">₹{savingsTotal.toLocaleString()}</p>
            <p className="text-xs text-emerald-600">Savings Collections</p>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-indigo-700">₹{emiTotal.toLocaleString()}</p>
            <p className="text-xs text-indigo-600">EMI Collections</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => handleFilterChange(() => setSearch(e.target.value))} placeholder="Search customer or receipt…" className="pl-9 h-9" />
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {(["ALL", "SAVINGS", "LOAN_EMI"] as CollectionTypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => handleFilterChange(() => setTypeFilter(t))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${typeFilter === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {t === "ALL" ? "All Types" : t === "SAVINGS" ? "Savings" : "EMI"}
            </button>
          ))}
        </div>

        {/* Date range filter */}
        <div className="flex gap-1">
          {(["ALL", "TODAY", "WEEK", "MONTH"] as DateRangeFilter[]).map((d) => (
            <button
              key={d}
              onClick={() => handleFilterChange(() => setDateFilter(d))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${dateFilter === d ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {d === "ALL" ? "All Time" : d === "TODAY" ? "Today" : d === "WEEK" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>

        {/* Agent filter */}
        {agents.length > 0 && (
          <select
            className="border border-slate-200 rounded-lg h-9 px-3 text-sm bg-white text-slate-700"
            value={agentFilter}
            onChange={(e) => handleFilterChange(() => setAgentFilter(e.target.value))}
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {(a as any).fullName || (a as any).name || a.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <IndianRupee className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No collections found with the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Receipt No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Collected By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date & Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((col) => {
                    const cust = members.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
                    const agent = members.find((m) => m.id === col.agentId || m.clerkUserId === col.agentId);
                    const d = toDate(col.collectedAt || col.timestamp);
                    const isSavings = col.collectionType !== "LOAN_EMI";
                    return (
                      <TableRow key={col.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-mono text-xs text-slate-600">{col.receiptNo || "—"}</TableCell>
                        <TableCell className="font-semibold">
                          {(cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-8)}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isSavings ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-indigo-50 text-indigo-700 border-indigo-100"}`}>
                            {isSavings ? "SAVINGS" : "EMI"}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {(agent as any)?.fullName || (agent as any)?.name || col.collectedByName || "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">
                          ₹{Number(col.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {d.getTime() > 0 ? format(d, "MMM d, h:mm a") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination footer */}
          {filtered.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {paginated.length} of {filtered.length} records
              </p>
              {hasMore && (
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Load {Math.min(PAGE_SIZE, filtered.length - paginated.length)} more
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

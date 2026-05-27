import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useUser } from "@clerk/clerk-react";
import { Collection, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { IndianRupee, Calendar, History } from "lucide-react";
import { useState } from "react";

type Period = "today" | "week" | "month" | "all";

export default function AgentHistory() {
  const { user } = useUser();
  const agentId = user?.id || "";
  const [period, setPeriod] = useState<Period>("today");

  const { data: collections, loading: collLoading } = useCollectionRealtime<Collection>("collections");
  const { data: allMembers, loading: membersLoading } = useCollectionRealtime<Membership>("organizationMembers");

  const myCollections = collections.filter((c) => c.agentId === agentId);

  const getStart = (): Date => {
    const now = new Date();
    switch (period) {
      case "today": return startOfDay(now);
      case "week": return startOfWeek(now, { weekStartsOn: 1 });
      case "month": return startOfMonth(now);
      case "all": return new Date(0);
    }
  };

  const filtered = myCollections
    .filter((c) => {
      const d = (c.timestamp as any)?.toDate?.() || new Date(c.timestamp);
      return d >= getStart();
    })
    .sort((a, b) => {
      const dA = (a.timestamp as any)?.toDate?.() || new Date(a.timestamp);
      const dB = (b.timestamp as any)?.toDate?.() || new Date(b.timestamp);
      return dB.valueOf() - dA.valueOf();
    });

  const total = filtered.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const periods: { id: Period; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "all", label: "All Time" },
  ];

  const loading = collLoading || membersLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <History className="h-6 w-6 text-slate-500" />
          Collection History
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Your complete collection record.</p>
      </div>

      {/* Period Filter */}
      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              period === p.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-600 text-white shadow-md border-none">
          <CardContent className="p-5">
            <p className="text-emerald-100 text-sm font-medium">Total Collected</p>
            <p className="text-3xl font-bold mt-1">₹{total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <p className="text-slate-500 text-sm font-medium">Transactions</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <p className="text-slate-500 text-sm font-medium">Avg per Collection</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              ₹{filtered.length ? Math.round(total / filtered.length).toLocaleString() : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Collection log */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          <CardTitle className="text-base font-bold text-slate-800">Collection Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <IndianRupee className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold">No collections found for this period.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map((col) => {
                const customer = allMembers.find((m) => m.id === col.customerId);
                const d = (col.timestamp as any)?.toDate?.() || new Date(col.timestamp);
                return (
                  <div key={col.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <IndianRupee className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {customer?.name || "Unknown Customer"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {d ? format(d, "MMM d, yyyy · h:mm a") : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">+₹{Number(col.amount).toLocaleString()}</p>
                      <p className="text-xs text-slate-400 mt-0.5 capitalize">{col.status}</p>
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

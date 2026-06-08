import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { AuditLog } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Shield, Search, ChevronDown, ChevronUp } from "lucide-react";
import { orderBy } from "firebase/firestore";

const ACTION_COLORS: Record<string, string> = {
  AGENT_CREATED: "bg-blue-50 text-blue-700 border-blue-100",
  AGENT_DEACTIVATED: "bg-red-50 text-red-700 border-red-100",
  AGENT_REACTIVATED: "bg-green-50 text-green-700 border-green-100",
  CUSTOMER_CREATED: "bg-violet-50 text-violet-700 border-violet-100",
  CUSTOMER_STATUS_CHANGED: "bg-orange-50 text-orange-700 border-orange-100",
  CUSTOMER_REASSIGNED: "bg-amber-50 text-amber-700 border-amber-100",
  SAVINGS_COLLECTION_RECORDED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  LOAN_CREATED: "bg-cyan-50 text-cyan-700 border-cyan-100",
  LOAN_APPROVED: "bg-teal-50 text-teal-700 border-teal-100",
  LOAN_REJECTED: "bg-red-50 text-red-700 border-red-100",
  LOAN_CLOSED: "bg-slate-50 text-slate-700 border-slate-100",
  EMI_COLLECTION_RECORDED: "bg-indigo-50 text-indigo-700 border-indigo-100",
  ORG_SETTINGS_UPDATED: "bg-gray-50 text-gray-700 border-gray-100",
};

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export default function OrgAuditLogs() {
  const { data: logs, loading } = useCollectionRealtime<AuditLog>("audit_logs", [
    orderBy("createdAt", "desc"),
  ]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = logs;

  const filtered = sorted.filter((log) => {
    const term = search.toLowerCase();
    return (
      !term ||
      log.action?.toLowerCase().includes(term) ||
      log.entityType?.toLowerCase().includes(term) ||
      log.actorName?.toLowerCase().includes(term) ||
      log.actorRole?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-slate-600" />
          Audit Logs
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Immutable record of every state-changing operation in your organization.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action, entity, actor…"
          className="pl-9 h-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: logs.length, color: "bg-slate-50" },
          { label: "Collections", value: logs.filter(l => l.action?.includes("COLLECTION")).length, color: "bg-emerald-50" },
          { label: "Loan Events", value: logs.filter(l => l.action?.includes("LOAN")).length, color: "bg-blue-50" },
          { label: "Member Events", value: logs.filter(l => l.action?.includes("AGENT") || l.action?.includes("CUSTOMER")).length, color: "bg-violet-50" },
        ].map((stat) => (
          <Card key={stat.label} className={`${stat.color} border-slate-200`}>
            <CardContent className="p-4">
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{filtered.length} Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No audit events found.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((log) => {
                const isExpanded = expandedId === log.id;
                const colorClass = ACTION_COLORS[log.action] || "bg-slate-50 text-slate-700 border-slate-100";
                const d = toDate(log.createdAt);
                return (
                  <div key={log.id} className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 mt-0.5 ${colorClass}`}>
                            {log.action?.replace(/_/g, " ")}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 leading-tight">
                              {log.entityType} · {log.entityId?.slice(-8)}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {log.actorName || log.actorId?.slice(0, 12)} · {log.actorRole}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400 hidden sm:block">
                            {d.getTime() > 0 ? format(d, "MMM d, h:mm a") : "—"}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </button>
                    {isExpanded && log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Metadata</p>
                        <div className="space-y-1">
                          {Object.entries(log.metadata).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-xs">
                              <span className="font-medium text-slate-500 shrink-0 min-w-[120px]">{key}:</span>
                              <span className="text-slate-800 font-mono break-all">
                                {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          {d.getTime() > 0 ? format(d, "EEEE, MMMM d yyyy · hh:mm:ss a") : "—"}
                        </p>
                      </div>
                    )}
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

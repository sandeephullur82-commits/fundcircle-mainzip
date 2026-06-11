import { useState, useMemo } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { AuditLog, AuditModule, AuditCategory } from "@/types";
import { sanitizeSearch } from "@/lib/validation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow, startOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import {
  Shield, Search, ChevronDown, ChevronUp, Download,
  Activity, Users, Layers, Lock, ArrowUpDown, FileDown,
} from "lucide-react";
import { orderBy, where } from "firebase/firestore";
import { useOrganization } from "@clerk/clerk-react";
import {
  getActionLabel, getActionModule, getActionCategory,
  CATEGORY_STYLES, MODULE_STYLES,
} from "@/lib/auditLogger";

const PAGE_SIZE = 50;

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function timeAgo(d: Date): string {
  if (d.getTime() === 0) return "—";
  try { return formatDistanceToNow(d, { addSuffix: true }); } catch { return "—"; }
}

const ALL_MODULES: AuditModule[] = [
  "CUSTOMERS", "AGENTS", "SAVINGS", "LOANS", "COLLECTIONS", "REPORTS", "ORGANIZATION", "AUTHENTICATION",
];
const ALL_CATEGORIES: AuditCategory[] = [
  "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "LOGIN", "EXPORT", "SECURITY",
];
const ALL_ROLES = ["OWNER", "AGENT", "CUSTOMER"];

function downloadCsv(logs: AuditLog[]) {
  const header = [
    "Timestamp", "Action", "Module", "Category", "Description",
    "Actor Name", "Actor Role", "Entity Type", "Entity ID", "Receipt / Ref",
  ].join(",");

  const rows = logs.map((l) => {
    const d = toDate(l.createdAt);
    const ts = d.getTime() > 0 ? format(d, "yyyy-MM-dd HH:mm:ss") : "";
    const desc = (l.description || "").replace(/,/g, ";").replace(/\n/g, " ");
    const ref = (l.metadata?.receiptNo || l.metadata?.loanId || l.entityId || "").replace(/,/g, "");
    return [
      ts,
      l.action,
      l.module || getActionModule(l.action),
      l.category || getActionCategory(l.action),
      `"${desc}"`,
      l.actorName || "",
      l.actorRole,
      l.entityType,
      l.entityId?.slice(-12) || "",
      ref,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type DateRangeKey = "TODAY" | "WEEK" | "MONTH" | "ALL";

export default function OrgAuditLogs() {
  const { organization } = useOrganization();
  const orgId = organization?.id || "NONE";

  const { data: logs, loading } = useCollectionRealtime<AuditLog>("audit_logs", [
    where("organizationId", "==", orgId),
    orderBy("createdAt", "desc"),
  ]);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("ALL");
  const [moduleFilter, setModuleFilter] = useState<AuditModule | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory | "ALL">("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);

  // ── Date boundary helpers ─────────────────────────────────────────────────
  const todayStart    = useMemo(() => startOfDay(new Date()), []);
  const weekStart     = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const monthStart    = useMemo(() => startOfMonth(new Date()), []);

  // ── Stats (always from ALL logs, not filtered) ────────────────────────────
  const todayLogs     = logs.filter(l => toDate(l.createdAt) >= todayStart);
  const weekLogs      = logs.filter(l => toDate(l.createdAt) >= weekStart);
  const collectionLogs = logs.filter(l =>
    l.action === "SAVINGS_COLLECTION_RECORDED" ||
    l.action === "EMI_COLLECTION_RECORDED" ||
    l.action === "COMBINED_COLLECTION_RECORDED"
  );
  const loanLogs      = logs.filter(l => (l.module || getActionModule(l.action)) === "LOANS");
  const memberLogs    = logs.filter(l => {
    const mod = l.module || getActionModule(l.action);
    return mod === "CUSTOMERS" || mod === "AGENTS";
  });
  const securityLogs  = logs.filter(l => {
    const cat = l.category || getActionCategory(l.action);
    return cat === "SECURITY" || cat === "LOGIN";
  });

  // ── Filtered view ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return logs.filter((log) => {
      // Date range
      const d = toDate(log.createdAt);
      if (dateRange === "TODAY"  && d < todayStart)  return false;
      if (dateRange === "WEEK"   && d < weekStart)   return false;
      if (dateRange === "MONTH"  && d < monthStart)  return false;

      // Module
      const mod = log.module || getActionModule(log.action);
      if (moduleFilter !== "ALL" && mod !== moduleFilter) return false;

      // Category
      const cat = log.category || getActionCategory(log.action);
      if (categoryFilter !== "ALL" && cat !== categoryFilter) return false;

      // Role
      if (roleFilter !== "ALL" && log.actorRole?.toUpperCase() !== roleFilter) return false;

      // Search
      if (term) {
        const label  = getActionLabel(log.action).toLowerCase();
        const desc   = (log.description || "").toLowerCase();
        const actor  = (log.actorName || "").toLowerCase();
        const entity = (log.entityId || "").toLowerCase();
        const receipt = (log.metadata?.receiptNo || "").toLowerCase();
        if (!label.includes(term) && !desc.includes(term) && !actor.includes(term) &&
            !entity.includes(term) && !receipt.includes(term)) return false;
      }

      return true;
    });
  }, [logs, search, dateRange, moduleFilter, categoryFilter, roleFilter, todayStart, weekStart, monthStart]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filtered.length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-slate-600" />
            Audit Trail
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Immutable record of every state-changing event in your organization — tamper-proof and real-time.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
          className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
          size="sm"
        >
          <FileDown className="w-4 h-4" />
          Export CSV ({filtered.length})
        </Button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Today",          value: todayLogs.length,     icon: Activity, color: "text-indigo-600",  bg: "bg-indigo-50"  },
          { label: "This Week",      value: weekLogs.length,      icon: ArrowUpDown, color: "text-blue-600", bg: "bg-blue-50"    },
          { label: "Collections",    value: collectionLogs.length,icon: Download,  color: "text-emerald-600",bg: "bg-emerald-50" },
          { label: "Loan Events",    value: loanLogs.length,      icon: Layers,    color: "text-amber-600",  bg: "bg-amber-50"   },
          { label: "Member Changes", value: memberLogs.length,    icon: Users,     color: "text-violet-600", bg: "bg-violet-50"  },
          { label: "Security",       value: securityLogs.length,  icon: Lock,      color: "text-rose-600",   bg: "bg-rose-50"    },
        ].map((stat) => (
          <Card key={stat.label} className={`${stat.bg} border-slate-200 shadow-none`}>
            <CardContent className="p-4">
              <stat.icon className={`w-4 h-4 ${stat.color} mb-2`} />
              <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Date Range */}
        <div className="flex gap-1 flex-wrap">
          {(["ALL", "TODAY", "WEEK", "MONTH"] as DateRangeKey[]).map((r) => (
            <button
              key={r}
              onClick={() => { setDateRange(r); resetPage(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                dateRange === r
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r === "ALL" ? "All Time" : r === "TODAY" ? "Today" : r === "WEEK" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>

        {/* Module + Category + Role filters + Search */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(sanitizeSearch(e.target.value)); resetPage(); }}
              placeholder="Search action, actor, receipt, entity…"
              maxLength={100}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value as any); resetPage(); }}
            className="h-9 rounded-lg border border-slate-200 bg-white text-sm px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="ALL">All Modules</option>
            {ALL_MODULES.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value as any); resetPage(); }}
            className="h-9 rounded-lg border border-slate-200 bg-white text-sm px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="ALL">All Categories</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-slate-200 bg-white text-sm px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="ALL">All Roles</option>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>

          {(moduleFilter !== "ALL" || categoryFilter !== "ALL" || roleFilter !== "ALL" || search || dateRange !== "ALL") && (
            <button
              onClick={() => { setModuleFilter("ALL"); setCategoryFilter("ALL"); setRoleFilter("ALL"); setSearch(""); setDateRange("ALL"); resetPage(); }}
              className="h-9 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Log List */}
      <Card className="border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">
            {loading ? "Loading…" : `${filtered.length} event${filtered.length !== 1 ? "s" : ""}`}
          </p>
          {!loading && filtered.length > 0 && (
            <p className="text-xs text-slate-400">
              Showing {Math.min(paginated.length, filtered.length)} of {filtered.length}
            </p>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit events match your filters.</p>
            <p className="text-xs mt-1">Try adjusting the date range or clearing the filters.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {paginated.map((log) => {
                const isExpanded = expandedId === log.id;
                const d = toDate(log.createdAt);
                const cat = log.category || getActionCategory(log.action);
                const mod = log.module  || getActionModule(log.action);
                const catStyle = CATEGORY_STYLES[cat] || CATEGORY_STYLES.UPDATE;
                const modStyle = MODULE_STYLES[mod]   || MODULE_STYLES.ORGANIZATION;
                const label = getActionLabel(log.action);
                const hasDetails = !!(
                  (log.metadata && Object.keys(log.metadata).length > 0) ||
                  log.oldValues || log.newValues || log.description ||
                  log.deviceInfo || log.browserInfo
                );

                return (
                  <div
                    key={log.id}
                    className={`border-l-4 ${catStyle.border} transition-colors ${isExpanded ? "bg-slate-50/60" : "hover:bg-slate-50/40"}`}
                  >
                    <button
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : log.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Category dot */}
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${catStyle.dot}`} />

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${catStyle.badge}`}>
                              {catStyle.label}
                            </span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${modStyle}`}>
                              {mod.charAt(0) + mod.slice(1).toLowerCase()}
                            </span>
                            <span className="text-sm font-semibold text-slate-900 leading-tight">{label}</span>
                          </div>
                          {log.description ? (
                            <p className="text-xs text-slate-500 italic truncate">{log.description}</p>
                          ) : (
                            <p className="text-xs text-slate-400 truncate">
                              {log.entityType} · <span className="font-mono">{log.entityId?.slice(-10)}</span>
                            </p>
                          )}
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-slate-700">
                              {log.actorName || log.actorId?.slice(0, 10) || "System"}
                            </p>
                            <p className="text-[10px] text-slate-400">{log.actorRole?.toLowerCase()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-slate-500">{d.getTime() > 0 ? timeAgo(d) : "—"}</p>
                            <p className="text-[10px] text-slate-400 hidden lg:block">
                              {d.getTime() > 0 ? format(d, "MMM d, h:mm a") : ""}
                            </p>
                          </div>
                          {hasDetails && (
                            isExpanded
                              ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                              : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 ml-5 space-y-4">

                        {/* Description */}
                        {log.description && (
                          <div className="bg-white border border-slate-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
                            <p className="text-sm text-slate-700">{log.description}</p>
                          </div>
                        )}

                        {/* Old → New values diff */}
                        {(log.oldValues || log.newValues) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {log.oldValues && (
                              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Before</p>
                                <div className="space-y-1.5">
                                  {Object.entries(log.oldValues).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-red-400 shrink-0 min-w-[100px] capitalize">{k.replace(/_/g, " ")}:</span>
                                      <span className="text-red-700 font-mono break-all">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {log.newValues && (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">After</p>
                                <div className="space-y-1.5">
                                  {Object.entries(log.newValues).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-emerald-500 shrink-0 min-w-[100px] capitalize">{k.replace(/_/g, " ")}:</span>
                                      <span className="text-emerald-700 font-mono break-all">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Metadata */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="bg-white border border-slate-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Details</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {Object.entries(log.metadata).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2 text-xs">
                                  <span className="font-medium text-slate-400 shrink-0 min-w-[110px] capitalize">{key.replace(/([A-Z])/g, " $1").trim()}:</span>
                                  <span className="text-slate-800 font-mono break-all">
                                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer: timestamp + device */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                          <span>
                            {d.getTime() > 0 ? format(d, "EEEE, MMMM d yyyy · hh:mm:ss a") : "—"}
                          </span>
                          {(log.browserInfo || log.deviceInfo || log.platform) && (
                            <span className="hidden sm:block">
                              {[log.browserInfo, log.deviceInfo, log.platform].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="p-4 border-t border-slate-100 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  className="text-slate-600 border-slate-200"
                >
                  Load more ({filtered.length - paginated.length} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

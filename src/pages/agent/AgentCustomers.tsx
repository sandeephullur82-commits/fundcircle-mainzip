import { useState, useMemo, useRef, useCallback } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection, Loan } from "@/types";
import {
  Users, Search, X, Phone, ChevronDown, ChevronUp,
  PiggyBank, ReceiptText, Plus, MessageCircle, CheckCircle2,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface AgentCustomersProps {
  onCollect?: () => void;
  onSwitchTab?: (tab: string) => void;
}

type FilterStatus = "all" | "pending" | "completed" | "active";
type SortDir = "asc" | "desc";

function safeN(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }
function initials(name: string) { return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(); }
function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function custId(id: string) { return `CUST-${id.slice(-6).toUpperCase()}`; }

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];
function avatarColor(id: string) {
  const code = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function AgentCustomers({ onSwitchTab }: AgentCustomersProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<FilterStatus>("all");
  const [sortDir,       setSortDir]       = useState<SortDir>("asc");
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [collectCustomer, setCollectCustomer] = useState<any | null>(null);
  const [swipedId,      setSwipedId]      = useState<string | null>(null);
  const [swipeDir,      setSwipeDir]      = useState<"left" | "right" | null>(null);

  const touchStartX  = useRef<number>(0);
  const swipeCardRef = useRef<string | null>(null);

  // ── Firestore queries ────────────────────────────────────────────────────────
  const { data: allCustomers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role",            "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);

  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts", [
    where("organizationId", "==", orgId || "NONE"),
    where("status",          "==", "ACTIVE"),
  ]);

  const { data: loans } = useCollectionRealtime<Loan>("loans", [
    where("organizationId", "==", orgId || "NONE"),
    where("status",          "==", "ACTIVE"),
  ]);

  const { data: collections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const today = useMemo(() => startOfDay(new Date()), []);

  const activeCustomers = useMemo(
    () => allCustomers.filter(c => (c as any).status === "ACTIVE"),
    [allCustomers]
  );

  const collectedTodaySet = useMemo(() => {
    const todayCols = collections.filter(c => toDate(c.collectedAt || (c as any).timestamp) >= today);
    return new Set(todayCols.flatMap(c => [c.customerId]));
  }, [collections, today]);

  const savingsMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of savingsAccounts) m.set(a.customerId, a);
    return m;
  }, [savingsAccounts]);

  const loanMap = useMemo(() => {
    const m = new Map<string, Loan>();
    for (const l of loans) m.set(l.customerId, l);
    return m;
  }, [loans]);

  const totalCollectedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collections) {
      const prev = m.get(c.customerId) ?? 0;
      m.set(c.customerId, prev + safeN(c.amount));
    }
    return m;
  }, [collections]);

  const lastCollectionMap = useMemo(() => {
    const m = new Map<string, Collection>();
    for (const c of collections) {
      const existing = m.get(c.customerId);
      if (!existing || toDate(c.collectedAt || (c as any).timestamp) > toDate(existing.collectedAt || (existing as any).timestamp)) {
        m.set(c.customerId, c);
      }
    }
    return m;
  }, [collections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\D/g, "");
    const qText = search.trim().toLowerCase();

    let list = activeCustomers.filter(c => {
      if (!qText) return true;
      const phone = ((c as any).phone || "").replace(/\D/g, "");
      const id    = custId(c.id).toLowerCase();
      // phone digits exact or ID match
      return (q && phone.includes(q)) || id.includes(qText);
    });

    // Status filter
    if (filterStatus === "pending")   list = list.filter(c => !collectedTodaySet.has(c.id) && !collectedTodaySet.has(c.clerkUserId));
    if (filterStatus === "completed") list = list.filter(c => collectedTodaySet.has(c.id) || collectedTodaySet.has(c.clerkUserId));
    if (filterStatus === "active")    list = [...list]; // already all active

    // Sort by ID
    list = [...list].sort((a, b) => sortDir === "asc"
      ? a.id.localeCompare(b.id)
      : b.id.localeCompare(a.id)
    );

    return list;
  }, [activeCustomers, search, filterStatus, sortDir, collectedTodaySet]);

  // ── Swipe handlers ───────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    touchStartX.current  = e.touches[0].clientX;
    swipeCardRef.current = id;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent, id: string) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) < 55) {
      if (swipedId === id) { setSwipedId(null); setSwipeDir(null); }
      return;
    }
    setSwipedId(id);
    setSwipeDir(diff > 0 ? "right" : "left");
  }, [swipedId]);

  const resetSwipe = useCallback(() => { setSwipedId(null); setSwipeDir(null); }, []);

  const handleCall = (phone: string) => {
    resetSwipe();
    if (!phone) return toast.error("No phone number on file");
    window.location.href = `tel:${phone.replace(/\D/g, "")}`;
  };

  const handleWhatsApp = (phone: string, name: string) => {
    resetSwipe();
    if (!phone) return toast.error("No phone number on file");
    const num = phone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${name}, this is your FundCircle agent.`);
    window.open(`https://wa.me/91${num}?text=${msg}`, "_blank");
  };

  // ── Stats bar ────────────────────────────────────────────────────────────────
  const pendingCount   = activeCustomers.filter(c => !collectedTodaySet.has(c.id) && !collectedTodaySet.has(c.clerkUserId)).length;
  const completedCount = activeCustomers.filter(c => collectedTodaySet.has(c.id)  ||  collectedTodaySet.has(c.clerkUserId)).length;

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: "all",       label: `All ${activeCustomers.length}` },
    { key: "pending",   label: `Pending ${pendingCount}`       },
    { key: "completed", label: `Done ${completedCount}`        },
  ];

  return (
    <div className="flex flex-col h-full pb-24">

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Customer ID or Phone"
          className="w-full h-11 pl-10 pr-9 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {/* ── Filter Row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide pb-0.5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filterStatus === f.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {f.label}
          </button>
        ))}
        {/* Sort toggle */}
        <button
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="shrink-0 ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600"
        >
          {sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          ID
        </button>
      </div>

      {/* ── Customer List ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[90px] bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasSearch={!!search || filterStatus !== "all"}
          onClearSearch={() => { setSearch(""); setFilterStatus("all"); }}
          onAddCustomer={() => toast.info("New customers are added by your organization admin.")}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(customer => {
            const c          = customer as any;
            const name       = c.fullName || c.name || c.email || "Customer";
            const phone      = c.phone || "";
            const cid        = custId(customer.id);
            const isDone     = collectedTodaySet.has(customer.id) || collectedTodaySet.has(customer.clerkUserId || "");
            const savAcc     = savingsMap.get(customer.id) || savingsMap.get(customer.clerkUserId);
            const loan       = loanMap.get(customer.id) || loanMap.get(customer.clerkUserId || "");
            const totalColl  = totalCollectedMap.get(customer.id) || totalCollectedMap.get(customer.clerkUserId || "") || 0;
            const lastCol    = lastCollectionMap.get(customer.id) || lastCollectionMap.get(customer.clerkUserId || "");
            const scheduled  = safeN(savAcc?.scheduledAmount);
            const pendingAmt = isDone ? 0 : scheduled;
            const isExpanded = expandedId === customer.id;
            const isSwiped   = swipedId === customer.id;
            const dir        = isSwiped ? swipeDir : null;

            return (
              <div key={customer.id} className="relative overflow-hidden rounded-2xl">
                {/* Swipe background — Call */}
                <div className="absolute inset-0 flex items-center">
                  <div className="w-16 h-full bg-emerald-500 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                </div>
                {/* Swipe background — WhatsApp */}
                <div className="absolute inset-0 flex items-center justify-end">
                  <div className="w-16 h-full bg-green-600 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                </div>

                {/* Card */}
                <motion.div
                  animate={{ x: dir === "right" ? 64 : dir === "left" ? -64 : 0 }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  className="relative bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
                  onTouchStart={e => onTouchStart(e, customer.id)}
                  onTouchEnd={e => {
                    onTouchEnd(e, customer.id);
                    if (swipedId === customer.id) {
                      if (swipeDir === "right") handleCall(phone);
                      else if (swipeDir === "left") handleWhatsApp(phone, name);
                    }
                  }}
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => {
                      if (isSwiped) { resetSwipe(); return; }
                      setExpandedId(isExpanded ? null : customer.id);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3 px-3 py-3 min-h-[88px]">
                      {/* Avatar + status dot */}
                      <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black ${avatarColor(customer.id)}`}>
                          {initials(name)}
                        </div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          isDone ? "bg-emerald-500" : "bg-amber-400"
                        }`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate leading-snug">{name}</p>
                        <p className="text-[11px] font-mono text-slate-400 leading-snug">{cid}</p>
                        {phone && (
                          <p className="text-[11px] text-slate-400 leading-snug">{phone}</p>
                        )}
                      </div>

                      {/* Right: pending amount or done */}
                      <div className="shrink-0 text-right flex flex-col items-end gap-1">
                        {isDone ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        ) : pendingAmt > 0 ? (
                          <span className="text-sm font-black text-amber-600">{formatINR(pendingAmt)}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        <span className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                          <ChevronDown className="w-4 h-4 text-slate-300" />
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded section */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-3 space-y-3">
                          {/* Stats grid */}
                          <div className="grid grid-cols-2 gap-2">
                            <StatBox
                              label="Total Savings"
                              value={savAcc ? formatINR(safeN(savAcc.totalBalance)) : "—"}
                              color="text-emerald-700"
                            />
                            <StatBox
                              label="Collected"
                              value={totalColl > 0 ? formatINR(totalColl) : "—"}
                              color="text-blue-700"
                            />
                            <StatBox
                              label="Pending"
                              value={pendingAmt > 0 ? formatINR(pendingAmt) : "—"}
                              color="text-amber-700"
                            />
                            <StatBox
                              label="Daily Amount"
                              value={scheduled > 0 ? formatINR(scheduled) : "—"}
                              color="text-slate-700"
                            />
                          </div>

                          {/* Dates */}
                          {savAcc && (
                            <div className="flex items-center gap-4">
                              {savAcc.startDate && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Start</p>
                                  <p className="text-[11px] font-semibold text-slate-700">
                                    {format(toDate(savAcc.startDate), "d MMM yyyy")}
                                  </p>
                                </div>
                              )}
                              {lastCol && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Last Collected</p>
                                  <p className="text-[11px] font-semibold text-slate-700">
                                    {format(toDate(lastCol.collectedAt || (lastCol as any).timestamp), "d MMM · h:mm a")}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => setCollectCustomer(customer)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl active:scale-95 transition-transform"
                            >
                              <PiggyBank className="w-3.5 h-3.5" />
                              New Collection
                            </button>
                            <button
                              onClick={() => { setExpandedId(null); onSwitchTab?.("receipts"); }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-xl active:scale-95 transition-transform"
                            >
                              <ReceiptText className="w-3.5 h-3.5" />
                              Receipts
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FAB ─────────────────────────────────────────────────────────────── */}
      <motion.button
        onClick={() => toast.info("New customers are added by your organization admin.")}
        className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 w-14 h-14 bg-emerald-600 rounded-full shadow-xl flex items-center justify-center text-white"
        whileTap={{ scale: 0.9 }}
        aria-label="Add Customer"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* CollectDialog */}
      <CollectDialog
        customer={collectCustomer}
        orgId={orgId}
        orgName={orgName}
        agentId={agentId}
        agentName={agentName}
        onClose={() => setCollectCustomer(null)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2 border border-slate-100">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-black ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ hasSearch, onClearSearch, onAddCustomer }: {
  hasSearch: boolean;
  onClearSearch: () => void;
  onAddCustomer: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-slate-300" />
      </div>
      <p className="font-bold text-slate-700 text-base">
        {hasSearch ? "No Customers Found" : "No Assigned Customers"}
      </p>
      <p className="text-xs text-slate-400 mt-1 mb-5">
        {hasSearch
          ? "Try searching with phone number or customer ID"
          : "Your manager will assign customers to you"}
      </p>
      {hasSearch ? (
        <button
          onClick={onClearSearch}
          className="px-5 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-xl"
        >
          Clear Search
        </button>
      ) : (
        <button
          onClick={onAddCustomer}
          className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl"
        >
          Add Customer
        </button>
      )}
    </div>
  );
}

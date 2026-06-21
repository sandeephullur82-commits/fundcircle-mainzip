import { useState, useMemo, useRef, useCallback, memo } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection } from "@/types";
import {
  Users, Search, X, Phone, MessageCircle,
  ArrowUp, ArrowDown, CheckCircle2,
} from "lucide-react";
import { startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import { toDate } from "@/components/agent/CollectDialog";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentCustomersProps {
  onViewCustomer: (customer: Membership) => void;
  onSwitchTab?: (tab: string) => void;
}
type FilterStatus = "all" | "pending" | "completed";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeN(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }
function custId(id: string) { return `CUST-${id.slice(-6).toUpperCase()}`; }
function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
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
function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-().+]/g, "").replace(/^0+/, "");
}
function isValidPhone(phone: string): boolean {
  const p = cleanPhone(phone);
  return /^\d{10,12}$/.test(p);
}

// ── Call bottom sheet ─────────────────────────────────────────────────────────
function CallSheet({ name, phone, onClose }: { name: string; phone: string; onClose: () => void }) {
  const handleCall = () => {
    const p = cleanPhone(phone);
    if (!isValidPhone(phone)) { toast.error("Invalid phone number"); onClose(); return; }
    window.location.href = `tel:${p}`;
    onClose();
  };
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
        >
          {/* Handle bar */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
          {/* Icon */}
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-black text-slate-900 text-center">Call Customer</h3>
          <p className="text-sm text-slate-500 text-center mt-1 mb-6">
            Do you want to call <span className="font-bold text-slate-800">{name}</span>?
          </p>
          <div className="space-y-3">
            <button
              onClick={handleCall}
              className="w-full py-3.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm active:scale-95 transition-transform"
            >
              Call Now
            </button>
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-slate-100 text-slate-700 font-bold rounded-2xl text-sm active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Customer Card ─────────────────────────────────────────────────────────────
const CustomerCard = memo(function CustomerCard({
  customer, pendingAmt, isDone, onTap, onCall, onWhatsApp,
}: {
  customer: Membership;
  pendingAmt: number;
  isDone: boolean;
  onTap: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
}) {
  const c       = customer as any;
  const name    = c.fullName || c.name || c.email || "Customer";
  const phone   = c.phone || "";
  const cid     = custId(customer.id);

  const touchStartX  = useRef(0);
  const touchStartY  = useRef(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [offsetX, setOffsetX]   = useState(0);
  const SNAP = 72;
  const THRESHOLD = 55;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeDir(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Only swipe horizontally if dominant axis is X
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (swipeDir === null) {
      if (Math.abs(dx) > 10) setSwipeDir(dx > 0 ? "right" : "left");
    }
    const clamped = Math.max(-SNAP - 8, Math.min(SNAP + 8, dx));
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    if (Math.abs(offsetX) >= THRESHOLD) {
      setOffsetX(offsetX > 0 ? SNAP : -SNAP);
    } else {
      setOffsetX(0);
      setSwipeDir(null);
    }
  };

  const resetSwipe = () => { setOffsetX(0); setSwipeDir(null); };

  const isRevealedRight = offsetX >= SNAP;
  const isRevealedLeft  = offsetX <= -SNAP;

  return (
    <div className="relative overflow-hidden rounded-2xl select-none">
      {/* Behind — Call (left side, revealed by swipe right) */}
      <div className="absolute inset-y-0 left-0 w-[72px] bg-emerald-500 flex items-center justify-center rounded-l-2xl">
        <button
          className="w-full h-full flex flex-col items-center justify-center gap-1"
          onClick={() => { resetSwipe(); onCall(); }}
        >
          <Phone className="w-5 h-5 text-white" />
          <span className="text-[9px] font-bold text-white">Call</span>
        </button>
      </div>
      {/* Behind — WhatsApp (right side, revealed by swipe left) */}
      <div className="absolute inset-y-0 right-0 w-[72px] bg-green-600 flex items-center justify-center rounded-r-2xl">
        <button
          className="w-full h-full flex flex-col items-center justify-center gap-1"
          onClick={() => {
            resetSwipe();
            const p = cleanPhone(phone);
            if (!isValidPhone(phone)) { toast.error("WhatsApp not available — invalid number"); return; }
            const msg = encodeURIComponent(`Hi ${name}, this is your FundCircle collector.`);
            window.open(`https://wa.me/${p.length === 10 ? `91${p}` : p}?text=${msg}`, "_blank");
          }}
        >
          <MessageCircle className="w-5 h-5 text-white" />
          <span className="text-[9px] font-bold text-white">WhatsApp</span>
        </button>
      </div>

      {/* Card */}
      <motion.div
        animate={{ x: offsetX }}
        transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.6 }}
        className="relative bg-white border border-slate-100 rounded-2xl shadow-sm"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={() => { if (isRevealedLeft || isRevealedRight) { resetSwipe(); return; } onTap(); }}
          className="w-full text-left"
        >
          <div className="flex items-center gap-3 px-3 py-3 min-h-[90px]">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black select-none ${avatarColor(customer.id)}`}>
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
              {phone && <p className="text-[11px] text-slate-400 leading-snug">{phone}</p>}
            </div>

            {/* Right: pending / done */}
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              {isDone ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </span>
              ) : pendingAmt > 0 ? (
                <span className="text-sm font-black text-amber-600">{formatINR(pendingAmt)}</span>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </div>
          </div>
        </button>
      </motion.div>
    </div>
  );
});

// ── Main Component ────────────────────────────────────────────────────────────
export default function AgentCustomers({ onViewCustomer, onSwitchTab }: AgentCustomersProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId = user?.id || "";
  const orgId   = organization?.id || "";

  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");
  const [callSheet,    setCallSheet]    = useState<{ name: string; phone: string } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  // ── Firestore ───────────────────────────────────────────────────────────────
  const { data: allCustomers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role",            "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);

  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts", [
    where("organizationId", "==", orgId || "NONE"),
  ]);

  const { data: collections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeCustomers = useMemo(
    () => allCustomers.filter(c => (c as any).status === "ACTIVE"),
    [allCustomers]
  );

  const collectedTodaySet = useMemo(() => {
    const todayCols = collections.filter(c => toDate(c.collectedAt || (c as any).timestamp) >= today);
    return new Set(todayCols.map(c => c.customerId));
  }, [collections, today]);

  const savingsMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of savingsAccounts) m.set(a.customerId, a);
    return m;
  }, [savingsAccounts]);

  const pendingCount   = useMemo(() => activeCustomers.filter(c => !collectedTodaySet.has(c.id) && !collectedTodaySet.has(c.clerkUserId || "")).length, [activeCustomers, collectedTodaySet]);
  const completedCount = useMemo(() => activeCustomers.filter(c =>  collectedTodaySet.has(c.id) ||  collectedTodaySet.has(c.clerkUserId || "")).length, [activeCustomers, collectedTodaySet]);

  // ── Search & filter ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rawQ  = search.trim();
    const qText = rawQ.toLowerCase();
    const qNum  = rawQ.replace(/\D/g, "");

    let list = activeCustomers.filter(c => {
      if (!rawQ) return true;
      const phone = ((c as any).phone || "").replace(/\D/g, "");
      const id    = custId(c.id).toLowerCase();
      return (qNum && phone.includes(qNum)) || id.includes(qText);
    });

    if (filterStatus === "pending")   list = list.filter(c => !collectedTodaySet.has(c.id) && !collectedTodaySet.has(c.clerkUserId || ""));
    if (filterStatus === "completed") list = list.filter(c =>  collectedTodaySet.has(c.id) ||  collectedTodaySet.has(c.clerkUserId || ""));

    return [...list].sort((a, b) =>
      sortDir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)
    );
  }, [activeCustomers, search, filterStatus, sortDir, collectedTodaySet]);

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: "all",       label: `All ${activeCustomers.length}` },
    { key: "pending",   label: `Pending ${pendingCount}` },
    { key: "completed", label: `Done ${completedCount}` },
  ];

  return (
    <div className="flex flex-col pb-24">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Customer ID or Phone"
          className="w-full h-11 pl-10 pr-9 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 transition-shadow"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {/* Filter row */}
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
        <button
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="shrink-0 ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600"
        >
          {sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          ID
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[90px] bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={!!search || filterStatus !== "all"}
          onClear={() => { setSearch(""); setFilterStatus("all"); }}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(customer => {
            const isDone     = collectedTodaySet.has(customer.id) || collectedTodaySet.has(customer.clerkUserId || "");
            const savAcc     = savingsMap.get(customer.id) || savingsMap.get(customer.clerkUserId);
            const scheduled  = safeN(savAcc?.scheduledAmount);
            const pendingAmt = isDone ? 0 : scheduled;
            const name       = (customer as any).fullName || (customer as any).name || customer.email || "Customer";
            const phone      = (customer as any).phone || "";

            return (
              <CustomerCard
                key={customer.id}
                customer={customer}
                pendingAmt={pendingAmt}
                isDone={isDone}
                onTap={() => onViewCustomer(customer)}
                onCall={() => setCallSheet({ name, phone })}
                onWhatsApp={() => {
                  const p = cleanPhone(phone);
                  if (!isValidPhone(phone)) { toast.error("WhatsApp not available — invalid number"); return; }
                  const msg = encodeURIComponent(`Hi ${name}, this is your FundCircle collector.`);
                  window.open(`https://wa.me/${p.length === 10 ? `91${p}` : p}?text=${msg}`, "_blank");
                }}
              />
            );
          })}
        </div>
      )}

      {/* Call confirmation sheet */}
      {callSheet && (
        <CallSheet
          name={callSheet.name}
          phone={callSheet.phone}
          onClose={() => setCallSheet(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-slate-300" />
      </div>
      <p className="font-bold text-slate-700 text-base">
        {hasFilter ? "No Customers Found" : "No Assigned Customers"}
      </p>
      <p className="text-xs text-slate-400 mt-1 mb-5">
        {hasFilter
          ? "Try searching with phone number or customer ID"
          : "Your manager will assign customers to you"}
      </p>
      {hasFilter && (
        <button
          onClick={onClear}
          className="px-5 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-xl"
        >
          Clear Filter
        </button>
      )}
    </div>
  );
}

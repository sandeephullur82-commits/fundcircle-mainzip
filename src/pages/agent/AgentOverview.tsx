import { useState, useEffect, useRef, useMemo } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection } from "@/types";
import {
  IndianRupee, Clock, Users, Banknote, Smartphone,
  PiggyBank, ReceiptText, ListChecks, ChevronRight,
  Plus, X, CheckCircle2, AlertCircle, WalletCards,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";
import { motion, AnimatePresence } from "framer-motion";

interface AgentOverviewProps {
  onSwitchTab: (tab: string) => void;
}

function safeN(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }

function formatINR(amount: number): string {
  if (amount >= 10_000_000) {
    const cr = amount / 10_000_000;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2).replace(/\.?0+$/, "")} Cr`;
  }
  if (amount >= 100_000) {
    const l = amount / 100_000;
    return `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1).replace(/\.?0+$/, "")} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function AgentOverview({ onSwitchTab }: AgentOverviewProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [fabOpen, setFabOpen]     = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Data Queries ────────────────────────────────────────────────────────────
  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role",            "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);

  const { data: allCollections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);

  const { data: savingsAccts } = useCollectionRealtime<any>("savings_accounts", [
    where("organizationId", "==", orgId || "NONE"),
    where("status",          "==", "ACTIVE"),
  ]);

  // ── Computed values ─────────────────────────────────────────────────────────
  const today = useMemo(() => startOfDay(new Date()), []);

  const todayCollections = useMemo(
    () => allCollections.filter(c => toDate(c.collectedAt || (c as any).timestamp) >= today),
    [allCollections, today]
  );

  const activeCustomers = useMemo(
    () => allMembers.filter(m => (m as any).status === "ACTIVE"),
    [allMembers]
  );

  const collectedCustomers = useMemo(
    () => activeCustomers.filter(c =>
      todayCollections.some(col => col.customerId === c.id || col.customerId === c.clerkUserId)
    ),
    [activeCustomers, todayCollections]
  );

  const pendingCustomers = useMemo(
    () => activeCustomers.filter(c =>
      !todayCollections.some(col => col.customerId === c.id || col.customerId === c.clerkUserId)
    ),
    [activeCustomers, todayCollections]
  );

  // Build map: memberId → scheduledAmount from savings accounts
  const savingsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const acct of savingsAccts) {
      const existing = map.get(acct.customerId) ?? 0;
      map.set(acct.customerId, existing + safeN(acct.scheduledAmount));
    }
    return map;
  }, [savingsAccts]);

  const pendingAmount = useMemo(
    () => pendingCustomers.reduce((sum, c) => sum + (savingsMap.get(c.id) ?? 0), 0),
    [pendingCustomers, savingsMap]
  );

  const cashCollections = useMemo(
    () => todayCollections.filter(c => !c.paymentMode || c.paymentMode === "CASH"),
    [todayCollections]
  );
  const upiCollections = useMemo(
    () => todayCollections.filter(c => c.paymentMode === "UPI"),
    [todayCollections]
  );

  const todayTotal = useMemo(() => todayCollections.reduce((s, c) => s + safeN(c.amount), 0), [todayCollections]);
  const cashTotal  = useMemo(() => cashCollections.reduce((s, c) => s + safeN(c.amount), 0), [cashCollections]);
  const upiTotal   = useMemo(() => upiCollections.reduce((s, c) => s + safeN(c.amount), 0), [upiCollections]);

  const recentActivity = useMemo(
    () => [...allCollections]
      .sort((a, b) =>
        toDate(b.collectedAt || (b as any).timestamp).valueOf() -
        toDate(a.collectedAt || (a as any).timestamp).valueOf()
      )
      .slice(0, 5),
    [allCollections]
  );

  const getMemberName = (col: Collection) => {
    const m = allMembers.find(x => x.id === col.customerId || x.clerkUserId === col.customerId);
    return (m as any)?.fullName || (m as any)?.name || `#${col.customerId?.slice(-4) || "?"}`;
  };

  // Close bottom sheet on outside tap
  useEffect(() => {
    if (!fabOpen) return;
    const fn = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setFabOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [fabOpen]);

  const fabActions = [
    { label: "New Collection",   icon: PiggyBank,   tab: "collect",   color: "text-emerald-600", bg: "bg-emerald-50"  },
    { label: "Customer List",    icon: Users,        tab: "customers", color: "text-slate-700",   bg: "bg-slate-100"   },
    { label: "Generate Receipt", icon: ReceiptText,  tab: "receipts",  color: "text-indigo-600",  bg: "bg-indigo-50"   },
  ];

  return (
    <div className="space-y-3 pb-28">

      {/* ── Section 1: Overview Strip ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <OverviewCell
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            value={collectedCustomers.length}
            label="Collected"
            valueClass="text-emerald-600"
          />
          <OverviewCell
            icon={<Clock className="w-4 h-4 text-amber-500" />}
            value={pendingCustomers.length}
            label="Pending"
            valueClass="text-amber-600"
          />
          <OverviewCell
            icon={<Users className="w-4 h-4 text-blue-500" />}
            value={activeCustomers.length}
            label="Total"
            valueClass="text-slate-800"
          />
        </div>
        {/* Progress bar */}
        {activeCustomers.length > 0 && (
          <div className="px-4 pb-3">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <motion.div
                className="bg-emerald-500 h-1.5 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((collectedCustomers.length / activeCustomers.length) * 100)}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: To Collect Card ───────────────────────────────────── */}
      {activeCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="w-10 h-10 text-slate-300" />}
          title="No Assigned Customers"
          subtitle="Your manager hasn't assigned any customers yet."
          action={{ label: "View Profile", onClick: () => onSwitchTab("more") }}
        />
      ) : (
        <button
          onClick={() => onSwitchTab("customers")}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-5 active:scale-[0.98] transition-transform shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">To Collect</p>
              <p className="text-4xl font-black text-amber-900 tracking-tight leading-none">
                {formatINR(pendingAmount)}
              </p>
              <div className="flex items-center gap-1.5 mt-2.5">
                <div className="w-5 h-5 bg-amber-200 rounded-full flex items-center justify-center">
                  <Clock className="w-3 h-3 text-amber-700" />
                </div>
                <p className="text-sm font-semibold text-amber-700">
                  {pendingCustomers.length} Customer{pendingCustomers.length !== 1 ? "s" : ""} Pending
                </p>
              </div>
            </div>
            <div className="w-11 h-11 bg-amber-200 rounded-xl flex items-center justify-center shrink-0">
              <WalletCards className="w-5 h-5 text-amber-700" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-amber-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600">Tap to view pending customers</span>
            <ChevronRight className="w-4 h-4 text-amber-500" />
          </div>
        </button>
      )}

      {/* ── Section 3: Collection Grid 2x2 ──────────────────────────────── */}
      {activeCustomers.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <CollectionCard
            label="Daily Cash"
            value={formatINR(cashTotal)}
            sub={`${cashCollections.length} collection${cashCollections.length !== 1 ? "s" : ""}`}
            icon={<Banknote className="w-4 h-4 text-emerald-600" />}
            iconBg="bg-emerald-100"
            onClick={() => onSwitchTab("collect")}
          />
          <CollectionCard
            label="UPI / Online"
            value={formatINR(upiTotal)}
            sub={`${upiCollections.length} collection${upiCollections.length !== 1 ? "s" : ""}`}
            icon={<Smartphone className="w-4 h-4 text-blue-600" />}
            iconBg="bg-blue-100"
            onClick={() => onSwitchTab("collect")}
          />
          <CollectionCard
            label="Today Total"
            value={formatINR(todayTotal)}
            sub={`${todayCollections.length} transaction${todayCollections.length !== 1 ? "s" : ""}`}
            icon={<IndianRupee className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-100"
            onClick={() => onSwitchTab("collect")}
            highlight
          />
          <CollectionCard
            label="Receipts"
            value={String(todayCollections.length)}
            sub="issued today"
            icon={<ReceiptText className="w-4 h-4 text-slate-600" />}
            iconBg="bg-slate-100"
            onClick={() => onSwitchTab("receipts")}
          />
        </div>
      )}

      {/* ── Section 4: Recent Collections ───────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-emerald-500" />
            Recent Collections
          </h3>
          <button
            onClick={() => onSwitchTab("receipts")}
            className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-8 text-center">
            <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-500">No Collections Today</p>
            <p className="text-xs text-slate-400 mt-0.5">Use the + button to record a collection</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {recentActivity.map((col) => {
              const d    = toDate(col.collectedAt || (col as any).timestamp);
              const mode = col.paymentMode || "CASH";
              const isUPI = mode === "UPI";
              return (
                <div key={col.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUPI ? "bg-blue-50" : "bg-emerald-50"
                  }`}>
                    {isUPI
                      ? <Smartphone className="w-4 h-4 text-blue-500" />
                      : <Banknote    className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{getMemberName(col)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-px rounded-full leading-none ${
                        isUPI ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}>{mode}</span>
                      <span className="text-[11px] text-slate-400">
                        {d.getTime() > 0 ? format(d, "h:mm a") : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-600 shrink-0">
                    +{formatINR(safeN(col.amount))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <motion.button
        onClick={() => setFabOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 w-14 h-14 bg-emerald-600 rounded-full shadow-2xl flex items-center justify-center text-white"
        whileTap={{ scale: 0.9 }}
        aria-label="Open actions"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* ── Bottom Sheet ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {fabOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFabOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              ref={sheetRef}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-4 pb-10 pt-2 safe-area-pb"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Drag handle */}
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">
                Quick Actions
              </p>

              <div className="space-y-2">
                {fabActions.map(({ label, icon: Icon, tab, color, bg }, i) => (
                  <motion.button
                    key={label}
                    onClick={() => { setFabOpen(false); onSwitchTab(tab); }}
                    className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl ${bg} active:scale-[0.97] transition-transform text-left`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.2 }}
                  >
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <span className={`font-semibold text-[15px] ${color}`}>{label}</span>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={() => setFabOpen(false)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3.5 text-slate-400 font-semibold text-sm"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CollectDialog
        customer={selectedCustomer}
        orgId={orgId}
        orgName={orgName}
        agentId={agentId}
        agentName={agentName}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverviewCell({ icon, value, label, valueClass }: {
  icon: React.ReactNode;
  value: number;
  label: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col items-center py-4 gap-1">
      {icon}
      <span className={`text-2xl font-black leading-none ${valueClass}`}>{value}</span>
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function CollectionCard({ label, value, sub, icon, iconBg, onClick, highlight }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-4 text-left active:scale-[0.96] transition-transform shadow-sm border ${
        highlight
          ? "bg-emerald-600 border-emerald-700 text-white"
          : "bg-white border-slate-100"
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${
        highlight ? "bg-white/20" : iconBg
      }`}>
        {icon}
      </div>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
        highlight ? "text-emerald-100" : "text-slate-400"
      }`}>{label}</p>
      <p className={`text-xl font-black leading-none tracking-tight ${
        highlight ? "text-white" : "text-slate-900"
      }`}>{value}</p>
      <p className={`text-[11px] mt-1 font-medium ${
        highlight ? "text-emerald-200" : "text-slate-400"
      }`}>{sub}</p>
    </button>
  );
}

function EmptyState({ icon, title, subtitle, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 py-10 text-center px-6">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="font-bold text-slate-700">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

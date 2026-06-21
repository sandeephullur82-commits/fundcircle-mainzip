import { useState, useEffect, useRef } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection } from "@/types";
import {
  IndianRupee, Clock, Users, Banknote, Smartphone,
  PiggyBank, ReceiptText, ListChecks, ChevronRight, Plus, X,
  CheckCircle2,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";
import { motion, AnimatePresence } from "framer-motion";

interface AgentOverviewProps {
  onSwitchTab: (tab: string) => void;
}

function safeN(v: any) { const n = Number(v); return isFinite(n) ? n : 0; }

export default function AgentOverview({ onSwitchTab }: AgentOverviewProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role",            "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  const { data: allCollections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);

  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  const today = startOfDay(new Date());

  const todayCollections = allCollections.filter(
    (c) => toDate(c.collectedAt || (c as any).timestamp) >= today
  );

  const todayTotal = todayCollections.reduce((s, c) => s + safeN(c.amount), 0);

  const cashCollections = todayCollections.filter((c) => !c.paymentMode || c.paymentMode === "CASH");
  const upiCollections  = todayCollections.filter((c) => c.paymentMode === "UPI");
  const cashTotal = cashCollections.reduce((s, c) => s + safeN(c.amount), 0);
  const upiTotal  = upiCollections.reduce((s, c) => s + safeN(c.amount), 0);

  const activeCustomers = allMembers.filter((m) => (m as any).status === "ACTIVE");

  const collectedCustomers = activeCustomers.filter(
    (c) => todayCollections.some((col) => col.customerId === c.id || col.customerId === c.clerkUserId)
  );
  const pendingCustomers = activeCustomers.filter(
    (c) => !todayCollections.some((col) => col.customerId === c.id || col.customerId === c.clerkUserId)
  );

  const collectedCount = collectedCustomers.length;
  const progressPct    = activeCustomers.length > 0
    ? Math.round((collectedCount / activeCustomers.length) * 100)
    : 0;

  const recentActivity = [...allCollections]
    .sort((a, b) =>
      toDate(b.collectedAt || (b as any).timestamp).valueOf() -
      toDate(a.collectedAt || (a as any).timestamp).valueOf()
    )
    .slice(0, 10);

  const getMemberName = (col: Collection) => {
    const m = allMembers.find((x) => x.id === col.customerId || x.clerkUserId === col.customerId);
    return (m as any)?.fullName || (m as any)?.name || col.customerId?.slice(-6) || "Customer";
  };

  useEffect(() => {
    if (!fabOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setFabOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fabOpen]);

  const fabActions = [
    { label: "Generate Receipt", icon: ReceiptText, tab: "receipts",  color: "bg-indigo-600" },
    { label: "Customer List",    icon: Users,        tab: "customers", color: "bg-slate-800"  },
    { label: "New Collection",   icon: PiggyBank,    tab: "collect",   color: "bg-emerald-600" },
  ];

  return (
    <div className="space-y-4 pb-6">

      {/* ── 1. Customer Statistics Card ───────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 shadow-lg">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">
          Customer Statistics — Today
        </p>
        <div className="grid grid-cols-3 divide-x divide-slate-700">
          {/* Collected */}
          <div className="flex flex-col items-center gap-1 pr-4">
            <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-1">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <span className="text-3xl font-black text-emerald-400 leading-none">{collectedCount}</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Collected</span>
          </div>

          {/* Pending */}
          <div className="flex flex-col items-center gap-1 px-4">
            <div className="w-9 h-9 bg-amber-500/20 rounded-xl flex items-center justify-center mb-1">
              <Clock className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <span className="text-3xl font-black text-amber-400 leading-none">{pendingCustomers.length}</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Pending</span>
          </div>

          {/* Total */}
          <div className="flex flex-col items-center gap-1 pl-4">
            <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center mb-1">
              <Users className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <span className="text-3xl font-black text-white leading-none">{activeCustomers.length}</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total</span>
          </div>
        </div>

        {activeCustomers.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Collection Progress</span>
              <span className="text-xs font-bold text-emerald-400">{progressPct}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <motion.div
                className="bg-emerald-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Collection Summary Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today's Collection — full width */}
        <button
          onClick={() => onSwitchTab("collect")}
          className="col-span-2 bg-emerald-600 text-white rounded-2xl p-5 flex items-center justify-between shadow-md active:scale-[0.98] transition-transform text-left"
        >
          <div>
            <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wide">Today's Collection</p>
            <p className="text-4xl font-black mt-1 tracking-tight">₹{todayTotal.toLocaleString()}</p>
            <p className="text-emerald-200 text-xs mt-1.5">
              {todayCollections.length} transaction{todayCollections.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-7 h-7 text-white" />
          </div>
        </button>

        {/* Cash */}
        <button
          onClick={() => onSwitchTab("collect")}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs font-semibold text-slate-500">Cash</span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">₹{cashTotal.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{cashCollections.length} collection{cashCollections.length !== 1 ? "s" : ""}</p>
        </button>

        {/* UPI */}
        <button
          onClick={() => onSwitchTab("collect")}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs font-semibold text-slate-500">UPI</span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">₹{upiTotal.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{upiCollections.length} collection{upiCollections.length !== 1 ? "s" : ""}</p>
        </button>

        {/* Pending Customers */}
        <button
          onClick={() => onSwitchTab("customers")}
          className="col-span-2 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between shadow-sm text-left active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pending Customers</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-2xl font-black text-amber-900">{pendingCustomers.length}</p>
                <p className="text-xs text-amber-600">customer{pendingCustomers.length !== 1 ? "s" : ""} not yet collected</p>
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
        </button>
      </div>

      {/* ── 3. Today's Performance ────────────────────────────────────────── */}
      {activeCustomers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-slate-700">Today's Performance</span>
            <span className="text-sm font-semibold text-emerald-600">
              {collectedCount}/{activeCustomers.length} · {progressPct}%
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Customers collected vs assigned</p>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <motion.div
              className="bg-emerald-500 h-3 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-1.5">
            <span>0</span>
            <span>{activeCustomers.length} total</span>
          </div>
        </div>
      )}

      {/* ── 4. Recent Collections ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-emerald-600" />
            Recent Collections
          </h2>
          <button onClick={() => onSwitchTab("receipts")} className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-100">
            <PiggyBank className="w-9 h-9 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No collections yet today</p>
            <p className="text-xs mt-1 opacity-70">Use the + button to record a collection</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {recentActivity.map((col) => {
              const d    = toDate(col.collectedAt || (col as any).timestamp);
              const mode = col.paymentMode || "CASH";
              return (
                <div key={col.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      mode === "UPI" ? "bg-blue-100" : "bg-emerald-100"
                    }`}>
                      {mode === "UPI"
                        ? <Smartphone className="w-4 h-4 text-blue-600" />
                        : <Banknote    className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{getMemberName(col)}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          mode === "UPI"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        }`}>{mode}</span>
                        <span className="text-xs text-slate-400">
                          {d.getTime() > 0 ? format(d, "h:mm a") : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="font-bold text-emerald-600 text-sm shrink-0">
                    +₹{safeN(col.amount).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 5. FAB ────────────────────────────────────────────────────────── */}
      <div ref={fabRef} className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 flex flex-col items-end gap-3">

        {/* Action items */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              className="flex flex-col items-end gap-2.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {fabActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.label}
                    onClick={() => { setFabOpen(false); onSwitchTab(action.tab); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-white font-semibold text-sm ${action.color} active:scale-95`}
                    initial={{ opacity: 0, y: 20, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.9 }}
                    transition={{ duration: 0.2, delay: i * 0.05, ease: "easeOut" }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {action.label}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          onClick={() => setFabOpen((o) => !o)}
          className="w-14 h-14 bg-emerald-600 rounded-full shadow-xl flex items-center justify-center text-white active:scale-95"
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: fabOpen ? 45 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          aria-label={fabOpen ? "Close actions" : "Open actions"}
        >
          {fabOpen
            ? <X className="w-6 h-6" />
            : <Plus className="w-6 h-6" />
          }
        </motion.button>
      </div>

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

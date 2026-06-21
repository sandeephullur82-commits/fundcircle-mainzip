import { useState, useEffect, useMemo } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import { format, startOfDay } from "date-fns";
import {
  ArrowLeft, Phone, MessageCircle, PiggyBank, ReceiptText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Membership, Collection } from "@/types";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import {
  getSavingsAccountByCustomer,
  getActiveLoanForCustomer,
} from "@/lib/services";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeN(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }
function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function custId(id: string) { return `CUST-${id.slice(-6).toUpperCase()}`; }
function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-().+]/g, "").replace(/^0+/, "");
}
function isValidPhone(phone: string): boolean {
  const p = cleanPhone(phone);
  return /^\d{10,12}$/.test(p);
}

const AVATAR_COLORS = [
  "from-emerald-400 to-teal-500",
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
];
function avatarGradient(id: string) {
  const code = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

// ── Progress Ring ─────────────────────────────────────────────────────────────
function ProgressRing({ pct }: { pct: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct / 100, 1));
  return (
    <svg width="96" height="96" viewBox="0 0 100 100" className="-rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke="#10b981" strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.7s ease" }}
      />
    </svg>
  );
}

// ── Call Sheet ────────────────────────────────────────────────────────────────
function CallSheet({ name, phone, onClose }: { name: string; phone: string; onClose: () => void }) {
  const handleCall = () => {
    const p = cleanPhone(phone);
    if (!isValidPhone(phone)) { toast.error("Invalid phone number"); onClose(); return; }
    window.location.href = `tel:${p}`;
    onClose();
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 200 }}
        animate={{ y: 0 }}
        exit={{ y: 200 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
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
  );
}

// ── Section Wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface CustomerDetailPageProps {
  customer: Membership;
  onBack: () => void;
  onSwitchTab?: (tab: string) => void;
}

export default function CustomerDetailPage({ customer, onBack, onSwitchTab }: CustomerDetailPageProps) {
  const { organization } = useOrganization();
  const { user }         = useUser();

  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";
  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";

  const c    = customer as any;
  const name = c.fullName || c.name || c.email || "Customer";
  const phone= c.phone || "";
  const cid  = custId(customer.id);

  const [savingsAccount,  setSavingsAccount]  = useState<any>(null);
  const [activeLoan,      setActiveLoan]      = useState<any>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [collectTarget,   setCollectTarget]   = useState<Membership | null>(null);
  const [callSheetOpen,   setCallSheetOpen]   = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  // Fetch savings + loan once
  useEffect(() => {
    setLoadingAccounts(true);
    Promise.all([
      getSavingsAccountByCustomer(customer.id, orgId),
      getActiveLoanForCustomer(customer.id, orgId),
    ]).then(([acc, loan]) => {
      setSavingsAccount(acc);
      setActiveLoan(loan);
    }).catch(() => {
      // silent
    }).finally(() => setLoadingAccounts(false));
  }, [customer.id, orgId]);

  // Real-time collections for this customer
  const { data: allCollections } = useCollectionRealtime<Collection>("collections", [
    where("customerId", "in", [customer.id, customer.clerkUserId || customer.id]),
  ]);

  // Aggregate stats
  const totalPaid = useMemo(
    () => allCollections.reduce((sum, c) => sum + safeN(c.amount), 0),
    [allCollections]
  );
  const isDoneToday = useMemo(() => {
    return allCollections.some(c => toDate(c.collectedAt || (c as any).timestamp) >= today);
  }, [allCollections, today]);

  const pendingAmt = useMemo(() => {
    if (isDoneToday) return 0;
    return safeN(savingsAccount?.scheduledAmount);
  }, [isDoneToday, savingsAccount]);

  const progressPct = useMemo(() => {
    const target = safeN(savingsAccount?.scheduledAmount) * 100; // rough: 100 days goal
    if (!target) return 0;
    return Math.min((totalPaid / target) * 100, 100);
  }, [totalPaid, savingsAccount]);

  // Group collections by date
  const groupedCollections = useMemo(() => {
    const sorted = [...allCollections].sort((a, b) =>
      toDate(b.collectedAt || (b as any).timestamp).valueOf() -
      toDate(a.collectedAt || (a as any).timestamp).valueOf()
    );
    const groups = new Map<string, Collection[]>();
    for (const col of sorted) {
      const d = toDate(col.collectedAt || (col as any).timestamp);
      const key = d.getTime() > 0 ? format(d, "d MMM yyyy") : "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(col);
    }
    return Array.from(groups.entries());
  }, [allCollections]);

  const handleWhatsApp = () => {
    const p = cleanPhone(phone);
    if (!isValidPhone(phone)) { toast.error("WhatsApp not available — invalid number"); return; }
    const msg = encodeURIComponent(`Hi ${name}, this is your FundCircle collector.`);
    window.open(`https://wa.me/${p.length === 10 ? `91${p}` : p}?text=${msg}`, "_blank");
  };

  return (
    <div className="pb-10">
      {/* Back header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer Details</p>
          <p className="text-sm font-bold text-slate-800 truncate max-w-[220px]">{name}</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${avatarGradient(customer.id)} flex items-center justify-center text-white text-xl font-black shrink-0 shadow-md`}>
              {initials(name)}
            </div>
            {/* Name + ID + status */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-slate-900 truncate">{name}</p>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{cid}</p>
              {phone && <p className="text-xs text-slate-500 mt-0.5">{phone}</p>}
              <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isDoneToday
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                {isDoneToday ? "✓ Collected Today" : "Pending Today"}
              </span>
            </div>
          </div>

          {/* Progress ring + stats */}
          <div className="flex items-center gap-4 mt-5 pt-5 border-t border-slate-50">
            <div className="relative shrink-0">
              <ProgressRing pct={progressPct} />
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-xs font-black text-slate-800">{Math.round(progressPct)}%</span>
                <span className="text-[8px] text-slate-400">Paid</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Pending</p>
                <p className="text-sm font-black text-amber-700">{pendingAmt > 0 ? formatINR(pendingAmt) : "—"}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Total Paid</p>
                <p className="text-sm font-black text-emerald-700">{totalPaid > 0 ? formatINR(totalPaid) : "₹0"}</p>
              </div>
              {savingsAccount && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Balance</p>
                  <p className="text-sm font-black text-slate-700">{formatINR(safeN(savingsAccount.totalBalance))}</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Collections</p>
                <p className="text-sm font-black text-slate-700">{allCollections.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details */}
        {!loadingAccounts && (savingsAccount || activeLoan) && (
          <Section title="Account Details">
            {phone && <DetailRow label="Phone" value={phone} />}
            {savingsAccount && (
              <>
                {savingsAccount.accountNumber && (
                  <DetailRow label="Account No." value={savingsAccount.accountNumber} mono />
                )}
                {savingsAccount.planName && (
                  <DetailRow label="Savings Plan" value={savingsAccount.planName} />
                )}
                {savingsAccount.scheduledAmount && (
                  <DetailRow label="Daily Amount" value={formatINR(safeN(savingsAccount.scheduledAmount))} />
                )}
                {savingsAccount.startDate && (
                  <DetailRow
                    label="Start Date"
                    value={format(toDate(savingsAccount.startDate), "d MMM yyyy")}
                  />
                )}
                {savingsAccount.endDate && (
                  <DetailRow
                    label="End Date"
                    value={format(toDate(savingsAccount.endDate), "d MMM yyyy")}
                  />
                )}
              </>
            )}
            {activeLoan && (
              <>
                <DetailRow label="Loan Amount" value={formatINR(safeN(activeLoan.amount || activeLoan.loanAmount))} />
                {activeLoan.outstandingBalance != null && (
                  <DetailRow label="Outstanding" value={formatINR(safeN(activeLoan.outstandingBalance))} />
                )}
                {activeLoan.interestRate && (
                  <DetailRow label="Interest Rate" value={`${activeLoan.interestRate}% p.a.`} />
                )}
                {activeLoan.startDate && (
                  <DetailRow
                    label="Loan Start"
                    value={format(toDate(activeLoan.startDate), "d MMM yyyy")}
                  />
                )}
              </>
            )}
          </Section>
        )}

        {/* Transaction History */}
        <Section title={`Transaction History (${allCollections.length})`}>
          {allCollections.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-slate-400">
              <ReceiptText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No collections yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedCollections.slice(0, 30).map(([date, cols]) => (
                <div key={date}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{date}</p>
                  <div className="space-y-1.5">
                    {cols.map(col => (
                      <div key={col.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {toDate(col.collectedAt || (col as any).timestamp).getTime() > 0
                              ? format(toDate(col.collectedAt || (col as any).timestamp), "h:mm a")
                              : "—"}
                          </p>
                          {col.receiptNo && (
                            <p className="text-[10px] text-slate-400 font-mono">{col.receiptNo}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600">+{formatINR(safeN(col.amount))}</p>
                          {(col as any).paymentMethod && (
                            <p className="text-[9px] text-slate-400 uppercase">{(col as any).paymentMethod}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Collection Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setCollectTarget(customer)}
            className="flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white text-sm font-bold rounded-2xl shadow-sm active:scale-95 transition-transform"
          >
            <PiggyBank className="w-4 h-4" />
            New Collection
          </button>
          <button
            onClick={() => onSwitchTab?.("receipts")}
            className="flex items-center justify-center gap-2 py-3.5 bg-slate-800 text-white text-sm font-bold rounded-2xl shadow-sm active:scale-95 transition-transform"
          >
            <ReceiptText className="w-4 h-4" />
            Receipts
          </button>
          <button
            onClick={() => setCallSheetOpen(true)}
            className="flex items-center justify-center gap-2 py-3.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-2xl shadow-sm active:scale-95 transition-transform"
          >
            <Phone className="w-4 h-4 text-emerald-600" />
            Call
          </button>
          <button
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 py-3.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-2xl shadow-sm active:scale-95 transition-transform"
          >
            <MessageCircle className="w-4 h-4 text-green-600" />
            WhatsApp
          </button>
        </div>

      </div>

      {/* Dialogs */}
      <CollectDialog
        customer={collectTarget}
        orgId={orgId}
        orgName={orgName}
        agentId={agentId}
        agentName={agentName}
        onClose={() => setCollectTarget(null)}
      />
      <AnimatePresence>
        {callSheetOpen && (
          <CallSheet
            name={name}
            phone={phone}
            onClose={() => setCallSheetOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

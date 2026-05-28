import React, { useState } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { useDocumentRealtime, useCollectionRealtime } from "@/lib/firestore-hooks";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { where } from "firebase/firestore";
import { resolveUpgradeRequests } from "@/lib/services";
import { Membership } from "@/types";
import { Zap, TrendingUp, Crown, Sparkles, Check, CreditCard, ArrowRight, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CURRENCY = { code: "INR", symbol: "₹" };

type PlanId = "free" | "starter" | "growth" | "enterprise";

const PLANS = [
  { id: "free" as PlanId, name: "Free", price: 0, gradient: "from-slate-400 to-slate-500", icon: Sparkles, limits: { maxAgents: 1, maxCustomers: 25, maxCollectionsPerMonth: 250 } },
  { id: "starter" as PlanId, name: "Starter", price: 999, gradient: "from-sky-500 to-blue-500", icon: Zap, limits: { maxAgents: 5, maxCustomers: 100, maxCollectionsPerMonth: 1000 } },
  { id: "growth" as PlanId, name: "Growth", price: 4999, gradient: "from-violet-500 to-fuchsia-500", icon: TrendingUp, popular: true, limits: { maxAgents: 25, maxCustomers: 1000, maxCollectionsPerMonth: 10000 } },
  { id: "enterprise" as PlanId, name: "Enterprise", price: 14999, gradient: "from-amber-500 to-orange-500", icon: Crown, limits: { maxAgents: -1, maxCustomers: -1, maxCollectionsPerMonth: -1 } },
];

function formatLimit(val: number) { return val === -1 ? "∞" : val.toLocaleString(); }

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max === -1 ? 0 : Math.min((used / max) * 100, 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-bold ${pct >= 90 ? "text-red-600" : "text-slate-600"}`}>
          {used.toLocaleString()} / {max === -1 ? "∞" : max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: max === -1 ? "4%" : `${pct}%` }} />
      </div>
    </div>
  );
}

function formatCardNumber(v: string) { return v.replace(/\D/g, "").substring(0, 16).replace(/(.{4})/g, "$1 ").trim(); }
function formatExpiry(v: string) { const d = v.replace(/\D/g, "").substring(0, 4); return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d; }

export default function OrgBilling() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);
  const { data: agents } = useCollectionRealtime<Membership>("organizationMembers", [where("role", "==", "AGENT")]);
  const { data: customers } = useCollectionRealtime<Membership>("organizationMembers", [where("role", "==", "CUSTOMER")]);
  const { data: payments, loading: paymentsLoading } = useCollectionRealtime<any>("payments");

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<PlanId>("growth");
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [upgradeStep, setUpgradeStep] = useState<"plan" | "payment">("plan");
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentPlanId = (orgDoc?.plan as PlanId) || "free";
  const currentPlan = PLANS.find((p) => p.id === currentPlanId) || PLANS[0];
  const limits = orgDoc?.limits || currentPlan.limits;

  const activeAgents = agents.filter((a: any) => a.status === "ACTIVE").length;
  const activeCustomers = customers.filter((c: any) => c.status === "ACTIVE").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { data: collections } = useCollectionRealtime<any>("collections");
  const collectionsThisMonth = collections.filter((c: any) => {
    const d = (c.timestamp as any)?.toDate?.() || new Date(c.timestamp);
    return d >= monthStart;
  }).length;

  const upgradePlanData = PLANS.find((p) => p.id === upgradePlan)!;
  const upgradePlanIsFree = upgradePlan === "free";

  const validatePayment = () => {
    const errs: Record<string, string> = {};
    if (!cardHolder.trim()) errs.cardHolder = "Required.";
    if (cardNumber.replace(/\s/g, "").length !== 16) errs.cardNumber = "Enter a valid 16-digit number.";
    if (!expiry.includes("/")) errs.expiry = "Enter MM/YY.";
    if (cvv.length < 3) errs.cvv = "Enter valid CVV.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleUpgrade = async () => {
    if (!upgradePlanIsFree && !validatePayment()) return;
    if (!organization?.id || !user?.id) return;
    setProcessing(true);
    try {
      if (!upgradePlanIsFree) await new Promise((r) => setTimeout(r, 1500));
      await setDoc(doc(db, "organizations", organization.id), {
        plan: upgradePlan,
        limits: upgradePlanData.limits,
        subscriptionStatus: "ACTIVE",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      const subRef = doc(collection(db, "subscriptions"));
      await setDoc(subRef, {
        id: subRef.id,
        organizationId: organization.id,
        plan: upgradePlan,
        planName: upgradePlanData.name,
        billingCycle: upgradePlanIsFree ? "free" : "monthly",
        amount: upgradePlanData.price,
        currency: CURRENCY.code,
        status: "active",
        startedAt: serverTimestamp(),
        expiresAt: upgradePlanIsFree ? null : new Date(Date.now() + 30 * 24 * 3600000).getTime(),
        createdAt: serverTimestamp(),
      });
      if (!upgradePlanIsFree) {
        const payRef = doc(collection(db, "payments"));
        await setDoc(payRef, {
          id: payRef.id,
          organizationId: organization.id,
          subscriptionId: subRef.id,
          amount: upgradePlanData.price,
          currency: CURRENCY.code,
          billingCycle: "monthly",
          paymentStatus: "success",
          cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
          planName: upgradePlanData.name,
          paidAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }
      // Resolve any pending upgrade requests now that the plan has been upgraded
      try { await resolveUpgradeRequests(organization.id); } catch (_) {}

      toast.success(`Plan updated to ${upgradePlanData.name}!`);
      setShowUpgrade(false);
      setUpgradeStep("plan");
      setCardHolder(""); setCardNumber(""); setExpiry(""); setCvv("");
    } catch (err: any) {
      toast.error(err?.message || "Upgrade failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Billing & Subscription</h2>
        <p className="text-slate-500 text-sm mt-1">Manage your plan, usage limits, and payment history.</p>
      </div>

      {/* Current Plan Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${currentPlan.gradient} shadow-md shrink-0`}>
              <currentPlan.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Plan</p>
              <p className="text-xl font-extrabold text-slate-900">{currentPlan.name}</p>
              <p className="text-sm text-slate-500">
                {currentPlan.price === 0 ? "Free forever" : `${CURRENCY.symbol}${currentPlan.price.toLocaleString()}/month`}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setShowUpgrade(true); setUpgradeStep("plan"); }}
            className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white px-5 py-2.5 text-sm font-bold shadow-sm shadow-sky-200 transition-all active:scale-[0.98]"
          >
            <ArrowRight className="w-4 h-4" /> Upgrade Plan
          </button>
        </div>

        {/* Usage Bars */}
        <div className="mt-6 space-y-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Usage This Period</p>
          <UsageBar label="Pigmy Collectors" used={activeAgents} max={limits.maxAgents} />
          <UsageBar label="Customers" used={activeCustomers} max={limits.maxCustomers} />
          <UsageBar label="Collections This Month" used={collectionsThisMonth} max={limits.maxCollectionsPerMonth} />
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Payment History</h3>
        </div>
        {paymentsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No payments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3 text-left">Plan</th>
                  <th className="px-5 py-3 text-left">Amount</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{p.planName || "—"}</td>
                    <td className="px-5 py-3 text-slate-700">{CURRENCY.symbol}{(p.amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        p.paymentStatus === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                      }`}>
                        {p.paymentStatus === "success" ? <Check className="w-3 h-3" /> : null}
                        {p.paymentStatus || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400">
                      {p.paidAt?.toDate ? p.paidAt.toDate().toLocaleDateString("en-IN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowUpgrade(false); }}>
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {upgradeStep === "plan" ? "Choose a Plan" : "Complete Payment"}
                </h3>
                <p className="text-sm text-slate-500">Current: {currentPlan.name}</p>
              </div>
              <button onClick={() => setShowUpgrade(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">×</button>
            </div>

            {upgradeStep === "plan" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PLANS.map((p) => {
                    const Icon = p.icon;
                    const isSelected = upgradePlan === p.id;
                    const isCurrent = currentPlanId === p.id;
                    return (
                      <button
                        key={p.id}
                        disabled={isCurrent}
                        onClick={() => setUpgradePlan(p.id)}
                        className={`relative text-left rounded-2xl border-2 p-4 transition-all ${
                          isCurrent ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed" :
                          isSelected ? "border-sky-400 ring-2 ring-sky-200 bg-white shadow-md" :
                          "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {p.popular && !isCurrent && (
                          <span className="absolute -top-2.5 left-4 rounded-full bg-violet-500 px-2.5 py-0.5 text-[10px] font-bold text-white">Most Popular</span>
                        )}
                        {isCurrent && (
                          <span className="absolute -top-2.5 left-4 rounded-full bg-slate-400 px-2.5 py-0.5 text-[10px] font-bold text-white">Current</span>
                        )}
                        <div className="flex items-center justify-between mb-2">
                          <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradient}`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          {isSelected && !isCurrent && <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                        </div>
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
                        <p className="text-base font-extrabold text-slate-900">{p.price === 0 ? "Free" : `${CURRENCY.symbol}${p.price.toLocaleString()}/mo`}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatLimit(p.limits.maxAgents)} collectors · {formatLimit(p.limits.maxCustomers)} customers</p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-end gap-3">
                  <button onClick={() => setShowUpgrade(false)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-all">Cancel</button>
                  <button
                    onClick={() => { if (upgradePlanIsFree) handleUpgrade(); else setUpgradeStep("payment"); }}
                    disabled={upgradePlan === currentPlanId || processing}
                    className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white px-6 py-2.5 text-sm font-bold shadow-sm transition-all disabled:opacity-50"
                  >
                    {processing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</> : upgradePlanIsFree ? "Activate Free Plan" : <>Continue <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${upgradePlanData.gradient}`}>
                    <upgradePlanData.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">{upgradePlanData.name} Plan</p>
                    <p className="text-xs text-slate-500">Monthly billing</p>
                  </div>
                  <p className="text-base font-extrabold text-slate-900">{CURRENCY.symbol}{upgradePlanData.price.toLocaleString()}/mo</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Card Holder Name</label>
                    <input type="text" value={cardHolder} onChange={(e) => { setCardHolder(e.target.value); setErrors(er => ({...er, cardHolder: ""})); }} placeholder="Name on card" className={`w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${errors.cardHolder ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`} />
                    {errors.cardHolder && <p className="mt-1 text-xs text-red-500">{errors.cardHolder}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Card Number</label>
                    <input type="text" value={cardNumber} onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setErrors(er => ({...er, cardNumber: ""})); }} placeholder="1234 5678 9012 3456" maxLength={19} className={`w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.cardNumber ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`} />
                    {errors.cardNumber && <p className="mt-1 text-xs text-red-500">{errors.cardNumber}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expiry</label>
                      <input type="text" value={expiry} onChange={(e) => { setExpiry(formatExpiry(e.target.value)); setErrors(er => ({...er, expiry: ""})); }} placeholder="MM/YY" maxLength={5} className={`w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.expiry ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`} />
                      {errors.expiry && <p className="mt-1 text-xs text-red-500">{errors.expiry}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CVV</label>
                      <input type="password" value={cvv} onChange={(e) => { setCvv(e.target.value.replace(/\D/g,"").substring(0,4)); setErrors(er => ({...er, cvv: ""})); }} placeholder="•••" maxLength={4} className={`w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.cvv ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`} />
                      {errors.cvv && <p className="mt-1 text-xs text-red-500">{errors.cvv}</p>}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-slate-500">Demo payment — no real charges are made.</p>
                </div>

                <div className="mt-5 flex justify-between">
                  <button onClick={() => setUpgradeStep("plan")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-semibold px-3 py-2">← Back</button>
                  <button onClick={handleUpgrade} disabled={processing} className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${upgradePlanData.gradient} text-white px-6 py-2.5 text-sm font-bold shadow transition-all disabled:opacity-70`}>
                    {processing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</> : <><CreditCard className="w-4 h-4" />Pay & Activate</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

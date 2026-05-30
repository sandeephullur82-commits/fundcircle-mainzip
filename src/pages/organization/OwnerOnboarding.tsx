import React, { useState, useRef } from "react";
import { useOrganizationList, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import { setCached } from "@/lib/authCache";
import { toast } from "sonner";
import {
  Building2, Phone, MapPin, ArrowRight, ArrowLeft,
  CreditCard, Check, Zap, TrendingUp, Crown, Shield,
  Sparkles, Loader2, IndianRupee, Users, User, Globe,
} from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";

const CURRENCY = { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" };

type PlanId = "free" | "starter" | "growth" | "enterprise";

interface Plan {
  id: PlanId;
  name: string;
  price: number;
  color: string;
  gradient: string;
  borderActive: string;
  icon: React.ElementType;
  popular?: boolean;
  limits: { maxAgents: number; maxCustomers: number; maxCollectionsPerMonth: number };
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    color: "slate",
    gradient: "from-slate-400 to-slate-500",
    borderActive: "border-slate-400 ring-slate-200",
    icon: Sparkles,
    limits: { maxAgents: 1, maxCustomers: 10, maxCollectionsPerMonth: 250 },
    features: ["1 Pigmy Collector", "10 Customers", "250 Collections/month", "Basic analytics", "FundCircle branding"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 999,
    color: "sky",
    gradient: "from-sky-500 to-blue-500",
    borderActive: "border-sky-400 ring-sky-200",
    icon: Zap,
    limits: { maxAgents: 5, maxCustomers: 100, maxCollectionsPerMonth: 1000 },
    features: ["5 Pigmy Collectors", "100 Customers", "1,000 Collections/month", "Advanced analytics", "Priority email support"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 4999,
    color: "violet",
    gradient: "from-violet-500 to-fuchsia-500",
    borderActive: "border-violet-400 ring-violet-200",
    icon: TrendingUp,
    popular: true,
    limits: { maxAgents: 25, maxCustomers: 500, maxCollectionsPerMonth: 10000 },
    features: ["25 Pigmy Collectors", "500 Customers", "10,000 Collections/month", "Full analytics suite", "Loan & EMI management", "SMS notifications"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 14999,
    color: "amber",
    gradient: "from-amber-500 to-orange-500",
    borderActive: "border-amber-400 ring-amber-200",
    icon: Crown,
    limits: { maxAgents: 50, maxCustomers: 5000, maxCollectionsPerMonth: 50000 },
    features: ["50 Pigmy Collectors", "5,000 Customers", "50,000 Collections/month", "Full analytics suite", "Custom integrations", "Dedicated account manager"],
  },
];

function generateInvoiceNumber() {
  const now = new Date();
  return `FC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").substring(0, 28) + "-" + Math.random().toString(36).substring(2, 6);
}

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").substring(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").substring(0, 4);
  if (digits.length >= 3) return digits.substring(0, 2) + "/" + digits.substring(2);
  return digits;
}

function formatLimit(val: number) {
  return val === -1 ? "Unlimited" : val.toLocaleString();
}

export default function OwnerOnboarding() {
  const { user } = useUser();
  const { isLoaded, createOrganization, setActive, userMemberships } = useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();

  const [step, setStep] = useState(0);

  // success MUST be declared before the useEffect that references it
  const [success, setSuccess] = useState(false);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If user already owns an org (and we're not mid-creation), block further creation
  const alreadyOwnsOrg = isLoaded && !success && (userMemberships?.data || []).some(
    (m: any) => m.role === "org:admin" || m.role === "org:owner"
  );
  const existingOwnerOrgName = alreadyOwnsOrg
    ? (userMemberships?.data?.find((m: any) => m.role === "org:admin" || m.role === "org:owner") as any)?.organization?.name || "your organization"
    : null;

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const [orgName, setOrgName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("growth");

  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const plan = PLANS.find((p) => p.id === selectedPlan)!;
  const isFree = selectedPlan === "free";
  const STEPS = isFree ? ["Organization", "Plan"] : ["Organization", "Plan", "Payment"];
  const totalSteps = STEPS.length;

  const isValidIndianPhone = (p: string) => /^[6-9]\d{9}$/.test(p);

  const validateStep0 = () => {
    const errs: Record<string, string> = {};
    if (!orgName.trim()) errs.orgName = "Organization name is required.";
    else if (orgName.trim().length < 3) errs.orgName = "Must be at least 3 characters.";
    else if (orgName.trim().length > 100) errs.orgName = "Must be 100 characters or fewer.";
    if (!phone) errs.phone = "Phone number is required.";
    else if (!isValidIndianPhone(phone)) errs.phone = "Enter a valid 10-digit Indian mobile number (starting with 6–9).";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!cardHolder.trim()) errs.cardHolder = "Card holder name is required.";
    const rawCard = cardNumber.replace(/\s/g, "");
    if (!rawCard || rawCard.length !== 16) errs.cardNumber = "Enter a valid 16-digit card number.";
    if (!expiry || !expiry.includes("/")) errs.expiry = "Enter a valid expiry (MM/YY).";
    if (!cvv || cvv.length < 3) errs.cvv = "Enter a valid CVV.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep0()) return;
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const getEffectiveName = () =>
    ownerName.trim() || user?.fullName || `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

  const createOrgInFirestore = async (orgId: string) => {
    await setDoc(doc(db, "organizations", orgId), {
      id: orgId,
      organizationId: orgId,
      name: orgName.trim(),
      ownerName: getEffectiveName(),
      slug: "",
      phone: phone.trim(),
      address: address.trim(),
      currency: CURRENCY.code,
      ownerClerkUserId: user!.id,
      ownerEmail: user!.primaryEmailAddress?.emailAddress || "",
      plan: selectedPlan,
      limits: plan.limits,
      usage: { activeAgents: 0, activeCustomers: 0, collectionsThisMonth: 0 },
      subscriptionStatus: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const createMembershipInFirestore = async (orgId: string) => {
    const membershipDocId = membershipIdFor(orgId, user!.id);
    const name = getEffectiveName();
    const membershipData = {
      id: membershipDocId,
      organizationId: orgId,
      clerkUserId: user!.id,
      clerkRole: "org:owner",
      role: "OWNER",
      organizationName: orgName.trim(),
      fullName: name,
      name,
      email: user!.primaryEmailAddress?.emailAddress || "",
      phone: phone.trim(),
      status: "ACTIVE",
      profileCompleted: true,
      actsAsAgent: true,
      collectorEnabled: true,
      assignedArea: "Main Area",
      joinedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "organizationMembers", membershipDocId), membershipData, { merge: true });
    await setDoc(doc(db, "memberships", membershipDocId), membershipData, { merge: true });
    await setDoc(doc(db, "users", user!.id), {
      id: user!.id,
      name,
      email: user!.primaryEmailAddress?.emailAddress || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const doNavigateToDashboard = (orgId: string) => {
    sessionStorage.setItem("fc_onboarding_org_id", orgId);
    // Navigate directly to /dashboard/owner — avoids a Firestore re-read in RoleRouter
    // that can timeout right after org creation. RoleProtectedRoute handles Clerk role fallback.
    console.log("[FC Onboarding] Organization Created — redirecting to /dashboard/owner, org:", orgId);
    navigate("/dashboard/owner", { replace: true, state: { orgId } });
  };

  const handleLaunchFree = async () => {
    if (!isLoaded || !createOrganization || !user) {
      toast.error("Please wait while we load your account.");
      return;
    }
    setProcessing(true);
    try {
      console.log("[FC Onboarding] Step 1: Creating Clerk organization…");
      const slug = slugify(orgName);
      const org = await createOrganization({ name: orgName.trim(), slug });
      console.log("[FC Onboarding] Step 1 ✓ Clerk org created:", org.id);

      console.log("[FC Onboarding] Step 2: Writing Firestore organization doc…");
      await createOrgInFirestore(org.id);
      console.log("[FC Onboarding] Step 2 ✓ organizations/{id} written");

      console.log("[FC Onboarding] Step 3: Writing membership + user docs…");
      await createMembershipInFirestore(org.id);
      console.log("[FC Onboarding] Step 3 ✓ organizationMembers + users written");

      // Pre-cache the owner role (keyed per-org) so the timeout fallback in
      // RoleProtectedRoute resolves instantly instead of waiting the full 5 s.
      setCached(`role_${user.id}_${org.id}`, "org:owner");
      console.log("[FC Onboarding] Role cached for instant fallback");

      console.log("[FC Onboarding] Step 4: Writing subscription doc…");
      const subRef = doc(collection(db, "subscriptions"));
      await setDoc(subRef, {
        id: subRef.id,
        organizationId: org.id,
        plan: "free",
        billingCycle: "free",
        amount: 0,
        currency: CURRENCY.code,
        status: "active",
        startedAt: serverTimestamp(),
        expiresAt: null,
        createdAt: serverTimestamp(),
      });
      console.log("[FC Onboarding] Step 4 ✓ subscriptions/{id} written");

      console.log("[FC Onboarding] Step 5: Setting Clerk active organization…");
      if (setActive) await setActive({ organization: org.id });
      console.log("[FC Onboarding] Step 5 ✓ Clerk active org set");

      setCreatedOrgId(org.id);
      setSuccess(true);
      console.log("[FC Onboarding] ✓ All steps complete — showing success screen");

      // Schedule auto-redirect; use a ref so we can clear it on manual click
      successTimerRef.current = setTimeout(() => {
        console.log("[FC Onboarding] Auto-redirecting to dashboard…");
        doNavigateToDashboard(org.id);
      }, 1500);
    } catch (err: any) {
      console.error("[FC Onboarding] Error:", err);
      toast.error(err?.errors?.[0]?.message || err?.message || "Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handlePayAndLaunch = async () => {
    if (!validateStep2()) return;
    if (!isLoaded || !createOrganization || !user) {
      toast.error("Please wait while we load your account.");
      return;
    }
    setProcessing(true);
    try {
      // Simulate payment processing
      await new Promise((r) => setTimeout(r, 1500));

      console.log("[FC Onboarding] Step 1: Creating Clerk organization…");
      const slug = slugify(orgName);
      const org = await createOrganization({ name: orgName.trim(), slug });
      console.log("[FC Onboarding] Step 1 ✓ Clerk org created:", org.id);

      console.log("[FC Onboarding] Step 2: Writing Firestore organization doc…");
      await createOrgInFirestore(org.id);
      console.log("[FC Onboarding] Step 2 ✓ organizations/{id} written");

      console.log("[FC Onboarding] Step 3: Writing membership + user docs…");
      await createMembershipInFirestore(org.id);
      console.log("[FC Onboarding] Step 3 ✓ organizationMembers + users written");

      setCached(`role_${user.id}_${org.id}`, "org:owner");
      console.log("[FC Onboarding] Role cached for instant fallback");

      console.log("[FC Onboarding] Step 4: Writing subscription + payment docs…");
      const invoiceNumber = generateInvoiceNumber();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      const subRef = doc(collection(db, "subscriptions"));
      await setDoc(subRef, {
        id: subRef.id,
        organizationId: org.id,
        plan: selectedPlan,
        planName: plan.name,
        billingCycle: "monthly",
        amount: plan.price,
        currency: CURRENCY.code,
        status: "active",
        startedAt: serverTimestamp(),
        expiresAt: expiresAt.getTime(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const payRef = doc(collection(db, "payments"));
      await setDoc(payRef, {
        id: payRef.id,
        organizationId: org.id,
        subscriptionId: subRef.id,
        amount: plan.price,
        currency: CURRENCY.code,
        billingCycle: "monthly",
        paymentStatus: "success",
        invoiceNumber,
        cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
        planName: plan.name,
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      console.log("[FC Onboarding] Step 4 ✓ subscription + payment written");

      console.log("[FC Onboarding] Step 5: Setting Clerk active organization…");
      if (setActive) await setActive({ organization: org.id });
      console.log("[FC Onboarding] Step 5 ✓ Clerk active org set");

      setCreatedOrgId(org.id);
      setSuccess(true);
      console.log("[FC Onboarding] ✓ All steps complete — showing success screen");

      successTimerRef.current = setTimeout(() => {
        console.log("[FC Onboarding] Auto-redirecting to dashboard…");
        doNavigateToDashboard(org.id);
      }, 1500);
    } catch (err: any) {
      console.error("[FC Onboarding] Error:", err);
      toast.error(err?.errors?.[0]?.message || err?.message || "Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-sm text-slate-500">Loading your account…</p>
        </div>
      </div>
    );
  }

  if (alreadyOwnsOrg) {
    const existingOrgId = (userMemberships?.data?.find((m: any) => m.role === "org:admin" || m.role === "org:owner") as any)?.organization?.id;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-8 shadow-xl space-y-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">You already own an organization</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Each owner account can only manage one organization.
            </p>
          </div>
          {existingOwnerOrgName && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200/70 rounded-2xl text-left">
              <div className="w-9 h-9 rounded-xl bg-amber-200/60 flex items-center justify-center shrink-0">
                <Building2 className="w-4.5 h-4.5 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{existingOwnerOrgName}</p>
                <p className="text-xs text-slate-500 mt-0.5">Your active organization</p>
              </div>
            </div>
          )}
          <button
            onClick={() => navigate("/dashboard/owner", { replace: true, state: { orgId: existingOrgId } })}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-violet-50/20">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-100px] top-[-60px] h-80 w-80 rounded-full bg-sky-200/40 blur-[120px]" />
        <div className="absolute right-[-80px] bottom-[-60px] h-96 w-96 rounded-full bg-violet-200/30 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <BrandMark />
              <p className="text-xs text-slate-400 font-medium mt-0.5">Organization Setup</p>
            </div>
            {/* Step Indicator */}
            <div className="hidden sm:flex items-center gap-2">
              {STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      i < step ? "bg-emerald-500 text-white" :
                      i === step ? "bg-sky-500 text-white shadow-md shadow-sky-300/40" :
                      "bg-slate-200 text-slate-400"
                    }`}>
                      {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === step ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-px w-8 transition-all ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* Mobile step badge */}
            <div className="sm:hidden">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                step === 0 ? "bg-sky-100 text-sky-700" : step === 1 ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
              }`}>
                {STEPS[step]} ({step + 1}/{totalSteps})
              </span>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-emerald-200 bg-white p-10 text-center shadow-2xl shadow-emerald-200/30"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Organization Created!</h2>
              <p className="text-slate-500 text-sm mb-1">
                {isFree ? "Your free workspace is live." : `${plan.name} plan activated.`}
              </p>
              <p className="text-slate-400 text-xs mt-1">Redirecting to your dashboard…</p>
              <div className="flex flex-col items-center gap-3 mt-5">
                <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />
                {createdOrgId && (
                  <button
                    onClick={() => {
                      if (successTimerRef.current) clearTimeout(successTimerRef.current);
                      doNavigateToDashboard(createdOrgId);
                    }}
                    className="text-xs text-sky-600 hover:text-sky-700 underline underline-offset-2 transition-colors"
                  >
                    Go to dashboard now
                  </button>
                )}
              </div>
            </motion.div>

          ) : step === 0 ? (
            /* ─── STEP 0: Organization Details ─── */
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xl shadow-slate-200/40"
            >
              <div className="mb-7">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1 text-xs font-bold text-sky-600 mb-3">
                  <Building2 className="w-3.5 h-3.5" /> Step 1 of {totalSteps}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Tell us about your organization</h1>
                <p className="text-sm text-slate-500 mt-1">This information will appear on your reports and invoices.</p>
              </div>

              <div className="space-y-5">
                {/* Owner Name — read-only from Clerk */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Owner Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <div className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-700 font-medium select-none cursor-default">
                      {user?.fullName || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "—"}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
                    <Shield className="w-3 h-3 shrink-0" /> Synced from your account
                  </p>
                </div>

                {/* Org Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={orgName}
                      maxLength={100}
                      onChange={(e) => { setOrgName(e.target.value); setErrors((er) => ({ ...er, orgName: "" })); }}
                      placeholder="e.g. Mandya Pigmy Cooperative Bank"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${errors.orgName ? "border-red-400 focus:ring-red-200 focus:border-red-400" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                    />
                  </div>
                  {errors.orgName
                    ? <p className="mt-1.5 text-xs font-medium text-red-500">{errors.orgName}</p>
                    : <p className="mt-1.5 text-xs text-slate-400">3–100 characters required.</p>
                  }
                </div>

                {/* Phone — required, Indian mobile */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <span className="absolute left-10 top-3 text-sm text-slate-400 font-medium select-none pointer-events-none">+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").substring(0, 10);
                        setPhone(digits);
                        setErrors((er) => ({ ...er, phone: "" }));
                      }}
                      placeholder="9876543210"
                      maxLength={10}
                      inputMode="numeric"
                      className={`w-full pl-[4.5rem] pr-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${errors.phone ? "border-red-400 focus:ring-red-200 focus:border-red-400" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                    />
                  </div>
                  {errors.phone
                    ? <p className="mt-1.5 text-xs font-medium text-red-500">{errors.phone}</p>
                    : <p className="mt-1.5 text-xs text-slate-400">10-digit Indian mobile number (starts with 6–9).</p>
                  }
                </div>

                {/* Address — optional */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Address <span className="text-slate-400 font-normal normal-case">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main Street, Mandya, Karnataka"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-200 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Currency — fixed read-only */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Currency</label>
                  <div className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 select-none cursor-default">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-extrabold text-base shrink-0">₹</span>
                    <span className="text-sm font-semibold text-slate-700">Indian Rupee (INR)</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200 rounded px-1.5 py-0.5">Fixed</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                {(() => {
                  const step0Valid =
                    orgName.trim().length >= 3 &&
                    orgName.trim().length <= 100 &&
                    isValidIndianPhone(phone);
                  return (
                    <button
                      onClick={handleNext}
                      disabled={!step0Valid}
                      className={`flex items-center gap-2 rounded-xl text-white px-6 py-3 text-sm font-bold shadow-md transition-all active:scale-[0.98] ${
                        step0Valid
                          ? "bg-sky-500 hover:bg-sky-600 shadow-sky-300/40 cursor-pointer"
                          : "bg-slate-300 shadow-none cursor-not-allowed opacity-60"
                      }`}
                    >
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  );
                })()}
              </div>
            </motion.div>

          ) : step === 1 ? (
            /* ─── STEP 1: Plan Selection ─── */
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xl shadow-slate-200/40"
            >
              <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600 mb-3">
                  <IndianRupee className="w-3.5 h-3.5" /> Step 2 of {totalSteps}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Choose your plan</h1>
                <p className="text-sm text-slate-500 mt-1">All plans include the same features — only usage limits differ.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {PLANS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = selectedPlan === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlan(p.id)}
                      className={`relative text-left rounded-2xl border-2 p-4 transition-all ${
                        isSelected
                          ? `${p.borderActive} bg-white ring-2 shadow-md`
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      {p.popular && (
                        <span className="absolute -top-2.5 left-4 rounded-full bg-violet-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow">
                          Most Popular
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradient} shadow-sm`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900">{p.name}</p>
                      <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                        {p.price === 0 ? "Free" : <>{CURRENCY.symbol}{p.price.toLocaleString()}<span className="text-xs font-normal text-slate-400">/mo</span></>}
                      </p>
                      <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5"><Users className="w-3 h-3 shrink-0" />{formatLimit(p.limits.maxAgents)} Collectors</div>
                        <div className="flex items-center gap-1.5"><User className="w-3 h-3 shrink-0" />{formatLimit(p.limits.maxCustomers)} Customers</div>
                        <div className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 shrink-0" />{formatLimit(p.limits.maxCollectionsPerMonth)} Collections/mo</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-between items-center">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 px-5 py-3 text-sm font-semibold transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={isFree ? handleLaunchFree : handleNext}
                  disabled={processing}
                  className={`flex items-center gap-2 rounded-xl text-white px-6 py-3 text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-70 ${
                    isFree
                      ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-300/40"
                      : "bg-sky-500 hover:bg-sky-600 shadow-sky-300/40"
                  }`}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                  ) : isFree ? (
                    <><Sparkles className="w-4 h-4" /> Launch for Free</>
                  ) : (
                    <>Continue to Payment <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </motion.div>

          ) : (
            /* ─── STEP 2: Payment ─── */
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xl shadow-slate-200/40"
            >
              <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600 mb-3">
                  <CreditCard className="w-3.5 h-3.5" /> Step 3 of 3
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Payment Details</h1>
                <p className="text-sm text-slate-500 mt-1">Demo payment system — no real charges are made.</p>
              </div>

              {/* Selected plan summary */}
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-4">
                <BrandMark size="xs" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{orgName}</p>
                  <p className="text-xs text-slate-500">{plan.name} Plan · Monthly billing</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold text-slate-900">{CURRENCY.symbol}{plan.price.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">/month</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Card Holder Name</label>
                  <input
                    type="text"
                    value={cardHolder}
                    onChange={(e) => { setCardHolder(e.target.value); setErrors((er) => ({ ...er, cardHolder: "" })); }}
                    placeholder="Name on card"
                    className={`w-full px-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${errors.cardHolder ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                  />
                  {errors.cardHolder && <p className="mt-1 text-xs text-red-500">{errors.cardHolder}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Card Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setErrors((er) => ({ ...er, cardNumber: "" })); }}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.cardNumber ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                    />
                  </div>
                  {errors.cardNumber && <p className="mt-1 text-xs text-red-500">{errors.cardNumber}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expiry Date</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => { setExpiry(formatExpiry(e.target.value)); setErrors((er) => ({ ...er, expiry: "" })); }}
                      placeholder="MM/YY"
                      maxLength={5}
                      className={`w-full px-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.expiry ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                    />
                    {errors.expiry && <p className="mt-1 text-xs text-red-500">{errors.expiry}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CVV</label>
                    <input
                      type="password"
                      value={cvv}
                      onChange={(e) => { setCvv(e.target.value.replace(/\D/g, "").substring(0, 4)); setErrors((er) => ({ ...er, cvv: "" })); }}
                      placeholder="•••"
                      maxLength={4}
                      className={`w-full px-4 py-3 rounded-xl border text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${errors.cvv ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-sky-200 focus:border-sky-400"}`}
                    />
                    {errors.cvv && <p className="mt-1 text-xs text-red-500">{errors.cvv}</p>}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
                <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-slate-500">This is a demo payment system. No real charges are made.</p>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={handleBack}
                  disabled={processing}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handlePayAndLaunch}
                  disabled={processing}
                  className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${plan.gradient} text-white px-7 py-3 text-sm font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed`}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  ) : (
                    <><Check className="w-4 h-4" /> Pay {CURRENCY.symbol}{plan.price.toLocaleString()} & Launch</>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Secured by Clerk Auth</span>
          <span className="flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" /> Demo payment system</span>
          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Multi-tenant isolation</span>
        </div>
      </div>
    </div>
  );
}

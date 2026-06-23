import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { BrandMark } from "@/components/BrandLogo";
import {
  Building2,
  Users,
  Wallet,
  BarChart3,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Layers,
  Lock,
  Clock3,
  Globe,
  Database,
  Check,
  IndianRupee,
  Zap,
  Bell,
  FileText,
  TrendingUp,
  Star,
  Menu,
  X,
} from "lucide-react";

const featureItems = [
  { title: "Real-time Collection Tracking", icon: BarChart3, desc: "Live Firestore sync across all devices instantly." },
  { title: "Multi-Tenant Organizations", icon: Layers, desc: "Isolated workspaces with full data separation." },
  { title: "Enterprise Authentication", icon: ShieldCheck, desc: "Enterprise-grade auth with OTP verification and direct account creation." },
  { title: "Firestore Realtime Sync", icon: Database, desc: "Every action updates dashboards instantly." },
  { title: "Agent Management", icon: Users, desc: "Add, track, and manage field collectors." },
  { title: "Customer Wallet Tracking", icon: Wallet, desc: "Savings history and balance at a glance." },
  { title: "Daily Analytics", icon: Sparkles, desc: "Smart daily and monthly collection reports." },
  { title: "Mobile Friendly", icon: Globe, desc: "Works perfectly on any device, anywhere." },
  { title: "Offline Ready", icon: Clock3, desc: "Continues working even without connectivity." },
];

const workflowSteps = [
  { label: "Organization Registration", desc: "Owner registers publicly and creates their organization." },
  { label: "Add Agents", desc: "Owner adds pigmy collectors directly to the organization." },
  { label: "Add Customers", desc: "Onboard savings customers instantly — no invite link needed." },
  { label: "Daily Collections", desc: "Agents collect daily savings and record transactions." },
  { label: "Realtime Sync", desc: "Firestore instantly syncs all dashboards." },
  { label: "Analytics Dashboard", desc: "Track trends, balances, and performance." },
  { label: "Settlement Reports", desc: "Export daily and monthly CSV reports." },
];

const trustMetrics = [
  { label: "Organizations", value: "1.2K+" },
  { label: "Agents", value: "8.4K+" },
  { label: "Collections", value: "95K+" },
  { label: "Transactions", value: "420K+" },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    desc: "Perfect for small chit fund groups getting started.",
    highlight: false,
    features: [
      "1 Organization",
      "Up to 5 Pigmy Collectors",
      "Up to 50 Customers",
      "Realtime Firestore sync",
      "Basic analytics",
      "CSV reports",
    ],
    cta: "Get Started Free",
  },
  {
    name: "Growth",
    price: "₹999",
    period: "/month",
    desc: "For growing pigmy collection businesses.",
    highlight: true,
    features: [
      "1 Organization",
      "Up to 25 Pigmy Collectors",
      "Up to 500 Customers",
      "Realtime Firestore sync",
      "Advanced analytics",
      "CSV + Excel exports",
      "Loan & EMI management",
      "Priority support",
    ],
    cta: "Start Free Trial",
  },
  {
    name: "Enterprise",
    price: "₹4,999",
    period: "/month",
    desc: "For large cooperative banks and NBFCs.",
    highlight: false,
    features: [
      "Unlimited Organizations",
      "Unlimited Collectors",
      "Unlimited Customers",
      "Realtime Firestore sync",
      "Full analytics suite",
      "All export formats",
      "Loan & EMI management",
      "Notifications system",
      "Dedicated support",
      "Custom integrations",
    ],
    cta: "Contact Sales",
  },
];

const LANDING_NAV = [
  { label: "Features", id: "features" },
  { label: "Workflow", id: "workflow" },
  { label: "Pricing", id: "pricing" },
  { label: "Contact", id: "contact" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LandingNavbar({
  onSignIn,
  onSignUp,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-slate-900/85 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20"
          : "bg-white/90 backdrop-blur-xl border-b border-slate-200/80"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <button onClick={() => scrollTo("hero")} className="flex items-center focus:outline-none">
          <BrandMark />
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {LANDING_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                scrolled
                  ? "text-slate-300 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={onSignIn}
            className={`hidden sm:block rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              scrolled
                ? "border-white/20 text-slate-200 hover:bg-white/10"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={onSignUp}
            className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-300/30 transition hover:brightness-110 flex items-center gap-1.5"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className={`md:hidden rounded-lg p-2 transition-colors duration-200 ${
              scrolled ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
            }`}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={`md:hidden overflow-hidden border-t ${
              scrolled ? "bg-slate-900/95 border-white/10" : "bg-white border-slate-100"
            }`}
          >
            <nav className="flex flex-col gap-1 px-4 pb-4 pt-2">
              {LANDING_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { scrollTo(item.id); setMobileOpen(false); }}
                  className={`rounded-lg px-3.5 py-2.5 text-sm font-medium text-left transition-colors ${
                    scrolled ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => { onSignIn(); setMobileOpen(false); }}
                className={`mt-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold text-center transition-colors ${
                  scrolled ? "border-white/20 text-slate-200" : "border-slate-200 text-slate-700"
                }`}
              >
                Sign In
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  const handleNavbarSignIn = () => navigate("/workspace-selection");
  const handleSignupIntent = () => navigate("/auth/sign-up");

  const handleRoleCardOwnerLogin = () => {
    localStorage.setItem("preferredLoginRole", "owner");
    navigate("/auth/sign-in");
  };
  const handleRoleCardAgentLogin = () => {
    localStorage.setItem("preferredLoginRole", "pigmy_collector");
    navigate("/auth/sign-in");
  };
  const handleRoleCardCustomerLogin = () => {
    localStorage.setItem("preferredLoginRole", "customer");
    navigate("/auth/sign-in");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 overflow-x-hidden">
      <LandingNavbar onSignIn={handleNavbarSignIn} onSignUp={handleSignupIntent} />

      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[700px] overflow-hidden">
        <div className="absolute left-[-140px] top-10 h-72 w-72 rounded-full bg-sky-200/50 blur-[130px]" />
        <div className="absolute right-[-120px] top-32 h-80 w-80 rounded-full bg-violet-200/50 blur-[150px]" />
        <div className="absolute left-[35%] top-16 h-72 w-72 rounded-full bg-indigo-100/80 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col gap-16 md:gap-24 px-4 pb-10 pt-20 sm:pt-24 sm:px-6 lg:px-10">
        <main id="hero" className="relative z-10 flex flex-col gap-16 md:gap-24 scroll-mt-24">
          {/* Hero */}
          <section className="grid gap-8 md:gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              className="space-y-6 md:space-y-8"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm text-sky-700 font-medium">
                <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                Premium workflow for modern pigmy collections
              </div>

              <div className="max-w-2xl space-y-4 md:space-y-5">
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem] leading-[1.1]">
                  Modern Pigmy Collection Platform for{" "}
                  <span className="bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
                    Financial Organizations
                  </span>
                </h1>
                <p className="text-base md:text-lg leading-7 md:leading-8 text-slate-600">
                  Manage pigmy collections, customers, collectors, analytics, and savings operations in one realtime platform.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={handleSignupIntent}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-7 py-3.5 md:px-8 md:py-4 text-base font-semibold text-white shadow-lg shadow-sky-200/50 transition hover:brightness-110"
                >
                  Start Free Trial
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNavbarSignIn}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-7 py-3.5 md:px-8 md:py-4 text-base font-semibold text-slate-950 transition hover:bg-slate-50"
                >
                  Sign In
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 md:gap-4">
                {[
                  { label: "Realtime stats", value: "99.9% uptime" },
                  { label: "Collection speed", value: "+42%" },
                  { label: "Active agents", value: "8.4k+" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl md:rounded-2xl border border-slate-200 bg-white px-3 py-3 md:px-5 md:py-4 shadow-sm">
                    <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-slate-500 leading-tight">{item.label}</p>
                    <p className="mt-1.5 md:mt-2 text-base md:text-xl font-bold text-slate-950">{item.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Dashboard Mockup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              className="relative mx-auto w-full max-w-xl"
            >
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-violet-100 blur-3xl opacity-60" />
              <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/60">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">FundCircle Dashboard</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">Collection Performance</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  {[
                    { label: "Today's Collection", value: "₹62,400", color: "text-emerald-600" },
                    { label: "Active Customers", value: "248", color: "text-sky-600" },
                    { label: "Pending Visits", value: "14", color: "text-orange-500" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl bg-slate-50 px-4 py-4 border border-slate-100">
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className={`mt-1.5 text-xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 border border-slate-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-600">Collection Graph</p>
                    <span className="text-xs font-bold text-sky-600">+24% vs last week</span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {[40, 65, 45, 80, 60, 90, 75].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-sky-400 to-violet-400 opacity-70"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    { name: "Rajan Kumar", area: "Sector 4", amount: "₹500", time: "2m ago" },
                    { name: "Priya Devi", area: "Sector 7", amount: "₹300", time: "5m ago" },
                    { name: "Suresh Bhat", area: "Sector 2", amount: "₹750", time: "12m ago" },
                  ].map((r) => (
                    <div key={r.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 border border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-violet-400 flex items-center justify-center text-white text-xs font-bold">
                          {r.name[0]}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.area} · {r.time}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-600">+{r.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </section>

          {/* Role Cards */}
          <section id="roles" className="space-y-10 scroll-mt-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Choose Your Workspace</p>
              <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Select the role that fits your team.</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                FundCircle uses a unified enterprise authentication gateway for all roles. Every workspace is secured, isolated, and realtime-synced.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  role: "owner",
                  title: "Owner",
                  subtitle: "Organization Management Portal",
                  description: "Manage pigmy collectors, customers, savings collections, analytics, and organization operations.",
                  icon: Building2,
                  gradient: "from-sky-500 to-blue-400",
                  loginLabel: "Owner Login",
                  onLogin: handleRoleCardOwnerLogin,
                  registerLabel: "Register Organization",
                  onRegister: handleSignupIntent,
                },
                {
                  role: "pigmy_collector",
                  title: "Pigmy Collector",
                  subtitle: "Field Collection Workspace",
                  description: "Track customer collections, daily visits, pending payments, and assigned collection areas.",
                  icon: Users,
                  gradient: "from-indigo-500 to-violet-400",
                  loginLabel: "Pigmy Collector Login",
                  onLogin: handleRoleCardAgentLogin,
                },
                {
                  role: "customer",
                  title: "Customer",
                  subtitle: "Customer Savings Portal",
                  description: "Track savings history, payment records, daily collections, and financial progress.",
                  icon: Wallet,
                  gradient: "from-violet-500 to-fuchsia-400",
                  loginLabel: "Customer Login",
                  onLogin: handleRoleCardCustomerLogin,
                },
              ].map((card) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40 transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.gradient}`} />
                  <div className="relative flex h-full flex-col gap-5">
                    <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${card.gradient} text-white shadow-lg`}>
                      <card.icon className="h-7 w-7" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-slate-950">{card.title}</h3>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{card.subtitle}</p>
                      <p className="text-sm leading-6 text-slate-600">{card.description}</p>
                    </div>
                    <div className="mt-auto flex flex-col gap-3">
                      <button
                        onClick={card.onLogin}
                        className={`inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r ${card.gradient} px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110`}
                      >
                        {card.loginLabel}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      {card.registerLabel && card.onRegister && (
                        <button
                          onClick={card.onRegister}
                          className="inline-flex justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          {card.registerLabel}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Features */}
          <section id="features" className="space-y-6 md:space-y-10 scroll-mt-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Features</p>
              <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl md:text-4xl">Everything your finance team needs to move faster.</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
              {featureItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.45, delay: index * 0.05 }}
                    className="rounded-2xl md:rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6 shadow-lg shadow-slate-200/40 transition hover:-translate-y-1 hover:shadow-xl flex gap-4 md:block"
                  >
                    <div className="md:mb-4 inline-flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl bg-sky-50 text-sky-600 shrink-0 self-start">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-950 mb-1">{item.title}</h3>
                      <p className="text-xs md:text-sm text-slate-500 leading-5 md:leading-6">{item.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Analytics Preview */}
          <section id="analytics" className="scroll-mt-24 rounded-[2.5rem] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-8 md:p-12 shadow-2xl">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-400">Analytics Preview</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">Realtime insights for every collection.</h2>
                <p className="text-base leading-7 text-slate-400">
                  Every collection, every agent visit, every customer payment — all reflected instantly in your analytics dashboard powered by Firestore onSnapshot listeners.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { label: "Firestore onSnapshot", icon: Zap, desc: "Zero-latency realtime updates" },
                    { label: "Agent Leaderboard", icon: TrendingUp, desc: "Track top performers" },
                    { label: "Daily Reports", icon: FileText, desc: "Auto-generated collection logs" },
                    { label: "Smart Notifications", icon: Bell, desc: "Instant alerts for key events" },
                  ].map((f) => (
                    <div key={f.label} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 border border-white/10">
                      <f.icon className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">{f.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[2rem] bg-white/5 border border-white/10 p-6 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Live Collection Feed</p>
                {[
                  { name: "Kavitha S.", area: "MG Road", amount: "₹500", agent: "Ramu K.", time: "Just now", color: "bg-emerald-400" },
                  { name: "Dinesh P.", area: "JP Nagar", amount: "₹300", agent: "Suresh B.", time: "2m ago", color: "bg-sky-400" },
                  { name: "Meena R.", area: "Koramangala", amount: "₹1,000", agent: "Raju L.", time: "5m ago", color: "bg-violet-400" },
                  { name: "Anand K.", area: "Indiranagar", amount: "₹250", agent: "Raj S.", time: "8m ago", color: "bg-orange-400" },
                ].map((item, i) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between rounded-xl bg-white/8 px-4 py-3 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                      <div>
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.area} · by {item.agent}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{item.amount}</p>
                      <p className="text-xs text-slate-500">{item.time}</p>
                    </div>
                  </motion.div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs text-slate-400 font-medium">Syncing via Firestore onSnapshot…</p>
                </div>
              </div>
            </div>
          </section>

          {/* Workflow */}
          <section id="workflow" className="space-y-10 scroll-mt-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Platform Flow</p>
              <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Enterprise workflow designed for daily collections.</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
                <div className="relative pl-8">
                  <div className="absolute left-3 top-4 h-[calc(100%-2rem)] w-0.5 rounded-full bg-slate-100" />
                  {workflowSteps.map((step, index) => (
                    <div key={step.label} className="relative mb-7 flex items-start gap-4 last:mb-0">
                      <div className="relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-200/50">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{step.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">How it works</p>
                  <h3 className="text-xl font-bold text-slate-950 mb-3">Fast onboarding for modern finance teams.</h3>
                  <p className="text-sm leading-7 text-slate-600">
                    From organization setup to agent and customer onboarding, FundCircle keeps every collection step synced in realtime for secure enterprise operations.
                  </p>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  {[
                    { label: "Secure login", icon: Lock },
                    { label: "Realtime sync", icon: Database },
                    { label: "Fast reporting", icon: BarChart3 },
                    { label: "Cloud ready", icon: Globe },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <item.icon className="h-5 w-5 text-sky-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[2rem] bg-gradient-to-br from-sky-50 to-violet-50 border border-sky-100 p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {trustMetrics.map((metric) => (
                      <div key={metric.label} className="text-center">
                        <p className="text-2xl font-bold text-slate-950">{metric.value}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mt-1">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" className="space-y-10 scroll-mt-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Pricing</p>
              <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Simple, transparent pricing.</h2>
              <p className="mt-4 text-base text-slate-600">Start for free. Scale as you grow. No hidden fees.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {pricingPlans.map((plan) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5 }}
                  className={`relative overflow-hidden rounded-[2rem] border p-6 flex flex-col ${
                    plan.highlight
                      ? "border-sky-200 bg-gradient-to-br from-sky-50 to-violet-50 shadow-2xl shadow-sky-200/50"
                      : "border-slate-200 bg-white shadow-lg shadow-slate-200/40"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-500 to-violet-500" />
                  )}
                  {plan.highlight && (
                    <div className="absolute top-4 right-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-2.5 py-1 text-xs font-bold text-white">
                        <Star className="h-3 w-3" /> Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-slate-950">{plan.price}</span>
                      {plan.period && <span className="text-slate-500 text-sm">{plan.period}</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{plan.desc}</p>
                  </div>

                  <ul className="space-y-3 flex-1 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <div className="mt-0.5 h-4 w-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Check className="h-2.5 w-2.5 text-emerald-600" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={handleSignupIntent}
                    className={`mt-auto w-full rounded-full py-3 text-sm font-semibold transition ${
                      plan.highlight
                        ? "bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-md shadow-sky-200/50 hover:brightness-110"
                        : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Security & Trust */}
          <section id="reports" className="space-y-10 scroll-mt-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Security</p>
              <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Built on trusted enterprise security.</h2>
              <p className="mt-4 text-base text-slate-600">
                FundCircle combines enterprise authentication, realtime persistence, and role-based access control to power your financial collection operations at scale.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { title: "Enterprise Authentication", icon: ShieldCheck, desc: "OTP verification, organization management, and custom roles with full security." },
                { title: "Firestore Security Rules", icon: Database, desc: "Multi-tenant data isolation with Firestore security rules per organization." },
                { title: "Role-Based Access", icon: Lock, desc: "Owner, Collector, and Customer roles enforce strict access boundaries." },
              ].map((item) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5 }}
                  className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40"
                >
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 mb-4">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-950 mb-2">{item.title}</h3>
                  <p className="text-sm leading-6 text-slate-600">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section id="contact" className="scroll-mt-24 rounded-[2.5rem] border border-slate-200 bg-gradient-to-br from-slate-50 via-sky-50 to-violet-50 p-8 md:p-12 shadow-xl shadow-slate-200/40">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-3">Get Started Today</p>
                <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Start Managing Collections Smarter</h2>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  Launch your enterprise collection workflow with secure authentication, realtime sync, and polished agent and customer experiences.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 shrink-0">
                <button
                  onClick={handleSignupIntent}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-7 py-4 text-base font-semibold text-white shadow-lg shadow-sky-200/50 transition hover:brightness-110"
                >
                  Create Organization
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNavbarSignIn}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-7 py-4 text-base font-semibold text-slate-950 transition hover:bg-slate-50"
                >
                  Sign In
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* About */}
        <section id="about" className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-8 md:p-12 shadow-lg shadow-slate-200/40">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500">About FundCircle</p>
              <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">Built for the people who keep communities funded.</h2>
              <p className="text-base leading-7 text-slate-600">
                FundCircle is a multi-tenant SaaS platform purpose-built for pigmy collection businesses, cooperative banks, and microfinance organizations across India. We provide the digital infrastructure to replace paper ledgers with real-time, cloud-connected workflows.
              </p>
              <p className="text-base leading-7 text-slate-600">
                Every feature is designed around the reality of daily field collection — fast agent onboarding, reliable offline resilience, and transparent reporting that builds customer trust.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Founded", value: "2024", desc: "Born from real-world collection problems." },
                { label: "Organizations", value: "1.2K+", desc: "Active chit funds and cooperatives." },
                { label: "Daily Transactions", value: "12K+", desc: "Processed through our platform." },
                { label: "Support", value: "24/7", desc: "Always here when collections happen." },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                  <p className="text-2xl font-bold text-slate-950">{item.value}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 mt-1">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-1.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Policy */}
        <section id="privacy" className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-8 md:p-12 shadow-lg shadow-slate-200/40">
          <div className="max-w-3xl space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-2">Legal</p>
              <h2 className="text-3xl font-bold text-slate-950">Privacy Policy</h2>
              <p className="text-sm text-slate-500 mt-1">Last updated: January 2026</p>
            </div>
            <div className="space-y-5 text-sm leading-7 text-slate-600">
              <div>
                <h3 className="font-bold text-slate-900 mb-1">1. Information We Collect</h3>
                <p>FundCircle collects information you provide when registering an organization, inviting agents, or onboarding customers. This includes names, phone numbers, email addresses, and collection transaction data. All data is stored securely in Google Firestore with multi-tenant isolation.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">2. How We Use Your Information</h3>
                <p>We use collected data solely to provide the FundCircle platform — enabling organizations to track pigmy collections, manage agents, and generate reports. We do not sell, rent, or share your data with third parties for marketing purposes.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">3. Data Security</h3>
                <p>All data is encrypted in transit (TLS) and at rest. Our enterprise-grade authentication system provides OTP verification and session management. Strict security rules enforce per-organization data isolation.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">4. Data Retention</h3>
                <p>Organization data is retained as long as the account is active. Upon account deletion, all associated data is permanently removed within 30 days. Collection transaction logs may be retained for regulatory compliance for up to 7 years.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">5. Your Rights</h3>
                <p>You have the right to access, correct, or delete your personal information at any time. Contact your organization owner or reach our support team through the Contact section above.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">6. Cookies</h3>
                <p>FundCircle uses only essential cookies required for authentication sessions. We do not use tracking or advertising cookies.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Terms of Service */}
        <section id="terms" className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-8 md:p-12 shadow-lg shadow-slate-200/40">
          <div className="max-w-3xl space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-2">Legal</p>
              <h2 className="text-3xl font-bold text-slate-950">Terms of Service</h2>
              <p className="text-sm text-slate-500 mt-1">Last updated: January 2026</p>
            </div>
            <div className="space-y-5 text-sm leading-7 text-slate-600">
              <div>
                <h3 className="font-bold text-slate-900 mb-1">1. Acceptance of Terms</h3>
                <p>By registering an organization or using the FundCircle platform in any capacity — as an owner, pigmy collector, or customer — you agree to be bound by these Terms of Service.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">2. Use of the Platform</h3>
                <p>FundCircle is a software platform for managing pigmy collections and daily savings operations. You agree to use the platform only for lawful financial operations and not to attempt to access data belonging to other organizations.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">3. Organization Responsibility</h3>
                <p>Organization owners are responsible for all activity within their workspace, including agent conduct and accurate recording of customer transactions. FundCircle provides infrastructure only and is not liable for financial disputes between organizations and their members.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">4. Subscription and Billing</h3>
                <p>The Starter plan is free with defined usage limits. Paid plans (Growth, Enterprise) are billed monthly. Downgrading or cancelling a plan takes effect at the end of the current billing cycle. No refunds are issued for partial months.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">5. Service Availability</h3>
                <p>We target 99.9% uptime and provide maintenance windows with advance notice. FundCircle is not liable for data loss or business impact resulting from outages beyond our reasonable control, including third-party service failures.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">6. Termination</h3>
                <p>We reserve the right to suspend or terminate accounts found to be in violation of these terms, engaged in fraud, or using the platform for illegal purposes. You may terminate your account at any time from your organization settings.</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">7. Governing Law</h3>
                <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bengaluru, Karnataka.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer id="footer" className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/40">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img src="/fundcircle-logo.png" alt="FundCircle" className="h-8 w-8 rounded-xl object-cover object-top" />
                <span className="font-bold text-slate-900">FundCircle</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Simple pigmy collection workflow for daily savings, designed for enterprise teams and modern financial operations.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-slate-900 mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                {[
                  { label: "Features", id: "features" },
                  { label: "Pricing", id: "pricing" },
                  { label: "Analytics", id: "analytics" },
                  { label: "Reports", id: "reports" },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => scrollTo(item.id)}
                      className="text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-slate-900 mb-4">Platform</h3>
              <ul className="space-y-2 text-sm">
                {[
                  { label: "Authentication", id: "reports" },
                  { label: "Firestore", id: "analytics" },
                  { label: "Multi-Tenant", id: "features" },
                  { label: "Role Access", id: "roles" },
                ].map((item) => (
                  <li key={item.id}>
                    <button onClick={() => scrollTo(item.id)} className="text-slate-600 hover:text-slate-900 transition-colors">{item.label}</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-slate-900 mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                {[
                  { label: "About", id: "about" },
                  { label: "Blog", id: "hero" },
                  { label: "Careers", id: "contact" },
                  { label: "Support", id: "contact" },
                ].map((item) => (
                  <li key={item.label}>
                    <button onClick={() => scrollTo(item.id)} className="text-slate-600 hover:text-slate-900 transition-colors">{item.label}</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-slate-900 mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => scrollTo("privacy")} className="text-slate-600 hover:text-slate-900 transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => scrollTo("terms")} className="text-slate-600 hover:text-slate-900 transition-colors">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">© 2026 FundCircle. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-slate-500">
              <button onClick={() => scrollTo("privacy")} className="hover:text-slate-800 transition-colors">Privacy Policy</button>
              <button onClick={() => scrollTo("terms")} className="hover:text-slate-800 transition-colors">Terms of Service</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

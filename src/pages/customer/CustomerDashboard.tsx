import React, { useState, useMemo } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import {
  LayoutDashboard, PiggyBank, BookOpen, CreditCard, Plus,
  CalendarDays, FileText, Bell, HelpCircle, User, Shield,
  ChevronDown, Check, Building2, Menu, X, LogOut,
} from "lucide-react";
import { where } from "firebase/firestore";
import { useCollectionRealtimeRaw, useDocumentRealtime } from "@/lib/firestore-hooks";
import type {
  Collection, Loan, LoanApplication, LoanInstallment,
  Membership, SavingsAccount, SavingsTransaction, Notification, SupportTicket,
} from "@/types";

// Tab components
import DashboardTab from "./tabs/DashboardTab";
import SavingsTab from "./tabs/SavingsTab";
import PassbookTab from "./tabs/PassbookTab";
import LoansTab from "./tabs/LoansTab";
import ApplyLoanTab from "./tabs/ApplyLoanTab";
import EMITab from "./tabs/EMITab";
import ReceiptsTab from "./tabs/ReceiptsTab";
import NotificationsTab from "./tabs/NotificationsTab";
import SupportTab from "./tabs/SupportTab";
import ProfileTab from "./tabs/ProfileTab";
import SecurityTab from "./tabs/SecurityTab";
import { SignOutButton } from "@clerk/clerk-react";

type Tab =
  | "dashboard" | "savings" | "passbook" | "loans" | "apply_loan"
  | "emi_schedule" | "receipts" | "notifications" | "support" | "profile" | "security";

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
  badgeKey?: "notifications";
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "savings", label: "Savings", icon: PiggyBank },
  { id: "passbook", label: "Passbook", icon: BookOpen },
  { id: "loans", label: "Loans", icon: CreditCard },
  { id: "apply_loan", label: "Apply Loan", icon: Plus },
  { id: "emi_schedule", label: "EMI Schedule", icon: CalendarDays },
  { id: "receipts", label: "Receipts", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell, badgeKey: "notifications" },
  { id: "support", label: "Support", icon: HelpCircle },
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
];

const SAVINGS_TABS: Tab[] = ["dashboard", "savings", "passbook", "receipts", "notifications", "support", "profile", "security"];
const LOAN_TABS: Tab[] = ["dashboard", "loans", "apply_loan", "emi_schedule", "receipts", "notifications", "support", "profile", "security"];

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function initials(name?: string | null): string {
  if (!name) return "C";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").substring(0, 2).toUpperCase();
}

export default function CustomerDashboard() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [orgSwitchOpen, setOrgSwitchOpen] = useState(false);

  const clerkUserId = user?.id ?? "";
  const orgId = organization?.id ?? "";
  const orgName = organization?.name ?? "FundCircle";
  const membershipId = orgId && clerkUserId ? `${orgId}_${clerkUserId}` : null;

  // ── Firestore realtime listeners ─────────────────────────────────────────────
  const { data: membershipDoc } = useDocumentRealtime<Membership>(
    "organizationMembers",
    membershipId ?? undefined
  );

  // Derive visible nav items from customerType (must be after membershipDoc hook)
  const customerType = (membershipDoc?.customerType as string | undefined);
  const visibleTabIds: Tab[] = customerType === "SAVINGS"
    ? SAVINGS_TABS
    : customerType === "LOAN"
    ? LOAN_TABS
    : ALL_NAV_ITEMS.map((n) => n.id);
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((n) => visibleTabIds.includes(n.id));
  const BOTTOM_PRIMARY: Tab[] = customerType === "SAVINGS"
    ? ["dashboard", "savings", "passbook", "receipts", "notifications"]
    : customerType === "LOAN"
    ? ["dashboard", "loans", "apply_loan", "emi_schedule", "notifications"]
    : ["dashboard", "savings", "loans", "receipts", "notifications"];

  const { data: savingsAccounts } = useCollectionRealtimeRaw<SavingsAccount>(
    "savingsAccounts",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );
  const savingsAccount = savingsAccounts?.[0] ?? null;

  const { data: savingsTxs } = useCollectionRealtimeRaw<SavingsTransaction>(
    "savings_transactions",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  const { data: loans } = useCollectionRealtimeRaw<Loan>(
    "loans",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  const { data: installments } = useCollectionRealtimeRaw<LoanInstallment>(
    "loan_installments",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  const { data: loanApplications } = useCollectionRealtimeRaw<LoanApplication>(
    "loanApplications",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  const { data: collections } = useCollectionRealtimeRaw<Collection>(
    "collections",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  const { data: _allNotifications } = useCollectionRealtimeRaw<Notification>(
    "notifications",
    clerkUserId ? [where("userId", "==", clerkUserId)] : []
  );
  // Filter by org in JS to avoid composite Firestore index requirement
  const notifications = useMemo(
    () => (_allNotifications ?? []).filter((n) => !orgId || n.organizationId === orgId || n.organizationId === undefined),
    [_allNotifications, orgId]
  );

  const { data: supportTickets } = useCollectionRealtimeRaw<SupportTicket>(
    "supportTickets",
    membershipId ? [where("customerId", "==", membershipId)] : []
  );

  // ── Derived values ────────────────────────────────────────────────────────────
  const unreadNotifCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications]
  );

  const allOrgs = userMemberships?.data ?? [];
  const hasMultiOrg = allOrgs.length > 1;

  const displayName =
    membershipDoc?.fullName ||
    `${membershipDoc?.firstName || ""} ${membershipDoc?.lastName || ""}`.trim() ||
    user?.fullName ||
    "Customer";

  const navigate = (tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    setMoreOpen(false);
  };

  // ── Badge helper ──────────────────────────────────────────────────────────────
  const getBadge = (item: NavItem): number => {
    if (item.badgeKey === "notifications") return unreadNotifCount;
    return 0;
  };

  // ── Tab content ───────────────────────────────────────────────────────────────
  const renderTab = () => {
    const customerName = displayName;
    const txs = savingsTxs ?? [];
    const cols = collections ?? [];
    const lns = loans ?? [];
    const insts = installments ?? [];
    const apps = loanApplications ?? [];
    const notifs = notifications ?? [];
    const tickets = supportTickets ?? [];

    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardTab
            savingsAccount={savingsAccount}
            savingsTxs={txs}
            loans={lns}
            installments={insts}
            collections={cols}
            notifications={notifs}
            onNavigate={navigate}
          />
        );
      case "savings":
        return (
          <SavingsTab
            savingsAccount={savingsAccount}
            savingsTxs={txs}
            orgName={orgName}
          />
        );
      case "passbook":
        return (
          <PassbookTab
            savingsTxs={txs}
            collections={cols}
            loans={lns}
            orgName={orgName}
          />
        );
      case "loans":
        return (
          <LoansTab
            loans={lns}
            installments={insts}
            loanApplications={apps}
            onApplyLoan={() => navigate("apply_loan")}
          />
        );
      case "apply_loan":
        return (
          <ApplyLoanTab
            orgId={orgId}
            membershipId={membershipId}
            user={user}
            loanApplications={apps}
          />
        );
      case "emi_schedule":
        return <EMITab installments={insts} loans={lns} />;
      case "receipts":
        return (
          <ReceiptsTab
            collections={cols}
            savingsTxs={txs}
            loans={lns}
            orgName={orgName}
            customerName={customerName}
          />
        );
      case "notifications":
        return (
          <NotificationsTab
            notifications={notifs}
            clerkUserId={clerkUserId}
          />
        );
      case "support":
        return (
          <SupportTab
            tickets={tickets}
            orgId={orgId}
            membershipId={membershipId}
            user={user}
          />
        );
      case "profile":
        return (
          <ProfileTab
            user={user}
            membershipId={membershipId}
            membershipDoc={membershipDoc ?? null}
          />
        );
      case "security":
        return <SecurityTab user={user} />;
      default:
        return null;
    }
  };

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 h-full">
        {/* Logo + Org */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center">
              <PiggyBank className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900 dark:text-white text-sm leading-tight">FundCircle</p>
              <p className="text-[10px] text-slate-400 truncate">{orgName}</p>
            </div>
          </div>

          {/* Org switcher */}
          {hasMultiOrg && (
            <button
              onClick={() => setOrgSwitchOpen(!orgSwitchOpen)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">{organization?.name}</p>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          )}
          {orgSwitchOpen && (
            <div className="mt-1 border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-lg">
              {allOrgs.map((mem) => {
                const org = mem.organization;
                const isActive = org.id === orgId;
                return (
                  <button
                    key={org.id}
                    onClick={() => { setActive?.({ organization: org.id }); setOrgSwitchOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                  >
                    <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 truncate">{org.name}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const badge = getBadge(item);
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`} />
                <span className={`text-sm font-medium flex-1 ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                {badge > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="Profile" className="w-8 h-8 rounded-xl object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                {initials(displayName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate leading-tight">{displayName}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <PiggyBank className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-black text-slate-900 dark:text-white text-sm">FundCircle</p>
                  <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{orgName}</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Profile info */}
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-b border-slate-100 dark:border-slate-800">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="Profile" className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black">
                  {initials(displayName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const badge = getBadge(item);
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                      isActive
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className={`text-sm font-medium flex-1 ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                    {badge > 0 && (
                      <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800">
              <SignOutButton>
                <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </SignOutButton>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Mobile/Tablet top header ──────────────────────────────────────── */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>

          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 bg-emerald-600 rounded-lg flex items-center justify-center">
              <PiggyBank className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-black text-slate-900 dark:text-white text-sm">FundCircle</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("notifications")}
              className="relative p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("profile")}
              className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white text-xs font-black overflow-hidden"
            >
              {user?.imageUrl
                ? <img src={user.imageUrl} alt="Profile" className="w-full h-full object-cover" />
                : initials(displayName)}
            </button>
          </div>
        </header>

        {/* ── Desktop page header ───────────────────────────────────────────── */}
        <div className="hidden md:flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {activeNavItem?.label ?? "Dashboard"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{orgName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Org switcher */}
            {hasMultiOrg && (
              <div className="relative">
                <button
                  onClick={() => setOrgSwitchOpen(!orgSwitchOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-200 max-w-[120px] truncate">{organization?.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {orgSwitchOpen && (
                  <div className="absolute right-0 top-10 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
                    {allOrgs.map((mem) => {
                      const org = mem.organization;
                      const isActive = org.id === orgId;
                      return (
                        <button
                          key={org.id}
                          onClick={() => { setActive?.({ organization: org.id }); setOrgSwitchOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                        >
                          <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{org.name}</span>
                          {isActive && <Check className="w-4 h-4 text-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Notification bell */}
            <button
              onClick={() => navigate("notifications")}
              className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-6">
          <div className="max-w-2xl mx-auto px-4 py-5 md:px-6">
            {renderTab()}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom navigation bar ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-2 pb-safe">
        <div className="flex items-stretch h-16">
          {BOTTOM_PRIMARY.map((tabId) => {
            const item = NAV_ITEMS.find((n) => n.id === tabId)!;
            const isActive = activeTab === tabId;
            const badge = getBadge(item);
            return (
              <button
                key={tabId}
                onClick={() => navigate(tabId)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                }`}
              >
                <div className="relative">
                  <item.icon className={`w-5 h-5 ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-semibold leading-none ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
                )}
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              !BOTTOM_PRIMARY.includes(activeTab) ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
            }`}
          >
            <Menu className={`w-5 h-5 ${!BOTTOM_PRIMARY.includes(activeTab) ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
            <span className={`text-[9px] font-semibold leading-none ${!BOTTOM_PRIMARY.includes(activeTab) ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
              More
            </span>
            {!BOTTOM_PRIMARY.includes(activeTab) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
            )}
          </button>
        </div>
      </nav>

      {/* ── More drawer (mobile) ─────────────────────────────────────────────── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-bold text-slate-900 dark:text-white">More Options</p>
              <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-4 gap-3 pb-8">
              {NAV_ITEMS.filter((n) => !BOTTOM_PRIMARY.includes(n.id)).map((item) => {
                const badge = getBadge(item);
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-colors ${
                      isActive
                        ? "bg-emerald-50 dark:bg-emerald-950/40"
                        : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isActive ? "bg-emerald-500" : "bg-white dark:bg-slate-700"
                      }`}>
                        <item.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-300"}`} />
                      </div>
                      {badge > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                          {badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold text-center leading-tight ${
                      isActive ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"
                    }`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

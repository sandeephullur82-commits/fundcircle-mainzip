import { useOrganization, useUser, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, Users, Wallet, CreditCard, FileText, Settings,
  Bell, LayoutDashboard, MoreHorizontal, ChevronRight,
  ArrowUpCircle, X, Plus, UserPlus, UserCheck,
  Landmark, IndianRupee, BarChart2, ClipboardList,
  User, Building2, UserCog,
} from "lucide-react";
import QuickAddCustomerDialog from "@/components/org/QuickAddCustomerDialog";
import QuickAddAgentDialog from "@/components/org/QuickAddAgentDialog";
import QuickNewLoanDialog from "@/components/org/QuickNewLoanDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeClerkRole, isAgentRole, isCustomerRole, isOwnerRole } from "@/lib/auth/get-user-role";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useState, useEffect, useRef } from "react";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor, ignoreUpgradeRequest } from "@/lib/services";
import { useDocumentRealtime, useCollectionRealtime } from "@/lib/firestore-hooks";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandLogo";
import OrgAvatar from "@/components/ui/OrgAvatar";
import OrgOverview from "./OrgOverview";
import OrgCustomers from "./OrgCustomers";
import OrgAgents from "./OrgAgents";
import OrgCollections from "./OrgCollections";
import OrgLoans from "./OrgLoans";
import OrgReports from "./OrgReports";
import OrgNotifications from "./OrgNotifications";
import OrgSettings from "./OrgSettings";
import OrgBilling from "./OrgBilling";
import OrgAuditLogs from "./OrgAuditLogs";
import MorePage from "./MorePage";
const BOTTOM_NAV_ADMIN = [
  { id: "overview",     label: "Dashboard",   icon: LayoutDashboard },
  { id: "customers",    label: "Customers",   icon: Users },
  { id: "collections",  label: "Collections", icon: Wallet },
  { id: "reports",      label: "Reports",     icon: FileText },
  { id: "more",         label: "More",         icon: MoreHorizontal },
];

export default function OrgDashboard() {
  const { isLoaded: isUserLoaded, user, isSignedIn } = useUser();
  const { isLoaded: isOrgLoaded, organization, membership: clerkOrgMembership } = useOrganization();
  const [activeTab, setActiveTabRaw] = useState(() => {
    try { return sessionStorage.getItem("fc_org_active_tab") || "overview"; } catch { return "overview"; }
  });
  const setActiveTab = (tab: string) => {
    setActiveTabRaw(tab);
    try { sessionStorage.setItem("fc_org_active_tab", tab); } catch {}
  };
  const [fabOpen, setFabOpen] = useState(false);
  const [orgActionsOpen, setOrgActionsOpen] = useState(false);
  const [fabCustomerOpen, setFabCustomerOpen] = useState(false);
  const [fabAgentOpen, setFabAgentOpen] = useState(false);
  const [fabLoanOpen, setFabLoanOpen] = useState(false);

  // Track whether Clerk has successfully loaded at least once.
  // After the first successful load we never return the full skeleton again —
  // Clerk briefly sets isOrgLoaded=false whenever it reloads org state after a
  // server-side membership change (e.g. adding a new customer/collector), which
  // would otherwise flash the entire screen back to a blank skeleton state.
  const hasLoadedOnceRef = useRef(false);
  if (isUserLoaded && isOrgLoaded) hasLoadedOnceRef.current = true;

  useEffect(() => {
    const handler = (e: Event) => setActiveTab((e as CustomEvent).detail);
    window.addEventListener("fundcircle:switchTab", handler);
    return () => window.removeEventListener("fundcircle:switchTab", handler);
  }, []);

  const { data: membershipDoc, loading: membershipDocLoading } = useDocumentRealtime<any>(
    "organizationMembers",
    user && organization ? membershipIdFor(organization.id, user.id) : null
  );

  const { data: notifications } = useCollectionRealtime<any>("notifications");
  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const { data: upgradeRequests } = useCollectionRealtime<any>("upgradeRequests", [where("status", "==", "PENDING")]);
  const [dismissedRequestIds, setDismissedRequestIds] = useState<Set<string>>(new Set());

  const { data: pendingSetupMembers } = useCollectionRealtime<any>("organizationMembers", [where("status", "==", "PENDING_SETUP")]);
  const pendingSetupCount = pendingSetupMembers.length;

  // Pending loan applications — for badges + push toasts
  const { data: pendingLoanApps } = useCollectionRealtime<any>("loanApplications", [
    where("status", "==", "PENDING"),
  ]);

  // Delta-detection refs — null means "initial snapshot not yet recorded"
  const prevLoanAppIds = useRef<Set<string> | null>(null);

  // Toast when a NEW pending loan application arrives
  useEffect(() => {
    const currentIds = new Set(pendingLoanApps.map((a: any) => a.id));
    if (prevLoanAppIds.current === null) {
      prevLoanAppIds.current = currentIds;
      return;
    }
    const newOnes = pendingLoanApps.filter((a: any) => !prevLoanAppIds.current!.has(a.id));
    newOnes.forEach((app: any) => {
      const amount = app.loanAmount ? `₹${Number(app.loanAmount).toLocaleString()}` : null;
      toast.info(
        `💳 New loan application${amount ? ` · ${amount}` : ""}`,
        {
          description: "A customer has applied for a loan and is awaiting your review.",
          action: { label: "Review", onClick: () => setActiveTab("loans") },
          duration: 8000,
        }
      );
    });
    prevLoanAppIds.current = currentIds;
  }, [pendingLoanApps]);

  // Role is always resolved from org membership — never from global user metadata.
  // Priority: Firestore membershipDoc → Clerk org membership → null
  const membershipRoleNormalized = normalizeClerkRole(
    membershipDoc?.clerkRole || membershipDoc?.role || null
  );
  const clerkOrgRole = normalizeClerkRole(clerkOrgMembership?.role ?? null);
  const effectiveRole = membershipRoleNormalized || clerkOrgRole || null;
  const isOwner = isOwnerRole(effectiveRole);

  const visibleRequests = isOwner
    ? upgradeRequests.filter((r: any) => !dismissedRequestIds.has(r.id))
    : [];

  const handleIgnoreRequest = async (requestId: string) => {
    setDismissedRequestIds(prev => new Set([...prev, requestId]));
    try { await ignoreUpgradeRequest(requestId); } catch (_) {}
  };

  const adminMenuItems = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "customers", label: "Customers", icon: Users },
    { id: "agents", label: "Collectors", icon: Users, badge: pendingSetupCount || undefined },
    { id: "collections", label: "Collections", icon: Wallet },
    { id: "loans", label: "Loans & EMI", icon: CreditCard, badge: pendingLoanApps.length || undefined },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "auditLogs", label: "Audit Logs", icon: ClipboardList },
    { id: "notifications", label: "Notifications", icon: Bell, badge: unreadCount },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const menuItems = adminMenuItems;

  useEffect(() => {
    if (user && organization) {
      setDoc(doc(db, "organizations", organization.id), {
        id: organization.id,
        name: organization.name,
        slug: organization.slug || "",
        createdBy: user.id,
        status: "ACTIVE",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  }, [user?.id, organization?.id]);

  // Show shimmer only on the very first load — never again after that.
  // Clerk transiently sets isOrgLoaded=false when refreshing org membership
  // (e.g. after a new customer/collector is added server-side). Without this
  // guard that would flash the full skeleton, looking like a page reload.
  if (!hasLoadedOnceRef.current && (!isUserLoaded || !isOrgLoaded)) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-screen">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
          <div className="flex-1 p-3 space-y-1">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
          </div>
          <div className="p-3 border-t border-slate-100">
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) return <Navigate to="/sign-in" replace />;
  if (isCustomerRole(effectiveRole)) return <Navigate to="/dashboard/customer" replace />;
  if (isAgentRole(effectiveRole)) return <Navigate to="/dashboard/agent" replace />;
  if (!organization) {
    if (isOwnerRole(effectiveRole)) return <Navigate to="/organization/create" replace />;
    return <Navigate to="/sign-in" replace />;
  }

  const orgName = organization?.name || "My Organization";

  return (
    <div className="flex flex-col md:flex-row md:h-screen min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-2.5 flex items-center justify-between sticky top-0 z-20">
        {/* Left — Org identity */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <OrgAvatar imageUrl={organization?.imageUrl} name={orgName} size="sm" />
          <span className="font-extrabold text-slate-900 text-sm tracking-tight truncate max-w-[120px]">{orgName}</span>
        </div>
        {/* Right — Bell + profile avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notification Bell */}
          <button
            onClick={() => {
              setActiveTab("more");
              setTimeout(() => window.dispatchEvent(new CustomEvent("fundcircle:morePage", { detail: "notifications" })), 80);
            }}
            aria-label="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Bell className="h-4 w-4 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5 shadow-sm">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {/* Profile avatar */}
          <button
            onClick={() => {
              setActiveTab("more");
              setTimeout(() => window.dispatchEvent(new CustomEvent("fundcircle:morePage", { detail: "profile" })), 80);
            }}
            aria-label="My Profile"
            className="relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-sky-100 text-sky-700 text-sm font-bold">
                {(user?.firstName?.charAt(0) || user?.fullName?.charAt(0) || "O").toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-full shrink-0 shadow-sm">
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          orgName={orgName}
          orgImageUrl={organization?.imageUrl}
          user={user}
          menuItems={menuItems}
          unreadCount={unreadCount}
          membershipLoading={membershipDocLoading}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 md:p-8 w-full max-w-7xl mx-auto pb-24 md:pb-10">
        {visibleRequests.length > 0 && (
          <div className="mb-4 space-y-2">
            {visibleRequests.slice(0, 3).map((req: any) => (
              <div
                key={req.id}
                className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <ArrowUpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900 leading-snug">
                      {req.requestedByName || "An agent"} requested a subscription upgrade
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Customer limit reached on the <span className="capitalize font-medium">{req.currentPlan || "Free"}</span> plan.
                    </p>
                  </div>
                  <button
                    onClick={() => handleIgnoreRequest(req.id)}
                    className="text-amber-400 hover:text-amber-600 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setActiveTab("billing"); setDismissedRequestIds(prev => new Set([...prev, req.id])); }}
                    className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-2 text-xs font-bold transition-all text-center"
                  >
                    Upgrade Plan
                  </button>
                  <button
                    onClick={() => handleIgnoreRequest(req.id)}
                    className="flex-1 rounded-xl border border-amber-200 bg-white text-amber-700 py-2 text-xs font-semibold transition-all text-center"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger></TabsList></div>
          <TabsContent value="overview" className="mt-0"><OrgOverview /></TabsContent>
          <TabsContent value="customers" className="mt-0"><OrgCustomers /></TabsContent>
          <TabsContent value="agents" className="mt-0"><OrgAgents /></TabsContent>
          <TabsContent value="collections" className="mt-0"><OrgCollections /></TabsContent>
          <TabsContent value="loans" className="mt-0"><OrgLoans /></TabsContent>
          <TabsContent value="reports" className="mt-0"><OrgReports /></TabsContent>
          <TabsContent value="notifications" className="mt-0"><OrgNotifications /></TabsContent>
          <TabsContent value="billing" className="mt-0"><OrgBilling /></TabsContent>
          <TabsContent value="settings" className="mt-0"><OrgSettings /></TabsContent>
          <TabsContent value="auditLogs" className="mt-0"><OrgAuditLogs /></TabsContent>
          <TabsContent value="more" className="mt-0"><MorePage /></TabsContent>
        </Tabs>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-center safe-area-pb">
        {BOTTOM_NAV_ADMIN.map((item) => {
          const Icon = item.icon;
          const isMore = item.id === "more";
          // "More" tab is active when current tab is not one of the primary four
          const primaryIds = ["overview", "customers", "collections", "reports"];
          const isActive = isMore
            ? !primaryIds.includes(activeTab)
            : activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-colors relative ${
                isActive ? "text-sky-600" : "text-slate-400"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? "text-sky-600" : "text-slate-400"}`} />
                {isMore && !primaryIds.includes(activeTab) && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-sky-500" />
                )}
              </div>
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Actions FAB — dashboard tab only */}
      {activeTab === "overview" && (
        <QuickActionsFAB
          open={fabOpen}
          setOpen={setFabOpen}
          onAction={(tab) => { setActiveTab(tab); setFabOpen(false); }}
          onOpenCustomer={() => { setFabOpen(false); setFabCustomerOpen(true); }}
          onOpenAgent={() => { setFabOpen(false); setFabAgentOpen(true); }}
          onOpenLoan={() => { setFabOpen(false); setFabLoanOpen(true); }}
          orgId={organization?.id || ""}
        />
      )}

      {/* Quick-add dialogs (opened from FAB) */}
      <QuickAddCustomerDialog open={fabCustomerOpen} onOpenChange={setFabCustomerOpen} />
      <QuickAddAgentDialog open={fabAgentOpen} onOpenChange={setFabAgentOpen} />
      <QuickNewLoanDialog open={fabLoanOpen} onOpenChange={setFabLoanOpen} />

      {/* ── Org Actions Sheet (bottom, tapping org name ▼) ─────────────────── */}
      <Sheet open={orgActionsOpen} onOpenChange={setOrgActionsOpen}>
        <SheetContent side="bottom" className="md:hidden rounded-t-2xl p-0 focus:outline-none">
          <div className="flex flex-col">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            {/* Org identity */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{orgName}</p>
                <p className="text-xs text-slate-400">Your organization</p>
              </div>
            </div>
            {/* Actions */}
            <div className="py-2 px-2">
              {[
                { label: "Organization Profile", sub: "Edit org name & details",   icon: Building2,  action: () => { setActiveTab("more"); setTimeout(() => window.dispatchEvent(new CustomEvent("fundcircle:morePage", { detail: "organization" })), 80); } },
                { label: "Billing & Subscription", sub: "Plan, usage & invoices",  icon: Wallet,     action: () => setActiveTab("billing") },
                { label: "Add Collector",          sub: "Add a field agent",        icon: UserCheck,  action: () => setActiveTab("agents")  },
                { label: "Add Customer",           sub: "Add a new customer",       icon: Users,      action: () => setActiveTab("customers") },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setOrgActionsOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-slate-50 active:bg-slate-100 transition-all"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 shrink-0">
                      <Icon className="w-4 h-4 text-sky-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-400">{item.sub}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
            <div className="pb-6" />
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}

// ── Quick Actions FAB Speed Dial (Draggable) ──────────────────────────────────
const FAB_SIZE = 56;
const DIAL_ITEM_SIZE = 44;
const DRAG_THRESHOLD = 6;
const FAB_MARGIN = 16;
const MOB_NAV_H = 56;

const FAB_ACTIONS = [
  { id: "addCustomer",      label: "Add Customer",        icon: UserPlus,    tab: "customers",   color: "#2563eb", modal: "customer" },
  { id: "addAgent",         label: "Add Agent",           icon: UserCheck,   tab: "agents",      color: "#0284c7", modal: "agent"    },
  { id: "newLoan",          label: "New Loan",            icon: Landmark,    tab: "loans",       color: "#4f46e5", modal: "loan"     },
  { id: "recordCollection", label: "Record Collection",   icon: IndianRupee, tab: "collections", color: "#0d9488", modal: null       },
  { id: "generateReport",   label: "Generate Report",     icon: BarChart2,   tab: "reports",     color: "#9333ea", modal: null       },
] as const;

/** Returns the height of the bottom nav bar for the current viewport width. */
function getBottomNavH(): number {
  return window.innerWidth < 768 ? MOB_NAV_H : 0;
}

/**
 * Clamp left/top pixel coords strictly within the visible viewport.
 *   left  >= FAB_MARGIN
 *   top   >= FAB_MARGIN
 *   right  <= viewportWidth  - FAB_SIZE - FAB_MARGIN
 *   bottom <= viewportHeight - FAB_SIZE - bottomNavHeight - FAB_MARGIN
 */
function clampFabPos(x: number, y: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const navH = getBottomNavH();
  return {
    x: Math.max(FAB_MARGIN, Math.min(x, vw - FAB_SIZE - FAB_MARGIN)),
    y: Math.max(FAB_MARGIN, Math.min(y, vh - FAB_SIZE - navH - FAB_MARGIN)),
  };
}

/** Pixel position → viewport-relative fractions in [0..1]. */
function pixelsToPercent(x: number, y: number) {
  return {
    xPercent: x / window.innerWidth,
    yPercent: y / window.innerHeight,
  };
}

/**
 * Fractions → clamped pixel position.
 * Returns null if the values are invalid so callers fall back to the CSS default.
 */
function percentToPixels(xPercent: unknown, yPercent: unknown): { x: number; y: number } | null {
  if (
    typeof xPercent !== "number" || typeof yPercent !== "number" ||
    !Number.isFinite(xPercent)  || !Number.isFinite(yPercent) ||
    xPercent < 0 || xPercent > 1 || yPercent < 0 || yPercent > 1
  ) return null;
  return clampFabPos(
    Math.round(xPercent * window.innerWidth),
    Math.round(yPercent * window.innerHeight),
  );
}

/** localStorage key scoped per org so different orgs don't share a position. */
function lsKey(orgId: string) { return `fc_fab_pos_${orgId}`; }

/** Read saved fractions from localStorage; returns null on any error. */
function lsRead(orgId: string): { xPercent: number; yPercent: number } | null {
  try {
    const raw = localStorage.getItem(lsKey(orgId));
    if (!raw) return null;
    const { xPercent, yPercent } = JSON.parse(raw);
    if (typeof xPercent === "number" && typeof yPercent === "number") return { xPercent, yPercent };
  } catch {}
  return null;
}

/** Persist fractions to localStorage; silently swallows errors. */
function lsWrite(orgId: string, xPercent: number, yPercent: number) {
  try { localStorage.setItem(lsKey(orgId), JSON.stringify({ xPercent, yPercent })); } catch {}
}

function QuickActionsFAB({
  open, setOpen, onAction, onOpenCustomer, onOpenAgent, onOpenLoan, orgId,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onAction: (tab: string) => void;
  onOpenCustomer: () => void;
  onOpenAgent: () => void;
  onOpenLoan: () => void;
  orgId: string;
}) {
  // ─── pos tracks the FAB BUTTON's own top-left corner in viewport pixels ────
  // null = no saved position → use CSS bottom/right default.
  // {x,y} = clamped pixel coords; always the button itself, NOT any wrapper div.
  //
  // Key invariant: pos.x/pos.y are always within clampFabPos bounds.
  // We never store the container's left/top here — that caused the old off-screen
  // bug because invisible dial items still occupy layout space and made the
  // container much wider/taller than the FAB button.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    if (!orgId) return null;
    const saved = lsRead(orgId);
    if (!saved) return null;
    return percentToPixels(saved.xPercent, saved.yPercent);
  });

  const [isDragging, setIsDragging] = useState(false);

  const savedPercent = useRef<{ xPercent: number; yPercent: number } | null>(
    orgId ? lsRead(orgId) : null
  );

  const drag = useRef({
    active:   false,
    hasMoved: false,
    startX:   0, startY: 0,
    fabX:     0, fabY:   0,
    pendingX: 0, pendingY: 0,
    rafId:    null as number | null,
  });

  // ── Save to localStorage + Firestore as viewport fractions ─────────────────
  const savePos = (x: number, y: number) => {
    const { xPercent, yPercent } = pixelsToPercent(x, y);
    savedPercent.current = { xPercent, yPercent };
    if (orgId) {
      lsWrite(orgId, xPercent, yPercent);
      setDoc(
        doc(db, "organizations", orgId, "settings", "ui"),
        { fabPosition: { xPercent, yPercent } },
        { merge: true }
      ).catch(() => {});
    }
  };

  // ── Firestore cross-device sync (localStorage handles instant local restore) ─
  useEffect(() => {
    if (!orgId) return;
    const uiRef = doc(db, "organizations", orgId, "settings", "ui");
    const unsub = onSnapshot(uiRef, (snap) => {
      if (drag.current.active) return;
      if (!snap.exists()) return;
      const fp = snap.data()?.fabPosition;
      const resolved = percentToPixels(fp?.xPercent, fp?.yPercent);
      if (resolved) {
        savedPercent.current = { xPercent: fp.xPercent, yPercent: fp.yPercent };
        lsWrite(orgId, fp.xPercent, fp.yPercent);
        setPos(resolved);
      }
    }, () => {});
    return unsub;
  }, [orgId]);

  // ── Re-clamp on viewport resize / orientation change ───────────────────────
  useEffect(() => {
    const onResize = () => {
      if (drag.current.active) return;
      if (!savedPercent.current) { setPos(null); return; }
      setPos(percentToPixels(savedPercent.current.xPercent, savedPercent.current.yPercent));
    };
    window.addEventListener("resize",            onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize",            onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // ── ESC closes Speed Dial ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, setOpen]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    e.stopPropagation();

    // Always read the FAB BUTTON's own bounding rect — never the container's.
    // The container is wider than the button (hidden dial items still occupy space),
    // so using container.left would cause a position jump on the first drag.
    const r = e.currentTarget.getBoundingClientRect();
    const clamped = clampFabPos(r.left, r.top);

    drag.current = {
      active: true, hasMoved: false,
      startX: e.clientX, startY: e.clientY,
      fabX: clamped.x, fabY: clamped.y,
      pendingX: clamped.x, pendingY: clamped.y,
      rafId: null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;

    if (!drag.current.hasMoved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
      drag.current.hasMoved = true;
      setIsDragging(true);
      setOpen(false);
    }

    const clamped = clampFabPos(drag.current.fabX + dx, drag.current.fabY + dy);
    drag.current.pendingX = clamped.x;
    drag.current.pendingY = clamped.y;

    if (!drag.current.rafId) {
      drag.current.rafId = requestAnimationFrame(() => {
        setPos({ x: drag.current.pendingX, y: drag.current.pendingY });
        drag.current.rafId = null;
      });
    }
  };

  const handlePointerUp = (_e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.rafId) { cancelAnimationFrame(drag.current.rafId); drag.current.rafId = null; }
    setIsDragging(false);

    if (drag.current.hasMoved) {
      const { x, y } = clampFabPos(drag.current.pendingX, drag.current.pendingY);
      setPos({ x, y });
      savePos(x, y);
    } else {
      setOpen(!open);
    }
  };

  // ── Layout ─────────────────────────────────────────────────────────────────
  const handleFabItemClick = (action: typeof FAB_ACTIONS[number]) => {
    setOpen(false);
    if (action.modal === "customer") { onOpenCustomer(); return; }
    if (action.modal === "agent")    { onOpenAgent();    return; }
    if (action.modal === "loan")     { onOpenLoan();     return; }
    onAction(action.tab);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // FAB centre in viewport coords (used for all quadrant decisions).
  // When pos is null the FAB lives at CSS bottom-right, so we compute the
  // equivalent pixel centre for the same boundary checks.
  const fabCX = pos
    ? pos.x + FAB_SIZE / 2
    : vw - FAB_MARGIN - FAB_SIZE / 2;
  const fabCY = pos
    ? pos.y + FAB_SIZE / 2
    : vh - (MOB_NAV_H + FAB_MARGIN) - FAB_SIZE / 2;

  // ── Vertical: open upward when FAB is in the lower 55 % of the screen ──────
  // Estimated dial height: 7 items × (44 px item + 8 px gap) = ~364 px.
  const DIAL_ESTIMATED_H = FAB_ACTIONS.length * (DIAL_ITEM_SIZE + 8);
  const spaceBelow = vh - (pos ? pos.y + FAB_SIZE : vh - (MOB_NAV_H + FAB_MARGIN)) - FAB_MARGIN;
  const spaceAbove = (pos ? pos.y : vh - (MOB_NAV_H + FAB_MARGIN + FAB_SIZE)) - FAB_MARGIN;
  // Prefer the direction with more room; fall back to upward (the common case).
  const dialAbove = spaceAbove >= spaceBelow || spaceBelow < DIAL_ESTIMATED_H;

  // ── Horizontal: labels on LEFT when FAB is in the right half ───────────────
  // Labels on RIGHT when FAB is in the left half so they never overflow.
  // Estimated label pill width: "New Savings Account" is the longest ≈ 170 px.
  const LABEL_ESTIMATED_W = 180; // px — generous estimate including gap + icon
  const fabRightEdge = pos ? pos.x + FAB_SIZE : vw - FAB_MARGIN;
  const fabLeftEdge  = pos ? pos.x             : vw - FAB_MARGIN - FAB_SIZE;
  const spaceToLeft  = fabLeftEdge  - FAB_MARGIN;
  const spaceToRight = vw - fabRightEdge - FAB_MARGIN;
  // Labels on left unless there isn't enough room; always fall back to whichever
  // side has more space.
  const labelsOnLeft = spaceToLeft >= LABEL_ESTIMATED_W || spaceToLeft >= spaceToRight;

  // FAB button style — position: fixed, anchored to pos.x / pos.y exactly.
  const fabStyle: React.CSSProperties = pos
    ? {
        position:   "fixed",
        left:       pos.x,
        top:        pos.y,
        zIndex:     9999,
        willChange: isDragging ? "transform" : "auto",
      }
    : {
        position: "fixed",
        bottom:   `calc(${MOB_NAV_H + FAB_MARGIN}px + env(safe-area-inset-bottom, 0px))`,
        right:    FAB_MARGIN,
        zIndex:   9999,
      };

  // ── Dial items container ────────────────────────────────────────────────────
  // Separate fixed element — never affects FAB position.
  // Anchored to the FAB's LEFT or RIGHT edge depending on which side the labels go.
  //   labelsOnLeft  → container right edge = FAB right edge  (rows grow leftward)
  //   !labelsOnLeft → container left  edge = FAB left  edge  (rows grow rightward)
  const dialStyle: React.CSSProperties = pos
    ? {
        position:      "fixed",
        ...(labelsOnLeft
          ? { right: vw - pos.x - FAB_SIZE }
          : { left:  pos.x }),
        ...(dialAbove
          ? { bottom: vh - pos.y + 10 }
          : { top:    pos.y + FAB_SIZE + 10 }),
        zIndex:        9998,
        display:       "flex",
        flexDirection: dialAbove ? "column" : "column-reverse",
        alignItems:    labelsOnLeft ? "flex-end" : "flex-start",
        gap:           8,
        pointerEvents: open && !isDragging ? "auto" : "none",
      }
    : {
        position:      "fixed",
        right:         FAB_MARGIN,
        bottom:        `calc(${MOB_NAV_H + FAB_MARGIN + FAB_SIZE + 10}px + env(safe-area-inset-bottom, 0px))`,
        zIndex:        9998,
        display:       "flex",
        flexDirection: "column",
        alignItems:    "flex-end",
        gap:           8,
        pointerEvents: open && !isDragging ? "auto" : "none",
      };

  // Translate direction for item enter/exit animation:
  //   dialAbove  → items slide up   (enter from below → translateY +12 → 0)
  //   !dialAbove → items slide down (enter from above → translateY -12 → 0)
  const itemHideTranslate = dialAbove ? "translateY(12px)" : "translateY(-12px)";

  // Suppress the unused-variable lint warning; fabCX/fabCY are intentionally
  // computed for documentation even though only the derived booleans are used.
  void fabCX; void fabCY;

  return (
    <>
      {/* Invisible backdrop — closes Speed Dial on outside tap/click */}
      {open && !isDragging && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990 }}
        />
      )}

      {/* ── Dial items — separate fixed element, never affects FAB position ── */}
      <div role="menu" aria-label="Quick action items" style={dialStyle}>
        {FAB_ACTIONS.map((action, i) => {
          const Icon       = action.icon;
          const idx        = dialAbove ? i : (FAB_ACTIONS.length - 1 - i);
          const enterDelay = `${idx * 35}ms`;
          const exitDelay  = `${(FAB_ACTIONS.length - 1 - idx) * 22}ms`;
          const delay      = open && !isDragging ? enterDelay : exitDelay;
          const visible    = open && !isDragging;
          return (
            <div
              key={action.id}
              role="menuitem"
              aria-label={action.label}
              style={{
                display:       "flex",
                flexDirection: labelsOnLeft ? "row" : "row-reverse",
                alignItems:    "center",
                gap:           10,
                opacity:       visible ? 1 : 0,
                transform:     visible ? "scale(1) translateY(0px)" : `scale(0.82) ${itemHideTranslate}`,
                transition:    `opacity 180ms ease ${delay}, transform 210ms cubic-bezier(0.34,1.4,0.64,1) ${delay}`,
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              {/* Label pill */}
              <span
                style={{
                  background:     "rgba(15,23,42,0.88)",
                  color:          "#fff",
                  fontSize:       12,
                  fontWeight:     600,
                  padding:        "5px 11px",
                  borderRadius:   999,
                  whiteSpace:     "nowrap",
                  userSelect:     "none",
                  boxShadow:      "0 2px 10px rgba(0,0,0,0.20)",
                  backdropFilter: "blur(4px)",
                }}
              >
                {action.label}
              </span>
              {/* Coloured icon button */}
              <button
                tabIndex={visible ? 0 : -1}
                aria-label={action.label}
                onClick={() => handleFabItemClick(action)}
                style={{
                  width:          DIAL_ITEM_SIZE,
                  height:         DIAL_ITEM_SIZE,
                  borderRadius:   "50%",
                  border:         "none",
                  cursor:         "pointer",
                  background:     action.color,
                  color:          "#fff",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  boxShadow:      "0 3px 12px rgba(0,0,0,0.22)",
                  transition:     "transform 120ms ease, box-shadow 120ms ease",
                }}
                onPointerEnter={(ev) => {
                  (ev.currentTarget as HTMLButtonElement).style.transform = "scale(1.12)";
                  (ev.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.28)";
                }}
                onPointerLeave={(ev) => {
                  (ev.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  (ev.currentTarget as HTMLButtonElement).style.boxShadow = "0 3px 12px rgba(0,0,0,0.22)";
                }}
              >
                <Icon style={{ width: 18, height: 18 }} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Main FAB button — position: fixed at pos.x / pos.y exactly ── */}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={isDragging ? "Drag FAB" : open ? "Close quick actions" : "Open quick actions"}
        style={{
          ...fabStyle,
          width:          FAB_SIZE,
          height:         FAB_SIZE,
          borderRadius:   "50%",
          border:         "none",
          cursor:         isDragging ? "grabbing" : "grab",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          touchAction:    "none",
          userSelect:     "none",
          transform:      open && !isDragging ? "rotate(45deg)" : "rotate(0deg)",
          transition:     isDragging
            ? "box-shadow 80ms ease"
            : "transform 240ms cubic-bezier(0.34,1.4,0.64,1), box-shadow 150ms ease",
          boxShadow:      isDragging
            ? "0 8px 32px rgba(0,0,0,0.38)"
            : open
              ? "0 6px 28px rgba(2,132,199,0.50)"
              : "0 4px 20px rgba(0,0,0,0.28)",
        }}
        className="bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
      >
        <Plus className="w-6 h-6 pointer-events-none" aria-hidden="true" />
      </button>
    </>
  );
}

function SidebarContent({ activeTab, setActiveTab, orgName, orgImageUrl, user, menuItems, unreadCount, membershipLoading }: any) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <OrgAvatar imageUrl={orgImageUrl} name={orgName} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{orgName}</p>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase mt-0.5">Owner Portal</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto scrollbar-hide">
        {membershipLoading
          ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)
          : menuItems.map((item: any) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                    isActive
                      ? "bg-sky-50 text-sky-700 font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-sky-600" : "text-slate-400"}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })
        }
      </div>

      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 mb-2 border border-slate-100">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-sky-100 text-sky-700 text-sm font-bold">
              {user?.firstName?.charAt(0) || "O"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.fullName || "Owner"}</p>
            <p className="text-xs text-slate-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
        <SignOutButton>
          <Button variant="ghost" className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm h-9 gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </SignOutButton>
      </div>
    </div>
  );
}

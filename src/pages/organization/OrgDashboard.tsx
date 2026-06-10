import { useOrganization, useUser, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, Users, Wallet, CreditCard, FileText, Settings,
  Bell, Menu, CalendarDays, ClipboardList, LayoutDashboard,
  ArrowUpCircle, X, Plus, UserPlus, UserCheck, PiggyBank,
  Landmark, IndianRupee, CheckCircle2, BarChart2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeClerkRole, isAgentRole, isCustomerRole, isOwnerRole } from "@/lib/auth/get-user-role";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
import OrgSavings from "./OrgSavings";
import AgentOverview from "../agent/AgentOverview";
import AgentCustomers from "../agent/AgentCustomers";

const BOTTOM_NAV_ADMIN = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "collections", label: "Collections", icon: Wallet },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

const BOTTOM_NAV_COLLECTOR = [
  { id: "daily", label: "Today", icon: CalendarDays },
  { id: "customerLedger", label: "Customers", icon: Users },
  { id: "collectionEntry", label: "Collections", icon: ClipboardList },
];

export default function OrgDashboard() {
  const { isLoaded: isUserLoaded, user, isSignedIn } = useUser();
  const { isLoaded: isOrgLoaded, organization, membership: clerkOrgMembership } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");
  const [mode, setMode] = useState<"admin" | "collector">("admin");
  const [fabOpen, setFabOpen] = useState(false);

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

  // Pending loan and savings applications — for badges + push toasts
  const { data: pendingLoanApps } = useCollectionRealtime<any>("loanApplications", [
    where("status", "==", "PENDING"),
  ]);
  const { data: pendingSavingsApps } = useCollectionRealtime<any>("savings_applications", [
    where("status", "==", "PENDING"),
  ]);

  // Delta-detection refs — null means "initial snapshot not yet recorded"
  const prevLoanAppIds = useRef<Set<string> | null>(null);
  const prevSavingsAppIds = useRef<Set<string> | null>(null);

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

  // Toast when a NEW pending savings application arrives
  useEffect(() => {
    const currentIds = new Set(pendingSavingsApps.map((a: any) => a.id));
    if (prevSavingsAppIds.current === null) {
      prevSavingsAppIds.current = currentIds;
      return;
    }
    const newOnes = pendingSavingsApps.filter((a: any) => !prevSavingsAppIds.current!.has(a.id));
    newOnes.forEach((app: any) => {
      const planName = app.planName ? ` — ${app.planName}` : "";
      toast.info(
        `💰 New savings application${planName}`,
        {
          description: "A customer has applied for a savings plan and is awaiting your approval.",
          action: { label: "Review", onClick: () => setActiveTab("savings") },
          duration: 8000,
        }
      );
    });
    prevSavingsAppIds.current = currentIds;
  }, [pendingSavingsApps]);

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
    { id: "savings", label: "Savings Management", icon: ArrowUpCircle, badge: pendingSavingsApps.length || undefined },
    { id: "loans", label: "Loans & EMI", icon: CreditCard, badge: pendingLoanApps.length || undefined },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "auditLogs", label: "Audit Logs", icon: ClipboardList },
    { id: "notifications", label: "Notifications", icon: Bell, badge: unreadCount },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const collectorMenuItems = [
    { id: "daily", label: "Today's Route", icon: CalendarDays },
    { id: "customerLedger", label: "Customer Ledger", icon: Users },
    { id: "collectionEntry", label: "Collection Entry", icon: ClipboardList },
  ];

  const menuItems = mode === "admin" ? adminMenuItems : collectorMenuItems;

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

  // Show shimmer only for initial Clerk load — not for Firestore membership fetch
  if (!isUserLoaded || !isOrgLoaded) {
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
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex flex-col gap-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark size="sm" />
            <span className="text-slate-300 font-light">·</span>
            <span className="font-semibold text-slate-700 truncate max-w-[120px] text-sm">{orgName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && (
              <div className="flex rounded-lg bg-slate-100 p-0.5 gap-0.5 mr-1">
                <button
                  onClick={() => { setMode("admin"); setActiveTab("overview"); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${mode === "admin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Admin
                </button>
                <button
                  onClick={() => { setMode("collector"); setActiveTab("daily"); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${mode === "collector" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Collector
                </button>
              </div>
            )}
            <Sheet>
              <SheetTrigger render={
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Menu className="w-4 h-4" />
                </Button>
              } />
              <SheetContent side="left" className="w-[280px] p-0">
                <SidebarContent
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  orgName={orgName}
                  user={user}
                  menuItems={menuItems}
                  isOwner={isOwner}
                  mode={mode}
                  setMode={setMode}
                  unreadCount={unreadCount}
                  membershipLoading={membershipDocLoading}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-full shrink-0 shadow-sm">
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          orgName={orgName}
          user={user}
          menuItems={menuItems}
          isOwner={isOwner}
          mode={mode}
          setMode={setMode}
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
          <TabsContent value="savings" className="mt-0"><OrgSavings /></TabsContent>
          <TabsContent value="loans" className="mt-0"><OrgLoans /></TabsContent>
          <TabsContent value="reports" className="mt-0"><OrgReports /></TabsContent>
          <TabsContent value="notifications" className="mt-0"><OrgNotifications /></TabsContent>
          <TabsContent value="billing" className="mt-0"><OrgBilling /></TabsContent>
          <TabsContent value="settings" className="mt-0"><OrgSettings /></TabsContent>
          <TabsContent value="auditLogs" className="mt-0"><OrgAuditLogs /></TabsContent>
          <TabsContent value="daily" className="mt-0"><AgentOverview /></TabsContent>
          <TabsContent value="customerLedger" className="mt-0">
            <AgentCustomers collectorRole={isOwner ? "OWNER" : "AGENT"} collectorName={user?.fullName || ""} collectorId={user?.id || ""} />
          </TabsContent>
          <TabsContent value="collectionEntry" className="mt-0"><OrgCollections /></TabsContent>
        </Tabs>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-center">
        {(mode === "admin" ? BOTTOM_NAV_ADMIN : BOTTOM_NAV_COLLECTOR).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 transition-colors ${
                isActive ? "text-sky-600" : "text-slate-400"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-sky-600" : "text-slate-400"}`} />
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Actions FAB — admin mode only */}
      {mode === "admin" && (
        <QuickActionsFAB
          open={fabOpen}
          setOpen={setFabOpen}
          onAction={(tab) => { setActiveTab(tab); setFabOpen(false); }}
          orgId={organization?.id || ""}
        />
      )}
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
  { id: "addCustomer",      label: "Add Customer",        icon: UserPlus,     tab: "customers",   color: "#2563eb" },
  { id: "addAgent",         label: "Add Agent",           icon: UserCheck,    tab: "agents",      color: "#0284c7" },
  { id: "newSavings",       label: "New Savings Account", icon: PiggyBank,    tab: "savings",     color: "#059669" },
  { id: "newLoan",          label: "New Loan",            icon: Landmark,     tab: "loans",       color: "#4f46e5" },
  { id: "recordCollection", label: "Record Collection",   icon: IndianRupee,  tab: "collections", color: "#0d9488" },
  { id: "approveLoan",      label: "Approve Loan",        icon: CheckCircle2, tab: "loans",       color: "#ea580c" },
  { id: "generateReport",   label: "Generate Report",     icon: BarChart2,    tab: "reports",     color: "#9333ea" },
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
  open, setOpen, onAction, orgId,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onAction: (tab: string) => void;
  orgId: string;
}) {
  // null  = no saved position → CSS default (bottom-right corner)
  // {x,y} = resolved left/top pixel coords (position: fixed)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    // Synchronously read from localStorage on first render so the FAB appears
    // in the correct place immediately — before any Firestore response arrives.
    if (!orgId) return null;
    const saved = lsRead(orgId);
    if (!saved) return null;
    return percentToPixels(saved.xPercent, saved.yPercent);
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest persisted fractions — kept in a ref so the resize/orientation handler
  // always reads the current value without a stale closure.
  const savedPercent = useRef<{ xPercent: number; yPercent: number } | null>(
    orgId ? lsRead(orgId) : null
  );

  const drag = useRef({
    active:   false,
    hasMoved: false,
    startX:   0, startY:   0,
    fabX:     0, fabY:     0,
    pendingX: 0, pendingY: 0,
    rafId:    null as number | null,
  });

  // ── Save to both localStorage + Firestore (percentages) ────────────────────
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

  // ── Real-time Firestore position sync ───────────────────────────────────────
  // localStorage already gives instant restore; Firestore handles cross-device sync.
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

  // ── Re-clamp position on viewport resize / orientation change ───────────────
  useEffect(() => {
    const onResize = () => {
      if (drag.current.active) return;
      if (!savedPercent.current) { setPos(null); return; }
      const resolved = percentToPixels(savedPercent.current.xPercent, savedPercent.current.yPercent);
      setPos(resolved ?? null);
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

    // Read the actual rendered rect so we start from the true visual position.
    // This is reliable even on mobile where window.innerHeight can fluctuate.
    let fabX: number, fabY: number;
    if (pos) {
      fabX = pos.x;
      fabY = pos.y;
    } else {
      const r = (containerRef.current ?? e.currentTarget).getBoundingClientRect();
      fabX = r.left;
      fabY = r.top;
    }
    // Clamp the start position itself so a stale value never seeds an out-of-bounds drag.
    const clamped = clampFabPos(fabX, fabY);

    drag.current = {
      active: true, hasMoved: false,
      startX: e.clientX, startY: e.clientY,
      fabX: clamped.x, fabY: clamped.y,
      pendingX: clamped.x, pendingY: clamped.y,
      rafId: null,
    };
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
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

    // Always clamp — the FAB can never leave the visible viewport.
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
      // Final clamp on release — guarantees the resting position is always valid.
      const { x, y } = clampFabPos(drag.current.pendingX, drag.current.pendingY);
      setPos({ x, y });
      savePos(x, y);
    } else {
      setOpen(!open);
    }
  };

  // ── Layout helpers ──────────────────────────────────────────────────────────
  const dialAbove    = pos ? pos.y >= window.innerHeight * 0.45 : true;
  const handleAction = (tab: string) => { setOpen(false); onAction(tab); };

  // When no saved position: CSS bottom/right default (safe-area-aware, no JS measurement).
  // When position saved: left/top pixel coords from stored viewport fractions.
  // Always position: fixed — never absolute, never outside the viewport.
  const containerStyle: React.CSSProperties = pos
    ? {
        position:   "fixed",
        left:       pos.x,
        top:        pos.y,
        zIndex:     9999,
        willChange: isDragging ? "left, top" : "auto",
      }
    : {
        position: "fixed",
        bottom:   `calc(${MOB_NAV_H + FAB_MARGIN}px + env(safe-area-inset-bottom, 0px))`,
        right:    FAB_MARGIN,
        zIndex:   9999,
      };

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

      {/* ── Speed Dial container ── */}
      <div
        ref={containerRef}
        role="group"
        aria-label="Quick actions"
        style={{
          ...containerStyle,
          display: "flex",
          flexDirection: dialAbove ? "column" : "column-reverse",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        {/* ── Dial items ── */}
        <div
          role="menu"
          aria-label="Quick action items"
          style={{
            display:       "flex",
            flexDirection: dialAbove ? "column" : "column-reverse",
            alignItems:    "flex-end",
            gap:           8,
            pointerEvents: open && !isDragging ? "auto" : "none",
          }}
        >
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
                  display:    "flex",
                  alignItems: "center",
                  gap:        10,
                  opacity:    visible ? 1 : 0,
                  transform:  visible
                    ? "scale(1) translateY(0px)"
                    : "scale(0.72) translateY(12px)",
                  transition: `opacity 180ms ease ${delay}, transform 210ms cubic-bezier(0.34,1.4,0.64,1) ${delay}`,
                }}
              >
                {/* Label pill */}
                <span
                  style={{
                    background:     "rgba(15,23,42,0.85)",
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
                  onClick={() => handleAction(action.tab)}
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
                  onPointerEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "scale(1.12)";
                    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.28)";
                  }}
                  onPointerLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "scale(1)";
                    el.style.boxShadow = "0 3px 12px rgba(0,0,0,0.22)";
                  }}
                >
                  <Icon style={{ width: 18, height: 18 }} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Main FAB button ── */}
        <button
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={isDragging ? "Drag FAB" : open ? "Close quick actions" : "Open quick actions"}
          style={{
            width:          FAB_SIZE,
            height:         FAB_SIZE,
            borderRadius:   "50%",
            border:         "none",
            cursor:         isDragging ? "grabbing" : "grab",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
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
      </div>
    </>
  );
}

function SidebarContent({ activeTab, setActiveTab, orgName, user, menuItems, isOwner, mode, setMode, unreadCount, membershipLoading }: any) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <BrandMark />
        <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{orgName}</p>
      </div>

      {/* Mode Switch — skeleton while role loads */}
      {membershipLoading ? (
        <div className="px-4 pt-4 pb-2">
          <Skeleton className="h-9 rounded-xl w-full" />
        </div>
      ) : isOwner ? (
        <div className="px-4 pt-4 pb-2">
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            <button
              onClick={() => { setMode("admin"); setActiveTab("overview"); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                mode === "admin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Admin
            </button>
            <button
              onClick={() => { setMode("collector"); setActiveTab("daily"); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                mode === "collector" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Collector
            </button>
          </div>
        </div>
      ) : null}

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

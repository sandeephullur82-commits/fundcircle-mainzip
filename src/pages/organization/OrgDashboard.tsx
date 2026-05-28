import { useOrganization, useUser, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, Users, Wallet, CreditCard, FileText, Settings,
  Bell, Menu, CalendarDays, ClipboardList, LayoutDashboard,
  ArrowUpCircle, X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeClerkRole, isAgentRole, isCustomerRole, isOwnerRole } from "@/lib/auth/get-user-role";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor, ignoreUpgradeRequest } from "@/lib/services";
import { useDocumentRealtime, useCollectionRealtime } from "@/lib/firestore-hooks";
import { Navigate } from "react-router-dom";
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
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");
  const [mode, setMode] = useState<"admin" | "collector">("admin");

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

  const clerkRole = normalizeClerkRole((user?.publicMetadata as any)?.role as string | undefined);
  const membershipRoleNormalized = normalizeClerkRole(membershipDoc?.role?.toString() || null);
  const effectiveRole = membershipRoleNormalized || clerkRole || null;
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
    { id: "agents", label: "Collectors", icon: Users },
    { id: "collections", label: "Collections", icon: Wallet },
    { id: "loans", label: "Loans & EMI", icon: CreditCard },
    { id: "reports", label: "Reports", icon: FileText },
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
        updatedAt: serverTimestamp(),
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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
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
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-screen sticky top-0 shadow-sm">
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
      <main className="flex-1 p-3 md:p-8 overflow-y-auto w-full max-w-7xl mx-auto pb-20 md:pb-8">
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
    </div>
  );
}

function SidebarContent({ activeTab, setActiveTab, orgName, user, menuItems, isOwner, mode, setMode, unreadCount, membershipLoading }: any) {
  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
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

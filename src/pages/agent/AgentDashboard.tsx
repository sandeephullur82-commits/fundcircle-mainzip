import { useUser, useOrganization, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, Users, History,
  AlertCircle, Menu, LayoutDashboard, TrendingUp,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { where } from "firebase/firestore";
import { useDocumentRealtime, useCollectionRealtime } from "@/lib/firestore-hooks";
import AgentOverview from "./AgentOverview";
import AgentCustomers from "./AgentCustomers";
import AgentPending from "./AgentPending";
import AgentHistory from "./AgentHistory";

const menuItems = [
  { id: "overview", label: "Today's Summary", icon: LayoutDashboard },
  { id: "pending", label: "Pending Visits", icon: AlertCircle },
  { id: "customers", label: "My Customers", icon: Users },
  { id: "history", label: "Collection History", icon: History },
];

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

function formatLimit(val: number) {
  return val === -1 ? "∞" : val.toLocaleString();
}

export default function AgentDashboard() {
  const { isLoaded: isUserLoaded, isSignedIn, user } = useUser();
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id ?? null);
  const { data: agents } = useCollectionRealtime<any>("organizationMembers", [where("role", "==", "AGENT")]);
  const { data: customers } = useCollectionRealtime<any>("organizationMembers", [where("role", "==", "CUSTOMER")]);
  const { data: collections } = useCollectionRealtime<any>("collections");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const collectionsThisMonth = collections.filter((c: any) => {
    const d = (c.timestamp as any)?.toDate?.() || new Date(c.timestamp);
    return d >= monthStart;
  }).length;

  const currentPlan = orgDoc?.plan ?? "free";
  const limits = orgDoc?.limits ?? { maxAgents: 1, maxCustomers: 25, maxCollectionsPerMonth: 250 };
  const activeAgentsCount = agents.filter((a: any) => a.status === "ACTIVE").length;
  const activeCustomersCount = customers.filter((c: any) => c.status === "ACTIVE" || c.status === "INVITED").length;

  const usageData = {
    plan: PLAN_NAMES[currentPlan] ?? currentPlan,
    agents: { used: activeAgentsCount, max: limits.maxAgents },
    customers: { used: activeCustomersCount, max: limits.maxCustomers },
    collections: { used: collectionsThisMonth, max: limits.maxCollectionsPerMonth },
  };

  if (!isUserLoaded || !isOrgLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Loading your agent console...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) return <Navigate to="/sign-in" replace />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img src="/fundcircle-logo.png" alt="FC" className="h-8 w-8 rounded-xl object-cover object-top shadow-md shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-900">Agent Portal</p>
            <p className="text-xs text-slate-400">{organization?.name}</p>
          </div>
        </div>
        <Sheet>
          <SheetTrigger render={
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          } />
          <SheetContent side="left" className="w-[280px] p-0">
            <AgentSidebar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              user={user}
              organization={organization}
              usageData={usageData}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-screen sticky top-0 shadow-sm">
        <AgentSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          organization={organization}
          usageData={usageData}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden" />
          <TabsContent value="overview" className="mt-0">
            <AgentOverview />
          </TabsContent>
          <TabsContent value="pending" className="mt-0">
            <AgentPending />
          </TabsContent>
          <TabsContent value="customers" className="mt-0">
            <AgentCustomers />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <AgentHistory />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MiniUsageBar({ used, max }: { used: number; max: number }) {
  const pct = max === -1 ? 0 : Math.min((used / max) * 100, 100);
  const color = pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: max === -1 ? "4%" : `${pct}%` }}
      />
    </div>
  );
}

function AgentSidebar({ activeTab, setActiveTab, user, organization, usageData }: any) {
  const { customers, agents, collections, plan } = usageData;
  const customerPct = customers.max === -1 ? 0 : (customers.used / customers.max) * 100;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Logo */}
      <div className="p-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/fundcircle-logo.png" alt="FC" className="h-10 w-10 rounded-xl object-cover object-top shadow-md shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Agent Portal</p>
            <p className="text-sm font-bold text-slate-900 truncate">{organization?.name || "FundCircle"}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-3 px-3 space-y-0.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 font-semibold shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Plan Usage Card */}
      <div className="mx-3 mb-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</span>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            plan === "Free" ? "bg-slate-200 text-slate-600"
            : plan === "Starter" ? "bg-sky-100 text-sky-700"
            : plan === "Growth" ? "bg-violet-100 text-violet-700"
            : "bg-amber-100 text-amber-700"
          }`}>
            {plan}
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Collectors</span>
              <span className={`font-semibold ${agents.used >= agents.max && agents.max !== -1 ? "text-red-600" : "text-slate-700"}`}>
                {agents.used} / {formatLimit(agents.max)}
              </span>
            </div>
            <MiniUsageBar used={agents.used} max={agents.max} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Customers</span>
              <span className={`font-semibold ${customerPct >= 100 ? "text-red-600" : customerPct >= 80 ? "text-amber-600" : "text-slate-700"}`}>
                {customers.used} / {formatLimit(customers.max)}
              </span>
            </div>
            <MiniUsageBar used={customers.used} max={customers.max} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Collections</span>
              <span className="font-semibold text-slate-700">
                {collections.used} / {formatLimit(collections.max)}
              </span>
            </div>
            <MiniUsageBar used={collections.used} max={collections.max} />
          </div>
        </div>
      </div>

      {/* User */}
      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 mb-2 border border-slate-100">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-bold">
              {user?.firstName?.charAt(0) || "A"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.fullName || "Agent"}</p>
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

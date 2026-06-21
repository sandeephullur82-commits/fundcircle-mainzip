import { useUser, useOrganization, useOrganizationList, SignOutButton } from "@clerk/clerk-react";
import {
  LayoutDashboard, Users, PiggyBank, ReceiptText, MoreHorizontal,
  Bell, Check, Building2, ChevronDown, LogOut,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useRef, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/BrandLogo";
import AgentOverview from "./AgentOverview";
import AgentCustomers from "./AgentCustomers";
import AgentCollections from "./AgentCollections";
import AgentHistory from "./AgentHistory";
import AgentProfile from "./AgentProfile";

const BOTTOM_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "collect",   label: "Collect",   icon: PiggyBank },
  { id: "receipts",  label: "Receipts",  icon: ReceiptText },
  { id: "more",      label: "More",      icon: MoreHorizontal },
];

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard",        icon: LayoutDashboard },
  { id: "customers", label: "My Customers",      icon: Users },
  { id: "collect",   label: "Collection Entry",  icon: PiggyBank },
  { id: "receipts",  label: "Receipts",          icon: ReceiptText },
  { id: "more",      label: "More",              icon: MoreHorizontal },
];

export default function AgentDashboard() {
  const { isLoaded: isUserLoaded, isSignedIn, user } = useUser();
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    const handler = (e: Event) => setActiveTab((e as CustomEvent).detail);
    window.addEventListener("fundcircle:agentSwitchTab", handler);
    return () => window.removeEventListener("fundcircle:agentSwitchTab", handler);
  }, []);

  if (!isUserLoaded || !isOrgLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-screen">
          <div className="p-5 border-b border-slate-100">
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex-1 p-3 space-y-1">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) return <Navigate to="/sign-in" replace />;

  return (
    <div className="flex flex-col md:flex-row md:h-screen min-h-screen bg-slate-50">
      {/* Mobile Header — compact fintech style */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-2.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark size="sm" />
          {organization && (
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none">Collection</p>
              <p className="text-xs font-bold text-slate-700 truncate max-w-[130px] leading-tight mt-0.5">{organization.name}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center relative">
            <Bell className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={() => setActiveTab("more")} className="shrink-0">
            <Avatar className="h-8 w-8 ring-2 ring-emerald-500/30">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">
                {user?.firstName?.charAt(0) || "A"}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 h-full shrink-0 shadow-sm">
        <AgentSidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} organization={organization} />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 md:p-8 w-full max-w-5xl mx-auto pb-24 md:pb-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden" />
          <TabsContent value="dashboard" className="mt-0">
            <AgentOverview onSwitchTab={setActiveTab} />
          </TabsContent>
          <TabsContent value="customers" className="mt-0">
            <AgentCustomers onCollect={() => setActiveTab("collect")} />
          </TabsContent>
          <TabsContent value="collect" className="mt-0">
            <AgentCollections />
          </TabsContent>
          <TabsContent value="receipts" className="mt-0">
            <AgentHistory />
          </TabsContent>
          <TabsContent value="more" className="mt-0">
            <AgentProfile />
          </TabsContent>
        </Tabs>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-center safe-area-pb">
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-colors min-h-[56px] justify-center ${
                isActive ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
              <span className="text-[9px] font-semibold leading-none mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AgentSidebar({ activeTab, setActiveTab, user, organization }: any) {
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const memberships = userMemberships?.data || [];
  const hasMultipleOrgs = memberships.length > 1;

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === organization?.id || !setActive || switching) return;
    setSwitching(true);
    setDropdownOpen(false);
    try {
      await setActive({ organization: orgId });
      navigate("/router", { replace: true });
    } catch {
      setSwitching(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="px-5 py-4 border-b border-slate-100 shrink-0">
        <BrandMark />
        {hasMultipleOrgs ? (
          <div className="relative mt-1.5" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={switching}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors w-full text-left"
            >
              <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="truncate flex-1">{organization?.name || "Select Organization"}</span>
              <ChevronDown className={`w-3 h-3 shrink-0 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Switch Organization
                </p>
                {memberships.map((m: any) => {
                  const id   = m.organization?.id;
                  const name = m.organization?.name || id;
                  const isActive = id === organization?.id;
                  return (
                    <button key={id} onClick={() => handleSwitchOrg(id)}
                      className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-2.5 ${
                        isActive ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <span className="truncate flex-1">{name}</span>
                      {isActive && <Check className="w-3 h-3 shrink-0 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mt-0.5">
            {organization?.name || "Collector Portal"}
          </p>
        )}
      </div>

      <div className="flex-1 py-3 px-3 space-y-0.5">
        {SIDEBAR_ITEMS.map((item) => {
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
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 mb-2 border border-slate-100">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-bold">
              {user?.firstName?.charAt(0) || "A"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.fullName || "Collector"}</p>
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

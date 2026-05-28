import { useUser, useOrganization, SignOutButton } from "@clerk/clerk-react";
import {
  LogOut, Users, History,
  AlertCircle, Menu, LayoutDashboard,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Navigate } from "react-router-dom";
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

export default function AgentDashboard() {
  const { isLoaded: isUserLoaded, isSignedIn, user } = useUser();
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");

  // Render shimmer only for the brief Clerk session check — not blocking on Firestore
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
            {menuItems.map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
          </div>
          <div className="p-3 border-t border-slate-100">
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
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
            <p className="text-xs font-semibold text-slate-900">Collector Portal</p>
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

function AgentSidebar({ activeTab, setActiveTab, user, organization }: any) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/fundcircle-logo.png" alt="FC" className="h-10 w-10 rounded-xl object-cover object-top shadow-md shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Collector Portal</p>
            <p className="text-sm font-bold text-slate-900 truncate">{organization?.name || "FundCircle"}</p>
          </div>
        </div>
      </div>

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

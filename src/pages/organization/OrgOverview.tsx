import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Collection, Loan, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, Wallet, CreditCard, TrendingUp, IndianRupee,
  UserCheck, SendHorizonal, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";

export default function OrgOverview() {
  const { data: collections, loading: collLoading } = useCollectionRealtime<Collection>("collections");
  const { data: members, loading: membersLoading } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loans, loading: loansLoading } = useCollectionRealtime<Loan>("loans");
  const { data: invitations, loading: invLoading } = useCollectionRealtime<any>("pendingInvites");

  const isLoading = collLoading || membersLoading || loansLoading || invLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 w-48 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const customers = members.filter((u) => u.role === "CUSTOMER" || u.role === "customer");
  const allCollectors = members.filter((u) => u.role === "AGENT" || u.role === "agent");
  const activeCollectorCount = allCollectors.filter((a: any) => a.status === "ACTIVE").length;

  // Pending invitations (PENDING status, not revoked/accepted)
  const pendingInvitations = invitations.filter(
    (i: any) =>
      (i.status || "").toUpperCase() !== "REVOKED" &&
      !i.profileCompleted &&
      (i.status || "").toUpperCase() !== "ACCEPTED" &&
      (i.status || "").toUpperCase() !== "ACTIVE"
  );
  const pendingAgents    = pendingInvitations.filter((i: any) => i.role === "pigmy_collector").length;
  const pendingCustomers = pendingInvitations.filter((i: any) => i.role === "customer").length;

  // Today & monthly collections
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const toDate = (ts: any): Date => {
    if (!ts) return new Date(0);
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
  };

  const todayCollections = collections.filter((c) => toDate(c.timestamp) >= today);
  const monthCollections  = collections.filter((c) => toDate(c.timestamp) >= thisMonth);
  const todayTotal   = todayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const monthlyTotal = monthCollections.reduce((s, c)  => s + (Number(c.amount) || 0), 0);
  const totalSavings = customers.reduce((s, c) => s + (Number(c.balance) || 0), 0);

  const activeLoans  = loans.filter((l) => l.status === "active");
  const pendingLoans = loans.filter((l) => l.status === "pending");

  const recentCollections = [...collections]
    .sort((a, b) => toDate(b.timestamp).valueOf() - toDate(a.timestamp).valueOf())
    .slice(0, 5);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Dashboard Overview</h2>
        <p className="text-slate-500 text-sm">Real-time platform metrics and activity.</p>
      </div>

      {/* Metric cards — 4 + 4 grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title="Total Customers"
          value={customers.length.toString()}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          trend={`${customers.filter((c: any) => c.status === "ACTIVE").length} active`}
          bg="bg-blue-50"
        />
        <MetricCard
          title="Active Collectors"
          value={activeCollectorCount.toString()}
          icon={<UserCheck className="w-5 h-5 text-sky-600" />}
          trend={`${allCollectors.length} total collectors`}
          bg="bg-sky-50"
        />
        <MetricCard
          title="Pending Invitations"
          value={(pendingAgents + pendingCustomers).toString()}
          icon={<SendHorizonal className="w-5 h-5 text-violet-600" />}
          trend={`${pendingAgents} agents · ${pendingCustomers} customers`}
          bg="bg-violet-50"
        />
        <MetricCard
          title="Today's Collection"
          value={`₹${todayTotal.toLocaleString()}`}
          icon={<IndianRupee className="w-5 h-5 text-emerald-600" />}
          trend={`${todayCollections.length} transaction${todayCollections.length !== 1 ? "s" : ""} today`}
          bg="bg-emerald-50"
        />
        <MetricCard
          title="Monthly Collection"
          value={`₹${monthlyTotal.toLocaleString()}`}
          icon={<CalendarDays className="w-5 h-5 text-teal-600" />}
          trend={`${monthCollections.length} transactions this month`}
          bg="bg-teal-50"
        />
        <MetricCard
          title="Total Savings"
          value={`₹${totalSavings.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5 text-purple-600" />}
          trend="Combined customer balances"
          bg="bg-purple-50"
        />
        <MetricCard
          title="Active Loans"
          value={activeLoans.length.toString()}
          icon={<CreditCard className="w-5 h-5 text-orange-600" />}
          trend={`${pendingLoans.length} pending approval`}
          bg="bg-orange-50"
        />
        <MetricCard
          title="All Collections"
          value={collections.length.toString()}
          icon={<TrendingUp className="w-5 h-5 text-rose-600" />}
          trend="Total recorded entries"
          bg="bg-rose-50"
        />
      </div>

      {/* Recent activity + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              Recent Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCollections.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No collections recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {recentCollections.map((col) => {
                  const customer = customers.find((c) => c.id === col.customerId);
                  const agent = allCollectors.find((a) => a.id === col.agentId);
                  const d = toDate(col.timestamp);
                  return (
                    <div
                      key={col.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div>
                        <p className="font-semibold text-sm text-slate-900">
                          {customer?.fullName || (customer as any)?.name || "Unknown Customer"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {agent?.fullName || (agent as any)?.name || "Unknown"} ·{" "}
                          {d ? format(d, "MMM d, h:mm a") : "—"}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm">+₹{Number(col.amount).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction
              label="Invite Customer"
              color="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
              onClick={() => window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "customers" }))}
            />
            <QuickAction
              label="Invite Agent"
              color="bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100"
              onClick={() => window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "agents" }))}
            />
            <QuickAction
              label="Record Collection"
              color="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
              onClick={() => window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "collections" }))}
            />
            <QuickAction
              label="Manage Invitations"
              color="bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100"
              onClick={() => window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "invitations" }))}
            />
            <QuickAction
              label="View Reports"
              color="bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100"
              onClick={() => window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "reports" }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, trend, bg }: any) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-slate-500 leading-tight pr-1">{title}</h3>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
            {icon}
          </div>
        </div>
        <p className="text-xl md:text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-[10px] text-slate-400 mt-1 leading-tight">{trend}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-3 rounded-xl border text-sm font-semibold text-left transition-colors ${color}`}
    >
      {label}
    </button>
  );
}

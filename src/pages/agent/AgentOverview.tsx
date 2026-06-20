import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection, Loan } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  IndianRupee, CheckCircle, Clock, Users, CreditCard, PiggyBank, Eye,
} from "lucide-react";
import { startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";

interface AgentOverviewProps {
  onSwitchTab: (tab: string) => void;
}

export default function AgentOverview({ onSwitchTab }: AgentOverviewProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  const { data: collections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);
  const { data: loans } = useCollectionRealtime<Loan>("loans", [
    where("status", "==", "ACTIVE"),
  ]);

  const today            = startOfDay(new Date());
  const todayCollections = collections.filter((c) => toDate(c.collectedAt || (c as any).timestamp) >= today);
  const todayTotal       = todayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const activeCustomers  = allMembers.filter((m) => (m as any).status === "ACTIVE");
  const pendingCustomers = activeCustomers.filter(
    (c) => !todayCollections.some((col) => col.customerId === c.id || col.customerId === c.clerkUserId)
  );

  const myActiveLoans = loans.filter((l) => {
    if (l.loanAssignedCollectorId) return l.loanAssignedCollectorId === agentId;
    const cust = allMembers.find((m) => m.id === l.customerId || m.clerkUserId === l.customerId);
    return (cust as any)?.assignedAgentId === agentId;
  });

  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);

  const shortId = (id: string) => `FC-${id.slice(-6).toUpperCase()}`;

  const sortedCustomers = [...activeCustomers].sort((a, b) => {
    const aName = (a as any).fullName || (a as any).name || "";
    const bName = (b as any).fullName || (b as any).name || "";
    return aName.localeCompare(bName);
  });

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-600 text-white shadow-md col-span-2">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium">Today's Collection</p>
              <p className="text-3xl font-black">₹{todayTotal.toLocaleString()}</p>
              <p className="text-emerald-200 text-xs mt-0.5">
                {todayCollections.length} transaction{todayCollections.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <IndianRupee className="w-6 h-6 text-white" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-amber-700 text-xs font-medium mb-1">Pending Visits</p>
            <p className="text-2xl font-black text-amber-900">{pendingCustomers.length}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-600">not visited</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-50">
          <CardContent className="p-4">
            <p className="text-slate-500 text-xs font-medium mb-1">Assigned Customers</p>
            <p className="text-2xl font-black text-slate-900">{activeCustomers.length}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">active</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-indigo-50 border-indigo-100 col-span-2 sm:col-span-4 sm:hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-indigo-700 text-xs font-medium mb-1">Today's EMI Due</p>
              <p className="text-2xl font-black text-indigo-900">{myActiveLoans.length}</p>
            </div>
            <CreditCard className="w-8 h-8 text-indigo-300" />
          </CardContent>
        </Card>

        <Card className="bg-indigo-50 border-indigo-100 hidden sm:block">
          <CardContent className="p-4">
            <p className="text-indigo-700 text-xs font-medium mb-1">Today's EMI Due</p>
            <p className="text-2xl font-black text-indigo-900">{myActiveLoans.length}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <CreditCard className="w-3 h-3 text-indigo-400" />
              <span className="text-xs text-indigo-500">active loans</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Progress Bar */}
      {activeCustomers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Today's Progress</span>
            <span>{activeCustomers.length - pendingCustomers.length}/{activeCustomers.length} collected</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${activeCustomers.length > 0 ? ((activeCustomers.length - pendingCustomers.length) / activeCustomers.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Customer List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-800">
            <PiggyBank className="w-4 h-4 text-emerald-600 inline mr-1.5 mb-0.5" />
            Daily Collection Route
          </h2>
          <span className="text-xs text-slate-400">{sortedCustomers.length} customers</span>
        </div>

        {sortedCustomers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No customers assigned yet.</p>
            <p className="text-xs mt-1">Your manager will assign customers to you.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedCustomers.map((customer) => {
              const collectedToday = todayCollections.some(
                (c) => c.customerId === customer.id || c.customerId === customer.clerkUserId
              );
              const name  = (customer as any).fullName || (customer as any).name || customer.email || "";
              return (
                <div
                  key={customer.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    collectedToday
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-slate-900 text-sm truncate">{name}</p>
                      </div>
                      <p className="text-xs text-slate-400">{shortId(customer.id)} · {customer.phone || customer.email || "—"}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {collectedToday ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Done
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => setSelectedCustomer(customer)}
                            className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <IndianRupee className="w-3 h-3" /> Collect
                          </button>
                          <button
                            onClick={() => onSwitchTab("customers")}
                            className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CollectDialog
        customer={selectedCustomer}
        orgId={orgId}
        orgName={orgName}
        agentId={agentId}
        agentName={agentName}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}

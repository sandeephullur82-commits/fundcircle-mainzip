import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection, Loan } from "@/types";
import {
  IndianRupee, PiggyBank, CreditCard, Clock, CheckCircle,
  Layers, Users,
} from "lucide-react";
import { startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";

type TabId = "ALL" | "SAVINGS" | "EMI" | "PENDING";

const COLLECTION_TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "ALL",     label: "All",     icon: Users    },
  { id: "SAVINGS", label: "Savings", icon: PiggyBank },
  { id: "EMI",     label: "EMI",     icon: CreditCard },
  { id: "PENDING", label: "Pending", icon: Clock    },
];

export default function AgentCollections() {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const { data: allCustomers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  const { data: collections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);
  const { data: loans } = useCollectionRealtime<Loan>("loans", [
    where("status", "==", "ACTIVE"),
  ]);
  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts");

  const [activeTab,        setActiveTab]        = useState<TabId>("ALL");
  const [collectCustomer,  setCollectCustomer]  = useState<any | null>(null);

  const today            = startOfDay(new Date());
  const todayCollections = collections.filter((c) => toDate(c.collectedAt || (c as any).timestamp) >= today);
  const todayTotal       = todayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const activeCustomers = allCustomers.filter((c) => (c as any).status === "ACTIVE");

  const isMyLoan = (loan: Loan, customer?: Membership) => {
    if (!loan) return false;
    if (loan.loanAssignedCollectorId) return loan.loanAssignedCollectorId === agentId;
    if (!customer) return false;
    return (customer as any).assignedAgentId === agentId;
  };

  const getActiveLoan = (customer: Membership) =>
    loans.find((l) => (l.customerId === customer.id || l.customerId === customer.clerkUserId) && isMyLoan(l, customer));

  const getSavingsAccount = (customer: Membership) =>
    savingsAccounts.find((s: any) => s.customerId === customer.id || s.customerId === customer.clerkUserId);

  const hasDoneToday = (customer: Membership) =>
    todayCollections.some((c) => c.customerId === customer.id || c.customerId === customer.clerkUserId);

  const customersWithLoans = activeCustomers.filter((c) => !!getActiveLoan(c));

  const getFilteredCustomers = () => {
    switch (activeTab) {
      case "SAVINGS":
        return activeCustomers.filter((c) => !!getSavingsAccount(c));
      case "EMI":
        return customersWithLoans;
      case "PENDING":
        return activeCustomers.filter((c) => !hasDoneToday(c));
      default:
        return activeCustomers;
    }
  };

  const filtered = getFilteredCustomers().sort((a, b) => {
    const aName = (a as any).fullName || (a as any).name || "";
    const bName = (b as any).fullName || (b as any).name || "";
    return aName.localeCompare(bName);
  });

  const pendingCount = activeCustomers.filter((c) => !hasDoneToday(c)).length;

  const shortId = (id: string) => `FC-${id.slice(-6).toUpperCase()}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Collections</h2>
        <p className="text-sm text-slate-500">
          Today: ₹{todayTotal.toLocaleString()} · {todayCollections.length} transactions
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-emerald-700">₹{todayTotal.toLocaleString()}</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Collected Today</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-amber-700">{pendingCount}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">Pending</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-indigo-700">{customersWithLoans.length}</p>
          <p className="text-[10px] text-indigo-600 mt-0.5">EMI Loans</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {COLLECTION_TABS.map(({ id, label, icon: Icon }) => {
          const count = id === "PENDING" ? pendingCount
            : id === "EMI" ? customersWithLoans.length
            : id === "SAVINGS" ? activeCustomers.filter((c) => !!getSavingsAccount(c)).length
            : activeCustomers.length;

          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
                activeTab === id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count > 0 && (
                <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ml-0.5 ${
                  activeTab === id ? "bg-white/30 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Customer collection cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {activeTab === "PENDING" ? (
            <>
              <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
              <p className="font-semibold text-emerald-600">All collections done for today!</p>
              <p className="text-xs mt-1">Great work — every customer has been visited.</p>
            </>
          ) : (
            <>
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No customers in this category.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((customer) => {
            const c           = customer as any;
            const name        = c.fullName || c.name || c.email || "";
            const done        = hasDoneToday(customer);
            const savAcc      = getSavingsAccount(customer);
            const loan        = getActiveLoan(customer);

            return (
              <div
                key={customer.id}
                className={`rounded-2xl border p-4 transition-all ${
                  done
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900 text-sm truncate">{name}</p>
                    </div>
                    <p className="text-xs text-slate-400 mb-1.5">{shortId(customer.id)} · {c.phone || c.email || "—"}</p>

                    {/* Financial summary */}
                    <div className="flex items-center gap-3 text-xs">
                      {savAcc && (
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <PiggyBank className="w-3 h-3" />₹{(savAcc.totalBalance || 0).toLocaleString()}
                        </span>
                      )}
                      {loan && (
                        <span className="flex items-center gap-1 text-indigo-600 font-semibold">
                          <CreditCard className="w-3 h-3" />₹{(loan.outstandingBalance ?? 0).toLocaleString()} due
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {done ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Done
                      </span>
                    ) : (
                      <button
                        onClick={() => setCollectCustomer(customer)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl transition-colors"
                      >
                        <IndianRupee className="w-4 h-4" /> Collect
                      </button>
                    )}
                  </div>
                </div>

                {/* S+L buttons when not collected */}
                {!done && cType === "SAVINGS_LOAN" && savAcc && loan && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setCollectCustomer({ ...customer, customerType: "SAVINGS" })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200 transition-colors"
                    >
                      <PiggyBank className="w-3.5 h-3.5" /> Savings
                    </button>
                    <button
                      onClick={() => setCollectCustomer({ ...customer, customerType: "LOAN" })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> EMI
                    </button>
                    <button
                      onClick={() => setCollectCustomer(customer)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200 transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5" /> Both
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CollectDialog
        customer={collectCustomer}
        orgId={orgId}
        orgName={orgName}
        agentId={agentId}
        agentName={agentName}
        onClose={() => setCollectCustomer(null)}
      />
    </div>
  );
}

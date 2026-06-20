import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Membership, Collection, Loan } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronDown, ChevronUp, PiggyBank, CreditCard, IndianRupee, Users,
  Phone, MapPin, UserCheck,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import CollectDialog, { toDate } from "@/components/agent/CollectDialog";

interface AgentCustomersProps {
  onCollect?: () => void;
}

export default function AgentCustomers({ onCollect }: AgentCustomersProps) {
  const { user }         = useUser();
  const { organization } = useOrganization();

  const agentId   = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId     = organization?.id || "";
  const orgName   = organization?.name || "FundCircle";

  const { data: allCustomers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts");
  const { data: loans }           = useCollectionRealtime<Loan>("loans", [where("status", "==", "ACTIVE")]);
  const { data: collections }     = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);

  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [collectCustomer, setCollectCustomer] = useState<any | null>(null);

  const today = startOfDay(new Date());

  const activeCustomers = allCustomers.filter((c) => (c as any).status === "ACTIVE");

  const filtered = activeCustomers
    .sort((a, b) => a.id.localeCompare(b.id));

  const getSavingsAccount = (customer: Membership) =>
    savingsAccounts.find((s: any) => s.customerId === customer.id || s.customerId === customer.clerkUserId);

  const getActiveLoan = (customer: Membership) =>
    loans.find((l) => (l.customerId === customer.id || l.customerId === customer.clerkUserId) && l.status === "ACTIVE");

  const getLastCollection = (customer: Membership) => {
    const custCols = collections
      .filter((c) => c.customerId === customer.id || c.customerId === customer.clerkUserId)
      .sort((a, b) => toDate(b.collectedAt || (b as any).timestamp).valueOf() - toDate(a.collectedAt || (a as any).timestamp).valueOf());
    return custCols[0] || null;
  };

  const collectedToday = (customer: Membership) => {
    const todayCollections = collections.filter((c) => toDate(c.collectedAt || (c as any).timestamp) >= today);
    return todayCollections.some((c) => c.customerId === customer.id || c.customerId === customer.clerkUserId);
  };

  const shortId = (id: string) => `FC-${id.slice(-6).toUpperCase()}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Customers</h2>
          <p className="text-sm text-slate-500">{activeCustomers.length} assigned · sorted by ID</p>
        </div>
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-500">No customers found</p>
          <p className="text-xs mt-1">No customers assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((customer) => {
            const c            = customer as any;
            const name         = c.fullName || c.name || c.email || "";
            const isExpanded   = expandedId === customer.id;
            const savAcc       = getSavingsAccount(customer);
            const loan         = getActiveLoan(customer);
            const lastCol      = getLastCollection(customer);
            const isDoneToday  = collectedToday(customer);

            return (
              <Card
                key={customer.id}
                className={`overflow-hidden transition-shadow ${isExpanded ? "shadow-md border-emerald-200" : "shadow-sm"}`}
              >
                {/* Collapsed card */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                  className="w-full text-left"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-slate-900 truncate">{name}</p>
                          {isDoneToday && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              ✓ Done
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{shortId(customer.id)} · {c.phone || c.email || "—"}</p>
                        <div className="flex items-center gap-4">
                          {savAcc && (
                            <div className="flex items-center gap-1">
                              <PiggyBank className="w-3 h-3 text-emerald-500" />
                              <span className="text-xs font-semibold text-emerald-700">₹{(savAcc.totalBalance || 0).toLocaleString()}</span>
                            </div>
                          )}
                          {loan && (
                            <div className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-indigo-500" />
                              <span className="text-xs font-semibold text-indigo-700">₹{(loan.outstandingBalance ?? 0).toLocaleString()}</span>
                            </div>
                          )}
                          {!savAcc && !loan && (
                            <span className="text-xs text-slate-400 italic">No active accounts</span>
                          )}
                        </div>
                      </div>
                      <div className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </CardContent>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 pb-4 pt-3 space-y-4">
                    {/* Full info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Details</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-slate-600">{shortId(customer.id)}</span>
                          </div>
                          {c.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-600">{c.phone}</span>
                            </div>
                          )}
                          {c.address && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="text-slate-600 text-xs leading-relaxed">{c.address}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {(c.nomineeName || c.nomineePhone || c.nomineeRelation) && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nominee</p>
                          <div className="space-y-1 text-sm text-slate-600">
                            {c.nomineeName     && <p>{c.nomineeName}</p>}
                            {c.nomineePhone    && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" />{c.nomineePhone}</p>}
                            {c.nomineeRelation && <p className="text-xs text-slate-400">{c.nomineeRelation}</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Savings details */}
                    {savAcc && (
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">Savings Account</p>
                        <div className="flex items-center justify-between">
                          <div>
                            {savAcc.planName && <p className="text-xs text-emerald-700 font-medium">{savAcc.planName}</p>}
                            <p className="text-xs text-emerald-600">Total Balance</p>
                          </div>
                          <p className="text-xl font-black text-emerald-700">₹{(savAcc.totalBalance || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    )}

                    {/* Loan details */}
                    {loan && (
                      <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Active Loan</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-indigo-700 font-medium">
                              ₹{(loan as any).loanAmount?.toLocaleString() || "—"} · {(loan as any).tenureMonths || (loan as any).durationMonths}mo
                            </p>
                            <p className="text-xs text-indigo-600">Outstanding Balance</p>
                          </div>
                          <p className="text-xl font-black text-indigo-700">₹{(loan.outstandingBalance ?? 0).toLocaleString()}</p>
                        </div>
                      </div>
                    )}

                    {/* Last collection */}
                    {lastCol && (
                      <div className="bg-white rounded-xl p-3 border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Last Collection</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-600">
                              {toDate(lastCol.collectedAt || (lastCol as any).timestamp).getTime() > 0
                                ? format(toDate(lastCol.collectedAt || (lastCol as any).timestamp), "MMM d, yyyy · h:mm a")
                                : "—"}
                            </p>
                            {lastCol.receiptNo && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{lastCol.receiptNo}</p>}
                          </div>
                          <p className="font-bold text-emerald-600">₹{Number(lastCol.amount).toLocaleString()}</p>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setCollectCustomer(customer)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${
                          savAcc && loan ? "bg-violet-600 hover:bg-violet-700"
                          : loan ? "bg-indigo-600 hover:bg-indigo-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {savAcc && loan
                          ? <><IndianRupee className="w-4 h-4" /> Collect Both</>
                          : loan
                          ? <><CreditCard className="w-4 h-4" /> EMI Entry</>
                          : savAcc
                          ? <><PiggyBank className="w-4 h-4" /> Savings Entry</>
                          : <><IndianRupee className="w-4 h-4" /> Collect</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </Card>
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

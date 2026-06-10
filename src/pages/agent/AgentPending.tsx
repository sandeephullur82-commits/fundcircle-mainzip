import { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { Membership, Collection } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format, startOfDay, differenceInDays } from "date-fns";
import { Search, Clock, CheckCircle, AlertTriangle, PiggyBank } from "lucide-react";
import { where } from "firebase/firestore";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export default function AgentPending() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const agentId = user?.id || "";

  // Firestore-level filter: only fetch customers assigned to this agent
  const { data: allMembers, loading: membersLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  const { data: collections } = useCollectionRealtime<Collection>("collections");
  const { data: savingsAccounts } = useCollectionRealtime<any>("savings_accounts");

  const [search, setSearch] = useState("");

  const today = startOfDay(new Date());

  // allMembers is already scoped to this agent; just filter by active status
  const myCustomers = allMembers.filter((m) => {
    return (m as any).status === "ACTIVE";
  });

  const myCollections = collections.filter((c) => c.agentId === agentId);
  const todayCollections = myCollections.filter((c) => toDate(c.collectedAt || c.timestamp) >= today);

  // Customers with no collection today
  const pendingCustomers = myCustomers.filter((cust) => {
    return !todayCollections.some(
      (col) => col.customerId === cust.id || col.customerId === cust.clerkUserId
    );
  });

  // Customers collected today
  const collectedCustomers = myCustomers.filter((cust) => {
    return todayCollections.some(
      (col) => col.customerId === cust.id || col.customerId === cust.clerkUserId
    );
  });

  const filtered = pendingCustomers.filter((c) => {
    const name = (c as any).fullName || (c as any).name || c.email || "";
    return !search || name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
  });

  const getLastCollectionDate = (customer: Membership): Date | null => {
    const custCols = myCollections
      .filter((c) => c.customerId === customer.id || c.customerId === customer.clerkUserId)
      .sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf());
    if (custCols.length === 0) return null;
    return toDate(custCols[0].collectedAt || custCols[0].timestamp);
  };

  const getSavingsBalance = (customer: Membership): number => {
    const acc = savingsAccounts.find(
      (a: any) => a.customerId === customer.id || a.customerId === customer.clerkUserId
    );
    return acc?.totalBalance || 0;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Pending Collections</h2>
        <p className="text-slate-500 text-sm">Customers who have not been visited today.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-amber-900">{pendingCustomers.length}</p>
            <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" /> Pending today
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-emerald-900">{collectedCustomers.length}</p>
            <p className="text-xs text-emerald-700 flex items-center gap-1 mt-0.5">
              <CheckCircle className="w-3 h-3" /> Collected today
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-slate-900">{myCustomers.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total assigned</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {myCustomers.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Today's progress</span>
            <span className="font-semibold">{collectedCustomers.length}/{myCustomers.length}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all"
              style={{ width: `${myCustomers.length > 0 ? (collectedCustomers.length / myCustomers.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pending customer…"
          className="pl-9 h-10"
        />
      </div>

      {/* Pending list */}
      {membersLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-900">
              {pendingCustomers.length === 0 ? "All collections done for today! 🎉" : "No customers match your search."}
            </p>
            {pendingCustomers.length === 0 && (
              <p className="text-xs text-slate-500 mt-1">Great work — all {myCustomers.length} customers have been visited.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => {
            const name = (customer as any).fullName || (customer as any).name || customer.email || "";
            const lastCol = getLastCollectionDate(customer);
            const daysSince = lastCol ? differenceInDays(today, lastCol) : null;
            const balance = getSavingsBalance(customer);
            const isLongAbsence = daysSince !== null && daysSince > 3;

            return (
              <div
                key={customer.id}
                className={`p-4 rounded-2xl border flex items-center gap-3 ${
                  isLongAbsence ? "bg-red-50 border-red-200" : "bg-white border-slate-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                  isLongAbsence ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500">{customer.phone || customer.email || ""}</span>
                    {daysSince !== null && (
                      <span className={`text-xs font-semibold ${isLongAbsence ? "text-red-600" : "text-slate-500"}`}>
                        {isLongAbsence && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                        Last: {daysSince === 0 ? "Yesterday" : `${daysSince}d ago`}
                      </span>
                    )}
                    {daysSince === null && <span className="text-xs text-slate-400 italic">No prior collections</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    <PiggyBank className="w-3 h-3 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-600">₹{balance.toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">savings bal</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collected customers */}
      {collectedCustomers.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Completed Today</p>
          <div className="space-y-1">
            {collectedCustomers.map((customer) => {
              const name = (customer as any).fullName || (customer as any).name || customer.email || "";
              const todayCol = todayCollections.find(
                (c) => c.customerId === customer.id || c.customerId === customer.clerkUserId
              );
              return (
                <div key={customer.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="font-semibold text-slate-800 text-sm">{name}</p>
                  </div>
                  <p className="font-bold text-emerald-600 text-sm">₹{Number(todayCol?.amount || 0).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

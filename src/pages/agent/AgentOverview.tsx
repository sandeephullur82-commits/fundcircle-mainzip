import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Collection, Membership, SavingsAccount } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IndianRupee, Search, CheckCircle, Loader2, PiggyBank, Users, Clock,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { recordSavingsCollection, getSavingsAccountByCustomer } from "@/lib/services";
import { where } from "firebase/firestore";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import FieldError from "@/components/ui/FieldError";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export default function AgentOverview() {
  const { user } = useUser();
  const { organization } = useOrganization();

  const agentId = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId = organization?.id || "";

  // Fetch only this agent's assigned customers (Firestore-scoped, not full org dump)
  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "in", ["CUSTOMER", "customer"]),
    where("assignedAgentId", "==", agentId || "NONE"),
  ]);
  // Fetch only this agent's collections (Firestore-scoped)
  const { data: collections } = useCollectionRealtime<Collection>("collections", [
    where("agentId", "==", agentId || "NONE"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", orgId || null);

  // Collections are already scoped to this agent
  const myCollections = collections;
  const today = startOfDay(new Date());
  const todayCollections = myCollections.filter((c) => toDate(c.collectedAt || c.timestamp) >= today);
  const todayTotal = todayCollections.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // Members already filtered to this agent's assignments by Firestore
  const myCustomers = allMembers.filter((m) =>
    m.assignedAgentId === agentId || (m as any).assigned_to_user_id === agentId
  );
  const activeCustomers = myCustomers.filter((m) => (m as any).status === "ACTIVE");

  // Customers with no collection today
  const pendingCustomers = activeCustomers.filter((c) => {
    return !todayCollections.some((col) => col.customerId === c.id || col.customerId === c.clerkUserId);
  });

  // ── Savings Collection Modal ───────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [savingsAccount, setSavingsAccount] = useState<SavingsAccount | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [amountError, setAmountError] = useState("");

  const filteredCustomers = activeCustomers.filter((c) => {
    const name = (c as any).fullName || (c as any).name || c.email || "";
    return !search || name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
  });

  const handleSelectCustomer = async (customer: Membership) => {
    setSelectedCustomer(customer);
    setAmount("");
    setAmountError("");
    setSavingsAccount(null);
    try {
      const acc = await getSavingsAccountByCustomer(customer.id, orgId);
      setSavingsAccount(acc);
    } catch (e) {
      console.error("Failed to load savings account", e);
    }
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !orgId || !user?.id) return;
    const numAmount = Number(amount);
    if (!amount.trim()) { setAmountError("Collection amount is required"); return; }
    if (isNaN(numAmount) || numAmount <= 0) { setAmountError("Amount must be greater than 0"); return; }
    if (numAmount > 1_000_000) { setAmountError("Amount cannot exceed ₹10,00,000"); return; }
    setAmountError("");
    setSubmitting(true);
    try {
      const result = await recordSavingsCollection({
        organizationId: orgId,
        organizationName: organization?.name || "FundCircle",
        customerId: selectedCustomer.id,
        agentId: user.id,
        agentName,
        amount: numAmount,
      });

      setReceipt({
        receiptNo: result.receiptNo,
        organizationName: organization?.name || "FundCircle",
        customerName: (selectedCustomer as any).fullName || (selectedCustomer as any).name || selectedCustomer.email || "",
        accountNumber: (savingsAccount as any)?.id?.slice(-8) || undefined,
        amount: numAmount,
        newBalance: result.newBalance,
        collectionType: "SAVINGS",
        agentName,
        collectedAt: new Date(),
      });

      setSelectedCustomer(null);
      setAmount("");
      setSavingsAccount(null);
      toast.success(`₹${numAmount.toLocaleString()} collected · Receipt: ${result.receiptNo}`);
    } catch (err: any) {
      toast.error(err?.message || "Collection failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-600 text-white shadow-md col-span-2">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium">Today's Collections</p>
              <p className="text-3xl font-black">₹{todayTotal.toLocaleString()}</p>
              <p className="text-emerald-200 text-xs mt-0.5">{todayCollections.length} transaction{todayCollections.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <IndianRupee className="w-6 h-6 text-white" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="p-4">
            <p className="text-slate-500 text-xs font-medium mb-1">Assigned Customers</p>
            <p className="text-2xl font-black text-slate-900">{activeCustomers.length}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">{myCustomers.length} total</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50">
          <CardContent className="p-4">
            <p className="text-amber-700 text-xs font-medium mb-1">Pending Visits</p>
            <p className="text-2xl font-black text-amber-900">{pendingCustomers.length}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-600">no collection today</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Savings Collection Section */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PiggyBank className="w-4 h-4 text-emerald-600" />
            Record Savings Collection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer by name or phone…"
              className="pl-9 h-11"
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <PiggyBank className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active customers found.</p>
              {search && <p className="text-xs mt-1">Try a different search term.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredCustomers.map((customer) => {
                const collectedToday = todayCollections.some(
                  (c) => c.customerId === customer.id || c.customerId === customer.clerkUserId
                );
                const name = (customer as any).fullName || (customer as any).name || customer.email || "";
                return (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      collectedToday
                        ? "border-emerald-200 bg-emerald-50 opacity-70"
                        : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{customer.phone || customer.email || ""}</p>
                      </div>
                      {collectedToday ? (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Done
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          Pending
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's collection list */}
      {todayCollections.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Today's Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...todayCollections]
                .sort((a, b) => toDate(b.collectedAt || b.timestamp).valueOf() - toDate(a.collectedAt || a.timestamp).valueOf())
                .map((col) => {
                  const cust = allMembers.find((m) => m.id === col.customerId || m.clerkUserId === col.customerId);
                  const name = (cust as any)?.fullName || (cust as any)?.name || col.customerId?.slice(-6) || "Customer";
                  const d = toDate(col.collectedAt || col.timestamp);
                  const isSavings = col.collectionType !== "LOAN_EMI";
                  return (
                    <div key={col.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSavings ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                            {isSavings ? "SAVINGS" : "EMI"}
                          </span>
                          <span className="text-xs text-slate-500">{d.getTime() > 0 ? format(d, "h:mm a") : ""}</span>
                          {col.receiptNo && <span className="text-xs text-slate-400 font-mono">{col.receiptNo}</span>}
                        </div>
                      </div>
                      <span className="font-bold text-emerald-600">+₹{Number(col.amount).toLocaleString()}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Savings Collection Modal */}
      <Dialog open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-emerald-600" />
              Record Savings Collection
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <form onSubmit={handleCollect} className="space-y-4 mt-1">
              {/* Customer info */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="font-bold text-slate-900">
                  {(selectedCustomer as any).fullName || (selectedCustomer as any).name || selectedCustomer.email}
                </p>
                <p className="text-xs text-slate-500">{selectedCustomer.phone || selectedCustomer.email}</p>
                {savingsAccount !== null && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-500">Current Savings Balance</span>
                    <span className="font-bold text-emerald-600 text-sm">
                      ₹{savingsAccount ? savingsAccount.totalBalance.toLocaleString() : "0"}
                    </span>
                  </div>
                )}
                {savingsAccount === null && (
                  <p className="text-xs text-red-500 mt-1">⚠ No savings account found. Contact admin.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collect-amount">Amount to Collect (₹)</Label>
                <Input
                  id="collect-amount"
                  type="number"
                  min="1"
                  placeholder="e.g. 100"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
                  className={`text-xl h-12 font-bold ${amountError ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                  autoFocus
                />
                <FieldError error={amountError} />
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setSelectedCustomer(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11"
                  disabled={submitting || !amount || Number(amount) <= 0 || !savingsAccount}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Collecting…</> : "Collect & Get Receipt"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

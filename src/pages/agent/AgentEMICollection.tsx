import { useState, useEffect } from "react";
import FieldError from "@/components/ui/FieldError";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Loan, LoanInstallment, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, isBefore, startOfDay } from "date-fns";
import { Search, CreditCard, Loader2, AlertTriangle, CheckCircle, Banknote, Smartphone, Building2 } from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { recordEMICollection } from "@/lib/services";
import { onSnapshot, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface CustomerLoan {
  loan: Loan;
  nextInstallment: LoanInstallment | null;
  overdueCount: number;
}

export default function AgentEMICollection() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const agentId = user?.id || "";
  const agentName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Agent";
  const orgId = organization?.id || "";

  const { data: allMembers } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loans } = useCollectionRealtime<Loan>("loans");

  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [customerLoan, setCustomerLoan] = useState<CustomerLoan | null>(null);
  const [loadingLoan, setLoadingLoan] = useState(false);
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER">("CASH");
  const [upiRef, setUpiRef] = useState("");

  // A loan is "mine" if:
  //   1. It has an explicit loanAssignedCollectorId that matches my userId, OR
  //   2. It has no explicit loanAssignedCollectorId AND the customer's assignedAgentId matches mine
  const isMyLoan = (loan: Loan, customer?: Membership) => {
    const isActive = loan.status === "ACTIVE" || (loan.status as string) === "active";
    if (!isActive) return false;
    if (loan.loanAssignedCollectorId) {
      return loan.loanAssignedCollectorId === agentId;
    }
    if (!customer) return false;
    return (customer as any).assignedAgentId === agentId || (customer as any).assigned_to_user_id === agentId;
  };

  // Customers with active loans assigned to this agent
  const customersWithLoans = allMembers.filter((m) => {
    const isCustomer = ["CUSTOMER", "customer"].includes(m.role as string);
    const isActive = (m as any).status === "ACTIVE";
    if (!isCustomer || !isActive) return false;
    return loans.some((l) => {
      const isCustomerMatch = l.customerId === m.id || l.customerId === m.clerkUserId;
      return isCustomerMatch && isMyLoan(l, m);
    });
  });

  const filtered = customersWithLoans.filter((c) => {
    const name = (c as any).fullName || (c as any).name || c.email || "";
    return !search || name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
  });

  const handleSelectCustomer = (customer: Membership) => {
    setSelectedCustomer(customer);
    setCustomerLoan(null);
    const loan = loans.find((l) => {
      const isCustomerMatch = l.customerId === customer.id || l.customerId === customer.clerkUserId;
      return isCustomerMatch && isMyLoan(l, customer);
    });
    setActiveLoanId(loan?.id ?? null);
    if (!loan) setLoadingLoan(false);
  };

  // Clear activeLoanId whenever the dialog is closed
  useEffect(() => {
    if (!selectedCustomer) setActiveLoanId(null);
  }, [selectedCustomer]);

  // Real-time pending installments listener — fires whenever a customer's loan dialog is open
  useEffect(() => {
    if (!activeLoanId) {
      setCustomerLoan(null);
      setLoadingLoan(false);
      return;
    }
    setLoadingLoan(true);
    const today = startOfDay(new Date());
    const q = query(
      collection(db, "loan_installments"),
      where("loanId", "==", activeLoanId),
      where("status", "!=", "PAID")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loan = loans.find((l) => l.id === activeLoanId) ?? null;
        const installments = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LoanInstallment))
          .sort((a, b) => a.installmentNo - b.installmentNo);
        const nextInst = installments[0] || null;
        const overdueCount = installments.filter((i) => isBefore(toDate(i.dueDate), today)).length;
        setCustomerLoan(loan ? { loan, nextInstallment: nextInst, overdueCount } : null);
        setLoadingLoan(false);
      },
      (err) => {
        console.error("[AgentEMICollection] installments listener error:", err);
        toast.error("Failed to load loan details");
        setLoadingLoan(false);
      }
    );
    return () => unsub();
  }, [activeLoanId]);

  const handleCollectEMI = async () => {
    if (!selectedCustomer || !customerLoan?.nextInstallment || !orgId || !user?.id) return;
    if (paymentMode !== "CASH" && !upiRef.trim()) {
      toast.error("Please enter the payment reference number.");
      return;
    }
    const loan = customerLoan.loan;
    const inst = customerLoan.nextInstallment;
    setSubmitting(true);
    try {
      const result = await recordEMICollection({
        organizationId: orgId,
        organizationName: organization?.name || "FundCircle",
        loanId: loan.id,
        installmentId: inst.id,
        customerId: selectedCustomer.id,
        agentId: user.id,
        agentName,
        amount: inst.emiAmount,
        paymentMode,
        paymentReference: upiRef.trim() || undefined,
      });

      const custName = (selectedCustomer as any).fullName || (selectedCustomer as any).name || selectedCustomer.email || "";
      setReceipt({
        receiptNo: result.receiptNo,
        organizationName: organization?.name || "FundCircle",
        customerName: custName,
        amount: inst.emiAmount,
        collectionType: "LOAN_EMI",
        agentName,
        collectedAt: new Date(),
        loanId: loan.id,
        installmentNo: inst.installmentNo,
        loanOutstanding: result.loanClosed ? 0 : (loan.outstandingBalance ?? 0) - inst.emiAmount,
      });

      if (result.loanClosed) {
        toast.success("🎉 EMI collected! Loan fully repaid and closed.");
      } else {
        toast.success(`EMI collected · Receipt: ${result.receiptNo}`);
      }

      setSelectedCustomer(null);
      setCustomerLoan(null);
      setPaymentMode("CASH");
      setUpiRef("");
    } catch (err: any) {
      toast.error(err?.message || "EMI collection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const today = startOfDay(new Date());

  // Stats: total outstanding loans assigned to me
  const myActiveLoans = loans.filter((l) => {
    const cust = allMembers.find((m) => m.id === l.customerId || m.clerkUserId === l.customerId);
    return isMyLoan(l, cust);
  });

  const loansWithOutstanding = myActiveLoans.filter((l) => {
    const outstanding = l.outstandingBalance ?? (l as any).balanceRemaining ?? 0;
    return outstanding > 0;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">EMI Collection</h2>
        <p className="text-slate-500 text-sm">Select a customer to collect their loan installment.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-indigo-50 border-indigo-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-indigo-900">{customersWithLoans.length}</p>
            <p className="text-xs text-indigo-600">Customers with active loans</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-100">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-red-900">{loansWithOutstanding.length}</p>
            <p className="text-xs text-red-600">Loans with outstanding balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            Select Customer for EMI Collection
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

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No customers with active loans assigned to you.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((customer) => {
                const loan = loans.find((l) => {
                  const isCustomerMatch = l.customerId === customer.id || l.customerId === customer.clerkUserId;
                  return isCustomerMatch && isMyLoan(l, customer);
                });
                const outstanding = loan ? (loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0) : 0;
                const name = (customer as any).fullName || (customer as any).name || customer.email || "";
                return (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm text-left transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{customer.phone || customer.email}</p>
                        {loan?.loanAssignedCollectorName && loan.loanAssignedCollectorName !== (user?.fullName || "") && (
                          <p className="text-xs text-indigo-500 mt-0.5">Collector: {loan.loanAssignedCollectorName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Outstanding</p>
                        <p className="font-bold text-orange-600 text-sm">₹{Number(outstanding).toLocaleString()}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* EMI Collection Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" /> EMI Collection
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4 mt-1">
              {/* Customer */}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="font-bold text-slate-900">
                  {(selectedCustomer as any).fullName || (selectedCustomer as any).name || selectedCustomer.email}
                </p>
                <p className="text-xs text-slate-500">{selectedCustomer.phone || selectedCustomer.email}</p>
              </div>

              {loadingLoan ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : !customerLoan ? (
                <div className="text-center py-6 text-slate-400 text-sm">No active loan found.</div>
              ) : !customerLoan.nextInstallment ? (
                <div className="text-center py-6">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-900">All installments paid!</p>
                  <p className="text-xs text-slate-500 mt-0.5">This loan has no pending installments.</p>
                </div>
              ) : (
                <>
                  {customerLoan.overdueCount > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-xs text-red-700 font-medium">
                        {customerLoan.overdueCount} overdue installment{customerLoan.overdueCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                  {/* Loan details */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-indigo-50 rounded-xl p-3">
                      <p className="text-xs text-indigo-600">Outstanding Balance</p>
                      <p className="font-bold text-indigo-900">₹{Number(customerLoan.loan.outstandingBalance ?? (customerLoan.loan as any).balanceRemaining ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Installment #</p>
                      <p className="font-bold text-slate-900">{customerLoan.nextInstallment.installmentNo} of {customerLoan.loan.tenureMonths ?? (customerLoan.loan as any).durationMonths}</p>
                    </div>
                  </div>

                  {/* Next installment */}
                  <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Next Installment Due</p>
                      {isBefore(toDate(customerLoan.nextInstallment.dueDate), today) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">OVERDUE</span>
                      )}
                    </div>
                    <p className="text-3xl font-black text-indigo-700">
                      ₹{Number(customerLoan.nextInstallment.emiAmount).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      Due: {toDate(customerLoan.nextInstallment.dueDate).getTime() > 0
                        ? format(toDate(customerLoan.nextInstallment.dueDate), "MMM d, yyyy")
                        : "—"}
                    </p>
                  </div>

                  {/* Payment Mode Selector */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Payment Mode</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "CASH" as const, label: "Cash", icon: <Banknote className="w-4 h-4" /> },
                        { id: "UPI" as const, label: "UPI", icon: <Smartphone className="w-4 h-4" /> },
                        { id: "BANK_TRANSFER" as const, label: "Bank", icon: <Building2 className="w-4 h-4" /> },
                      ]).map(({ id, label, icon }) => (
                        <button key={id} type="button" onClick={() => { setPaymentMode(id); if (id === "CASH") setUpiRef(""); }}
                          className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-colors ${paymentMode === id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                          {icon} {label}
                        </button>
                      ))}
                    </div>
                    {paymentMode !== "CASH" && (
                      <Input
                        value={upiRef}
                        onChange={(e) => setUpiRef(e.target.value)}
                        placeholder={paymentMode === "UPI" ? "UPI Transaction ID…" : "Bank Transfer Reference…"}
                        className="h-10 text-sm"
                      />
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setSelectedCustomer(null)}>
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-11"
                      onClick={handleCollectEMI}
                      disabled={submitting}
                    >
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : "Collect EMI"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

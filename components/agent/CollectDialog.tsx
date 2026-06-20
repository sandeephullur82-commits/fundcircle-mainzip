import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PiggyBank, CreditCard, Layers, Loader2 } from "lucide-react";
import { SavingsAccount, Loan, LoanInstallment } from "@/types";
import {
  recordSavingsCollection,
  recordEMICollection,
  recordCombinedCollection,
  getSavingsAccountByCustomer,
  getActiveLoanForCustomer,
  getNextPendingInstallment,
} from "@/lib/services";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import FieldError from "@/components/ui/FieldError";

type CollectMode = "SAVINGS" | "LOAN" | "COMBINED" | null;

export function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

interface CollectDialogProps {
  customer: any | null;
  orgId: string;
  orgName: string;
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export default function CollectDialog({
  customer, orgId, orgName, agentId, agentName, onClose,
}: CollectDialogProps) {
  const [collectMode,     setCollectMode]     = useState<CollectMode>(null);
  const [savingsAccount,  setSavingsAccount]  = useState<SavingsAccount | null>(null);
  const [activeLoan,      setActiveLoan]      = useState<Loan | null>(null);
  const [nextInstallment, setNextInstallment] = useState<LoanInstallment | null>(null);
  const [loadingDetails,  setLoadingDetails]  = useState(false);
  const [savingsAmount,   setSavingsAmount]   = useState("");
  const [emiAmount,       setEmiAmount]       = useState("");
  const [savingsError,    setSavingsError]    = useState("");
  const [emiError,        setEmiError]        = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [receipt,         setReceipt]         = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (!customer) {
      setCollectMode(null);
      setSavingsAmount(""); setEmiAmount("");
      setSavingsError(""); setEmiError("");
      setSavingsAccount(null); setActiveLoan(null); setNextInstallment(null);
      return;
    }
    setLoadingDetails(true);
    setSavingsAmount(""); setEmiAmount("");
    setSavingsError(""); setEmiError("");
    setSavingsAccount(null); setActiveLoan(null); setNextInstallment(null);

    (async () => {
      try {
        const [acc, loan] = await Promise.all([
          getSavingsAccountByCustomer(customer.id, orgId),
          getActiveLoanForCustomer(customer.id, orgId),
        ]);
        setSavingsAccount(acc);
        setActiveLoan(loan);
        if (loan) {
          const inst = await getNextPendingInstallment(loan.id);
          setNextInstallment(inst);
          if (inst) setEmiAmount(String(inst.emiAmount || ""));
        }
        if (acc && loan)     setCollectMode("COMBINED");
        else if (acc)        setCollectMode("SAVINGS");
        else if (loan)       setCollectMode("LOAN");
        else                 setCollectMode("SAVINGS");
      } catch {
        toast.error("Failed to load account details.");
      } finally {
        setLoadingDetails(false);
      }
    })();
  }, [customer?.id]);

  const custName = customer ? (customer.fullName || customer.name || customer.email || "") : "";

  const handleCollectSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !agentId) return;
    const num = Number(savingsAmount);
    if (!savingsAmount.trim())       { setSavingsError("Collection amount is required"); return; }
    if (isNaN(num) || num <= 0)      { setSavingsError("Amount must be greater than 0"); return; }
    if (num > 1_000_000)             { setSavingsError("Amount cannot exceed ₹10,00,000"); return; }
    setSavingsError("");
    setSubmitting(true);
    try {
      const result = await recordSavingsCollection({
        organizationId: orgId, organizationName: orgName,
        customerId: customer.id, agentId, agentName, amount: num,
      });
      setReceipt({
        receiptNo: result.receiptNo, organizationName: orgName,
        customerName: custName, accountNumber: (savingsAccount as any)?.id?.slice(-8),
        amount: num, newBalance: result.newBalance,
        collectionType: "SAVINGS", agentName, collectedAt: new Date(),
      });
      onClose();
      toast.success(`₹${num.toLocaleString()} collected · ${result.receiptNo}`);
    } catch (err: any) {
      toast.error(err?.message || "Collection failed.");
    } finally { setSubmitting(false); }
  };

  const handleCollectEMI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !activeLoan || !nextInstallment || !agentId) return;
    const num = Number(emiAmount);
    if (!emiAmount.trim())      { setEmiError("EMI amount is required"); return; }
    if (isNaN(num) || num <= 0) { setEmiError("Amount must be greater than 0"); return; }
    setEmiError("");
    setSubmitting(true);
    try {
      const result = await recordEMICollection({
        organizationId: orgId, organizationName: orgName,
        loanId: activeLoan.id, installmentId: nextInstallment.id,
        customerId: customer.id, agentId, agentName, amount: num,
      });
      setReceipt({
        receiptNo: result.receiptNo, organizationName: orgName,
        customerName: custName, amount: num, collectionType: "LOAN_EMI",
        loanOutstanding: result.loanClosed ? 0 : (activeLoan.outstandingBalance ?? 0) - num,
        installmentNo: nextInstallment.installmentNo, agentName, collectedAt: new Date(),
      });
      onClose();
      toast.success(`EMI ₹${num.toLocaleString()} collected · ${result.receiptNo}`);
    } catch (err: any) {
      toast.error(err?.message || "Collection failed.");
    } finally { setSubmitting(false); }
  };

  const handleCollectCombined = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !agentId) return;
    const savNum = Number(savingsAmount);
    const emiNum = Number(emiAmount);
    let hasError = false;
    if (!savingsAmount.trim() || isNaN(savNum) || savNum <= 0) { setSavingsError("Enter savings amount > 0"); hasError = true; }
    if (!emiAmount.trim()     || isNaN(emiNum) || emiNum <= 0) { setEmiError("Enter EMI amount > 0");         hasError = true; }
    if (hasError) return;
    if (!activeLoan || !nextInstallment) { toast.error("No active loan installment found."); return; }
    setSavingsError(""); setEmiError("");
    setSubmitting(true);
    try {
      const result = await recordCombinedCollection({
        organizationId: orgId, organizationName: orgName,
        customerId: customer.id, agentId, agentName,
        savingsAmount: savNum, loanId: activeLoan.id,
        installmentId: nextInstallment.id, emiAmount: emiNum,
      });
      setReceipt({
        receiptNo: result.receiptNo, organizationName: orgName,
        customerName: custName, amount: savNum + emiNum,
        savingsAmount: savNum, loanAmount: emiNum,
        newBalance: result.savingsBalance,
        loanOutstanding: result.loanOutstanding,
        collectionType: "BOTH", agentName, collectedAt: new Date(),
      });
      onClose();
      toast.success(`Combined ₹${(savNum + emiNum).toLocaleString()} collected · ${result.receiptNo}`);
    } catch (err: any) {
      toast.error(err?.message || "Collection failed.");
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {collectMode === "LOAN"                       && <CreditCard className="w-5 h-5 text-indigo-600" />}
              {collectMode === "COMBINED"                   && <Layers    className="w-5 h-5 text-violet-600" />}
              {(collectMode === "SAVINGS" || !collectMode)  && <PiggyBank  className="w-5 h-5 text-emerald-600" />}
              {collectMode === "SAVINGS"  ? "Record Savings Collection"
               : collectMode === "LOAN"  ? "Record EMI Payment"
               : collectMode === "COMBINED" ? "Combined Collection"
               : "Record Collection"}
            </DialogTitle>
          </DialogHeader>

          {customer && (
            <div className="mt-1 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900">{custName}</p>
                </div>
                <p className="text-xs text-slate-500">{customer.phone || customer.email}</p>

                {loadingDetails ? (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Loading account details…</span>
                  </div>
                ) : (
                  <>
                    {(collectMode === "SAVINGS" || collectMode === "COMBINED") && savingsAccount && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                        <span className="text-xs text-slate-500">Savings Balance</span>
                        <span className="font-bold text-emerald-600 text-sm">₹{(savingsAccount as any).totalBalance?.toLocaleString()}</span>
                      </div>
                    )}
                    {(collectMode === "SAVINGS" || collectMode === "COMBINED") && !savingsAccount && !loadingDetails && (
                      <p className="text-xs text-red-500 mt-1 pt-1 border-t border-slate-200">⚠ No active savings account.</p>
                    )}
                    {(collectMode === "LOAN" || collectMode === "COMBINED") && activeLoan && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                        <span className="text-xs text-slate-500">Loan Outstanding</span>
                        <span className="font-bold text-indigo-600 text-sm">₹{(activeLoan.outstandingBalance ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(collectMode === "LOAN" || collectMode === "COMBINED") && !activeLoan && !loadingDetails && (
                      <p className="text-xs text-amber-600 mt-1 pt-1 border-t border-slate-200">ℹ No active loan found.</p>
                    )}
                  </>
                )}
              </div>

              {collectMode === "SAVINGS" && (
                <form onSubmit={handleCollectSavings} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cd-sav-amt">Amount to Collect (₹)</Label>
                    <Input id="cd-sav-amt" type="number" min="1" placeholder="e.g. 100"
                      value={savingsAmount}
                      onChange={(e) => { setSavingsAmount(e.target.value); setSavingsError(""); }}
                      className={`text-xl h-12 font-bold ${savingsError ? "border-red-400" : ""}`}
                      autoFocus disabled={submitting}
                    />
                    <FieldError error={savingsError} />
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11"
                      disabled={submitting || loadingDetails}>
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : "Collect Savings"}
                    </Button>
                  </div>
                </form>
              )}

              {collectMode === "LOAN" && (
                <form onSubmit={handleCollectEMI} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cd-emi-amt">EMI Amount (₹)</Label>
                    <Input id="cd-emi-amt" type="number" min="1" placeholder="EMI amount"
                      value={emiAmount}
                      onChange={(e) => { setEmiAmount(e.target.value); setEmiError(""); }}
                      className={`text-xl h-12 font-bold ${emiError ? "border-red-400" : ""}`}
                      autoFocus disabled={submitting}
                    />
                    <FieldError error={emiError} />
                    {nextInstallment && (
                      <p className="text-xs text-indigo-600">
                        Installment #{nextInstallment.installmentNo} · Due ₹{Number(nextInstallment.emiAmount).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-11"
                      disabled={submitting || loadingDetails || !nextInstallment}>
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : "Collect EMI"}
                    </Button>
                  </div>
                </form>
              )}

              {collectMode === "COMBINED" && (
                <form onSubmit={handleCollectCombined} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cd-comb-sav">Savings Amount (₹)</Label>
                    <Input id="cd-comb-sav" type="number" min="1" placeholder="Savings deposit"
                      value={savingsAmount}
                      onChange={(e) => { setSavingsAmount(e.target.value); setSavingsError(""); }}
                      className={`text-lg h-11 font-semibold ${savingsError ? "border-red-400" : ""}`}
                      disabled={submitting}
                    />
                    <FieldError error={savingsError} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cd-comb-emi">EMI Amount (₹)</Label>
                    <Input id="cd-comb-emi" type="number" min="1" placeholder="EMI payment"
                      value={emiAmount}
                      onChange={(e) => { setEmiAmount(e.target.value); setEmiError(""); }}
                      className={`text-lg h-11 font-semibold ${emiError ? "border-red-400" : ""}`}
                      disabled={submitting}
                    />
                    <FieldError error={emiError} />
                    {nextInstallment && (
                      <p className="text-xs text-indigo-500">
                        Installment #{nextInstallment.installmentNo} · Due ₹{Number(nextInstallment.emiAmount).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700 h-10 text-sm"
                      disabled={submitting || loadingDetails}>
                      {submitting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Processing…</> : "Collect Both"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, Banknote, Loader2, AlertTriangle, CheckCircle2,
  TrendingDown, ChevronRight, ZapOff, Sparkles, Smartphone,
  WifiOff, ExternalLink, XCircle, RefreshCw, QrCode, CheckCheck,
  Settings, ArrowRight,
} from "lucide-react";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { Loan, LoanInstallment } from "@/types";
import {
  recordGeneralCollection,
  recordEMICollection,
  recordPartialPayment,
  recordAdvancePayment,
  recordForeclosure,
  syncInstallmentStatuses,
  getActiveLoanForCustomer,
  getNextPendingInstallment,
} from "@/lib/services";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import FieldError from "@/components/ui/FieldError";

type PaymentMode   = "CASH" | "UPI" | "BANK_TRANSFER";
type CollectMode   = "LOAN_EMI" | "GENERAL" | null;
type RepaymentType = "REGULAR_EMI" | "PARTIAL_PAYMENT" | "ADVANCE_PAYMENT" | "FORECLOSURE";
type UpiStatus     = "idle" | "launched" | "confirming";

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
  collectedByRole?: string;
  collectedById?: string;
}

const TYPE_META: Record<RepaymentType, {
  label: string;
  sublabel: string;
  icon: React.ElementType;
  badge: string;
  border: string;
  bg: string;
  text: string;
}> = {
  REGULAR_EMI: {
    label:    "Regular EMI",
    sublabel: "Exact EMI amount detected",
    icon:     CheckCircle2,
    badge:    "bg-indigo-100 text-indigo-700 border-indigo-200",
    border:   "border-indigo-200",
    bg:       "bg-indigo-50",
    text:     "text-indigo-700",
  },
  PARTIAL_PAYMENT: {
    label:    "Partial Payment",
    sublabel: "Amount is less than EMI",
    icon:     TrendingDown,
    badge:    "bg-amber-100 text-amber-700 border-amber-200",
    border:   "border-amber-200",
    bg:       "bg-amber-50",
    text:     "text-amber-700",
  },
  ADVANCE_PAYMENT: {
    label:    "Advance Payment",
    sublabel: "Covers more than one EMI",
    icon:     CreditCard,
    badge:    "bg-emerald-100 text-emerald-700 border-emerald-200",
    border:   "border-emerald-200",
    bg:       "bg-emerald-50",
    text:     "text-emerald-700",
  },
  FORECLOSURE: {
    label:    "Foreclosure",
    sublabel: "Settles entire outstanding balance",
    icon:     ZapOff,
    badge:    "bg-rose-100 text-rose-700 border-rose-200",
    border:   "border-rose-200",
    bg:       "bg-rose-50",
    text:     "text-rose-700",
  },
};

const SUBMIT_COLORS: Record<RepaymentType, string> = {
  REGULAR_EMI:     "bg-indigo-600 hover:bg-indigo-700",
  PARTIAL_PAYMENT: "bg-amber-500  hover:bg-amber-600",
  ADVANCE_PAYMENT: "bg-emerald-600 hover:bg-emerald-700",
  FORECLOSURE:     "bg-rose-600   hover:bg-rose-700",
};

const SUBMIT_LABELS: Record<RepaymentType, string> = {
  REGULAR_EMI:     "Collect EMI",
  PARTIAL_PAYMENT: "Record Partial Payment",
  ADVANCE_PAYMENT: "Record Advance Payment",
  FORECLOSURE:     "Confirm Foreclosure",
};

function detectRepaymentType(
  num: number,
  emi: number,
  outstanding: number,
): RepaymentType | null {
  if (!num || num <= 0) return null;
  if (num >= outstanding - 0.05)          return "FORECLOSURE";
  if (emi > 0 && Math.abs(num - emi) <= 1) return "REGULAR_EMI";
  if (emi > 0 && num > emi + 1)            return "ADVANCE_PAYMENT";
  return "PARTIAL_PAYMENT";
}

function buildUpiString(upiId: string, payeeName: string, amount: number, note: string): string {
  return (
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(payeeName)}` +
    `&am=${amount.toFixed(2)}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(note)}`
  );
}

function buildQrUrl(upiString: string): string {
  return (
    `https://api.qrserver.com/v1/create-qr-code/` +
    `?size=180x180&data=${encodeURIComponent(upiString)}&bgcolor=ffffff&color=1e1b4b&margin=8&qzone=1`
  );
}

export default function CollectDialog({
  customer, orgId, orgName, agentId, agentName, onClose,
  collectedByRole, collectedById,
}: CollectDialogProps) {
  const [collectMode,     setCollectMode]     = useState<CollectMode>(null);
  const [activeLoan,      setActiveLoan]      = useState<Loan | null>(null);
  const [nextInstallment, setNextInstallment] = useState<LoanInstallment | null>(null);
  const [loadingDetails,  setLoadingDetails]  = useState(false);
  const [amount,          setAmount]          = useState("");
  const [amountError,     setAmountError]     = useState("");
  const [paymentMode,     setPaymentMode]     = useState<PaymentMode>("CASH");
  const [notes,           setNotes]           = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [receipt,         setReceipt]         = useState<ReceiptData | null>(null);

  const { data: orgData } = useDocumentRealtime<any>("organizations", orgId || null);
  const orgUpiId     = (orgData?.upiId || "") as string;
  const upiEnabled   = orgData?.upiEnabled !== false;
  const merchantName = (orgData?.merchantName || orgName) as string;

  const [upiTxnRef, setUpiTxnRef] = useState<string>("");
  const [upiStatus, setUpiStatus] = useState<UpiStatus>("idle");
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [qrError,   setQrError]   = useState(false);

  const isOwner = collectedByRole === "OWNER";

  useEffect(() => {
    const up   = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  useEffect(() => {
    setUpiStatus("idle");
    setUpiTxnRef("");
    setQrError(false);
  }, [amount, paymentMode]);

  useEffect(() => {
    if (!customer) {
      setCollectMode(null); setAmount(""); setAmountError("");
      setActiveLoan(null); setNextInstallment(null);
      setUpiStatus("idle"); setUpiTxnRef(""); setQrError(false);
      return;
    }
    setLoadingDetails(true);
    setAmount(""); setAmountError(""); setPaymentMode("CASH");
    setNotes(""); setActiveLoan(null); setNextInstallment(null);
    setUpiStatus("idle"); setUpiTxnRef(""); setQrError(false);

    (async () => {
      try {
        const loan = await getActiveLoanForCustomer(customer.id, orgId);
        if (loan && (loan.status === "CLOSED" || (loan.outstandingBalance ?? 0) <= 0)) {
          setActiveLoan(null);
          setCollectMode("GENERAL");
        } else if (loan) {
          setActiveLoan(loan);
          try { await syncInstallmentStatuses(loan.id); } catch (_) {}
          const inst = await getNextPendingInstallment(loan.id);
          setNextInstallment(inst);
          if (inst) setAmount(String(Math.round(inst.emiAmount || 0)));
          setCollectMode("LOAN_EMI");
        } else {
          setCollectMode("GENERAL");
        }
      } catch {
        toast.error("Failed to load account details.");
        setCollectMode("GENERAL");
      } finally {
        setLoadingDetails(false);
      }
    })();
  }, [customer?.id]);

  const outstanding  = activeLoan ? (activeLoan.outstandingBalance ?? 0) : 0;
  const emiAmount    = nextInstallment ? (nextInstallment.emiAmount ?? 0) : 0;
  const custName     = customer ? (customer.fullName || customer.name || customer.email || "") : "";
  const numAmount    = Number(amount);

  const detectedType = useMemo<RepaymentType | null>(() => {
    if (collectMode !== "LOAN_EMI" || !activeLoan) return null;
    if (!amount.trim() || isNaN(numAmount) || numAmount <= 0) return null;
    return detectRepaymentType(numAmount, emiAmount, outstanding);
  }, [amount, emiAmount, outstanding, collectMode, activeLoan]);

  const exceedsOutstanding = numAmount > outstanding + 0.05 && numAmount > 0;

  const advancePreview = useMemo(() => {
    if (detectedType !== "ADVANCE_PAYMENT" || !nextInstallment || !numAmount) return null;
    if (emiAmount <= 0) return null;
    const fullEMIs = Math.floor(numAmount / emiAmount);
    const partial  = numAmount - fullEMIs * emiAmount;
    return { fullEMIs, partial: Math.round(partial * 100) / 100 };
  }, [detectedType, numAmount, emiAmount, nextInstallment]);

  const partialRemaining = useMemo(() => {
    if (detectedType !== "PARTIAL_PAYMENT" || !nextInstallment || !numAmount) return null;
    return Math.max(0, Math.round((emiAmount - numAmount) * 100) / 100);
  }, [detectedType, numAmount, emiAmount, nextInstallment]);

  const upiNote = useMemo(() => {
    if (activeLoan && nextInstallment) {
      return `EMI #${nextInstallment.installmentNo} Loan ${activeLoan.id.slice(-6).toUpperCase()} ${custName}`;
    }
    return `Payment ${custName}`;
  }, [activeLoan, nextInstallment, custName]);

  const upiString = useMemo(() => {
    if (!orgUpiId || numAmount <= 0) return "";
    return buildUpiString(orgUpiId, merchantName, numAmount, upiNote);
  }, [orgUpiId, merchantName, numAmount, upiNote]);

  const qrCodeUrl = useMemo(() => {
    if (!upiString) return "";
    return buildQrUrl(upiString);
  }, [upiString]);

  const handleAmountChange = (val: string) => {
    setAmount(val.replace(/[^0-9.]/g, ""));
    setAmountError("");
  };

  const executeEMICollection = useCallback(async () => {
    if (!customer || !activeLoan || !agentId) return;
    const num  = numAmount;
    const type = detectedType;

    if (!num || isNaN(num) || num <= 0) { setAmountError("Amount must be greater than ₹0"); return; }
    if (num > outstanding + 0.05) {
      setAmountError(`Amount exceeds outstanding balance of ₹${outstanding.toLocaleString("en-IN")}`);
      return;
    }
    if (!type) { setAmountError("Enter a valid amount"); return; }
    if ((type === "REGULAR_EMI" || type === "PARTIAL_PAYMENT") && !nextInstallment) {
      setAmountError("No pending installment found"); return;
    }

    setAmountError("");
    setSubmitting(true);
    if (paymentMode === "UPI") setUpiStatus("confirming");

    const baseInfo = {
      organizationId: orgId, organizationName: orgName,
      loanId: activeLoan.id, customerId: customer.id,
      agentId, agentName, paymentMode,
      ...(collectedByRole ? { collectedByRole } : {}),
      ...(collectedById   ? { collectedById   } : {}),
    };
    const txnRef = upiTxnRef.trim() || undefined;

    try {
      if (type === "REGULAR_EMI") {
        const result = await recordEMICollection({
          ...baseInfo,
          installmentId: nextInstallment!.id,
          amount: num,
          ...(txnRef ? { paymentReference: txnRef } : {}),
        });
        setReceipt({
          receiptNo: result.receiptNo, organizationName: orgName,
          customerName: custName, amount: num,
          collectionType: "LOAN_EMI", repaymentType: "REGULAR",
          loanOutstanding: result.loanClosed ? 0 : Math.max(0, outstanding - num),
          installmentNo: nextInstallment!.installmentNo, agentName, collectedAt: new Date(),
          paymentMode, upiRef: txnRef,
        });
        onClose();
        toast.success(`EMI ₹${num.toLocaleString("en-IN")} collected · ${result.receiptNo}`);

      } else if (type === "PARTIAL_PAYMENT") {
        const result = await recordPartialPayment({
          ...baseInfo,
          installmentId: nextInstallment!.id,
          amount: num,
          ...(txnRef ? { paymentReference: txnRef } : {}),
        });
        setReceipt({
          receiptNo: result.receiptNo, organizationName: orgName,
          customerName: custName, amount: num,
          collectionType: "LOAN_EMI", repaymentType: "PARTIAL",
          loanOutstanding: result.loanClosed ? 0 : Math.max(0, outstanding - num),
          installmentNo: nextInstallment!.installmentNo, agentName, collectedAt: new Date(),
          paymentMode, upiRef: txnRef,
        });
        onClose();
        toast.success(`Partial ₹${num.toLocaleString("en-IN")} collected · ${result.receiptNo}`);

      } else if (type === "ADVANCE_PAYMENT") {
        const result = await recordAdvancePayment({
          ...baseInfo,
          amount: num,
          ...(txnRef ? { paymentReference: txnRef } : {}),
        });
        setReceipt({
          receiptNo: result.receiptNo, organizationName: orgName,
          customerName: custName, amount: num,
          collectionType: "LOAN_EMI", repaymentType: "ADVANCE",
          loanOutstanding: result.loanClosed ? 0 : Math.max(0, outstanding - num),
          emisCleared: result.emisCleared, agentName, collectedAt: new Date(),
          paymentMode, upiRef: txnRef,
        });
        onClose();
        toast.success(`Advance ₹${num.toLocaleString("en-IN")} · ${result.emisCleared} EMI${result.emisCleared !== 1 ? "s" : ""} cleared · ${result.receiptNo}`);

      } else if (type === "FORECLOSURE") {
        const result = await recordForeclosure({
          organizationId: orgId, organizationName: orgName,
          loanId: activeLoan.id, customerId: customer.id,
          agentId, agentName, paymentMode,
          ...(txnRef ? { paymentReference: txnRef } : {}),
          ...(collectedByRole ? { collectedByRole } : {}),
          ...(collectedById   ? { collectedById   } : {}),
        });
        setReceipt({
          receiptNo: result.receiptNo, organizationName: orgName,
          customerName: custName, amount: result.amountPaid,
          collectionType: "LOAN_EMI", repaymentType: "FORECLOSURE",
          loanOutstanding: 0, agentName, collectedAt: new Date(),
          paymentMode, upiRef: upiTxnRef.trim() || undefined,
        });
        onClose();
        toast.success(`Loan foreclosed · ₹${result.amountPaid.toLocaleString("en-IN")} settled · ${result.receiptNo}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Collection failed.");
      if (paymentMode === "UPI") setUpiStatus("launched");
    } finally {
      setSubmitting(false);
    }
  }, [
    customer, activeLoan, agentId, numAmount, detectedType, outstanding,
    nextInstallment, orgId, orgName, agentName, paymentMode, upiTxnRef,
    collectedByRole, collectedById, custName,
  ]);

  const handleCollectEMI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMode === "UPI") return;
    await executeEMICollection();
  };

  const handleCollectGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !agentId) return;
    const num = Number(amount);
    if (!amount.trim())         { setAmountError("Amount is required"); return; }
    if (isNaN(num) || num <= 0) { setAmountError("Amount must be greater than ₹0"); return; }
    if (num > 1_000_000)        { setAmountError("Amount cannot exceed ₹10,00,000"); return; }
    setAmountError("");
    setSubmitting(true);
    try {
      const result = await recordGeneralCollection({
        organizationId: orgId, organizationName: orgName,
        customerId: customer.id, agentId, agentName, amount: num,
        paymentMode, notes: notes.trim() || undefined,
        ...(collectedByRole ? { collectedByRole } : {}),
        ...(collectedById   ? { collectedById   } : {}),
      });
      setReceipt({
        receiptNo: result.receiptNo, organizationName: orgName,
        customerName: custName, amount: num,
        collectionType: "SAVINGS", agentName, collectedAt: new Date(),
        paymentMode, upiRef: upiTxnRef.trim() || undefined,
      });
      onClose();
      toast.success(`₹${num.toLocaleString("en-IN")} collected · ${result.receiptNo}`);
    } catch (err: any) {
      toast.error(err?.message || "Collection failed.");
    } finally { setSubmitting(false); }
  };

  const handleLaunchUpi = () => {
    if (!upiString) return;
    setUpiStatus("launched");
    window.location.href = upiString;
  };

  const canSubmit =
    !submitting &&
    !loadingDetails &&
    !exceedsOutstanding &&
    !!detectedType &&
    numAmount > 0;

  const submitBtnColor = detectedType ? SUBMIT_COLORS[detectedType] : "bg-indigo-600 hover:bg-indigo-700";
  const submitLabel    = detectedType ? SUBMIT_LABELS[detectedType] : "Collect";

  const showUpiPanel = paymentMode === "UPI" && collectMode === "LOAN_EMI" && !!detectedType && !exceedsOutstanding && numAmount > 0;

  return (
    <>
      <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {collectMode === "LOAN_EMI"
                ? <CreditCard className="w-5 h-5 text-indigo-600" />
                : <Banknote className="w-5 h-5 text-emerald-600" />}
              {collectMode === "LOAN_EMI" ? "Record EMI Payment" : "Record Collection"}
            </DialogTitle>
          </DialogHeader>

          {customer && (
            <div className="mt-1 space-y-4">
              {/* Customer info card */}
              <div className="bg-slate-50 rounded-xl p-3.5 space-y-1">
                <p className="font-bold text-slate-900 text-sm">{custName}</p>
                <p className="text-xs text-slate-500">{customer.phone || customer.email}</p>

                {loadingDetails ? (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Loading account details…</span>
                  </div>
                ) : (
                  <>
                    {collectMode === "LOAN_EMI" && activeLoan && (
                      <>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                          <span className="text-xs text-slate-500">Outstanding Balance</span>
                          <span className="font-bold text-indigo-600 text-sm">
                            ₹{outstanding.toLocaleString("en-IN")}
                          </span>
                        </div>
                        {nextInstallment && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Monthly EMI</span>
                            <span className="text-xs font-semibold text-slate-700">
                              ₹{Math.round(emiAmount).toLocaleString("en-IN")}/mo
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {collectMode === "GENERAL" && (
                      <p className="text-xs text-emerald-600 mt-1 pt-1 border-t border-slate-200">
                        General collection
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* ── LOAN EMI FORM ── */}
              {collectMode === "LOAN_EMI" && activeLoan && !loadingDetails && (
                <form onSubmit={handleCollectEMI} className="space-y-4">

                  {/* Amount input */}
                  <div className="space-y-2">
                    <Label htmlFor="cd-emi-amt">Payment Amount (₹)</Label>
                    <Input
                      id="cd-emi-amt"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      placeholder={`e.g. ₹${Math.round(emiAmount).toLocaleString("en-IN")}`}
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className={`text-xl h-12 font-bold ${
                        exceedsOutstanding || amountError ? "border-red-400" : detectedType ? `border-2 ${TYPE_META[detectedType].border}` : ""
                      }`}
                      autoFocus
                      disabled={submitting}
                    />
                    {exceedsOutstanding && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Amount exceeds outstanding balance of ₹{outstanding.toLocaleString("en-IN")}
                      </div>
                    )}
                    <FieldError error={amountError} />
                  </div>

                  {/* Auto-detected repayment type badge */}
                  {detectedType && !exceedsOutstanding ? (
                    <div className={`rounded-xl border px-4 py-3 space-y-2 ${TYPE_META[detectedType].bg} ${TYPE_META[detectedType].border}`}>
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-3.5 h-3.5 shrink-0 ${TYPE_META[detectedType].text}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          Detected Repayment Type
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {React.createElement(TYPE_META[detectedType].icon, {
                          className: `w-4 h-4 shrink-0 ${TYPE_META[detectedType].text}`,
                        })}
                        <div>
                          <p className={`text-sm font-bold leading-tight ${TYPE_META[detectedType].text}`}>
                            {TYPE_META[detectedType].label}
                          </p>
                          <p className="text-[11px] text-slate-500 leading-tight">
                            {TYPE_META[detectedType].sublabel}
                          </p>
                        </div>
                      </div>
                      {detectedType === "REGULAR_EMI" && nextInstallment && (
                        <p className="text-xs text-indigo-600">
                          EMI #{nextInstallment.installmentNo} will be marked as paid.
                        </p>
                      )}
                      {detectedType === "PARTIAL_PAYMENT" && partialRemaining !== null && (
                        <p className="text-xs text-amber-700">
                          Remaining balance on this EMI: <strong>₹{partialRemaining.toLocaleString("en-IN")}</strong>. Installment will be marked PARTIAL.
                        </p>
                      )}
                      {detectedType === "ADVANCE_PAYMENT" && advancePreview && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          Clears <strong>{advancePreview.fullEMIs}</strong> full EMI{advancePreview.fullEMIs !== 1 ? "s" : ""}
                          {advancePreview.partial > 0 && ` + ₹${advancePreview.partial.toLocaleString("en-IN")} partial`}
                        </div>
                      )}
                      {detectedType === "FORECLOSURE" && (
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                            <p className="text-xs text-rose-700 leading-snug">
                              This will settle the entire outstanding balance and <strong>close the loan immediately</strong>.
                            </p>
                          </div>
                          <div className="bg-white rounded-lg px-3 py-2 flex justify-between items-center border border-rose-100">
                            <span className="text-xs text-slate-500">Settlement Amount</span>
                            <span className="text-base font-black text-rose-700">
                              ₹{outstanding.toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    !exceedsOutstanding && amount.trim() === "" && nextInstallment && (
                      <p className="text-xs text-slate-400 text-center">
                        Enter an amount — repayment type will be detected automatically
                      </p>
                    )
                  )}

                  {/* Payment Mode */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Mode</Label>
                    <div className="flex gap-1.5">
                      {(["CASH", "UPI", "BANK_TRANSFER"] as PaymentMode[]).map((m) => (
                        <button key={m} type="button" onClick={() => setPaymentMode(m)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                            paymentMode === m
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          {m === "BANK_TRANSFER" ? "Bank" : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── UPI PAYMENT PANEL ── */}
                  {showUpiPanel ? (
                    <UpiPaymentPanel
                      isOnline={isOnline}
                      orgUpiId={orgUpiId}
                      upiEnabled={upiEnabled}
                      isOwner={isOwner}
                      merchantName={merchantName}
                      qrCodeUrl={qrCodeUrl}
                      upiString={upiString}
                      amount={numAmount}
                      custName={custName}
                      orgName={orgName}
                      upiNote={upiNote}
                      loanId={activeLoan.id}
                      installmentNo={nextInstallment?.installmentNo}
                      upiStatus={upiStatus}
                      upiTxnRef={upiTxnRef}
                      submitting={submitting}
                      qrError={qrError}
                      onQrError={() => setQrError(true)}
                      onLaunch={handleLaunchUpi}
                      onConfirm={executeEMICollection}
                      onFailed={() => { setUpiStatus("idle"); setUpiTxnRef(""); }}
                      onTxnRefChange={setUpiTxnRef}
                      onCancel={onClose}
                      onConfigureUpi={() => {
                        onClose();
                        window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: "settings" }));
                        setTimeout(() => window.dispatchEvent(new CustomEvent("fundcircle:settingsSection", { detail: "payments" })), 120);
                      }}
                      onSwitchToCash={() => setPaymentMode("CASH")}
                    />
                  ) : (
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className={`flex-1 h-11 text-white ${submitBtnColor}`}
                        disabled={!canSubmit}
                      >
                        {submitting
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                          : submitLabel}
                      </Button>
                    </div>
                  )}
                </form>
              )}

              {/* No active loan */}
              {collectMode === "LOAN_EMI" && !activeLoan && !loadingDetails && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100">
                  ℹ No active loan found for this customer.
                </p>
              )}

              {/* ── GENERAL COLLECTION FORM ── */}
              {collectMode === "GENERAL" && (
                <form onSubmit={handleCollectGeneral} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cd-gen-amt">Amount to Collect (₹)</Label>
                    <Input id="cd-gen-amt" type="number" inputMode="decimal" min="1" placeholder="e.g. 100"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
                      className={`text-xl h-12 font-bold ${amountError ? "border-red-400" : ""}`}
                      autoFocus disabled={submitting}
                    />
                    <FieldError error={amountError} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Mode</Label>
                    <div className="flex gap-1.5">
                      {(["CASH", "UPI", "BANK_TRANSFER"] as PaymentMode[]).map((m) => (
                        <button key={m} type="button"
                          onClick={() => setPaymentMode(m)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                            paymentMode === m
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"
                          }`}
                        >
                          {m === "BANK_TRANSFER" ? "Bank" : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cd-gen-notes">
                      Notes <span className="text-slate-400 font-normal text-xs">(optional)</span>
                    </Label>
                    <Input id="cd-gen-notes" type="text" placeholder="e.g. advance, late fee…"
                      value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                      className="h-9 text-sm" disabled={submitting}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11"
                      disabled={submitting || loadingDetails}>
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : "Collect"}
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

interface UpiPanelProps {
  isOnline: boolean;
  orgUpiId: string;
  upiEnabled: boolean;
  isOwner: boolean;
  merchantName: string;
  qrCodeUrl: string;
  upiString: string;
  amount: number;
  custName: string;
  orgName: string;
  upiNote: string;
  loanId: string;
  installmentNo?: number;
  upiStatus: UpiStatus;
  upiTxnRef: string;
  submitting: boolean;
  qrError: boolean;
  onQrError: () => void;
  onLaunch: () => void;
  onConfirm: () => void;
  onFailed: () => void;
  onTxnRefChange: (v: string) => void;
  onCancel: () => void;
  onConfigureUpi: () => void;
  onSwitchToCash: () => void;
}

function UpiPaymentPanel({
  isOnline, orgUpiId, upiEnabled, isOwner, merchantName,
  qrCodeUrl, upiString, amount, custName, orgName,
  upiNote, loanId, installmentNo, upiStatus, upiTxnRef, submitting,
  qrError, onQrError, onLaunch, onConfirm, onFailed, onTxnRefChange, onCancel,
  onConfigureUpi, onSwitchToCash,
}: UpiPanelProps) {

  if (!isOnline) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-5 h-5 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">UPI unavailable offline</p>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          UPI payments require an internet connection. Switch to Cash to record this collection.
        </p>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1 h-10 text-sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="flex-1 h-10 text-sm bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onSwitchToCash}>
            <Banknote className="w-3.5 h-3.5 mr-1.5" />Use Cash
          </Button>
        </div>
      </div>
    );
  }

  if (!orgUpiId || !upiEnabled) {
    if (isOwner) {
      return (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-900">
                {!orgUpiId ? "UPI not configured" : "UPI payments disabled"}
              </p>
              <p className="text-xs text-indigo-600">
                {!orgUpiId
                  ? "Add your merchant UPI ID to accept digital payments."
                  : "Enable UPI in Payment Settings to accept digital payments."}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">What you'll get</p>
            <ul className="space-y-1">
              {["QR code for customers to scan", "Instant UPI payment tracking", "Auto-linked to EMI receipts"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-indigo-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />{f}
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            onClick={onConfigureUpi}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 text-sm"
          >
            <Settings className="w-4 h-4" />
            Configure UPI
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
          <div className="flex gap-2 pt-1 border-t border-indigo-100">
            <Button type="button" variant="outline" className="flex-1 h-9 text-sm" onClick={onCancel}>Cancel</Button>
            <Button type="button" variant="outline" className="flex-1 h-9 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={onSwitchToCash}>
              <Banknote className="w-3.5 h-3.5 mr-1.5" />Use Cash
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <ZapOff className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">UPI not set up</p>
            <p className="text-xs text-slate-500">The organization owner needs to configure UPI payments.</p>
          </div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            Contact your organization owner to add a merchant UPI ID in Settings, or collect this payment in cash.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-10 text-sm" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            className="flex-1 h-10 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onSwitchToCash}
          >
            <Banknote className="w-3.5 h-3.5 mr-1.5" />Use Cash
          </Button>
        </div>
      </div>
    );
  }

  if (upiStatus === "idle") {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-indigo-600" />
            <p className="text-sm font-bold text-indigo-900">UPI Payment</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wide">
            Scan or Tap
          </span>
        </div>

        <div className="flex flex-col items-center gap-3">
          {qrError ? (
            <div className="w-[180px] h-[180px] rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2 border border-slate-200">
              <QrCode className="w-8 h-8 text-slate-300" />
              <p className="text-[10px] text-slate-400 text-center px-2">QR unavailable offline</p>
            </div>
          ) : (
            <div className="p-2 rounded-xl border-2 border-indigo-200 bg-white shadow-sm">
              <img
                src={qrCodeUrl}
                alt="UPI QR Code"
                width={180}
                height={180}
                className="rounded-lg"
                onError={onQrError}
              />
            </div>
          )}

          <div className="w-full space-y-1.5 text-center">
            <p className="text-2xl font-black text-indigo-700">₹{amount.toLocaleString("en-IN")}</p>
            <p className="text-xs font-semibold text-slate-700">{custName}</p>
            {installmentNo && (
              <p className="text-[10px] text-slate-500">EMI #{installmentNo} · {loanId.slice(-8).toUpperCase()}</p>
            )}
            <div className="flex flex-col items-center gap-1 mt-1">
              <p className="text-[11px] font-semibold text-slate-600">{merchantName}</p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
                <Smartphone className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-xs font-mono text-slate-700 font-semibold">{orgUpiId}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 text-center leading-relaxed">
          Customer can scan this QR using PhonePe, Google Pay, Paytm, BHIM or any UPI app
        </p>

        <Button
          type="button"
          onClick={onLaunch}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 text-sm"
        >
          <ExternalLink className="w-4 h-4" />
          Pay with UPI App
        </Button>

        <p className="text-[10px] text-slate-400 text-center">
          Launches PhonePe / Google Pay / Paytm / BHIM chooser
        </p>

        <div className="flex gap-2 pt-1 border-t border-indigo-100">
          <Button type="button" variant="outline" className="flex-1 h-9 text-sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="outline" className="flex-1 h-9 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={onSwitchToCash}>
            <Banknote className="w-3.5 h-3.5 mr-1" />Use Cash
          </Button>
        </div>
      </div>
    );
  }

  if (upiStatus === "launched") {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">Waiting for payment…</p>
            <p className="text-xs text-amber-600">Ask the customer to complete payment on their device</p>
          </div>
        </div>

        <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Amount</span>
            <span className="font-bold text-slate-900">₹{amount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Customer</span>
            <span className="font-semibold text-slate-900">{custName}</span>
          </div>
          {installmentNo && (
            <div className="flex justify-between">
              <span className="text-slate-500">EMI #</span>
              <span className="font-semibold text-slate-900">{installmentNo}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">UPI ID</span>
            <span className="font-mono font-semibold text-slate-900">{orgUpiId}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">
            UPI Transaction ID <span className="text-slate-400 font-normal">(optional but recommended)</span>
          </Label>
          <Input
            type="text"
            placeholder="e.g. 423845738902"
            value={upiTxnRef}
            onChange={(e) => onTxnRefChange(e.target.value.trim())}
            className="h-10 text-sm font-mono"
            maxLength={50}
          />
          <p className="text-[10px] text-slate-400">
            Enter the 12-digit UTR/reference number shown after payment
          </p>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 text-sm"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Saving collection…</>
              : <><CheckCheck className="w-4 h-4" />Confirm Payment Received</>}
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-9 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
              onClick={onFailed}
              disabled={submitting}
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Payment Failed
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-9 text-xs"
              onClick={() => { onFailed(); }}
              disabled={submitting}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 text-center">
          Only confirm after the customer shows you the payment success screen
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 flex flex-col items-center gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      <p className="text-sm font-semibold text-indigo-800">Saving collection…</p>
      <p className="text-xs text-indigo-600">Please wait, do not close this dialog</p>
    </div>
  );
}

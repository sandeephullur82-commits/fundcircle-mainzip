import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CheckCircle, Loader2, TrendingUp, Banknote, ShieldCheck,
  AlertTriangle, ChevronDown, Crown, Calendar, ClipboardCheck,
  UserCheck, Building2, Smartphone, FileText, ChevronRight,
  CreditCard, UserPlus, Save,
} from "lucide-react";
import { calculateEMI, approveLoan, createLoan } from "@/lib/services";
import { Loan, LoanApplication, Membership } from "@/types";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DisbursementMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

const NOMINEE_THRESHOLD = 0; // nominee always required

const CHECKLIST_ITEMS = [
  { id: "identity",   label: "Customer identity documents verified" },
  { id: "income",     label: "Income proof / bank statement reviewed" },
  { id: "nominee",    label: "Nominee details confirmed" },
  { id: "purpose",    label: "Loan purpose valid and documented" },
  { id: "repayment",  label: "Repayment capacity assessed" },
];

function generateLoanAccountNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `FC-LOAN-${datePart}-${rand}`;
}

function toInputDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface Props {
  loan: Loan | null;
  application: LoanApplication | null;
  members: Membership[];
  collectors: Membership[];
  actorId: string;
  actorName: string;
  onClose: () => void;
}

export default function LoanApprovalDialog({
  loan, application, members, collectors, actorId, actorName, onClose,
}: Props) {
  const isOpen = !!(loan || application);
  const isApplicationMode = !loan && !!application;

  const customerId = loan?.customerId ?? application?.customerId ?? "";
  const customer = members.find((m) => m.id === customerId || m.clerkUserId === customerId);
  const custName =
    (customer as any)?.fullName || (customer as any)?.name ||
    application?.customerName || customerId.slice(-8);

  const nomineeName    = (customer as any)?.nomineeName    || customer?.nominee?.name     || "";
  const nomineeRelation = (customer as any)?.nomineeRelation || customer?.nominee?.relation || "";
  const nomineePhone   = (customer as any)?.nomineePhone   || customer?.nominee?.phone    || "";
  const nomineeAddress = (customer as any)?.nomineeAddress || customer?.nominee?.address  || "";
  const nomineeComplete = !!(nomineeName && nomineeRelation);

  const requestedAmount = loan?.principalAmount ?? (loan as any)?.principal ?? application?.loanAmount ?? 0;
  const requestedTenure = loan?.tenureMonths ?? (loan as any)?.durationMonths ?? application?.tenureMonths ?? 12;
  const ct = (customer as any)?.customerType as string | undefined;
  const ctLabel = ct === "SAVINGS" ? "Savings Only" : ct === "LOAN" ? "Loan Only" : ct === "SAVINGS_LOAN" ? "Savings + Loan" : "";

  const defaultDisbDate = toInputDate(new Date());
  const defaultFirstEmi = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return toInputDate(d); })();

  const [approvedAmount, setApprovedAmount]     = useState(String(requestedAmount));
  const [interestRate, setInterestRate]         = useState(String(loan?.interestRate ?? (application as any)?.interestRate ?? 12));
  const [disbursementDate, setDisbursementDate] = useState(defaultDisbDate);
  const [firstEmiDate, setFirstEmiDate]         = useState(defaultFirstEmi);
  const [disbursementMethod, setDisbursementMethod] = useState<DisbursementMethod>("CASH");
  const [upiId, setUpiId]         = useState("");
  const [upiUtr, setUpiUtr]       = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [bankIfsc, setBankIfsc]   = useState("");
  const [bankUtr, setBankUtr]     = useState("");
  const [chequeNo, setChequeNo]   = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [riskLevel, setRiskLevel]   = useState<RiskLevel>("LOW");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("PENDING");
  const [checklist, setChecklist]   = useState<Record<string, boolean>>({});
  const [showGuarantor, setShowGuarantor] = useState(false);
  const [guarantorName, setGuarantorName]       = useState("");
  const [guarantorPhone, setGuarantorPhone]     = useState("");
  const [guarantorRelation, setGuarantorRelation] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  // Inline nominee form state
  const [showInlineNominee, setShowInlineNominee] = useState(false);
  const [savingInlineNominee, setSavingInlineNominee] = useState(false);
  const [inlineNomineeName, setInlineNomineeName] = useState("");
  const [inlineNomineeRelation, setInlineNomineeRelation] = useState("");
  const [inlineNomineePhone, setInlineNomineePhone] = useState("");
  const [inlineNomineeAddress, setInlineNomineeAddress] = useState("");
  // Locally-saved nominee override (enables approval without page reload)
  const [localNomineeSaved, setLocalNomineeSaved] = useState<{
    name: string; relation: string; phone: string; address: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLocalNomineeSaved(null);
      setShowInlineNominee(false);
      setInlineNomineeName(""); setInlineNomineeRelation("");
      setInlineNomineePhone(""); setInlineNomineeAddress("");
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const amt = loan?.principalAmount ?? (loan as any)?.principal ?? application?.loanAmount ?? 0;
    const rate = loan?.interestRate ?? (application as any)?.interestRate ?? 12;
    setApprovedAmount(String(amt));
    setInterestRate(String(rate));
    setDisbursementDate(toInputDate(new Date()));
    const fe = new Date(); fe.setMonth(fe.getMonth() + 1);
    setFirstEmiDate(toInputDate(fe));
    setDisbursementMethod("CASH");
    setUpiId(""); setUpiUtr(""); setBankAccNo(""); setBankIfsc(""); setBankUtr("");
    setChequeNo(""); setChequeBank(""); setChequeDate("");
    setRiskLevel((loan?.riskLevel as RiskLevel) || "LOW");
    setVerificationStatus("PENDING");
    setChecklist({});
    setShowGuarantor(false);
    setGuarantorName(""); setGuarantorPhone(""); setGuarantorRelation("");
    setApprovalNotes(loan?.approvalNotes || "");
    if (loan?.loanAssignedCollectorId) {
      setCollectorId(loan.loanAssignedCollectorId);
    } else {
      const agentId = (customer as any)?.assignedAgentId || "";
      const found = collectors.find((c) => c.id === agentId);
      if (found) setCollectorId(agentId);
      else if (collectors.length === 1) setCollectorId(collectors[0].id);
      else setCollectorId("");
    }
  }, [isOpen, loan?.id, application?.id]);

  const approvedAmountNum = parseFloat(approvedAmount) || 0;
  const interestRateNum   = parseFloat(interestRate) || 0;
  const liveEMI           = approvedAmountNum > 0 && requestedTenure > 0
    ? calculateEMI(approvedAmountNum, interestRateNum, requestedTenure)
    : 0;
  const totalRepayment = liveEMI * requestedTenure;
  const totalInterest  = totalRepayment - approvedAmountNum;

  // Effective nominee — local override takes precedence after inline save
  const effectiveNomineeName     = localNomineeSaved?.name     ?? nomineeName;
  const effectiveNomineeRelation = localNomineeSaved?.relation ?? nomineeRelation;
  const effectiveNomineePhone    = localNomineeSaved?.phone    ?? nomineePhone;
  const effectiveNomineeAddress  = localNomineeSaved?.address  ?? nomineeAddress;
  const effectiveNomineeComplete = !!(effectiveNomineeName && effectiveNomineeRelation);

  const requiresNominee = approvedAmountNum > NOMINEE_THRESHOLD;
  const nomineeBlocked  = requiresNominee && !effectiveNomineeComplete;
  const checkedCount    = Object.values(checklist).filter(Boolean).length;

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";
  const collectorLabel = (c: any) => {
    const name = c.fullName || c.name || c.email || c.id;
    return isOwnerMember(c) ? `${name} (Owner)` : name;
  };

  const buildDisbRef = (): string => {
    if (disbursementMethod === "UPI")           return [upiId, upiUtr].filter(Boolean).join(" | ");
    if (disbursementMethod === "BANK_TRANSFER")  return [bankAccNo, bankIfsc, bankUtr].filter(Boolean).join(" | ");
    if (disbursementMethod === "CHEQUE")         return [chequeNo, chequeBank, chequeDate].filter(Boolean).join(" | ");
    return "";
  };

  const handleSaveInlineNominee = async () => {
    if (!inlineNomineeName.trim()) { toast.error("Nominee name is required."); return; }
    if (!inlineNomineeRelation)    { toast.error("Nominee relationship is required."); return; }
    const customerDoc = members.find((m) => m.id === customerId || m.clerkUserId === customerId);
    if (!customerDoc) { toast.error("Customer profile not found."); return; }
    setSavingInlineNominee(true);
    try {
      const nomineeFields = {
        nomineeName:     inlineNomineeName.trim(),
        nomineeRelation: inlineNomineeRelation,
        nomineePhone:    inlineNomineePhone.trim(),
        nomineeAddress:  inlineNomineeAddress.trim(),
        nominee: {
          name:     inlineNomineeName.trim(),
          relation: inlineNomineeRelation,
          phone:    inlineNomineePhone.trim(),
          address:  inlineNomineeAddress.trim(),
        },
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "organizationMembers", customerDoc.id), nomineeFields);
      try { await updateDoc(doc(db, "customers", customerDoc.id), nomineeFields); } catch (_) {}
      setLocalNomineeSaved({
        name:     inlineNomineeName.trim(),
        relation: inlineNomineeRelation,
        phone:    inlineNomineePhone.trim(),
        address:  inlineNomineeAddress.trim(),
      });
      setShowInlineNominee(false);
      toast.success("Nominee saved — approval is now enabled.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save nominee.");
    } finally {
      setSavingInlineNominee(false);
    }
  };

  const handleApprove = async () => {
    if (nomineeBlocked) {
      toast.error("Nominee is required. Please add one using '+ Add Nominee Now' above.");
      return;
    }
    if (!approvedAmountNum || approvedAmountNum <= 0) {
      toast.error("Approved amount must be greater than zero.");
      return;
    }

    const collector      = collectors.find((c) => c.id === collectorId);
    const loanAccountNum = generateLoanAccountNumber();
    const completedItems = CHECKLIST_ITEMS.filter((i) => checklist[i.id]).map((i) => i.label);
    const disbDate       = disbursementDate ? new Date(disbursementDate) : new Date();
    const fEmiDate       = firstEmiDate ? new Date(firstEmiDate) : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();
    const disbRef        = buildDisbRef();
    const collectorParams = {
      loanAssignedCollectorId:   collector?.id || collectorId || "",
      loanAssignedCollectorName: collector ? ((collector.fullName || (collector as any).name) ?? "") : "",
      loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
    };

    setProcessing(true);
    try {
      let finalLoanId: string;

      if (isApplicationMode && application) {
        finalLoanId = await createLoan({
          organizationId: application.organizationId,
          customerId: application.customerId,
          principalAmount: approvedAmountNum,
          interestRate: interestRateNum,
          tenureMonths: application.tenureMonths,
          createdByActorId: actorId,
          createdByActorRole: "OWNER",
          createdByActorName: actorName,
          ...collectorParams,
        });
      } else {
        finalLoanId = loan!.id;
      }

      await approveLoan({
        loanId: finalLoanId,
        actorId, actorRole: "OWNER", actorName,
        approvedAmount: approvedAmountNum,
        firstEmiDate: fEmiDate,
        disbursementDate: disbDate,
        loanAccountNumber: loanAccountNum,
        guarantorName:     guarantorName || undefined,
        guarantorPhone:    guarantorPhone || undefined,
        guarantorRelation: guarantorRelation || undefined,
        approvalChecklist: completedItems,
        riskLevel,
        approvalNotes,
        disbursementMethod,
        disbursementReference: disbRef,
        verificationStatus: isApplicationMode ? verificationStatus : undefined,
        ...collectorParams,
      });

      if (isApplicationMode && application) {
        await updateDoc(doc(db, "loanApplications", application.id), {
          status: "APPROVED",
          loanId: finalLoanId,
          reviewedByActorId: actorId,
          reviewedByActorName: actorName,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          verificationStatus,
          riskLevel,
          approvalNotes,
        });
      }

      toast.success(`Loan approved — Account ${loanAccountNum} activated.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Approval failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {isApplicationMode ? "Approve Loan Application" : "Approve Loan"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-1">

          {/* ── 1. Customer Profile ──────────────────────────────────────────── */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Customer Profile</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {[
                { label: "Name",    value: custName },
                { label: "Email",   value: (customer as any)?.email || application?.customerEmail || "" },
                { label: "Phone",   value: (customer as any)?.phone || "" },
                { label: "Aadhaar", value: (customer as any)?.aadhaarLast4 ? `XXXX XXXX XXXX ${(customer as any).aadhaarLast4}` : "" },
              ].filter((r) => r.value).map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="font-medium text-slate-900">{row.value}</span>
                </div>
              ))}
              {ctLabel && (
                <div className="flex items-center justify-between text-sm col-span-2">
                  <span className="text-slate-500">Customer Type</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    ct === "SAVINGS" ? "bg-emerald-100 text-emerald-700" :
                    ct === "LOAN"    ? "bg-blue-100 text-blue-700"       :
                                       "bg-violet-100 text-violet-700"
                  }`}>{ctLabel}</span>
                </div>
              )}
              {(customer as any)?.address && (
                <div className="flex items-start justify-between text-sm col-span-2">
                  <span className="text-slate-500 shrink-0">Address</span>
                  <span className="text-slate-700 text-right ml-4">{(customer as any).address}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. Nominee Status Card ───────────────────────────────────────── */}
          <div className={`rounded-xl p-4 border space-y-2 ${
            effectiveNomineeComplete ? "bg-purple-50 border-purple-100" :
            showInlineNominee        ? "bg-blue-50 border-blue-200"     :
                                       "bg-red-50 border-red-200"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-1">Nominee Details</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                effectiveNomineeComplete ? "bg-purple-200 text-purple-800" :
                showInlineNominee        ? "bg-blue-200 text-blue-800"     :
                                           "bg-red-200 text-red-800"
              }`}>
                {effectiveNomineeComplete ? "✓ Complete" : "Required — Missing"}
              </span>
            </div>

            {effectiveNomineeComplete ? (
              /* Nominee exists — show details */
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  { label: "Name",     value: effectiveNomineeName },
                  { label: "Relation", value: effectiveNomineeRelation },
                  { label: "Phone",    value: effectiveNomineePhone },
                  { label: "Address",  value: effectiveNomineeAddress },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-medium text-slate-800">{row.value}</span>
                  </div>
                ))}
                {localNomineeSaved && (
                  <div className="col-span-2 mt-1 text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Nominee added in this session
                  </div>
                )}
              </div>
            ) : showInlineNominee ? (
              /* Inline add form */
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-slate-500">Full Name *</Label>
                    <input
                      value={inlineNomineeName}
                      onChange={(e) => setInlineNomineeName(e.target.value)}
                      placeholder="Nominee's full name"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Relationship *</Label>
                    <select
                      value={inlineNomineeRelation}
                      onChange={(e) => setInlineNomineeRelation(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    >
                      <option value="">Select…</option>
                      {["Spouse","Father","Mother","Son","Daughter","Sibling","Other"].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Phone</Label>
                    <input
                      value={inlineNomineePhone}
                      onChange={(e) => setInlineNomineePhone(e.target.value)}
                      placeholder="Contact number"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-slate-500">Address</Label>
                    <input
                      value={inlineNomineeAddress}
                      onChange={(e) => setInlineNomineeAddress(e.target.value)}
                      placeholder="Nominee's address"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSaveInlineNominee}
                    disabled={savingInlineNominee}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {savingInlineNominee ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Saving…</>
                    ) : (
                      <><Save className="w-3.5 h-3.5 mr-1" />Save Nominee</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowInlineNominee(false)}
                    disabled={savingInlineNominee}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* No nominee — show options */
              <div className="space-y-2">
                <p className="text-xs text-red-700 font-semibold">
                  ⚠ Nominee is required to approve this loan.
                </p>
                <p className="text-[11px] text-slate-500">Choose one of the options below:</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowInlineNominee(true)}
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Option A — Add Nominee Now
                </Button>
                <p className="text-[10px] text-slate-400 text-center">— or —</p>
                <p className="text-[11px] text-slate-500 text-center">
                  Option B — Close this dialog, open the customer profile and add the nominee there, then come back to approve.
                </p>
              </div>
            )}
          </div>

          {/* ── 3. Loan Terms ────────────────────────────────────────────────── */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Terms</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Requested Amount</Label>
                <div className="h-10 rounded-md border border-slate-200 bg-slate-100 px-3 flex items-center text-sm font-semibold text-slate-500 select-none">
                  ₹{Number(requestedAmount).toLocaleString()}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-emerald-700">
                  Approved Amount <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">₹</span>
                  <Input
                    type="number" min="1" step="1"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    className="pl-7 font-semibold border-emerald-300 focus-visible:ring-emerald-300"
                    placeholder={String(requestedAmount)}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Interest Rate (% p.a.)</Label>
                <Input
                  type="number" min="0" max="100" step="0.1"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Tenure</Label>
                <div className="h-10 rounded-md border border-slate-200 bg-slate-100 px-3 flex items-center text-sm font-semibold text-slate-500">
                  {requestedTenure} months
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. Live Loan Summary Panel ───────────────────────────────────── */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-3">Loan Summary</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Monthly EMI",     value: liveEMI > 0 ? `₹${Math.round(liveEMI).toLocaleString()}` : "—",   color: "text-emerald-700" },
                { label: "Total Interest",  value: liveEMI > 0 ? `₹${Math.round(totalInterest).toLocaleString()}` : "—", color: "text-amber-600" },
                { label: "Total Repayment", value: liveEMI > 0 ? `₹${Math.round(totalRepayment).toLocaleString()}` : "—", color: "text-slate-700" },
                { label: "Tenure",          value: `${requestedTenure} mo`,                                             color: "text-slate-700" },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-lg p-3 border border-emerald-100">
                  <p className="text-[10px] text-slate-400 font-medium mb-0.5">{stat.label}</p>
                  <p className={`text-base font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Date Pickers ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Disbursement Date
              </Label>
              <Input type="date" value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> First EMI Date
              </Label>
              <Input type="date" value={firstEmiDate} onChange={(e) => setFirstEmiDate(e.target.value)} />
            </div>
          </div>

          {/* ── 6. Disbursement Method ───────────────────────────────────────── */}
          <div className="space-y-3">
            <Label className="flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5 text-slate-400" /> Disbursement Method
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: "CASH",          label: "Cash",     Icon: Banknote },
                { value: "UPI",           label: "UPI",      Icon: Smartphone },
                { value: "BANK_TRANSFER", label: "Bank",     Icon: Building2 },
                { value: "CHEQUE",        label: "Cheque",   Icon: FileText },
              ] as { value: DisbursementMethod; label: string; Icon: any }[]).map(({ value, label, Icon }) => (
                <button
                  key={value} type="button"
                  onClick={() => setDisbursementMethod(value)}
                  className={`py-2.5 rounded-lg border text-xs font-semibold transition-colors flex flex-col items-center gap-1 ${
                    disbursementMethod === value
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-indigo-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {disbursementMethod === "UPI" && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">UPI ID</Label>
                  <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. user@paytm" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UTR Number</Label>
                  <Input value={upiUtr} onChange={(e) => setUpiUtr(e.target.value)} placeholder="e.g. UTR1234567890" className="h-9" />
                </div>
              </div>
            )}

            {disbursementMethod === "BANK_TRANSFER" && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Account No.</Label>
                  <Input value={bankAccNo} onChange={(e) => setBankAccNo(e.target.value)} placeholder="Account number" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} placeholder="e.g. SBIN0001234" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UTR / Ref.</Label>
                  <Input value={bankUtr} onChange={(e) => setBankUtr(e.target.value)} placeholder="NEFT / RTGS ref" className="h-9" />
                </div>
              </div>
            )}

            {disbursementMethod === "CHEQUE" && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Cheque No.</Label>
                  <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="e.g. 001234" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name</Label>
                  <Input value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} placeholder="e.g. SBI" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cheque Date</Label>
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="h-9" />
                </div>
              </div>
            )}
          </div>

          {/* ── 7. Verification Status (applications only) ───────────────────── */}
          {isApplicationMode && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Verification Status
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(["PENDING", "VERIFIED", "REJECTED"] as VerificationStatus[]).map((v) => (
                  <button key={v} type="button" onClick={() => setVerificationStatus(v)}
                    className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      v === "PENDING"  ? (verificationStatus === v ? "bg-amber-500 text-white border-amber-500"   : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50") :
                      v === "VERIFIED" ? (verificationStatus === v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-emerald-50") :
                                         (verificationStatus === v ? "bg-red-600 text-white border-red-600"         : "bg-white text-slate-600 border-slate-200 hover:bg-red-50")
                    }`}>{v}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── 8. Risk Level ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" /> Risk Level
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(["LOW", "MEDIUM", "HIGH"] as RiskLevel[]).map((r) => (
                <button key={r} type="button" onClick={() => setRiskLevel(r)}
                  className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    r === "LOW"    ? (riskLevel === r ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-emerald-50") :
                    r === "MEDIUM" ? (riskLevel === r ? "bg-amber-500 text-white border-amber-500"    : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50")   :
                                     (riskLevel === r ? "bg-red-600 text-white border-red-600"         : "bg-white text-slate-600 border-slate-200 hover:bg-red-50")
                  }`}>{r}</button>
              ))}
            </div>
          </div>

          {/* ── 9. Approval Checklist ────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" /> Approval Checklist
              </Label>
              <span className={`text-xs font-semibold ${checkedCount === CHECKLIST_ITEMS.length ? "text-emerald-600" : "text-slate-400"}`}>
                {checkedCount}/{CHECKLIST_ITEMS.length} completed
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
              {CHECKLIST_ITEMS.map((item) => (
                <button
                  key={item.id} type="button"
                  onClick={() => setChecklist((p) => ({ ...p, [item.id]: !p[item.id] }))}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-100 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    checklist[item.id] ? "bg-emerald-600 border-emerald-600" : "border-slate-300"
                  }`}>
                    {checklist[item.id] && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-sm ${checklist[item.id] ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── 10. Guarantor (optional, collapsible) ───────────────────────── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGuarantor((g) => !g)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
            >
              <span className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" />
                Guarantor
                <span className="text-xs text-slate-400 font-normal">(Optional)</span>
                {(guarantorName || guarantorPhone) && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Added</span>
                )}
              </span>
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showGuarantor ? "rotate-90" : ""}`} />
            </button>
            {showGuarantor && (
              <div className="p-4 border-t border-slate-100 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name</Label>
                  <Input value={guarantorName} onChange={(e) => setGuarantorName(e.target.value)} placeholder="Guarantor name" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={guarantorPhone} onChange={(e) => setGuarantorPhone(e.target.value)} placeholder="+91 98765 43210" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Relation</Label>
                  <Input value={guarantorRelation} onChange={(e) => setGuarantorRelation(e.target.value)} placeholder="e.g. Brother" className="h-9" />
                </div>
              </div>
            )}
          </div>

          {/* ── 11. Collection Agent ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Collection Agent</Label>
            {collectors.length === 0 ? (
              <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">
                No active collectors available
              </div>
            ) : collectors.length === 1 ? (
              <div className="h-10 rounded-md border border-emerald-200 bg-emerald-50 px-3 flex items-center gap-2 text-sm text-emerald-800 font-medium">
                {isOwnerMember(collectors[0]) && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <span className="flex-1">{collectorLabel(collectors[0])}</span>
                <span className="text-xs text-emerald-600 font-normal">Auto-assigned</span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={collectorId}
                  onChange={(e) => setCollectorId(e.target.value)}
                  className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm h-10 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">Select a collector…</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{collectorLabel(c)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* ── 12. Approval Notes ───────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Approval Notes</Label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes for this approval…"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none"
            />
          </div>

          {/* ── Loan Account Number preview ──────────────────────────────────── */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium">Loan Account Number</p>
              <p className="text-sm font-mono font-semibold text-slate-700">Auto-generated on approval</p>
            </div>
          </div>

          {/* ── Action Buttons ───────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-1 pb-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              disabled={processing || nomineeBlocked || showInlineNominee}
              title={nomineeBlocked ? "Add a nominee above before approving" : undefined}
            >
              {processing
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
                : nomineeBlocked
                  ? "Nominee Required"
                  : "Approve & Activate"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

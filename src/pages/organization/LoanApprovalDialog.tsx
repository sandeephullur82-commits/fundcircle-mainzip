import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import {
  CheckCircle, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  User, IndianRupee, Calculator, UserCheck, FileText,
  ShieldCheck, ClipboardList, TrendingUp, TrendingDown,
  Minus, Crown, Calendar, Building2, Phone, MapPin,
  Briefcase, CreditCard, Info, Save,
} from "lucide-react";
import { calculateEMI, approveLoan, createLoan, createAuditLog } from "@/lib/services";
import {
  calculateRiskLevel, fetchCustomerLoanData, RiskLevel, RiskResult,
} from "@/lib/loanEligibility";
import { Loan, LoanApplication, Membership } from "@/types";
import {
  doc, updateDoc, serverTimestamp, addDoc, collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import FieldError from "@/components/ui/FieldError";
import SearchSelect from "@/components/ui/SearchSelect";
import { validateAmount, validateRate } from "@/lib/validation";
import { format, addMonths } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type DisbursementMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";

const LOAN_TYPES = [
  "Personal Loan", "Business Loan", "Emergency Loan",
  "Education Loan", "Agriculture Loan", "Consumer Loan", "Other",
];

const STEP_META: Record<Step, { label: string; icon: React.ElementType }> = {
  1: { label: "Review",     icon: User },
  2: { label: "Details",    icon: IndianRupee },
  3: { label: "Calculator", icon: Calculator },
  4: { label: "Collector",  icon: UserCheck },
  5: { label: "Notes",      icon: FileText },
  6: { label: "Risk",       icon: ShieldCheck },
  7: { label: "Confirm",    icon: ClipboardList },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function fmt(n: number) {
  return `₹${Number(Math.round(n)).toLocaleString("en-IN")}`;
}

function toInputDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function generateLoanNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `FC-LOAN-${d}-${Math.floor(10000 + Math.random() * 90000)}`;
}

const RISK_CONFIG: Record<RiskLevel, {
  color: string; bg: string; border: string; dot: string; label: string;
}> = {
  LOW:    { color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", dot: "bg-emerald-500", label: "Low Risk" },
  MEDIUM: { color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   dot: "bg-amber-500",   label: "Medium Risk" },
  HIGH:   { color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",      dot: "bg-red-500",     label: "High Risk" },
};

const IMPACT_ICON = {
  positive: <TrendingUp  className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
  neutral:  <Minus       className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
  negative: <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  loan: Loan | null;
  application: LoanApplication | null;
  members: Membership[];
  collectors: Membership[];
  actorId: string;
  actorName: string;
  organizationId: string;
  organizationName?: string;
  onClose: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LoanApprovalDialog({
  loan, application, members, collectors,
  actorId, actorName, organizationId, organizationName,
  onClose,
}: Props) {
  const isOpen = !!(loan || application);
  const isAppMode = !loan && !!application;

  // ── Derived customer data ─────────────────────────────────────────────────
  const customerId = loan?.customerId ?? application?.customerId ?? "";
  const customer   = members.find((m) => m.id === customerId || m.clerkUserId === customerId);
  const custName   = (customer as any)?.fullName || (customer as any)?.name
    || application?.customerName || customerId.slice(-8);
  const custPhone  = (customer as any)?.phone || "";
  const custEmail  = (customer as any)?.email || application?.customerEmail || "";
  const custAddr   = (customer as any)?.address || application?.address || "";
  const custOcc    = (customer as any)?.occupation || (customer as any)?.employmentType
    || application?.employmentType || "";
  const custIncome = Number((customer as any)?.monthlyIncome || application?.monthlyIncome || 0);
  const applicationDate = toDate(application?.createdAt ?? loan?.createdAt);

  const reqAmount  = loan?.principalAmount ?? (loan as any)?.principal ?? application?.loanAmount ?? 0;
  const reqTenure  = loan?.tenureMonths ?? (loan as any)?.durationMonths ?? application?.tenureMonths ?? 12;
  const reqPurpose = (loan as any)?.loanPurpose || application?.loanPurpose || "";

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [visited, setVisited] = useState<Set<Step>>(new Set([1]));

  // Step 2 form
  const [approvedAmount, setApprovedAmount] = useState(String(reqAmount));
  const [interestRate,   setInterestRate]   = useState(String(loan?.interestRate ?? (application as any)?.interestRate ?? 12));
  const [tenure,         setTenure]         = useState(String(reqTenure));
  const [processingFee,  setProcessingFee]  = useState("0");
  const [disbDate,       setDisbDate]       = useState(toInputDate(new Date()));
  const [loanPurpose,    setLoanPurpose]    = useState(reqPurpose);
  const [loanType,       setLoanType]       = useState("Personal Loan");

  // Step 4 form
  const [collectorId,    setCollectorId]    = useState("");

  // Step 5 form
  const [approvalNotes,  setApprovalNotes]  = useState("");

  // Async loan data (for risk + review)
  const [loanData, setLoanData]   = useState<{ activeLoansCount: number; overdueCount: number } | null>(null);
  const [loanDataLoading, setLoanDataLoading] = useState(false);

  // Risk result
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);

  // Draft / processing
  const [savingDraft,  setSavingDraft]  = useState(false);
  const [processing,   setProcessing]  = useState(false);
  const [fieldErrors,  setFieldErrors] = useState<Record<string, string>>({});

  // Prevent double-click
  const approveCalledRef = useRef(false);

  // ── Derived calculations ──────────────────────────────────────────────────
  const approvedAmt  = Math.max(0, parseFloat(approvedAmount) || 0);
  const rateNum      = Math.max(0, parseFloat(interestRate)   || 0);
  const tenureNum    = Math.max(1, parseInt(tenure)           || 1);
  const procFeeNum   = Math.max(0, parseFloat(processingFee)  || 0);

  const liveEMI         = approvedAmt > 0 ? calculateEMI(approvedAmt, rateNum, tenureNum) : 0;
  const totalInterest   = liveEMI * tenureNum - approvedAmt;
  const totalRepayment  = liveEMI * tenureNum;
  const netDisbursement = approvedAmt - procFeeNum;

  const disbDateObj   = disbDate ? new Date(disbDate) : new Date();
  const firstEmiDate  = addMonths(disbDateObj, 1);
  const lastEmiDate   = addMonths(disbDateObj, tenureNum);

  // ── Fetch customer loan data once ─────────────────────────────────────────
  const loadLoanData = useCallback(async () => {
    if (!customerId || !organizationId) return;
    setLoanDataLoading(true);
    try {
      const data = await fetchCustomerLoanData(customerId, organizationId);
      setLoanData(data);
    } catch {
      setLoanData({ activeLoansCount: 0, overdueCount: 0 });
    } finally {
      setLoanDataLoading(false);
    }
  }, [customerId, organizationId]);

  // ── Recompute risk whenever relevant values change ────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const result = calculateRiskLevel({
      customerId,
      organizationId,
      monthlyIncome: custIncome,
      loanAmount: approvedAmt,
      emiAmount: liveEMI,
      activeLoansCount: loanData?.activeLoansCount ?? 0,
      overdueCount:     loanData?.overdueCount     ?? 0,
    });
    setRiskResult(result);
  }, [approvedAmt, liveEMI, loanData, custIncome, isOpen]);

  // ── Reset when dialog opens ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) { setStep(1); setVisited(new Set([1])); return; }

    const amt    = loan?.principalAmount ?? (loan as any)?.principal ?? application?.loanAmount ?? 0;
    const rate   = loan?.interestRate ?? (application as any)?.interestRate ?? 12;
    const ten    = loan?.tenureMonths ?? (loan as any)?.durationMonths ?? application?.tenureMonths ?? 12;
    const purp   = (loan as any)?.loanPurpose || application?.loanPurpose || "";

    setApprovedAmount(String(amt));
    setInterestRate(String(rate));
    setTenure(String(ten));
    setProcessingFee("0");
    setDisbDate(toInputDate(new Date()));
    setLoanPurpose(purp);
    setLoanType("Personal Loan");
    setApprovalNotes(loan?.approvalNotes || application?.approvalNotes || "");
    setFieldErrors({});
    setProcessing(false);
    setSavingDraft(false);
    approveCalledRef.current = false;

    // Default collector
    const existingCollId = loan?.loanAssignedCollectorId || "";
    const agentId = (customer as any)?.assignedAgentId || "";
    const found = collectors.find(
      (c) => c.id === existingCollId || (c as any).clerkUserId === existingCollId ||
             c.id === agentId       || (c as any).clerkUserId === agentId
    );
    if (found) setCollectorId(found.id);
    else if (collectors.length === 1) setCollectorId(collectors[0].id);
    else setCollectorId("");

    loadLoanData();
  }, [isOpen, loan?.id, application?.id]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goTo = (s: Step) => {
    setStep(s);
    setVisited((prev) => new Set([...prev, s]));
    setFieldErrors({});
  };

  const validateStep = (s: Step): boolean => {
    const errs: Record<string, string> = {};
    if (s === 2) {
      const amtRes = validateAmount(approvedAmount, { label: "Approved amount", min: 1000, max: 10_000_000 });
      if (!amtRes.valid) errs.approvedAmount = amtRes.error!;
      const rateRes = validateRate(interestRate, { label: "Interest rate", max: 60 });
      if (!rateRes.valid) errs.interestRate = rateRes.error!;
      const ten = parseInt(tenure) || 0;
      if (ten < 1 || ten > 120) errs.tenure = "Tenure must be between 1 and 120 months.";
    }
    if (s === 4 && !collectorId) errs.collectorId = "Please assign a collector.";
    if (Object.keys(errs).length) { setFieldErrors(errs); fcToast.formError(); return false; }
    setFieldErrors({});
    return true;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    if (step < 7) goTo((step + 1) as Step);
  };
  const handleBack = () => { if (step > 1) goTo((step - 1) as Step); };

  // ── Collector helpers ─────────────────────────────────────────────────────
  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";
  const collectorOptions = collectors.map((c) => ({
    value: c.id,
    label: isOwnerMember(c)
      ? `${(c as any).fullName || (c as any).name || c.email} (Owner)`
      : ((c as any).fullName || (c as any).name || c.email),
    sublabel: c.email || "",
    badge: isOwnerMember(c) ? "Owner" : undefined,
  }));
  const selectedCollector = collectors.find((c) => c.id === collectorId);
  const collectorName = selectedCollector
    ? ((selectedCollector as any).fullName || (selectedCollector as any).name || selectedCollector.email)
    : "Not assigned";

  // ── Save Draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const partial = {
        approvedAmountDraft: approvedAmt,
        interestRateDraft: rateNum,
        tenureMonthsDraft: tenureNum,
        processingFeeDraft: procFeeNum,
        loanTypeDraft: loanType,
        approvalNotesDraft: approvalNotes,
        collectorDraft: collectorId,
        draftSavedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (isAppMode && application) {
        await updateDoc(doc(db, "loanApplications", application.id), partial);
      } else if (loan) {
        await updateDoc(doc(db, "loans", loan.id), partial);
      }
      toast.success("Draft saved successfully.");
    } catch {
      toast.error("Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (approveCalledRef.current) return;
    if (!validateStep(2) || !validateStep(4)) {
      toast.error("Please fill in all required fields.");
      return;
    }
    approveCalledRef.current = true;
    setProcessing(true);

    const loanAccountNumber = generateLoanNumber();
    const collector = collectors.find((c) => c.id === collectorId);
    const collectorParams = {
      loanAssignedCollectorId:   (collector as any)?.clerkUserId || collector?.id || collectorId,
      loanAssignedCollectorName: collector ? ((collector as any).fullName || (collector as any).name || "") : "",
      loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
    };

    try {
      let finalLoanId: string;

      if (isAppMode && application) {
        finalLoanId = await createLoan({
          organizationId: application.organizationId,
          customerId:     application.customerId,
          principalAmount: approvedAmt,
          interestRate:    rateNum,
          tenureMonths:    tenureNum,
          createdByActorId:   actorId,
          createdByActorRole: "OWNER",
          createdByActorName: actorName,
          ...collectorParams,
        });
      } else {
        finalLoanId = loan!.id;
      }

      await approveLoan({
        loanId:              finalLoanId,
        actorId,
        actorRole:           "OWNER",
        actorName,
        approvedAmount:      approvedAmt,
        firstEmiDate,
        disbursementDate:    disbDateObj,
        loanAccountNumber,
        riskLevel:           riskResult?.level,
        approvalNotes,
        disbursementMethod:  "CASH",
        ...collectorParams,
      });

      if (isAppMode && application) {
        await updateDoc(doc(db, "loanApplications", application.id), {
          status:               "APPROVED",
          loanId:               finalLoanId,
          riskLevel:            riskResult?.level,
          approvalNotes,
          reviewedByActorId:    actorId,
          reviewedByActorName:  actorName,
          reviewedAt:           serverTimestamp(),
          updatedAt:            serverTimestamp(),
        });
      }

      // Customer notification
      try {
        await addDoc(collection(db, "notifications"), {
          userId:         customerId,
          organizationId,
          type:           "LOAN_APPROVED",
          title:          "Loan Approved! 🎉",
          message:        `Your loan of ${fmt(approvedAmt)} has been approved. EMI of ${fmt(Math.round(liveEMI))}/month starts ${format(firstEmiDate, "dd MMM yyyy")}.`,
          metadata:       { loanId: finalLoanId, amount: approvedAmt, emiAmount: liveEMI, loanAccountNumber },
          read:           false,
          createdAt:      serverTimestamp(),
        });
      } catch (_) {}

      // Comprehensive audit log
      await createAuditLog({
        organizationId,
        actorId,
        actorRole:   "OWNER",
        actorName,
        action:      "LOAN_APPROVED",
        module:      "LOANS",
        category:    "APPROVE",
        entityType:  "Loan",
        entityId:    finalLoanId,
        description: `Loan of ${fmt(approvedAmt)} approved for ${custName}`,
        newValues: {
          requestedAmount: reqAmount,
          approvedAmount:  approvedAmt,
          interestRate:    rateNum,
          tenure:          tenureNum,
          collector:       collectorName,
          approvedBy:      actorName,
          approvedTime:    new Date().toISOString(),
          approvalNotes,
          riskLevel:       riskResult?.level,
          loanAccountNumber,
        },
      });

      fcToast.loanApproved(custName, approvedAmt, loanAccountNumber);
      onClose();
    } catch (err: any) {
      approveCalledRef.current = false;
      fcToast.loanApprovalFailed(err?.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Step renderers ────────────────────────────────────────────────────────

  function renderStep1() {
    const infoRow = (icon: React.ElementType, label: string, value: string, highlight?: boolean) => {
      const Icon = icon;
      return (
        <div className={`flex items-start gap-3 py-3 border-b border-slate-100 last:border-0 ${highlight ? "bg-amber-50 -mx-4 px-4 rounded-xl" : ""}`}>
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 font-medium">{label}</p>
            <p className={`text-sm font-semibold mt-0.5 ${value ? "text-slate-900" : "text-slate-400 italic"} ${highlight ? "text-amber-700" : ""}`}>
              {value || "Not provided"}
            </p>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-0">
        <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-100 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xl font-black">
              {custName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">{custName}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                ID: {customerId.slice(-10).toUpperCase()}
              </p>
              <p className="text-xs text-slate-500">{organizationName || "—"}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 px-4 divide-y divide-slate-100">
          {infoRow(Phone,     "Phone Number",        custPhone)}
          {infoRow(MapPin,    "Address",             custAddr)}
          {infoRow(Briefcase, "Occupation",          custOcc)}
          {infoRow(IndianRupee, "Monthly Income",    custIncome > 0 ? fmt(custIncome) : "", !!(custIncome > 0))}
          {loanDataLoading
            ? infoRow(CreditCard, "Existing Active Loans", "Loading…")
            : infoRow(
                CreditCard,
                "Existing Active Loans",
                loanData ? String(loanData.activeLoansCount) : "Unknown",
                !!(loanData && loanData.activeLoansCount > 0)
              )
          }
          {infoRow(Building2, "Organization",        organizationName || "—")}
          {infoRow(Calendar,  "Application Date",
            applicationDate > new Date(1000)
              ? format(applicationDate, "dd MMM yyyy")
              : "—"
          )}
        </div>

        {/* Requested loan highlight */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Requested Amount", value: fmt(reqAmount), color: "text-slate-900" },
            { label: "Tenure",           value: `${reqTenure} months`,  color: "text-slate-900" },
            { label: "Purpose",          value: reqPurpose || "—",      color: "text-slate-600" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
              <p className={`font-bold text-sm ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-4">
        {/* Requested Amount (read-only) */}
        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Requested Amount</p>
            <p className="text-2xl font-black text-slate-800 mt-0.5">{fmt(reqAmount)}</p>
          </div>
          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-1 rounded-full font-medium">Read Only</span>
        </div>

        {/* Approved Amount */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">
            Approved Amount <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
            <Input
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder={String(reqAmount)}
              className="pl-7 h-12 text-base font-semibold"
            />
          </div>
          <FieldError error={fieldErrors.approvedAmount} />
        </div>

        {/* Purpose */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Loan Purpose</Label>
          <Input
            value={loanPurpose}
            onChange={(e) => setLoanPurpose(e.target.value)}
            placeholder="e.g. Business expansion, medical, education…"
            maxLength={100}
          />
        </div>

        {/* Loan Type */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Loan Type</Label>
          <div className="flex flex-wrap gap-2">
            {LOAN_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLoanType(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  loanType === t
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Rate + Tenure */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">
              Interest Rate <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="12"
                className="h-11"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">% p.a.</span>
            </div>
            <FieldError error={fieldErrors.interestRate} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">
              Tenure <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                value={tenure}
                onChange={(e) => setTenure(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="12"
                className="h-11"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">months</span>
            </div>
            <FieldError error={fieldErrors.tenure} />
          </div>
        </div>

        {/* Processing Fee + Disbursement Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Processing Fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <Input
                value={processingFee}
                onChange={(e) => setProcessingFee(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="pl-7 h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Disbursement Date</Label>
            <Input
              type="date"
              value={disbDate}
              onChange={(e) => setDisbDate(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const stat = (label: string, value: string, accent?: boolean, large?: boolean) => (
      <div className={`rounded-2xl p-4 border ${accent ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100"}`}>
        <p className={`${large ? "text-2xl" : "text-lg"} font-black ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">{label}</p>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Info className="w-4 h-4 text-blue-400" />
          <span>Updates automatically when you change Amount, Rate, or Tenure.</span>
        </div>

        {/* Primary — EMI big */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white text-center">
          <p className="text-xs font-bold uppercase tracking-wider opacity-75 mb-1">Monthly EMI</p>
          <p className="text-5xl font-black">{fmt(Math.round(liveEMI))}</p>
          <p className="text-xs opacity-75 mt-2">for {tenureNum} months</p>
        </div>

        {/* Secondary grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {stat("Total Interest",    fmt(Math.round(totalInterest)))}
          {stat("Total Repayment",   fmt(Math.round(totalRepayment)),  true)}
          {stat("Net Disbursement",  fmt(Math.round(netDisbursement)))}
          {stat("Processing Fee",    fmt(procFeeNum))}
        </div>

        {/* Date summary */}
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">EMI Schedule</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Disbursement Date", value: disbDate ? format(new Date(disbDate), "dd MMM yyyy") : "—" },
              { label: "First EMI",         value: format(firstEmiDate, "dd MMM yyyy") },
              { label: "Last EMI",          value: format(lastEmiDate, "dd MMM yyyy") },
              { label: "Total EMIs",        value: `${tenureNum} payments` },
            ].map((r) => (
              <div key={r.label}>
                <p className="text-[10px] text-slate-400 font-medium">{r.label}</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{r.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Amortization mini summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Breakdown</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            <div
              className="bg-emerald-500 h-3 rounded-l-full"
              style={{ width: `${Math.round((approvedAmt / totalRepayment) * 100)}%` }}
              title="Principal"
            />
            <div
              className="bg-amber-400 h-3 rounded-r-full flex-1"
              title="Interest"
            />
          </div>
          <div className="flex gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Principal {totalRepayment > 0 ? Math.round((approvedAmt / totalRepayment) * 100) : 0}%
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Interest {totalRepayment > 0 ? Math.round((totalInterest / totalRepayment) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="space-y-5">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <UserCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Assign a Collector</p>
            <p className="text-xs text-blue-600 mt-0.5">
              The assigned collector will be responsible for collecting EMI payments from this customer.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">
            Collector <span className="text-red-500">*</span>
          </Label>
          <SearchSelect
            options={collectorOptions}
            value={collectorId}
            onChange={setCollectorId}
            placeholder="Search and select a collector…"
            clearable
          />
          <FieldError error={fieldErrors.collectorId} />
        </div>

        {selectedCollector && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-200 flex items-center justify-center text-emerald-800 font-black text-base">
              {collectorName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-slate-900">{collectorName}</p>
                {isOwnerMember(selectedCollector) && (
                  <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                    <Crown className="w-2.5 h-2.5" /> Owner
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{selectedCollector.email}</p>
            </div>
            <CheckCircle className="w-5 h-5 text-emerald-500 ml-auto shrink-0" />
          </div>
        )}

        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Collectors ({collectors.length})</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {collectors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCollectorId(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  collectorId === c.id
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-sm shrink-0">
                  {((c as any).fullName || (c as any).name || c.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {(c as any).fullName || (c as any).name || c.email}
                  </p>
                  <p className="text-xs text-slate-400">{c.email}</p>
                </div>
                {isOwnerMember(c) && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                {collectorId === c.id && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="space-y-5">
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-start gap-3">
          <FileText className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Internal Approval Notes</p>
            <p className="text-xs text-slate-500 mt-0.5">
              These notes are for internal record keeping and will be stored in the audit log.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Approval Notes <span className="text-slate-400 font-normal">(Optional)</span></Label>
          <textarea
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder={"Customer verified.\nIncome validated.\nDocuments approved."}
            rows={6}
            maxLength={500}
            className="w-full px-3 py-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-slate-400 text-right">{approvalNotes.length}/500</p>
        </div>

        {/* Quick templates */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Templates</p>
          <div className="flex flex-wrap gap-2">
            {[
              "Customer verified. Income validated.",
              "Documents reviewed and approved.",
              "Background check cleared.",
              "Income source confirmed. Loan approved.",
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setApprovalNotes((prev) => prev ? `${prev} ${t}` : t)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors text-left"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderStep6() {
    const risk = riskResult;
    if (!risk) return (
      <div className="py-12 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Calculating risk…</p>
      </div>
    );

    const cfg = RISK_CONFIG[risk.level];

    return (
      <div className="space-y-4">
        {/* Risk Level Banner */}
        <div className={`${cfg.bg} ${cfg.border} border rounded-2xl p-5 text-center`}>
          <div className={`w-5 h-5 ${cfg.dot} rounded-full mx-auto mb-3 ring-4 ring-offset-2 ${
            risk.level === "LOW" ? "ring-emerald-200" :
            risk.level === "MEDIUM" ? "ring-amber-200" : "ring-red-200"
          }`} />
          <p className="text-3xl font-black text-slate-800 mb-1">
            {risk.level === "LOW" ? "🟢" : risk.level === "MEDIUM" ? "🟡" : "🔴"} {cfg.label}
          </p>
          <p className={`text-sm ${cfg.color} mt-1 font-medium`}>{risk.summary}</p>
          <p className="text-xs text-slate-400 mt-2">Risk Score: {risk.score}</p>
        </div>

        {/* Risk Factors */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk Factors</p>
          {risk.factors.map((f, i) => (
            <div key={i} className={`bg-white rounded-2xl border p-3.5 flex items-start gap-3 ${
              f.impact === "positive" ? "border-emerald-100" :
              f.impact === "negative" ? "border-red-100" : "border-amber-100"
            }`}>
              {IMPACT_ICON[f.impact]}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                  <span className={`text-xs font-bold shrink-0 ${
                    f.impact === "positive" ? "text-emerald-600" :
                    f.impact === "negative" ? "text-red-600" : "text-amber-600"
                  }`}>{f.value}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{f.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {risk.level === "HIGH" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              <strong>High risk detected.</strong> Review the risk factors carefully. You can still approve, but document your reasoning in the approval notes.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderStep7() {
    const risk = riskResult;
    const cfg = risk ? RISK_CONFIG[risk.level] : RISK_CONFIG.LOW;
    const rows = [
      { label: "Customer Name",    value: custName },
      { label: "Requested Amount", value: fmt(reqAmount) },
      { label: "Approved Amount",  value: fmt(approvedAmt), accent: true },
      { label: "Loan Type",        value: loanType },
      { label: "Monthly EMI",      value: fmt(Math.round(liveEMI)), accent: true },
      { label: "Interest Rate",    value: `${rateNum}% p.a.` },
      { label: "Tenure",           value: `${tenureNum} months` },
      { label: "Processing Fee",   value: fmt(procFeeNum) },
      { label: "Net Disbursement", value: fmt(Math.round(netDisbursement)) },
      { label: "First EMI Date",   value: format(firstEmiDate, "dd MMM yyyy") },
      { label: "Collector",        value: collectorName },
      { label: "Risk Level",       value: risk ? `${risk.level === "LOW" ? "🟢" : risk.level === "MEDIUM" ? "🟡" : "🔴"} ${cfg.label}` : "—" },
    ];

    return (
      <div className="space-y-4">
        {/* Summary table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {rows.map((r, i) => (
            <div key={r.label} className={`flex items-center justify-between px-4 py-3 ${
              i < rows.length - 1 ? "border-b border-slate-100" : ""
            } ${r.accent ? "bg-emerald-50" : ""}`}>
              <span className="text-xs text-slate-500 font-medium">{r.label}</span>
              <span className={`text-sm font-bold ${r.accent ? "text-emerald-700" : "text-slate-800"}`}>
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {approvalNotes && (
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Approval Notes</p>
            <p className="text-xs text-slate-700 leading-relaxed">{approvalNotes}</p>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Confirm Approval</p>
            <p className="text-xs text-amber-700 mt-1">
              This action will create an active loan account, generate a complete EMI schedule, create ledger entries, assign the collector, and generate the loan number <strong>FC-LOAN-…</strong>. This cannot be undone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step renderers map ────────────────────────────────────────────────────
  const RENDERERS: Record<Step, () => React.ReactNode> = {
    1: renderStep1,
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
    5: renderStep5,
    6: renderStep6,
    7: renderStep7,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o && !processing) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden rounded-3xl">

        {/* ── Fixed Header ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">Loan Approval</h2>
              <p className="text-xs text-slate-400 mt-0.5">{custName}</p>
            </div>
            <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              riskResult ? `${RISK_CONFIG[riskResult.level].bg} ${RISK_CONFIG[riskResult.level].border} ${RISK_CONFIG[riskResult.level].color}` : "bg-slate-100 text-slate-400"
            }`}>
              {riskResult
                ? `${riskResult.level === "LOW" ? "🟢" : riskResult.level === "MEDIUM" ? "🟡" : "🔴"} ${RISK_CONFIG[riskResult.level].label}`
                : "Calculating…"
              }
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {(Object.keys(STEP_META) as unknown as Step[]).map((s) => {
              const n = Number(s) as Step;
              const meta = STEP_META[n];
              const Icon = meta.icon;
              const isActive = step === n;
              const isDone = n < step;
              const isVisited = visited.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => isVisited ? goTo(n) : undefined}
                  disabled={!isVisited}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all shrink-0 ${
                    isActive  ? "bg-slate-900 text-white" :
                    isDone    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" :
                    isVisited ? "bg-slate-100 text-slate-600 hover:bg-slate-200" :
                    "bg-slate-50 text-slate-300"
                  }`}
                >
                  {isDone
                    ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Icon className="w-3.5 h-3.5" />
                  }
                  <span className="text-[9px] font-bold leading-none">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {/* Step title */}
          <div className="flex items-center gap-2 mb-4">
            {(() => { const Icon = STEP_META[step].icon; return <Icon className="w-4 h-4 text-slate-500" />; })()}
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Step {step} of 7 — {STEP_META[step].label}
            </p>
          </div>
          {RENDERERS[step]()}
        </div>

        {/* ── Fixed Footer ── */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-white">
          {step < 7 ? (
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} className="gap-1.5 h-11" disabled={processing}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white gap-1.5 h-11"
              >
                {step === 6 ? "Review & Confirm" : "Next"}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Step 7 action row */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={processing || savingDraft}
                  className="h-11 gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={processing || savingDraft}
                  className="flex-1 h-11 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {savingDraft
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Save className="w-4 h-4" /> Save Draft</>
                  }
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={processing}
                  className="flex-1 h-11 border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                >
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={processing || savingDraft}
                  className="flex-[2] h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
                >
                  {processing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    : <><CheckCircle className="w-4 h-4" /> Approve Loan</>
                  }
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

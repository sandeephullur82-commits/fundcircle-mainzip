import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Loan, LoanApplication, LoanInstallment, Membership } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import EmptyState from "@/components/ui/EmptyState";
import FieldError from "@/components/ui/FieldError";
import SearchSelect from "@/components/ui/SearchSelect";
import { format } from "date-fns";
import {
  Search, Plus, Eye, Loader2, CreditCard, Inbox, Crown,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  FileText, Calendar, IndianRupee, Filter, BarChart2,
  RefreshCw, AlertTriangle, TrendingUp, MoreVertical,
} from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { createLoan, approveLoan, calculateEMI } from "@/lib/services";
import { sanitizeSearch, validateAmount, validateRate, validateTenure } from "@/lib/validation";
import {
  where, onSnapshot, query, collection, doc,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import LoanApprovalDialog from "./LoanApprovalDialog";
import LoanRejectDialog from "./LoanRejectDialog";
import LoanRequestDocsDialog from "./LoanRequestDocsDialog";
import LoanRepaymentScheduleDialog from "./LoanRepaymentScheduleDialog";
import LoanPortfolioAnalytics from "./LoanPortfolioAnalytics";

type Tab = "pending" | "active" | "rejected" | "closed" | "all";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function fmt(n: number) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

const TAB_CONFIG: Record<Tab, { label: string; icon: React.ElementType; color: string; activeClass: string }> = {
  pending: { label: "Pending",  icon: Clock,         color: "text-amber-600",  activeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  active:  { label: "Active",   icon: CheckCircle,   color: "text-emerald-600",activeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:{ label: "Rejected", icon: XCircle,       color: "text-red-500",    activeClass: "bg-red-50 text-red-700 border-red-200" },
  closed:  { label: "Closed",   icon: CreditCard,    color: "text-slate-500",  activeClass: "bg-slate-100 text-slate-600 border-slate-200" },
  all:     { label: "All",      icon: BarChart2,     color: "text-slate-500",  activeClass: "bg-slate-100 text-slate-700 border-slate-200" },
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:               "bg-emerald-50 text-emerald-700 border-emerald-100",
  PENDING:              "bg-amber-50 text-amber-700 border-amber-100",
  REJECTED:             "bg-red-50 text-red-700 border-red-100",
  CLOSED:               "bg-slate-100 text-slate-500 border-slate-200",
  APPROVED:             "bg-blue-50 text-blue-700 border-blue-100",
  DOCUMENTS_REQUESTED:  "bg-violet-50 text-violet-700 border-violet-100",
};

// ── Loan Application Card ────────────────────────────────────────────────────

interface AppCardProps {
  key?: React.Key;
  app: LoanApplication;
  customer?: Membership;
  onApprove: () => void;
  onReject: () => void;
  onRequestDocs: () => void;
  optimisticStatus?: string;
}

function ApplicationCard({ app, customer, onApprove, onReject, onRequestDocs, optimisticStatus }: AppCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = optimisticStatus || app.status;
  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
  const isPending = status === "PENDING" || status === "DOCUMENTS_REQUESTED";

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      isPending ? "border-amber-200 shadow-sm shadow-amber-50" : "border-slate-200"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <Inbox className="w-4 h-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{app.customerName || "Customer"}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmt(app.loanAmount)} · {app.tenureMonths}m
                {app.loanPurpose && ` · ${app.loanPurpose}`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Applied {toDate(app.createdAt) > new Date(1000)
                  ? format(toDate(app.createdAt), "dd MMM yyyy")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              {status === "DOCUMENTS_REQUESTED" ? "Docs Requested" : status}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                { label: "Amount",      value: fmt(app.loanAmount) },
                { label: "Tenure",      value: `${app.tenureMonths} months` },
                { label: "Purpose",     value: app.loanPurpose || "—" },
                { label: "Employment",  value: (app as any).employmentType || "—" },
                { label: "Income",      value: (app as any).monthlyIncome ? fmt((app as any).monthlyIncome) + "/mo" : "—" },
                { label: "App ID",      value: app.id.slice(-8).toUpperCase() },
              ].map((row) => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="font-medium text-slate-700 text-right ml-2">{row.value}</span>
                </div>
              ))}
            </div>

            {app.rejectionReason && (
              <div className="bg-red-50 rounded-xl p-2.5 border border-red-100 flex items-start gap-2">
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{app.rejectionReason}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {isPending && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onApprove}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            onClick={onRequestDocs}
            variant="outline"
            className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 gap-1.5 h-8 text-xs"
          >
            <FileText className="w-3.5 h-3.5" /> Request Docs
          </Button>
          <Button
            size="sm"
            onClick={onReject}
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5 h-8 text-xs"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Loan Card ────────────────────────────────────────────────────────────────

interface LoanCardProps {
  key?: React.Key;
  loan: Loan;
  customerName: string;
  collectorName?: string;
  isOwnerCollector?: boolean;
  onViewSchedule: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

function LoanCard({ loan, customerName, collectorName, isOwnerCollector, onViewSchedule, onApprove, onReject }: LoanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = (loan.status || "").toUpperCase();
  const badgeClass = STATUS_BADGE[status] || "bg-slate-100 text-slate-500 border-slate-200";
  const principal = loan.principalAmount ?? (loan as any).principal ?? 0;
  const emi = loan.emiAmount ?? 0;
  const tenure = loan.tenureMonths ?? (loan as any).durationMonths ?? 0;
  const outstanding = loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0;
  const progressPct = principal > 0 ? Math.min(100, Math.round(((principal - outstanding) / principal) * 100)) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              status === "ACTIVE" ? "bg-emerald-100" :
              status === "CLOSED" ? "bg-slate-100" :
              status === "REJECTED" ? "bg-red-100" : "bg-amber-100"
            }`}>
              <CreditCard className={`w-4 h-4 ${
                status === "ACTIVE" ? "text-emerald-600" :
                status === "CLOSED" ? "text-slate-500" :
                status === "REJECTED" ? "text-red-500" : "text-amber-600"
              }`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate">{customerName}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <span className="text-xs text-slate-700 font-medium">{fmt(principal)}</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">{fmt(emi)}/mo</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">{tenure}m</span>
              </div>
              {collectorName && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  {isOwnerCollector && <Crown className="w-3 h-3 text-amber-400" />}
                  {collectorName}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              {status}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Outstanding progress bar — only for ACTIVE loans */}
        {status === "ACTIVE" && outstanding > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Outstanding: <strong className="text-orange-600">{fmt(outstanding)}</strong></span>
              <span>{progressPct}% repaid</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                { label: "Principal",    value: fmt(principal) },
                { label: "EMI",          value: `${fmt(emi)}/month` },
                { label: "Interest Rate",value: `${loan.interestRate}% p.a.` },
                { label: "Outstanding",  value: outstanding > 0 ? fmt(outstanding) : "Fully Paid" },
                { label: "Account No.",  value: loan.loanAccountNumber || `ID: ${loan.id.slice(-8).toUpperCase()}` },
                { label: "Created",      value: toDate(loan.createdAt) > new Date(1000) ? format(toDate(loan.createdAt), "dd MMM yyyy") : "—" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="font-medium text-slate-700 text-right ml-2">{row.value}</span>
                </div>
              ))}
            </div>

            {loan.rejectionReason && (
              <div className="bg-red-50 rounded-xl p-2.5 border border-red-100 flex items-start gap-2">
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{loan.rejectionReason}</p>
              </div>
            )}

            {loan.approvalNotes && (
              <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                <p className="text-xs text-blue-700">{loan.approvalNotes}</p>
              </div>
            )}

            <button
              type="button"
              onClick={onViewSchedule}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" /> View Repayment Schedule
            </button>
          </div>
        )}
      </div>

      {/* Actions for PENDING loans (owner-created awaiting approval) */}
      {status === "PENDING" && onApprove && onReject && (
        <div className="px-4 pb-4 flex gap-2">
          <Button size="sm" onClick={onApprove} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs">
            <CheckCircle className="w-3.5 h-3.5" /> Approve
          </Button>
          <Button size="sm" onClick={onReject} variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5 h-8 text-xs">
            <XCircle className="w-3.5 h-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrgLoans() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = organization?.id || "";

  const { data: loans, loading: loansLoading } = useCollectionRealtime<Loan>("loans");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loanApplications, loading: appsLoading } = useCollectionRealtime<LoanApplication>("loanApplications");

  const [activeTab, setActiveTab]   = useState<Tab>("pending");
  const [search, setSearch]         = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Modal state
  const [approveApp, setApproveApp]           = useState<LoanApplication | null>(null);
  const [approveLoanItem, setApproveLoanItem]  = useState<Loan | null>(null);
  const [rejectTarget, setRejectTarget]        = useState<{ item: LoanApplication | Loan; type: "application" | "loan" } | null>(null);
  const [requestDocsApp, setRequestDocsApp]    = useState<LoanApplication | null>(null);
  const [scheduleTarget, setScheduleTarget]    = useState<{ loan: Loan; name: string } | null>(null);

  // Optimistic UI — track in-flight status changes
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});

  // Create form state
  const [customerId, setCustomerId]           = useState("");
  const [principal, setPrincipal]             = useState("");
  const [interestRate, setInterestRate]       = useState("12");
  const [tenureMonths, setTenureMonths]       = useState("12");
  const [createCollectorId, setCreateCollectorId] = useState("");
  const [creating, setCreating]               = useState(false);
  const [loanErrors, setLoanErrors]           = useState<Record<string, string>>({});

  const actorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner";

  // Member groupings
  const customers = useMemo(() =>
    members.filter((m) => ["CUSTOMER", "customer"].includes(m.role as string) && (m as any).status !== "DEACTIVATED"),
    [members]
  );
  const activeOwners = useMemo(() =>
    members.filter((m) => ["OWNER", "owner"].includes(m.role as string)),
    [members]
  );
  const activeAgents = useMemo(() =>
    members.filter((m) => ["AGENT", "agent"].includes(m.role as string) && ["ACTIVE", "active"].includes((m as any).status || "ACTIVE")),
    [members]
  );
  const collectorsForAssignment = useMemo(() => [...activeOwners, ...activeAgents], [activeOwners, activeAgents]);

  // Customer & collector options
  const customerOptions = useMemo(() =>
    customers.map((c) => ({
      value: c.id,
      label: (c as any).fullName || (c as any).name || c.email || c.id,
      sublabel: `${c.phone || ""} · ID: ${c.id.slice(-6).toUpperCase()}`,
    })),
    [customers]
  );

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";
  const collectorOptions = useMemo(() =>
    collectorsForAssignment.map((c) => ({
      value: c.id,
      label: isOwnerMember(c) ? `${(c as any).fullName || (c as any).name || c.email} (Owner)` : ((c as any).fullName || (c as any).name || c.email),
      sublabel: c.email || "",
      badge: isOwnerMember(c) ? "Owner" : undefined,
    })),
    [collectorsForAssignment]
  );

  // Auto-set collector
  useEffect(() => {
    if (!customerId) { setCreateCollectorId(""); return; }
    const cust = customers.find((c) => c.id === customerId);
    if (cust && (cust as any).assignedAgentId) {
      const found = collectorsForAssignment.find(
        (c) => c.id === (cust as any).assignedAgentId || (c as any).clerkUserId === (cust as any).assignedAgentId
      );
      if (found) { setCreateCollectorId(found.id); return; }
    }
    if (collectorsForAssignment.length === 1) setCreateCollectorId(collectorsForAssignment[0].id);
    else setCreateCollectorId("");
  }, [customerId, customers, collectorsForAssignment]);

  // Search + tab filtering
  const searchLower = search.toLowerCase();

  const filteredApps = useMemo(() => {
    const baseApps = loanApplications.filter((a) => {
      if (activeTab === "pending") return a.status === "PENDING" || a.status === "DOCUMENTS_REQUESTED";
      if (activeTab === "rejected") return a.status === "REJECTED";
      if (activeTab === "all") return true;
      return false;
    });
    if (!searchLower) return baseApps.sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
    return baseApps
      .filter((a) => (a.customerName || "").toLowerCase().includes(searchLower))
      .sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
  }, [loanApplications, activeTab, searchLower]);

  const filteredLoans = useMemo(() => {
    const baseLoans = loans.filter((l) => {
      const st = (l.status || "").toUpperCase();
      if (activeTab === "active")   return st === "ACTIVE";
      if (activeTab === "closed")   return st === "CLOSED";
      if (activeTab === "rejected") return st === "REJECTED";
      if (activeTab === "all")      return true;
      return false;
    });
    if (!searchLower) return baseLoans.sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
    return baseLoans.filter((l) => {
      const cust = members.find((m) => m.id === l.customerId || m.clerkUserId === l.customerId);
      const name = ((cust as any)?.fullName || (cust as any)?.name || "").toLowerCase();
      return name.includes(searchLower) || (l.loanAccountNumber || "").toLowerCase().includes(searchLower);
    }).sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
  }, [loans, activeTab, searchLower, members]);

  // Tab counts
  const counts = useMemo(() => ({
    pending:  loanApplications.filter((a) => a.status === "PENDING" || a.status === "DOCUMENTS_REQUESTED").length,
    active:   loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE").length,
    rejected: loanApplications.filter((a) => a.status === "REJECTED").length + loans.filter((l) => (l.status || "").toUpperCase() === "REJECTED").length,
    closed:   loans.filter((l) => (l.status || "").toUpperCase() === "CLOSED").length,
    all:      loans.length + loanApplications.length,
  }), [loans, loanApplications]);

  // EMI preview
  const principalNum = parseFloat(principal) || 0;
  const rateNum      = parseFloat(interestRate) || 0;
  const tenureNum    = parseInt(tenureMonths) || 0;
  const previewEMI   = principalNum > 0 && rateNum >= 0 && tenureNum > 0
    ? calculateEMI(principalNum, rateNum, tenureNum) : null;

  const resetCreate = () => {
    setPrincipal(""); setCustomerId(""); setInterestRate("12"); setTenureMonths("12");
    setCreateCollectorId(""); setLoanErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !user?.id) return;
    const errors: Record<string, string> = {};
    if (!customerId) errors.customerId = "Please select a customer";
    const amtRes = validateAmount(principal, { label: "Principal amount", min: 1000, max: 10_000_000 });
    if (!amtRes.valid) errors.principal = amtRes.error!;
    const rateRes = validateRate(interestRate, { label: "Interest rate", max: 100 });
    if (!rateRes.valid) errors.interestRate = rateRes.error!;
    const tenRes = validateTenure(tenureMonths);
    if (!tenRes.valid) errors.tenureMonths = tenRes.error!;
    if (!errors.tenureMonths && tenureNum > 120) errors.tenureMonths = "Tenure cannot exceed 120 months";
    if (!createCollectorId && collectorsForAssignment.length > 1) errors.collector = "Please select a collector";
    if (Object.values(errors).some(Boolean)) { setLoanErrors(errors); fcToast.formError(); return; }
    setLoanErrors({});

    const collector = collectorsForAssignment.find((c) => c.id === createCollectorId);
    setCreating(true);
    try {
      const loanId = await createLoan({
        organizationId: orgId,
        customerId,
        principalAmount: principalNum,
        interestRate: rateNum,
        tenureMonths: tenureNum,
        createdByActorId: user.id,
        createdByActorRole: "OWNER",
        createdByActorName: actorName,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? ((collector as any).fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      const firstEmi = new Date(); firstEmi.setMonth(firstEmi.getMonth() + 1);
      await approveLoan({
        loanId, actorId: user.id, actorRole: "OWNER", actorName,
        approvedAmount: principalNum, disbursementDate: new Date(), firstEmiDate: firstEmi,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? ((collector as any).fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      // Notify
      try {
        await addDoc(collection(db, "notifications"), {
          userId: customerId,
          organizationId: orgId,
          type: "LOAN_CREATED",
          title: "Loan Created",
          message: `A loan of ${fmt(principalNum)} has been created for you.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (_) {}
      const custName = customers.find((c) => c.id === customerId);
      fcToast.loanCreated((custName as any)?.fullName || (custName as any)?.name);
      setShowCreate(false); resetCreate(); setActiveTab("active");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create loan");
    } finally {
      setCreating(false);
    }
  };

  const getCustomerName = (loan: Loan) => {
    const cust = members.find((m) => m.id === loan.customerId || m.clerkUserId === loan.customerId);
    return (cust as any)?.fullName || (cust as any)?.name || loan.customerId?.slice(-8) || "—";
  };

  const isLoading = loansLoading || appsLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Loan Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage applications, approvals, and active loans.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnalytics((v) => !v)}
            className="gap-1.5 h-9"
          >
            <BarChart2 className="w-4 h-4" />
            <span className="hidden sm:inline">Analytics</span>
          </Button>
          <Button
            onClick={() => { resetCreate(); setShowCreate(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-9 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Loan</span>
          </Button>
        </div>
      </div>

      {/* ── Analytics Panel ── */}
      {showAnalytics && (
        <LoanPortfolioAnalytics loans={loans} applications={loanApplications} />
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {(Object.keys(TAB_CONFIG) as Tab[]).map((tab) => {
          const cfg = TAB_CONFIG[tab];
          const Icon = cfg.icon;
          const count = counts[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-all shrink-0 ${
                isActive ? cfg.activeClass : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "" : cfg.color}`} />
              {cfg.label}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-white/60 text-current"
                    : tab === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(sanitizeSearch(e.target.value))}
          placeholder="Search by customer name or loan ID…"
          maxLength={100}
          className="pl-9 h-10 rounded-xl"
        />
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">

          {/* Applications (Pending / Rejected tabs) */}
          {(activeTab === "pending" || activeTab === "rejected" || activeTab === "all") &&
            filteredApps.map((app) => {
              const cust = members.find((m) => m.id === app.customerId || m.clerkUserId === app.customerId);
              return (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  customer={cust}
                  optimisticStatus={optimisticStatuses[app.id]}
                  onApprove={() => setApproveApp(app)}
                  onReject={() => setRejectTarget({ item: app, type: "application" })}
                  onRequestDocs={() => setRequestDocsApp(app)}
                />
              );
            })
          }

          {/* Loans (Active / Closed / Rejected / All tabs) */}
          {(activeTab === "active" || activeTab === "closed" || activeTab === "all" ||
            (activeTab === "rejected" && filteredLoans.length > 0)) &&
            filteredLoans.map((loan) => {
              const name = getCustomerName(loan);
              const isOwnerColl = (loan.loanAssignedCollectorRole || "").toUpperCase() === "OWNER";
              const loanStatus = (loan.status || "").toUpperCase();
              return (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  customerName={name}
                  collectorName={loan.loanAssignedCollectorName || undefined}
                  isOwnerCollector={isOwnerColl}
                  onViewSchedule={() => setScheduleTarget({ loan, name })}
                  onApprove={loanStatus === "PENDING" ? () => setApproveLoanItem(loan) : undefined}
                  onReject={loanStatus === "PENDING" ? () => setRejectTarget({ item: loan, type: "loan" }) : undefined}
                />
              );
            })
          }

          {/* Empty state */}
          {filteredApps.length === 0 && filteredLoans.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                {activeTab === "pending" ? <Inbox className="w-7 h-7 text-amber-400" /> :
                 activeTab === "active"  ? <CheckCircle className="w-7 h-7 text-emerald-400" /> :
                 activeTab === "closed"  ? <CreditCard className="w-7 h-7 text-slate-400" /> :
                 activeTab === "rejected"? <XCircle className="w-7 h-7 text-red-400" /> :
                 <BarChart2 className="w-7 h-7 text-slate-400" />}
              </div>
              <p className="font-semibold text-slate-700">
                {search ? "No results found" :
                 activeTab === "pending"  ? "No pending applications" :
                 activeTab === "active"   ? "No active loans" :
                 activeTab === "closed"   ? "No closed loans yet" :
                 activeTab === "rejected" ? "No rejected applications" :
                 "No loans yet"}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {search ? `No loans matching "${search}"` :
                 activeTab === "pending" ? "New loan applications from customers will appear here." :
                 activeTab === "active"  ? "Approved loans will appear here." :
                 "Loan records will appear here once created."}
              </p>
              {activeTab !== "pending" && !search && (
                <Button
                  onClick={() => { resetCreate(); setShowCreate(true); }}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 gap-2"
                  size="sm"
                >
                  <Plus className="w-4 h-4" /> Create New Loan
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Create Loan Dialog ── */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && (resetCreate(), setShowCreate(false))}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Plus className="w-5 h-5" /> Create New Loan
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">
                Customer <span className="text-red-500">*</span>
              </Label>
              <SearchSelect
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer…"
              />
              <FieldError error={loanErrors.customerId} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">
                  Principal <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <Input
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="pl-7"
                    inputMode="decimal"
                    placeholder="Amount"
                  />
                </div>
                <FieldError error={loanErrors.principal} />
              </div>
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
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                </div>
                <FieldError error={loanErrors.interestRate} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">
                Tenure (months) <span className="text-red-500">*</span>
              </Label>
              <Input
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="12"
              />
              <FieldError error={loanErrors.tenureMonths} />
            </div>

            {/* EMI preview */}
            {previewEMI && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                <div>
                  <p className="text-base font-black text-emerald-700">{fmt(Math.round(previewEMI))}</p>
                  <p className="text-[10px] text-slate-400">Monthly EMI</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">{fmt(Math.round(previewEMI * tenureNum))}</p>
                  <p className="text-[10px] text-slate-400">Total Repayment</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-600">{fmt(Math.round(previewEMI * tenureNum - principalNum))}</p>
                  <p className="text-[10px] text-slate-400">Total Interest</p>
                </div>
              </div>
            )}

            {collectorsForAssignment.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Assign Collector</Label>
                <SearchSelect
                  options={collectorOptions}
                  value={createCollectorId}
                  onChange={setCreateCollectorId}
                  placeholder="Select collector…"
                  clearable
                />
                <FieldError error={loanErrors.collector} />
              </div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Owner-created loans are approved and disbursed immediately. EMI schedule will be generated automatically.
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { resetCreate(); setShowCreate(false); }} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={creating}>
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Plus className="w-4 h-4" /> Create & Activate</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Approval Dialog (Application) ── */}
      <LoanApprovalDialog
        loan={null}
        application={approveApp}
        members={members}
        collectors={collectorsForAssignment}
        actorId={user?.id || ""}
        actorName={actorName}
        organizationId={orgId}
        organizationName={organization?.name || ""}
        onClose={() => setApproveApp(null)}
      />

      {/* ── Approval Dialog (Loan) ── */}
      <LoanApprovalDialog
        loan={approveLoanItem}
        application={null}
        members={members}
        collectors={collectorsForAssignment}
        actorId={user?.id || ""}
        actorName={actorName}
        organizationId={orgId}
        organizationName={organization?.name || ""}
        onClose={() => setApproveLoanItem(null)}
      />

      {/* ── Reject Dialog ── */}
      <LoanRejectDialog
        open={!!rejectTarget}
        target={rejectTarget?.item ?? null}
        targetType={rejectTarget?.type ?? "application"}
        actorId={user?.id || ""}
        actorName={actorName}
        onClose={() => setRejectTarget(null)}
        onSuccess={() => {
          if (rejectTarget) {
            setOptimisticStatuses((p) => ({ ...p, [rejectTarget.item.id]: "REJECTED" }));
            setTimeout(() => {
              setOptimisticStatuses((p) => {
                const next = { ...p };
                delete next[rejectTarget.item.id];
                return next;
              });
            }, 5000);
          }
        }}
      />

      {/* ── Request Docs Dialog ── */}
      <LoanRequestDocsDialog
        open={!!requestDocsApp}
        application={requestDocsApp}
        actorId={user?.id || ""}
        actorName={actorName}
        onClose={() => setRequestDocsApp(null)}
        onSuccess={() => {
          if (requestDocsApp) {
            setOptimisticStatuses((p) => ({ ...p, [requestDocsApp.id]: "DOCUMENTS_REQUESTED" }));
          }
        }}
      />

      {/* ── Repayment Schedule ── */}
      <LoanRepaymentScheduleDialog
        open={!!scheduleTarget}
        loan={scheduleTarget?.loan ?? null}
        customerName={scheduleTarget?.name}
        onClose={() => setScheduleTarget(null)}
      />
    </div>
  );
}

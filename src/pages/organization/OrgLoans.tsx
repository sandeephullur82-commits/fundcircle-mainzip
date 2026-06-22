import React, { useState, useEffect, useMemo } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Loan, LoanApplication, LoanInstallment, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import FieldError from "@/components/ui/FieldError";
import SearchSelect from "@/components/ui/SearchSelect";
import { format, isBefore, startOfDay } from "date-fns";
import {
  Search, Plus, Eye, Loader2, CreditCard, Inbox,
  Crown, AlertTriangle, CheckCircle, XCircle, IndianRupee,
} from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { createLoan, approveLoan, rejectLoan, calculateEMI } from "@/lib/services";
import { sanitizeSearch, validateAmount, validateRate, validateTenure } from "@/lib/validation";
import { where, onSnapshot, query, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type LoanStatus = "ALL" | "ACTIVE" | "CLOSED" | "REJECTED";
type View = "loans" | "applications";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   "bg-emerald-50 text-emerald-700 border-emerald-100",
  active:   "bg-emerald-50 text-emerald-700 border-emerald-100",
  CLOSED:   "bg-slate-100 text-slate-500 border-slate-200",
  closed:   "bg-slate-100 text-slate-500 border-slate-200",
  REJECTED: "bg-red-50 text-red-700 border-red-100",
  rejected: "bg-red-50 text-red-700 border-red-100",
  PENDING:  "bg-amber-50 text-amber-700 border-amber-100",
  pending:  "bg-amber-50 text-amber-700 border-amber-100",
};

export default function OrgLoans() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = organization?.id || "";

  const { data: loans, loading } = useCollectionRealtime<Loan>("loans");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loanApplications, loading: appsLoading } = useCollectionRealtime<LoanApplication>("loanApplications");

  const [activeView, setActiveView] = useState<View>("loans");
  const [statusFilter, setStatusFilter] = useState<LoanStatus>("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewLoan, setViewLoan] = useState<Loan | null>(null);
  const [scheduleInstallments, setScheduleInstallments] = useState<LoanInstallment[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Create form
  const [customerId, setCustomerId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("12");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [createCollectorId, setCreateCollectorId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loanErrors, setLoanErrors] = useState<Record<string, string>>({});

  // Approve application dialog (simplified)
  const [approveApp, setApproveApp] = useState<LoanApplication | null>(null);
  const [appCollectorId, setAppCollectorId] = useState("");
  const [approvingApp, setApprovingApp] = useState(false);

  // Reject
  const [rejectAppId, setRejectAppId] = useState<string | null>(null);
  const [appRejectReason, setAppRejectReason] = useState("");
  const [rejectingApp, setRejectingApp] = useState(false);

  const customers = useMemo(() =>
    members.filter((m) => ["CUSTOMER", "customer"].includes(m.role as string) && (m as any).status === "ACTIVE"),
    [members]
  );
  const activeOwners = useMemo(() =>
    members.filter((m) => ["OWNER", "owner"].includes(m.role as string) && ["ACTIVE", "active"].includes((m as any).status || "ACTIVE")),
    [members]
  );
  const activeAgents = useMemo(() =>
    members.filter((m) => ["AGENT", "agent"].includes(m.role as string) && ["ACTIVE", "active"].includes((m as any).status || "ACTIVE")),
    [members]
  );
  const collectorsForAssignment = useMemo(() => [...activeOwners, ...activeAgents], [activeOwners, activeAgents]);

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";
  const actorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner";

  const collectorLabel = (c: any) => {
    const name = c.fullName || c.name || c.email || c.id;
    return isOwnerMember(c) ? `${name} (Owner)` : name;
  };

  // Customer options for SearchSelect
  const customerOptions = useMemo(() =>
    customers.map((c) => ({
      value: c.id,
      label: c.fullName || (c as any).name || c.email || c.id,
      sublabel: `${c.phone || ""} · ID: ${c.id.slice(-6).toUpperCase()}`,
    })),
    [customers]
  );

  // Collector options for SearchSelect
  const collectorOptions = useMemo(() =>
    collectorsForAssignment.map((c) => ({
      value: c.id,
      label: collectorLabel(c),
      sublabel: c.email || "",
      badge: isOwnerMember(c) ? "Owner" : undefined,
    })),
    [collectorsForAssignment]
  );

  // Auto-set collector when customer changes
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

  // Auto-set collector for application approval
  useEffect(() => {
    if (!approveApp) { setAppCollectorId(""); return; }
    const cust = members.find((m) => m.id === approveApp.customerId || m.clerkUserId === approveApp.customerId);
    if (cust && (cust as any).assignedAgentId) {
      const found = collectorsForAssignment.find(
        (c) => c.id === (cust as any).assignedAgentId || (c as any).clerkUserId === (cust as any).assignedAgentId
      );
      if (found) { setAppCollectorId(found.id); return; }
    }
    if (collectorsForAssignment.length === 1) setAppCollectorId(collectorsForAssignment[0].id);
  }, [approveApp?.id, collectorsForAssignment]);

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      const st = (l.status || "").toUpperCase();
      if (statusFilter !== "ALL" && st !== statusFilter) return false;
      const cust = members.find((m) => m.id === l.customerId || m.clerkUserId === l.customerId);
      const custName = (cust as any)?.fullName || (cust as any)?.name || "";
      return !search || custName.toLowerCase().includes(search.toLowerCase());
    }).sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());
  }, [loans, statusFilter, search, members]);

  const pendingApps = useMemo(() => loanApplications.filter((a) => a.status === "PENDING"), [loanApplications]);
  const sortedApps = useMemo(() =>
    [...loanApplications].sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf()),
    [loanApplications]
  );

  // Real-time EMI preview
  const principalNum = parseFloat(principal) || 0;
  const rateNum = parseFloat(interestRate) || 0;
  const tenureNum = parseInt(tenureMonths) || 0;
  const previewEMI = principalNum > 0 && rateNum >= 0 && tenureNum > 0
    ? calculateEMI(principalNum, rateNum, tenureNum)
    : null;
  const previewTotal = previewEMI ? previewEMI * tenureNum : 0;
  const previewInterest = previewEMI ? previewTotal - principalNum : 0;

  const loanStats = useMemo(() => ({
    total:  loans.length,
    active: loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE").length,
    closed: loans.filter((l) => (l.status || "").toUpperCase() === "CLOSED").length,
    pending: loans.filter((l) => (l.status || "").toUpperCase() === "PENDING").length,
  }), [loans]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

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
    const tenureN = parseInt(tenureMonths);
    if (!errors.tenureMonths && tenureN > 120) errors.tenureMonths = "Tenure cannot exceed 120 months";
    if (!createCollectorId && collectorsForAssignment.length > 1) errors.collector = "Please select a collector";

    if (Object.values(errors).some(Boolean)) { setLoanErrors(errors); fcToast.formError(); return; }
    setLoanErrors({});

    const collector = collectorsForAssignment.find((c) => c.id === createCollectorId);
    setCreating(true);
    try {
      // Step 1: Create loan (PENDING)
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
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });

      // Step 2: Auto-activate immediately (no approval step)
      const firstEmi = new Date();
      firstEmi.setMonth(firstEmi.getMonth() + 1);
      await approveLoan({
        loanId,
        actorId: user.id,
        actorRole: "OWNER",
        actorName,
        approvedAmount: principalNum,
        disbursementDate: new Date(),
        firstEmiDate: firstEmi,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });

      const custName = customers.find((c) => c.id === customerId);
      fcToast.loanCreated((custName as any)?.fullName || (custName as any)?.name);
      setShowCreate(false);
      setPrincipal(""); setCustomerId(""); setInterestRate("12"); setTenureMonths("12"); setCreateCollectorId("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create loan");
    } finally {
      setCreating(false);
    }
  };

  const handleApproveApplication = async () => {
    if (!approveApp || !user?.id) return;
    const collector = collectorsForAssignment.find((c) => c.id === appCollectorId);
    setApprovingApp(true);
    try {
      const firstEmi = new Date();
      firstEmi.setMonth(firstEmi.getMonth() + 1);
      const loanId = await createLoan({
        organizationId: approveApp.organizationId,
        customerId: approveApp.customerId,
        principalAmount: approveApp.loanAmount,
        interestRate: (approveApp as any).interestRate ?? 12,
        tenureMonths: approveApp.tenureMonths,
        createdByActorId: user.id,
        createdByActorRole: "OWNER",
        createdByActorName: actorName,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      await approveLoan({
        loanId,
        actorId: user.id,
        actorRole: "OWNER",
        actorName,
        approvedAmount: approveApp.loanAmount,
        disbursementDate: new Date(),
        firstEmiDate: firstEmi,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      await updateDoc(doc(db, "loanApplications", approveApp.id), {
        status: "APPROVED", loanId,
        reviewedByActorId: user.id, reviewedByActorName: actorName,
        reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      fcToast.loanApproved(approveApp.customerName || "", approveApp.loanAmount, "");
      setApproveApp(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve application");
    } finally {
      setApprovingApp(false);
    }
  };

  const handleRejectApplication = async () => {
    if (!rejectAppId || !user?.id) return;
    setRejectingApp(true);
    try {
      await updateDoc(doc(db, "loanApplications", rejectAppId), {
        status: "REJECTED", rejectionReason: appRejectReason,
        reviewedByActorId: user.id, reviewedByActorName: actorName,
        reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      const app = sortedApps.find((a) => a.id === rejectAppId);
      fcToast.loanRejected(app?.customerName);
      setRejectAppId(null); setAppRejectReason("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject application");
    } finally {
      setRejectingApp(false);
    }
  };

  // EMI schedule real-time listener
  useEffect(() => {
    if (!viewLoan?.id) { setScheduleInstallments([]); setScheduleLoading(false); return; }
    setScheduleLoading(true);
    const q = query(collection(db, "loan_installments"), where("loanId", "==", viewLoan.id));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LoanInstallment))
        .sort((a, b) => a.installmentNo - b.installmentNo);
      setScheduleInstallments(items);
      setScheduleLoading(false);
    }, (err) => {
      console.error("[OrgLoans] installments listener error:", err);
      toast.error("Failed to load EMI schedule");
      setScheduleLoading(false);
    });
    return () => unsub();
  }, [viewLoan?.id]);

  const today = startOfDay(new Date());

  const resetCreate = () => {
    setPrincipal(""); setCustomerId(""); setInterestRate("12"); setTenureMonths("12"); setCreateCollectorId("");
    setLoanErrors({});
  };

  if (loading && appsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-36 bg-slate-200 rounded-lg" />
            <div className="h-4 w-52 bg-slate-100 rounded" />
          </div>
          <div className="h-9 w-28 bg-slate-200 rounded-xl" />
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-8 w-24 bg-slate-200 rounded-full" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-2xl" />)}
        </div>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Loan Management</h2>
          <p className="text-slate-500 text-sm">Create and track loans. All loans are activated immediately upon creation.</p>
        </div>
        <Button onClick={() => { resetCreate(); setShowCreate(true); }} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Loan
        </Button>
      </div>

      {/* ── View switcher ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveView("loans")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeView === "loans" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          <CreditCard className="w-4 h-4" /> Loan Accounts
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeView === "loans" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
            {loans.length}
          </span>
        </button>
        <button
          onClick={() => setActiveView("applications")}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeView === "applications" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          <Inbox className="w-4 h-4" /> Applications
          {pendingApps.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-amber-500 text-white">
              {pendingApps.length}
            </span>
          )}
        </button>
      </div>

      {/* ══ LOANS VIEW ══ */}
      {activeView === "loans" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", val: loanStats.total, color: "bg-slate-50", textColor: "text-slate-900" },
              { label: "Active", val: loanStats.active, color: "bg-emerald-50", textColor: "text-emerald-700" },
              { label: "Closed", val: loanStats.closed, color: "bg-slate-100", textColor: "text-slate-600" },
              { label: "Pending", val: loanStats.pending, color: "bg-amber-50", textColor: "text-amber-700" },
            ].map((s) => (
              <Card key={s.label} className={`${s.color} border-slate-200`}>
                <CardContent className="p-4">
                  <p className={`text-2xl font-black ${s.textColor}`}>{s.val}</p>
                  <p className="text-xs text-slate-500">{s.label} loans</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(sanitizeSearch(e.target.value))}
                placeholder="Search by customer name…"
                maxLength={100}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["ALL", "ACTIVE", "CLOSED", "REJECTED"] as LoanStatus[]).map((s) => (
                <button
                  key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Loans table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : filteredLoans.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No loans found. Click "New Loan" to create one.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Customer</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>EMI / Month</TableHead>
                        <TableHead>Tenure</TableHead>
                        <TableHead>Outstanding</TableHead>
                        <TableHead>Collector</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLoans.map((loan) => {
                        const cust = members.find((m) => m.id === loan.customerId || m.clerkUserId === loan.customerId);
                        const custName = (cust as any)?.fullName || (cust as any)?.name || loan.customerId?.slice(-8) || "—";
                        const st = (loan.status || "").toUpperCase();
                        const loanPrincipal = loan.principalAmount ?? (loan as any).principal ?? 0;
                        const tenure = loan.tenureMonths ?? (loan as any).durationMonths ?? 0;
                        const emi = loan.emiAmount ?? 0;
                        const outstanding = loan.outstandingBalance ?? (loan as any).balanceRemaining ?? 0;
                        const collectorName = loan.loanAssignedCollectorName || "";
                        return (
                          <TableRow key={loan.id} className="hover:bg-slate-50/50">
                            <TableCell className="font-semibold">{custName}</TableCell>
                            <TableCell>₹{Number(loanPrincipal).toLocaleString()}</TableCell>
                            <TableCell>₹{Number(emi).toLocaleString()}</TableCell>
                            <TableCell>{tenure}m</TableCell>
                            <TableCell className={outstanding > 0 ? "font-semibold text-orange-600" : "text-slate-400"}>
                              {outstanding > 0 ? `₹${Number(outstanding).toLocaleString()}` : "—"}
                            </TableCell>
                            <TableCell>
                              {collectorName ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700 font-medium">
                                  {loan.loanAssignedCollectorRole === "OWNER" && <Crown className="w-3 h-3 text-amber-500" />}
                                  {collectorName}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[loan.status as string] || "bg-slate-50 text-slate-600 border-slate-100"}`}>
                                {st}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-500 text-sm">
                              {toDate(loan.createdAt).getTime() > 0 ? format(toDate(loan.createdAt), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {(st === "ACTIVE" || st === "CLOSED") && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setViewLoan(loan)}>
                                  <Eye className="w-3 h-3" /> Schedule
                                </Button>
                              )}
                              {st === "REJECTED" && loan.rejectionReason && (
                                <span className="text-xs text-red-500 italic truncate max-w-[100px] block">{loan.rejectionReason}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ══ APPLICATIONS VIEW ══ */}
      {activeView === "applications" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Customer Loan Applications</CardTitle>
            <p className="text-xs text-slate-500">Review requests submitted by customers. Approve to create and activate the loan instantly.</p>
          </CardHeader>
          <CardContent className="p-0">
            {appsLoading ? (
              <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : sortedApps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No loan applications yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Tenure</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Income / Month</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedApps.map((app) => {
                      const st = app.status;
                      return (
                        <TableRow key={app.id} className={`hover:bg-slate-50/50 ${st === "PENDING" ? "bg-amber-50/30" : ""}`}>
                          <TableCell>
                            <p className="font-semibold text-slate-900">{app.customerName || "—"}</p>
                            <p className="text-xs text-slate-400 truncate max-w-[140px]">{app.customerEmail}</p>
                          </TableCell>
                          <TableCell className="font-bold text-slate-900">₹{Number(app.loanAmount || 0).toLocaleString()}</TableCell>
                          <TableCell>{app.tenureMonths}m</TableCell>
                          <TableCell className="text-slate-600 text-sm max-w-[120px] truncate">{app.loanPurpose}</TableCell>
                          <TableCell>₹{Number(app.monthlyIncome || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              st === "PENDING"  ? "bg-amber-50 text-amber-700 border-amber-100"
                              : st === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-red-50 text-red-700 border-red-100"
                            }`}>{st}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {st === "PENDING" && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs gap-1" onClick={() => setApproveApp(app)}>
                                  <CheckCircle className="w-3 h-3" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-7 px-2 text-xs gap-1"
                                  onClick={() => { setRejectAppId(app.id); setAppRejectReason(""); }}>
                                  <XCircle className="w-3 h-3" /> Reject
                                </Button>
                              </div>
                            )}
                            {st === "APPROVED" && <span className="text-xs text-emerald-600 font-medium">Loan active ✓</span>}
                            {st === "REJECTED" && app.rejectionReason && (
                              <span className="text-xs text-red-500 italic max-w-[100px] block truncate">{app.rejectionReason}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Create Loan Dialog ── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { resetCreate(); } setShowCreate(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-emerald-600" /> New Loan
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">Loan will be activated immediately upon creation.</p>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            {/* Customer */}
            <div className="space-y-1.5">
              <Label>Customer <span className="text-red-500">*</span></Label>
              {customers.length === 0 ? (
                <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">
                  No active customers found
                </div>
              ) : (
                <SearchSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={(v) => { setCustomerId(v); setLoanErrors((p) => ({ ...p, customerId: "" })); }}
                  placeholder="Select a customer…"
                  searchPlaceholder="Search by name, phone or ID…"
                  emptyText="No customers found"
                  error={!!loanErrors.customerId}
                />
              )}
              <FieldError error={loanErrors.customerId} />
            </div>

            {/* Principal + Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Principal Amount (₹) <span className="text-red-500">*</span></Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 50000"
                  value={principal}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setPrincipal(v);
                    setLoanErrors((p) => ({ ...p, principal: "" }));
                  }}
                  className={loanErrors.principal ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                <FieldError error={loanErrors.principal} />
              </div>
              <div className="space-y-1.5">
                <Label>Interest Rate (% p.a.)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="12"
                  value={interestRate}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setInterestRate(v);
                    setLoanErrors((p) => ({ ...p, interestRate: "" }));
                  }}
                  className={loanErrors.interestRate ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                <FieldError error={loanErrors.interestRate} />
              </div>
            </div>

            {/* Tenure */}
            <div className="space-y-1.5">
              <Label>Tenure (months) — max 120</Label>
              <Input
                inputMode="numeric"
                placeholder="12"
                value={tenureMonths}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setTenureMonths(v);
                  setLoanErrors((p) => ({ ...p, tenureMonths: "" }));
                }}
                className={loanErrors.tenureMonths ? "border-red-400 focus-visible:ring-red-300" : ""}
              />
              <FieldError error={loanErrors.tenureMonths} />
            </div>

            {/* Real-time EMI preview */}
            {previewEMI !== null && previewEMI > 0 && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Loan Summary</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-emerald-600">Monthly EMI</p>
                    <p className="text-lg font-black text-emerald-800">₹{previewEMI.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Total Interest</p>
                    <p className="text-lg font-black text-amber-700">₹{previewInterest.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Total Repayment</p>
                    <p className="text-lg font-black text-slate-800">₹{previewTotal.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Collector */}
            <div className="space-y-1.5">
              <Label>Assigned Collector</Label>
              {collectorsForAssignment.length === 0 ? (
                <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">
                  No active collectors available
                </div>
              ) : collectorsForAssignment.length === 1 ? (
                <div className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-3 flex items-center gap-2 text-sm text-emerald-800 font-medium">
                  {isOwnerMember(collectorsForAssignment[0]) && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <span className="flex-1 truncate">{collectorLabel(collectorsForAssignment[0])}</span>
                  <span className="text-xs text-emerald-600 font-normal shrink-0">Auto-assigned</span>
                </div>
              ) : (
                <SearchSelect
                  options={collectorOptions}
                  value={createCollectorId}
                  onChange={(v) => { setCreateCollectorId(v); setLoanErrors((p) => ({ ...p, collector: "" })); }}
                  placeholder="Select a collector…"
                  error={!!loanErrors.collector}
                />
              )}
              <FieldError error={loanErrors.collector} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowCreate(false); resetCreate(); }}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={creating}>
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating…</> : "Create & Activate Loan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Approve Application Dialog ── */}
      <Dialog open={!!approveApp} onOpenChange={(o) => !o && setApproveApp(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Approve Application
            </DialogTitle>
          </DialogHeader>
          {approveApp && (
            <div className="space-y-4 mt-2">
              {/* Application summary */}
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                <p className="font-semibold text-slate-900">{approveApp.customerName}</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-bold text-slate-900">₹{Number(approveApp.loanAmount || 0).toLocaleString()}</span>
                  <span className="text-slate-500">Tenure</span>
                  <span className="font-medium text-slate-900">{approveApp.tenureMonths} months</span>
                  <span className="text-slate-500">Purpose</span>
                  <span className="font-medium text-slate-900 truncate">{approveApp.loanPurpose || "—"}</span>
                </div>
              </div>

              {/* EMI preview */}
              {(() => {
                const emi = calculateEMI(approveApp.loanAmount || 0, (approveApp as any).interestRate ?? 12, approveApp.tenureMonths || 12);
                return (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                    <p className="text-xs text-emerald-600">Monthly EMI</p>
                    <p className="text-xl font-black text-emerald-800">₹{emi.toFixed(0)}</p>
                  </div>
                );
              })()}

              {/* Collector */}
              <div className="space-y-1.5">
                <Label>Assign Collector</Label>
                {collectorsForAssignment.length === 1 ? (
                  <div className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-3 flex items-center text-sm text-emerald-800 font-medium">
                    {collectorLabel(collectorsForAssignment[0])}
                  </div>
                ) : (
                  <SearchSelect
                    options={collectorOptions}
                    value={appCollectorId}
                    onChange={setAppCollectorId}
                    placeholder="Select a collector…"
                  />
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setApproveApp(null)}>Cancel</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleApproveApplication} disabled={approvingApp}>
                  {approvingApp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Approve & Activate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reject Application Dialog ── */}
      <Dialog open={!!rejectAppId} onOpenChange={(o) => !o && setRejectAppId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Input
                value={appRejectReason}
                onChange={(e) => setAppRejectReason(e.target.value)}
                placeholder="e.g. Insufficient income, pending documents…"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectAppId(null)}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleRejectApplication} disabled={rejectingApp}>
                {rejectingApp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EMI Schedule Dialog ── */}
      <Dialog open={!!viewLoan} onOpenChange={(o) => !o && setViewLoan(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>EMI Schedule</DialogTitle></DialogHeader>
          {viewLoan && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Principal</p>
                  <p className="font-bold text-slate-900">₹{Number(viewLoan.principalAmount ?? (viewLoan as any).principal ?? 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Monthly EMI</p>
                  <p className="font-bold text-slate-900">₹{Number(viewLoan.emiAmount ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3">
                  <p className="text-xs text-orange-600">Outstanding</p>
                  <p className="font-bold text-orange-700">₹{Number(viewLoan.outstandingBalance ?? (viewLoan as any).balanceRemaining ?? 0).toLocaleString()}</p>
                </div>
              </div>
              {viewLoan.loanAssignedCollectorName && (
                <div className="bg-indigo-50 rounded-xl p-3 flex items-center gap-2 text-sm">
                  <span className="text-indigo-500 font-semibold">Collector:</span>
                  <span className="text-indigo-900 font-medium">{viewLoan.loanAssignedCollectorName}</span>
                </div>
              )}
              {scheduleLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : scheduleInstallments.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">No installments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>#</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>EMI Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduleInstallments.map((inst) => {
                      const dueDate = toDate(inst.dueDate);
                      const isOverdue = inst.status !== "PAID" && isBefore(dueDate, today);
                      return (
                        <TableRow key={inst.id} className={isOverdue ? "bg-red-50" : ""}>
                          <TableCell className="font-semibold">{inst.installmentNo}</TableCell>
                          <TableCell className={isOverdue ? "text-red-600 font-semibold" : ""}>
                            {dueDate.getTime() > 0 ? format(dueDate, "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>₹{Number(inst.emiAmount ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{(inst.paidAmount || 0) > 0 ? `₹${inst.paidAmount}` : "—"}</TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              inst.status === "PAID" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : isOverdue ? "bg-red-50 text-red-700 border-red-100"
                              : "bg-amber-50 text-amber-700 border-amber-100"
                            }`}>
                              {inst.status === "PAID" ? "PAID" : isOverdue ? "OVERDUE" : "DUE"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

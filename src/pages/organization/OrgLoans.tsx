import React, { useState, useEffect } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Loan, LoanApplication, LoanInstallment, Membership } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, isBefore, startOfDay } from "date-fns";
import { Search, Plus, CheckCircle, XCircle, Eye, Loader2, AlertTriangle, CreditCard, Inbox, ChevronDown, Crown } from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { createLoan, approveLoan, rejectLoan, calculateEMI } from "@/lib/services";
import { where, getDocs, query, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

type LoanStatus = "ALL" | "PENDING" | "ACTIVE" | "CLOSED" | "REJECTED";
type View = "loans" | "applications";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-100",
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  CLOSED: "bg-slate-100 text-slate-500 border-slate-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  REJECTED: "bg-red-50 text-red-700 border-red-100",
  rejected: "bg-red-50 text-red-700 border-red-100",
};

export default function OrgLoans() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = organization?.id || "";

  const { data: loans, loading } = useCollectionRealtime<Loan>("loans");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: loanApplications, loading: appsLoading } = useCollectionRealtime<LoanApplication>("loanApplications");

  // ── View switcher ────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<View>("loans");

  // ── Loan list state ──────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<LoanStatus>("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewLoan, setViewLoan] = useState<Loan | null>(null);
  const [scheduleInstallments, setScheduleInstallments] = useState<LoanInstallment[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // ── Create form ──────────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("12");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [createCollectorId, setCreateCollectorId] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Approve PENDING loan dialog ──────────────────────────────────────────────
  const [approveDialogLoan, setApproveDialogLoan] = useState<Loan | null>(null);
  const [approveDialogCollectorId, setApproveDialogCollectorId] = useState("");
  const [approvingDialog, setApprovingDialog] = useState(false);

  // ── Reject loan ──────────────────────────────────────────────────────────────
  const [rejectLoanId, setRejectLoanId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // ── Application approval/rejection ──────────────────────────────────────────
  const [approveApp, setApproveApp] = useState<LoanApplication | null>(null);
  const [appInterestRate, setAppInterestRate] = useState("12");
  const [appCollectorId, setAppCollectorId] = useState("");
  const [approvingAppId, setApprovingAppId] = useState<string | null>(null);
  const [rejectAppId, setRejectAppId] = useState<string | null>(null);
  const [appRejectReason, setAppRejectReason] = useState("");
  const [rejectingApp, setRejectingApp] = useState(false);

  const customers = members.filter((m) => ["CUSTOMER", "customer"].includes(m.role as string) && (m as any).status === "ACTIVE");
  const activeOwners = members.filter((m) => ["OWNER", "owner"].includes(m.role as string) && ((m as any).status === "ACTIVE" || (m as any).status === "active"));
  const activeAgents = members.filter((m) => ["AGENT", "agent"].includes(m.role as string) && ((m as any).status === "ACTIVE" || (m as any).status === "active"));
  const collectorsForAssignment = [...activeOwners, ...activeAgents];

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";

  const actorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner";

  // Derive collector info by id
  const getCollectorById = (id: string) => collectorsForAssignment.find((c) => c.id === id);

  const collectorLabel = (c: any) => {
    const name = c.fullName || (c as any).name || c.email || c.id;
    const ownerTag = isOwnerMember(c) ? " (Owner)" : "";
    return `${name}${ownerTag}`;
  };

  // Auto-set collector when customer changes in create form
  useEffect(() => {
    if (!customerId) { setCreateCollectorId(""); return; }
    const cust = customers.find((c) => c.id === customerId);
    if (cust && (cust as any).assignedAgentId) {
      setCreateCollectorId((cust as any).assignedAgentId);
    } else if (collectorsForAssignment.length === 1) {
      setCreateCollectorId(collectorsForAssignment[0].id);
    } else {
      setCreateCollectorId("");
    }
  }, [customerId]);

  // Auto-set collector when approve dialog opens
  useEffect(() => {
    if (!approveDialogLoan) { setApproveDialogCollectorId(""); return; }
    const existing = approveDialogLoan.loanAssignedCollectorId;
    if (existing) { setApproveDialogCollectorId(existing); return; }
    const cust = customers.find((c) => c.id === approveDialogLoan.customerId || c.clerkUserId === approveDialogLoan.customerId);
    if (cust && (cust as any).assignedAgentId) {
      setApproveDialogCollectorId((cust as any).assignedAgentId);
    } else if (collectorsForAssignment.length === 1) {
      setApproveDialogCollectorId(collectorsForAssignment[0].id);
    }
  }, [approveDialogLoan]);

  // Auto-set collector when application approval dialog opens
  useEffect(() => {
    if (!approveApp) { setAppCollectorId(""); return; }
    const cust = customers.find((c) => c.id === approveApp.customerId || c.clerkUserId === approveApp.customerId);
    if (cust && (cust as any).assignedAgentId) {
      setAppCollectorId((cust as any).assignedAgentId);
    } else if (collectorsForAssignment.length === 1) {
      setAppCollectorId(collectorsForAssignment[0].id);
    }
  }, [approveApp]);

  const filteredLoans = loans.filter((l) => {
    const st = (l.status || "").toUpperCase();
    if (statusFilter !== "ALL" && st !== statusFilter) return false;
    const cust = members.find((m) => m.id === l.customerId || m.clerkUserId === l.customerId);
    const custName = (cust as any)?.fullName || (cust as any)?.name || "";
    return !search || custName.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());

  const pendingApps = loanApplications.filter((a) => a.status === "PENDING");
  const sortedApps = [...loanApplications].sort((a, b) => toDate(b.createdAt).valueOf() - toDate(a.createdAt).valueOf());

  const previewEMI = principal && interestRate && tenureMonths
    ? calculateEMI(Number(principal), Number(interestRate), Number(tenureMonths))
    : null;

  const approvePreviewEMI = approveApp && appInterestRate
    ? calculateEMI(approveApp.loanAmount, Number(appInterestRate), approveApp.tenureMonths)
    : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !user?.id || !customerId) return;
    if (Number(principal) <= 0) return toast.error("Principal must be > 0");
    const collector = getCollectorById(createCollectorId);
    setCreating(true);
    try {
      await createLoan({
        organizationId: orgId, customerId,
        principalAmount: Number(principal),
        interestRate: Number(interestRate),
        tenureMonths: Number(tenureMonths),
        createdByActorId: user.id, createdByActorRole: "OWNER", createdByActorName: actorName,
        loanAssignedCollectorId: collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      toast.success("Loan application created successfully.");
      setShowCreate(false);
      setPrincipal(""); setCustomerId(""); setInterestRate("12"); setTenureMonths("12"); setCreateCollectorId("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create loan");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenApproveDialog = (loan: Loan) => {
    setApproveDialogLoan(loan);
  };

  const handleConfirmApprove = async () => {
    if (!approveDialogLoan || !user?.id) return;
    const collector = getCollectorById(approveDialogCollectorId);
    setApprovingDialog(true);
    try {
      await approveLoan({
        loanId: approveDialogLoan.id,
        actorId: user.id, actorRole: "OWNER", actorName,
        loanAssignedCollectorId: collector?.id || approveDialogCollectorId || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      toast.success("Loan approved and EMI schedule generated.");
      setApproveDialogLoan(null);
    } catch (err: any) {
      toast.error(err?.message || "Approval failed");
    } finally {
      setApprovingDialog(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectLoanId || !user?.id) return;
    setRejecting(true);
    try {
      await rejectLoan({ loanId: rejectLoanId, reason: rejectReason, actorId: user.id, actorRole: "OWNER", actorName });
      toast.success("Loan rejected.");
      setRejectLoanId(null); setRejectReason("");
    } catch (err: any) {
      toast.error(err?.message || "Rejection failed");
    } finally {
      setRejecting(false);
    }
  };

  const handleApproveApplication = async () => {
    if (!approveApp || !user?.id) return;
    const collector = getCollectorById(appCollectorId);
    setApprovingAppId(approveApp.id);
    try {
      const loanId = await createLoan({
        organizationId: approveApp.organizationId,
        customerId: approveApp.customerId,
        principalAmount: approveApp.loanAmount,
        interestRate: Number(appInterestRate),
        tenureMonths: approveApp.tenureMonths,
        createdByActorId: user.id, createdByActorRole: "OWNER", createdByActorName: actorName,
        loanAssignedCollectorId: collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      await approveLoan({
        loanId, actorId: user.id, actorRole: "OWNER", actorName,
        loanAssignedCollectorId: collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });
      await updateDoc(doc(db, "loanApplications", approveApp.id), {
        status: "APPROVED", loanId,
        reviewedByActorId: user.id, reviewedByActorName: actorName,
        reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast.success("Application approved — loan created and EMI schedule generated.");
      setApproveApp(null); setAppInterestRate("12"); setAppCollectorId("");
    } catch (err: any) {
      toast.error(err?.message || "Approval failed");
    } finally {
      setApprovingAppId(null);
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
      toast.success("Application rejected.");
      setRejectAppId(null); setAppRejectReason("");
    } catch (err: any) {
      toast.error(err?.message || "Rejection failed");
    } finally {
      setRejectingApp(false);
    }
  };

  const handleViewSchedule = async (loan: Loan) => {
    setViewLoan(loan);
    setScheduleLoading(true);
    setScheduleInstallments([]);
    try {
      const snap = await getDocs(query(collection(db, "loan_installments"), where("loanId", "==", loan.id)));
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LoanInstallment))
        .sort((a, b) => a.installmentNo - b.installmentNo);
      setScheduleInstallments(items);
    } catch {
      toast.error("Failed to load EMI schedule");
    } finally {
      setScheduleLoading(false);
    }
  };

  const today = startOfDay(new Date());

  const loanStats = {
    total: loans.length,
    pending: loans.filter((l) => (l.status || "").toUpperCase() === "PENDING").length,
    active: loans.filter((l) => (l.status || "").toUpperCase() === "ACTIVE").length,
    closed: loans.filter((l) => (l.status || "").toUpperCase() === "CLOSED").length,
  };

  // ── Collector select component (reused in multiple dialogs) ──────────────────
  const CollectorSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="space-y-1.5">
      <Label>Collection Agent</Label>
      {collectorsForAssignment.length === 0 ? (
        <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">
          No active collectors available
        </div>
      ) : collectorsForAssignment.length === 1 ? (
        <div className="h-10 rounded-md border border-emerald-200 bg-emerald-50 px-3 flex items-center gap-2 text-sm text-emerald-800 font-medium">
          {isOwnerMember(collectorsForAssignment[0]) && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          <span className="flex-1">{collectorLabel(collectorsForAssignment[0])}</span>
          <span className="text-xs text-emerald-600 font-normal shrink-0">Auto-assigned</span>
        </div>
      ) : (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 h-10 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          >
            <option value="">Select a collector…</option>
            {collectorsForAssignment.map((c) => (
              <option key={c.id} value={c.id}>{collectorLabel(c)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Loan Management</h2>
          <p className="text-slate-500 text-sm">Create, approve, track EMI schedules, and review customer applications.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Loan
        </Button>
      </div>

      {/* ── View switcher ────────────────────────────────────────────────────── */}
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

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LOANS VIEW                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeView === "loans" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", val: loanStats.total, color: "bg-slate-50" },
              { label: "Pending", val: loanStats.pending, color: "bg-amber-50" },
              { label: "Active", val: loanStats.active, color: "bg-emerald-50" },
              { label: "Closed", val: loanStats.closed, color: "bg-slate-100" },
            ].map((s) => (
              <Card key={s.label} className={`${s.color} border-slate-200`}>
                <CardContent className="p-4">
                  <p className="text-2xl font-black text-slate-900">{s.val}</p>
                  <p className="text-xs text-slate-500">{s.label} loans</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer…" className="pl-9 h-9" />
            </div>
            <div className="flex gap-1">
              {(["ALL", "PENDING", "ACTIVE", "CLOSED", "REJECTED"] as LoanStatus[]).map((s) => (
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
                        const custName = (cust as any)?.fullName || (cust as any)?.name || loan.customerId?.slice(-8);
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
                              <div className="flex justify-end gap-1">
                                {st === "PENDING" && (
                                  <>
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs gap-1" onClick={() => handleOpenApproveDialog(loan)}>
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-7 px-2 text-xs gap-1" onClick={() => { setRejectLoanId(loan.id); setRejectReason(""); }}>
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                  </>
                                )}
                                {(st === "ACTIVE" || st === "CLOSED") && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleViewSchedule(loan)}>
                                    <Eye className="w-3 h-3" /> Schedule
                                  </Button>
                                )}
                                {st === "REJECTED" && loan.rejectionReason && (
                                  <span className="text-xs text-red-500 italic">{loan.rejectionReason}</span>
                                )}
                              </div>
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

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* APPLICATIONS VIEW                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeView === "applications" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Customer Loan Applications</CardTitle>
            <p className="text-xs text-slate-500">Review requests submitted by customers. Approve to create the loan and generate EMI schedule.</p>
          </CardHeader>
          <CardContent className="p-0">
            {appsLoading ? (
              <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : sortedApps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No loan applications yet.</p>
                <p className="text-xs mt-1">Customers can submit requests from their dashboard.</p>
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
                      <TableHead>Employment</TableHead>
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
                            <p className="text-xs text-slate-400">{app.customerEmail}</p>
                          </TableCell>
                          <TableCell className="font-bold text-slate-900">₹{Number(app.loanAmount).toLocaleString()}</TableCell>
                          <TableCell>{app.tenureMonths}m</TableCell>
                          <TableCell className="text-slate-600 text-sm">{app.loanPurpose}</TableCell>
                          <TableCell>₹{Number(app.monthlyIncome).toLocaleString()}</TableCell>
                          <TableCell className="text-slate-600 text-sm">{app.employmentType}</TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {toDate(app.createdAt).getTime() > 0 ? format(toDate(app.createdAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              st === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-100"
                              : st === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-red-50 text-red-700 border-red-100"
                            }`}>{st}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {st === "PENDING" && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs gap-1"
                                  onClick={() => { setApproveApp(app); setAppInterestRate("12"); }}
                                  disabled={!!approvingAppId}
                                >
                                  <CheckCircle className="w-3 h-3" /> Approve
                                </Button>
                                <Button
                                  size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-7 px-2 text-xs gap-1"
                                  onClick={() => { setRejectAppId(app.id); setAppRejectReason(""); }}
                                >
                                  <XCircle className="w-3 h-3" /> Reject
                                </Button>
                              </div>
                            )}
                            {st === "APPROVED" && (
                              <span className="text-xs text-emerald-600 font-medium">Loan created ✓</span>
                            )}
                            {st === "REJECTED" && app.rejectionReason && (
                              <span className="text-xs text-red-500 italic max-w-[120px] block truncate">{app.rejectionReason}</span>
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

      {/* ── Create Loan Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Loan Application</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Customer <span className="text-red-500">*</span></Label>
              <select
                className="w-full border border-slate-200 rounded-lg h-10 px-3 text-sm bg-white"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{(c as any).fullName || (c as any).name || c.email}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Principal Amount (₹) <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="50000" required />
              </div>
              <div className="space-y-1.5">
                <Label>Interest Rate (% p.a.)</Label>
                <Input type="number" min="0" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tenure (months)</Label>
              <Input type="number" min="1" max="360" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} />
            </div>
            {previewEMI && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-widest mb-1">Calculated EMI</p>
                <p className="text-2xl font-black text-blue-700">₹{previewEMI.toFixed(2)} / month</p>
                <p className="text-xs text-blue-500 mt-0.5">Total repayment: ₹{(previewEMI * Number(tenureMonths)).toFixed(2)}</p>
              </div>
            )}
            <CollectorSelect value={createCollectorId} onChange={setCreateCollectorId} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={creating || !customerId || !principal}>
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : "Create Loan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Approve Pending Loan Dialog ──────────────────────────────────────── */}
      <Dialog open={!!approveDialogLoan} onOpenChange={(o) => !o && setApproveDialogLoan(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Approve Loan
            </DialogTitle>
          </DialogHeader>
          {approveDialogLoan && (
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                {(() => {
                  const cust = members.find((m) => m.id === approveDialogLoan.customerId || m.clerkUserId === approveDialogLoan.customerId);
                  const custName = (cust as any)?.fullName || (cust as any)?.name || approveDialogLoan.customerId?.slice(-8);
                  const loanPrincipal = approveDialogLoan.principalAmount ?? (approveDialogLoan as any).principal ?? 0;
                  const tenure = approveDialogLoan.tenureMonths ?? (approveDialogLoan as any).durationMonths ?? 0;
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Customer</span>
                        <span className="font-semibold text-slate-900">{custName}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Principal</span>
                        <span className="font-bold text-slate-900">₹{Number(loanPrincipal).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Tenure</span>
                        <span className="font-semibold text-slate-900">{tenure} months</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <CollectorSelect value={approveDialogCollectorId} onChange={setApproveDialogCollectorId} />
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setApproveDialogLoan(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleConfirmApprove}
                  disabled={approvingDialog}
                >
                  {approvingDialog ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : "Approve & Activate"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve Application Dialog ───────────────────────────────────────── */}
      <Dialog open={!!approveApp} onOpenChange={(o) => !o && setApproveApp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Approve Loan Application
            </DialogTitle>
          </DialogHeader>
          {approveApp && (
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-semibold text-slate-900">{approveApp.customerName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Requested Amount</span>
                  <span className="font-bold text-slate-900">₹{Number(approveApp.loanAmount).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tenure</span>
                  <span className="font-semibold text-slate-900">{approveApp.tenureMonths} months</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Purpose</span>
                  <span className="font-semibold text-slate-900">{approveApp.loanPurpose}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monthly Income</span>
                  <span className="font-semibold text-slate-900">₹{Number(approveApp.monthlyIncome).toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Interest Rate (% per annum)</Label>
                <Input
                  type="number" min="0" step="0.1" value={appInterestRate}
                  onChange={(e) => setAppInterestRate(e.target.value)}
                />
              </div>
              {approvePreviewEMI && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-xs text-emerald-600 font-semibold uppercase tracking-widest mb-1">Monthly EMI</p>
                  <p className="text-2xl font-black text-emerald-700">₹{approvePreviewEMI.toFixed(2)}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">Total repayment: ₹{(approvePreviewEMI * approveApp.tenureMonths).toFixed(2)}</p>
                </div>
              )}
              <CollectorSelect value={appCollectorId} onChange={setAppCollectorId} />
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setApproveApp(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleApproveApplication}
                  disabled={!!approvingAppId}
                >
                  {approvingAppId ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : "Approve & Create Loan"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reject Application Dialog ────────────────────────────────────────── */}
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
              <Input value={appRejectReason} onChange={(e) => setAppRejectReason(e.target.value)} placeholder="e.g. Insufficient income, pending documents…" />
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

      {/* ── Reject Loan Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!rejectLoanId} onOpenChange={(o) => !o && setRejectLoanId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Reject Loan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Insufficient credit score, pending documents…" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectLoanId(null)}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleRejectSubmit} disabled={rejecting}>
                {rejecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EMI Schedule Dialog ──────────────────────────────────────────────── */}
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
                          <TableCell>₹{Number(inst.emiAmount).toFixed(2)}</TableCell>
                          <TableCell>{inst.paidAmount > 0 ? `₹${inst.paidAmount}` : "—"}</TableCell>
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

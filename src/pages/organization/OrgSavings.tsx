import { useState, useMemo } from "react";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName, sanitizeMultiline, validateAmount, validateRate } from "@/lib/validation";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { where } from "firebase/firestore";
import { toast } from "sonner";
import { format, startOfDay, startOfMonth, subMonths } from "date-fns";
import {
  PiggyBank, Plus, Edit2, Trash2, Users, IndianRupee, TrendingUp,
  Calendar, CheckCircle, Archive, Search, ChevronRight, Loader2,
  BarChart3, Download, X, AlertCircle, UserCheck, ArrowLeftRight,
  Eye, Snowflake, Power, FileText, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createSavingsPlan, updateSavingsPlan, deleteSavingsPlan,
  approveSavingsApplication, rejectSavingsApplication,
  updateSavingsAccountStatus, transferSavingsAgent,
} from "@/lib/services";
import type { SavingsPlan, SavingsApplication, SavingsAccount, SavingsTransaction, Membership } from "@/types";

type SubTab = "overview" | "plans" | "accounts" | "applications" | "reports";

const PLAN_TYPES = [
  { value: "DAILY_PIGMY", label: "Daily Pigmy" },
  { value: "WEEKLY_PIGMY", label: "Weekly Pigmy" },
  { value: "MONTHLY_PIGMY", label: "Monthly Pigmy" },
  { value: "RECURRING_DEPOSIT", label: "Recurring Deposit" },
  { value: "FIXED_DEPOSIT", label: "Fixed Deposit" },
];
const FREQ_TYPES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function fmt(ts: any) {
  const d = toDate(ts);
  return d.getTime() > 0 ? format(d, "MMM d, yyyy") : "—";
}

function planLabel(v: string) {
  return PLAN_TYPES.find((p) => p.value === v)?.label ?? v;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ title, value, icon: Icon, color = "sky", sub }: {
  title: string; value: string | number; icon: any; color?: string; sub?: string;
}) {
  const colors: Record<string, string> = {
    sky: "bg-sky-50 text-sky-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    slate: "bg-slate-100 text-slate-500",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500 leading-tight">{title}</p>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colors[color] || colors.sky}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Plan Form ─────────────────────────────────────────────────────────────────
function emptyPlanForm() {
  return {
    planName: "", planType: "DAILY_PIGMY", minDeposit: 10, maxDeposit: 10000,
    collectionFrequency: "DAILY", interestRate: 4, penaltyAmount: 50, graceDays: 3,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function OrgSavings() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const orgId = organization?.id ?? "";
  const actorId = user?.id ?? "";
  const actorName = user?.fullName ?? "Owner";

  // ── Realtime data ─────────────────────────────────────────────────────────
  const { data: savingsPlans } = useCollectionRealtime<SavingsPlan>("savings_plans");
  const { data: savingsAccounts } = useCollectionRealtime<SavingsAccount>("savings_accounts");
  const { data: savingsTxs } = useCollectionRealtime<SavingsTransaction>("savings_transactions");
  const { data: applications } = useCollectionRealtime<SavingsApplication>("savings_applications");
  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");

  // ── KPI derivations ───────────────────────────────────────────────────────
  const totalBalance = useMemo(() => savingsAccounts.reduce((s, a) => s + (a.totalBalance || 0), 0), [savingsAccounts]);
  const activeAccounts = useMemo(() => savingsAccounts.filter((a) => a.status === "ACTIVE").length, [savingsAccounts]);
  const closedAccounts = useMemo(() => savingsAccounts.filter((a) => a.status === "CLOSED").length, [savingsAccounts]);
  const savingsCustomers = useMemo(() => new Set(savingsAccounts.map((a) => a.customerId)).size, [savingsAccounts]);

  const today = startOfDay(new Date());
  const todayCollection = useMemo(() =>
    savingsTxs.filter((t) => toDate(t.collectedAt) >= today).reduce((s, t) => s + (t.amount || 0), 0),
    [savingsTxs]
  );
  const monthCollection = useMemo(() =>
    savingsTxs.filter((t) => toDate(t.collectedAt) >= startOfMonth(new Date())).reduce((s, t) => s + (t.amount || 0), 0),
    [savingsTxs]
  );
  const pendingApps = useMemo(() => applications.filter((a) => a.status === "PENDING"), [applications]);

  // Agents + owner for assignment
  const assignableAgents = useMemo(() =>
    members.filter((m) => {
      const role = String(m.role).toUpperCase();
      return (role === "AGENT" || role === "OWNER") && (m as any).status !== "INACTIVE" && (m as any).status !== "ARCHIVED";
    }),
    [members]
  );

  // ── Sub-tab state ─────────────────────────────────────────────────────────
  const [subTab, setSubTab] = useState<SubTab>("overview");

  // ── Plans modal state ─────────────────────────────────────────────────────
  const [planModal, setPlanModal] = useState<"create" | "edit" | null>(null);
  const [editingPlan, setEditingPlan] = useState<SavingsPlan | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm());
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [planSaving, setPlanSaving] = useState(false);
  const [deleteConfirmPlan, setDeleteConfirmPlan] = useState<SavingsPlan | null>(null);

  // ── Accounts state ────────────────────────────────────────────────────────
  const [accountSearch, setAccountSearch] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<"ALL" | "ACTIVE" | "FROZEN" | "CLOSED">("ALL");
  const [viewAccount, setViewAccount] = useState<SavingsAccount | null>(null);
  const [transferModal, setTransferModal] = useState<SavingsAccount | null>(null);
  const [transferAgentId, setTransferAgentId] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Applications state ────────────────────────────────────────────────────
  const [approveModal, setApproveModal] = useState<SavingsApplication | null>(null);
  const [rejectModal, setRejectModal] = useState<SavingsApplication | null>(null);
  const [approveAgentId, setApproveAgentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [appSubmitting, setAppSubmitting] = useState(false);
  const [appFilter, setAppFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");

  // ── PLAN CRUD ─────────────────────────────────────────────────────────────
  const openCreatePlan = () => {
    setPlanForm(emptyPlanForm());
    setEditingPlan(null);
    setPlanModal("create");
  };
  const openEditPlan = (plan: SavingsPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      planName: plan.planName,
      planType: plan.planType,
      minDeposit: plan.minDeposit,
      maxDeposit: plan.maxDeposit,
      collectionFrequency: plan.collectionFrequency,
      interestRate: plan.interestRate,
      penaltyAmount: plan.penaltyAmount,
      graceDays: plan.graceDays,
    });
    setPlanModal("edit");
  };
  const handleSavePlan = async () => {
    const errors: Record<string, string> = {};
    if (!planForm.planName.trim()) errors.planName = "Plan name is required";
    else if (planForm.planName.trim().length > 100) errors.planName = "Cannot exceed 100 characters";
    if (!planForm.minDeposit || Number(planForm.minDeposit) <= 0) errors.minDeposit = "Must be greater than 0";
    if (!planForm.maxDeposit || Number(planForm.maxDeposit) <= 0) errors.maxDeposit = "Must be greater than 0";
    else if (Number(planForm.maxDeposit) < Number(planForm.minDeposit)) errors.maxDeposit = "Must be ≥ min deposit";
    if (Number(planForm.interestRate) < 0 || Number(planForm.interestRate) > 100) errors.interestRate = "Must be 0–100";
    if (Number(planForm.penaltyAmount) < 0) errors.penaltyAmount = "Cannot be negative";
    if (Number(planForm.graceDays) < 0) errors.graceDays = "Cannot be negative";
    if (Object.values(errors).some(Boolean)) {
      setPlanErrors(errors);
      toast.error("Please fix the highlighted errors.");
      return;
    }
    setPlanErrors({});
    if (!orgId) return;
    const cleanPlanForm = { ...planForm, planName: sanitizeName(planForm.planName) };
    setPlanSaving(true);
    try {
      if (planModal === "create") {
        await createSavingsPlan({ ...cleanPlanForm, organizationId: orgId, createdByActorId: actorId, createdByActorName: actorName });
        toast.success("Savings plan created.");
      } else if (editingPlan) {
        await updateSavingsPlan(editingPlan.id, { ...cleanPlanForm, organizationId: orgId, actorId, actorName });
        toast.success("Savings plan updated.");
      }
      setPlanModal(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save plan.");
    } finally {
      setPlanSaving(false);
    }
  };
  const handleTogglePlan = async (plan: SavingsPlan) => {
    try {
      await updateSavingsPlan(plan.id, {
        status: plan.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
        organizationId: orgId, actorId, actorName,
      });
      toast.success(plan.status === "ACTIVE" ? "Plan disabled." : "Plan enabled.");
    } catch { toast.error("Failed to update plan status."); }
  };
  const handleDeletePlan = async () => {
    if (!deleteConfirmPlan) return;
    try {
      await deleteSavingsPlan(deleteConfirmPlan.id, orgId, actorId, actorName);
      toast.success("Plan deleted.");
      setDeleteConfirmPlan(null);
    } catch { toast.error("Failed to delete plan."); }
  };

  // ── ACCOUNT ACTIONS ───────────────────────────────────────────────────────
  const handleAccountStatus = async (account: SavingsAccount, status: "ACTIVE" | "FROZEN" | "CLOSED") => {
    setActionLoading(account.id);
    try {
      await updateSavingsAccountStatus(account.id, status, orgId, actorId, actorName);
      toast.success(`Account ${status === "ACTIVE" ? "activated" : status === "FROZEN" ? "frozen" : "closed"}.`);
      setViewAccount(null);
    } catch { toast.error("Failed to update account."); } finally { setActionLoading(null); }
  };
  const handleTransferAgent = async () => {
    if (!transferModal || !transferAgentId) { toast.error("Select an agent."); return; }
    const agent = assignableAgents.find((a) => a.clerkUserId === transferAgentId || a.id === transferAgentId);
    if (!agent) { toast.error("Agent not found."); return; }
    setActionLoading(transferModal.id);
    try {
      await transferSavingsAgent(
        transferModal.id,
        agent.clerkUserId ?? agent.id,
        (agent as any).fullName || agent.email,
        orgId, actorId, actorName
      );
      toast.success("Agent transferred successfully.");
      setTransferModal(null);
      setTransferAgentId("");
    } catch { toast.error("Failed to transfer agent."); } finally { setActionLoading(null); }
  };

  // ── APPLICATION ACTIONS ───────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approveModal) return;
    if (!approveAgentId) { toast.error("Please assign a collector."); return; }
    const agent = assignableAgents.find((a) => a.clerkUserId === approveAgentId || a.id === approveAgentId);
    if (!agent) { toast.error("Agent not found."); return; }
    setAppSubmitting(true);
    try {
      const plan = savingsPlans.find((p) => p.id === approveModal.planId);
      await approveSavingsApplication({
        applicationId: approveModal.id,
        organizationId: orgId,
        customerId: approveModal.customerId,
        customerName: approveModal.customerName,
        customerPhone: approveModal.customerPhone,
        planId: approveModal.planId,
        planName: approveModal.planName,
        planType: approveModal.planType,
        depositAmount: approveModal.depositAmount,
        interestRate: plan?.interestRate ?? 0,
        assignedAgentId: agent.clerkUserId ?? agent.id,
        assignedAgentName: (agent as any).fullName || agent.email,
        reviewedByActorId: actorId,
        reviewedByActorName: actorName,
      });
      toast.success(`Savings account opened for ${approveModal.customerName}.`);
      setApproveModal(null);
      setApproveAgentId("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve application.");
    } finally { setAppSubmitting(false); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) { toast.error("Please provide a rejection reason."); return; }
    setAppSubmitting(true);
    try {
      await rejectSavingsApplication({
        applicationId: rejectModal.id,
        organizationId: orgId,
        reviewedByActorId: actorId,
        reviewedByActorName: actorName,
        rejectionReason: rejectReason.trim(),
      });
      toast.success("Application rejected.");
      setRejectModal(null);
      setRejectReason("");
    } catch { toast.error("Failed to reject application."); } finally { setAppSubmitting(false); }
  };

  // ── FILTERED ACCOUNTS ─────────────────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    return savingsAccounts.filter((a) => {
      const name = (a.customerName || "").toLowerCase();
      const acctNo = (a.accountNumber || "").toLowerCase();
      const matchSearch = !accountSearch || name.includes(accountSearch.toLowerCase()) || acctNo.includes(accountSearch.toLowerCase());
      const matchStatus = accountStatusFilter === "ALL" || a.status === accountStatusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  }, [savingsAccounts, accountSearch, accountStatusFilter]);

  // ── FILTERED APPLICATIONS ─────────────────────────────────────────────────
  const filteredApps = useMemo(() => {
    return applications
      .filter((a) => appFilter === "ALL" || a.status === appFilter)
      .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  }, [applications, appFilter]);

  // ── CSV EXPORT ────────────────────────────────────────────────────────────
  const exportAccountsCSV = () => {
    const rows = [
      ["Account No", "Customer", "Plan", "Balance", "Agent", "Status", "Since"],
      ...filteredAccounts.map((a) => [
        a.accountNumber || "—", a.customerName || "—", planLabel(a.planType),
        a.totalBalance.toString(), a.assignedAgentName || "—", a.status, fmt(a.startDate),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "savings_accounts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportTransactionsCSV = () => {
    const rows = [
      ["Receipt No", "Customer", "Amount", "Balance After", "Agent", "Date"],
      ...savingsTxs.sort((a, b) => toDate(b.collectedAt).getTime() - toDate(a.collectedAt).getTime()).map((t) => {
        const cust = savingsAccounts.find((a) => a.id === t.savingsAccountId);
        return [
          t.receiptNo, cust?.customerName || t.customerId?.slice(-8) || "—",
          t.amount.toString(), t.balanceAfter.toString(),
          t.collectedByName || "—", fmt(t.collectedAt),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "savings_transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── REPORT DATA ───────────────────────────────────────────────────────────
  const reportMonthly = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d).getTime();
      const end = startOfMonth(subMonths(d, -1)).getTime();
      const txsInMonth = savingsTxs.filter((t) => {
        const ts = toDate(t.collectedAt).getTime();
        return ts >= start && ts < end;
      });
      months.push({
        label: format(d, "MMM yyyy"),
        total: txsInMonth.reduce((s, t) => s + t.amount, 0),
        count: txsInMonth.length,
      });
    }
    return months;
  }, [savingsTxs]);

  const agentReport = useMemo(() => {
    const map = new Map<string, { agentName: string; total: number; count: number }>();
    savingsTxs.forEach((t) => {
      const key = t.agentId;
      const existing = map.get(key) || { agentName: t.collectedByName || "Unknown", total: 0, count: 0 };
      existing.total += t.amount;
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [savingsTxs]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Savings Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">Plans, accounts, collections, and analytics — all real-time.</p>
        </div>
        {pendingApps.length > 0 && (
          <button
            onClick={() => { setSubTab("applications"); setAppFilter("PENDING"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold shadow-sm hover:bg-amber-600 transition-colors shrink-0"
          >
            <Clock className="w-3.5 h-3.5" />
            {pendingApps.length} Pending
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPICard title="Savings Customers" value={savingsCustomers} icon={Users} color="sky" />
        <KPICard title="Total Savings Balance" value={`₹${totalBalance.toLocaleString()}`} icon={IndianRupee} color="emerald" />
        <KPICard title="Today's Collection" value={`₹${todayCollection.toLocaleString()}`} icon={Calendar} color="blue" />
        <KPICard title="Monthly Collection" value={`₹${monthCollection.toLocaleString()}`} icon={TrendingUp} color="violet" />
        <KPICard title="Active Accounts" value={activeAccounts} icon={CheckCircle} color="green" />
        <KPICard title="Closed Accounts" value={closedAccounts} icon={Archive} color="slate" />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {([
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "plans", label: "Plans", icon: FileText },
          { id: "accounts", label: "Accounts", icon: PiggyBank },
          { id: "applications", label: `Applications${pendingApps.length ? ` (${pendingApps.length})` : ""}`, icon: UserCheck },
          { id: "reports", label: "Reports", icon: TrendingUp },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                subTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW TAB ───────────────────────────────────────────────────────── */}
      {subTab === "overview" && (
        <div className="space-y-5">
          {/* Recent Applications */}
          {pendingApps.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                  <Clock className="w-4 h-4" />
                  {pendingApps.length} Pending Savings Application{pendingApps.length > 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {pendingApps.slice(0, 3).map((app) => (
                  <div key={app.id} className="flex items-center justify-between px-4 py-3 border-t border-amber-100">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{app.customerName}</p>
                      <p className="text-xs text-slate-500">{app.planName} · ₹{app.depositAmount.toLocaleString()}/mo</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setApproveModal(app); setSubTab("applications"); }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
                {pendingApps.length > 3 && (
                  <button onClick={() => setSubTab("applications")} className="w-full py-2 text-xs text-amber-700 font-semibold hover:bg-amber-100 transition-colors rounded-b-xl">
                    View all {pendingApps.length} applications →
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Accounts by Plan Type */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Accounts by Plan Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savingsPlans.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No plans created yet. <button onClick={() => setSubTab("plans")} className="text-sky-600 font-semibold">Create your first plan →</button></p>
              ) : (
                savingsPlans.map((plan) => {
                  const planAccs = savingsAccounts.filter((a) => a.planId === plan.id || a.planType === plan.planType);
                  const bal = planAccs.reduce((s, a) => s + (a.totalBalance || 0), 0);
                  return (
                    <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{plan.planName}</p>
                        <p className="text-xs text-slate-400">{planLabel(plan.planType)} · {planAccs.length} accounts</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-700">₹{bal.toLocaleString()}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                          {plan.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Agent Performance */}
          {agentReport.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Agent Collection Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {agentReport.slice(0, 5).map((ar, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</div>
                      <p className="text-sm font-medium text-slate-800">{ar.agentName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">₹{ar.total.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">{ar.count} collections</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── PLANS TAB ──────────────────────────────────────────────────────────── */}
      {subTab === "plans" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{savingsPlans.length} plan{savingsPlans.length !== 1 ? "s" : ""} configured</p>
            <Button size="sm" onClick={openCreatePlan} className="gap-1.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-3.5 h-3.5" /> New Plan
            </Button>
          </div>

          {savingsPlans.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No savings plans yet</p>
                <p className="text-sm mt-1">Create a plan to start enrolling customers.</p>
                <Button size="sm" onClick={openCreatePlan} className="mt-4 gap-1.5 bg-sky-600 hover:bg-sky-700">
                  <Plus className="w-3.5 h-3.5" /> Create First Plan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {savingsPlans.map((plan) => {
                const accountCount = savingsAccounts.filter((a) => a.planId === plan.id || a.planType === plan.planType).length;
                return (
                  <Card key={plan.id} className={plan.status === "DISABLED" ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900">{plan.planName}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                              {plan.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{planLabel(plan.planType)} · {plan.collectionFrequency} collection · {accountCount} accounts</p>
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                            <span>Min: ₹{plan.minDeposit}</span>
                            <span>Max: ₹{plan.maxDeposit}</span>
                            <span>Interest: {plan.interestRate}%</span>
                            <span>Penalty: ₹{plan.penaltyAmount}</span>
                            <span>Grace: {plan.graceDays} days</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => handleTogglePlan(plan)}
                            className={`p-2 rounded-lg text-xs transition-colors ${plan.status === "ACTIVE" ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                            title={plan.status === "ACTIVE" ? "Disable plan" : "Enable plan"}>
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEditPlan(plan)}
                            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteConfirmPlan(plan)}
                            className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ACCOUNTS TAB ───────────────────────────────────────────────────────── */}
      {subTab === "accounts" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search customer or account number…" className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1">
              {(["ALL", "ACTIVE", "FROZEN", "CLOSED"] as const).map((s) => (
                <button key={s} onClick={() => setAccountStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${accountStatusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {s}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportAccountsCSV} className="gap-1.5 shrink-0">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          </div>

          {filteredAccounts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <PiggyBank className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No accounts found.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-50">
                  {filteredAccounts.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 text-sm truncate">{acc.customerName || "—"}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            acc.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" :
                            acc.status === "FROZEN" ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-500"
                          }`}>{acc.status}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {acc.accountNumber || "—"} · {planLabel(acc.planType)} · Agent: {acc.assignedAgentName || "—"}
                        </p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className="font-bold text-emerald-700 text-sm">₹{(acc.totalBalance || 0).toLocaleString()}</p>
                        <button onClick={() => setViewAccount(acc)}
                          className="text-xs text-sky-600 font-semibold hover:text-sky-700 mt-0.5 flex items-center gap-0.5 ml-auto">
                          <Eye className="w-3 h-3" /> View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 px-4 py-2.5 flex justify-between items-center">
                  <p className="text-xs text-slate-400">{filteredAccounts.length} accounts</p>
                  <p className="text-sm font-bold text-emerald-700">
                    Total: ₹{filteredAccounts.reduce((s, a) => s + (a.totalBalance || 0), 0).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── APPLICATIONS TAB ─────────────────────────────────────────────────── */}
      {subTab === "applications" && (
        <div className="space-y-4">
          <div className="flex gap-1">
            {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
              <button key={s} onClick={() => setAppFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${appFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {s} {s !== "ALL" ? `(${applications.filter((a) => a.status === s).length})` : ""}
              </button>
            ))}
          </div>

          {filteredApps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No applications found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredApps.map((app) => (
                <Card key={app.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900">{app.customerName}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            app.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                            app.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" :
                            "bg-red-100 text-red-700"
                          }`}>{app.status}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{app.planName} · ₹{app.depositAmount.toLocaleString()} / collection</p>
                        {app.customerPhone && <p className="text-xs text-slate-400">{app.customerPhone}</p>}
                        {app.notes && <p className="text-xs text-slate-400 italic mt-1">"{app.notes}"</p>}
                        {app.rejectionReason && <p className="text-xs text-red-600 mt-1">Reason: {app.rejectionReason}</p>}
                        <p className="text-xs text-slate-300 mt-1">Applied {fmt(app.createdAt)}</p>
                      </div>
                      {app.status === "PENDING" && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => { setApproveModal(app); setApproveAgentId(""); }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
                            Approve
                          </button>
                          <button onClick={() => { setRejectModal(app); setRejectReason(""); }}
                            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REPORTS TAB ────────────────────────────────────────────────────────── */}
      {subTab === "reports" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportAccountsCSV} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Accounts CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportTransactionsCSV} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Transactions CSV
            </Button>
          </div>

          {/* Monthly collection table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Monthly Savings Collection (12 months)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                {reportMonthly.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.count} transactions</p>
                    </div>
                    <p className="font-bold text-emerald-700">₹{row.total.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-4 py-2.5 flex justify-between">
                <p className="text-xs text-slate-400">12-month total</p>
                <p className="text-sm font-black text-emerald-700">
                  ₹{reportMonthly.reduce((s, r) => s + r.total, 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Agent report table */}
          {agentReport.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Agent Collection Report</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-50">
                  {agentReport.map((ar, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                        <p className="text-sm font-medium text-slate-800">{ar.agentName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">₹{ar.total.toLocaleString()}</p>
                        <p className="text-xs text-slate-400">{ar.count} collections</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* Plan Create/Edit Modal */}
      <Dialog open={!!planModal} onOpenChange={(o) => !o && setPlanModal(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{planModal === "create" ? "Create Savings Plan" : "Edit Savings Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs">Plan Name *</Label>
              <Input value={planForm.planName}
                onChange={(e) => { setPlanForm((p) => ({ ...p, planName: e.target.value })); setPlanErrors((p) => ({ ...p, planName: "" })); }}
                placeholder="e.g. Daily Pigmy Gold"
                className={`mt-1 h-10 ${planErrors.planName ? "border-red-400" : ""}`} />
              <FieldError error={planErrors.planName} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Plan Type</Label>
                <select value={planForm.planType} onChange={(e) => setPlanForm((p) => ({ ...p, planType: e.target.value }))}
                  className="mt-1 w-full h-10 px-2 rounded-lg border border-input bg-background text-sm">
                  {PLAN_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Collection Frequency</Label>
                <select value={planForm.collectionFrequency} onChange={(e) => setPlanForm((p) => ({ ...p, collectionFrequency: e.target.value }))}
                  className="mt-1 w-full h-10 px-2 rounded-lg border border-input bg-background text-sm">
                  {FREQ_TYPES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Min Deposit (₹)</Label>
                <Input type="number" value={planForm.minDeposit}
                  onChange={(e) => { setPlanForm((p) => ({ ...p, minDeposit: Number(e.target.value) })); setPlanErrors((p) => ({ ...p, minDeposit: "" })); }}
                  className={`mt-1 h-10 ${planErrors.minDeposit ? "border-red-400" : ""}`} min={1} />
                <FieldError error={planErrors.minDeposit} />
              </div>
              <div>
                <Label className="text-xs">Max Deposit (₹)</Label>
                <Input type="number" value={planForm.maxDeposit}
                  onChange={(e) => { setPlanForm((p) => ({ ...p, maxDeposit: Number(e.target.value) })); setPlanErrors((p) => ({ ...p, maxDeposit: "" })); }}
                  className={`mt-1 h-10 ${planErrors.maxDeposit ? "border-red-400" : ""}`} min={1} />
                <FieldError error={planErrors.maxDeposit} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Interest Rate (%)</Label>
                <Input type="number" value={planForm.interestRate}
                  onChange={(e) => { setPlanForm((p) => ({ ...p, interestRate: Number(e.target.value) })); setPlanErrors((p) => ({ ...p, interestRate: "" })); }}
                  className={`mt-1 h-10 ${planErrors.interestRate ? "border-red-400" : ""}`} min={0} step={0.1} />
                <FieldError error={planErrors.interestRate} />
              </div>
              <div>
                <Label className="text-xs">Penalty (₹)</Label>
                <Input type="number" value={planForm.penaltyAmount}
                  onChange={(e) => { setPlanForm((p) => ({ ...p, penaltyAmount: Number(e.target.value) })); setPlanErrors((p) => ({ ...p, penaltyAmount: "" })); }}
                  className={`mt-1 h-10 ${planErrors.penaltyAmount ? "border-red-400" : ""}`} min={0} />
                <FieldError error={planErrors.penaltyAmount} />
              </div>
              <div>
                <Label className="text-xs">Grace Days</Label>
                <Input type="number" value={planForm.graceDays}
                  onChange={(e) => { setPlanForm((p) => ({ ...p, graceDays: Number(e.target.value) })); setPlanErrors((p) => ({ ...p, graceDays: "" })); }}
                  className={`mt-1 h-10 ${planErrors.graceDays ? "border-red-400" : ""}`} min={0} />
                <FieldError error={planErrors.graceDays} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPlanModal(null)}>Cancel</Button>
              <Button className="flex-1 bg-sky-600 hover:bg-sky-700" onClick={handleSavePlan} disabled={planSaving}>
                {planSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : planModal === "create" ? "Create Plan" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Plan Confirm */}
      <Dialog open={!!deleteConfirmPlan} onOpenChange={(o) => !o && setDeleteConfirmPlan(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Delete <strong>{deleteConfirmPlan?.planName}</strong>? This cannot be undone. Existing accounts will not be affected.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmPlan(null)}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDeletePlan}>Delete Plan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Account Modal */}
      <Dialog open={!!viewAccount} onOpenChange={(o) => !o && setViewAccount(null)}>
        {viewAccount && (
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Savings Account</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <p className="text-xs text-emerald-700 font-medium">Current Balance</p>
                <p className="text-3xl font-black text-emerald-800">₹{(viewAccount.totalBalance || 0).toLocaleString()}</p>
                <p className="text-xs text-emerald-600 font-mono mt-1">{viewAccount.accountNumber || "—"}</p>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ["Customer", viewAccount.customerName || "—"],
                  ["Phone", viewAccount.customerPhone || "—"],
                  ["Plan", planLabel(viewAccount.planType)],
                  ["Plan Name", viewAccount.planName || "—"],
                  ["Scheduled Amt", `₹${(viewAccount.scheduledAmount || 0).toLocaleString()}`],
                  ["Agent", viewAccount.assignedAgentName || "—"],
                  ["Status", viewAccount.status],
                  ["Since", fmt(viewAccount.startDate)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold text-slate-900">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                {viewAccount.status !== "ACTIVE" && (
                  <Button size="sm" onClick={() => handleAccountStatus(viewAccount, "ACTIVE")}
                    disabled={!!actionLoading} className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    <Power className="w-3.5 h-3.5" /> Activate
                  </Button>
                )}
                {viewAccount.status === "ACTIVE" && (
                  <Button size="sm" variant="outline" onClick={() => handleAccountStatus(viewAccount, "FROZEN")}
                    disabled={!!actionLoading} className="flex-1 gap-1.5 text-sky-600 border-sky-200 hover:bg-sky-50">
                    <Snowflake className="w-3.5 h-3.5" /> Freeze
                  </Button>
                )}
                {viewAccount.status !== "CLOSED" && (
                  <Button size="sm" variant="outline" onClick={() => handleAccountStatus(viewAccount, "CLOSED")}
                    disabled={!!actionLoading} className="flex-1 gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                    <Archive className="w-3.5 h-3.5" /> Close
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setTransferModal(viewAccount); setViewAccount(null); }}
                  className="flex-1 gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Transfer
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Transfer Agent Modal */}
      <Dialog open={!!transferModal} onOpenChange={(o) => !o && setTransferModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Agent</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              Reassign <strong>{transferModal?.customerName}</strong>'s savings account to a different agent.
            </p>
            <div>
              <Label className="text-xs">Select New Agent / Owner</Label>
              <select value={transferAgentId} onChange={(e) => setTransferAgentId(e.target.value)}
                className="mt-1 w-full h-10 px-2 rounded-lg border border-input bg-background text-sm">
                <option value="">Select…</option>
                {assignableAgents.map((a) => (
                  <option key={a.id} value={a.clerkUserId ?? a.id}>
                    {(a as any).fullName || a.email} ({String(a.role).toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setTransferModal(null)}>Cancel</Button>
              <Button className="flex-1 bg-sky-600 hover:bg-sky-700" onClick={handleTransferAgent}
                disabled={!!actionLoading || !transferAgentId}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Transfer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Application Modal */}
      <Dialog open={!!approveModal} onOpenChange={(o) => !o && setApproveModal(null)}>
        {approveModal && (
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Approve Savings Application</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="font-bold text-slate-900">{approveModal.customerName}</p>
                <p className="text-xs text-slate-500">Plan: {approveModal.planName}</p>
                <p className="text-xs text-slate-500">Amount: ₹{approveModal.depositAmount.toLocaleString()} / collection</p>
                {approveModal.notes && <p className="text-xs text-slate-400 italic">"{approveModal.notes}"</p>}
              </div>
              <div>
                <Label className="text-xs">Assign Collector *</Label>
                <select value={approveAgentId} onChange={(e) => setApproveAgentId(e.target.value)}
                  className="mt-1 w-full h-10 px-2 rounded-lg border border-input bg-background text-sm">
                  <option value="">Select agent / owner…</option>
                  {assignableAgents.map((a) => (
                    <option key={a.id} value={a.clerkUserId ?? a.id}>
                      {(a as any).fullName || a.email} ({String(a.role).toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setApproveModal(null)}>Cancel</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={appSubmitting}>
                  {appSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open Account"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Reject Application Modal */}
      <Dialog open={!!rejectModal} onOpenChange={(o) => !o && setRejectModal(null)}>
        {rejectModal && (
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm text-slate-600">Rejecting application from <strong>{rejectModal.customerName}</strong>.</p>
              <div>
                <Label className="text-xs">Rejection Reason *</Label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this application is being rejected…"
                  className="mt-1 w-full h-24 px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setRejectModal(null)}>Cancel</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleReject} disabled={appSubmitting}>
                  {appSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reject"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership, SavingsAccount, Loan, Collection } from "@/types";
import { where } from "firebase/firestore";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  createDirectMember, validateCustomerEmail, reassignCustomer,
  createAuditLog, migrateCustomerAssignments,
} from "@/lib/services";
import CollectDialog from "@/components/agent/CollectDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FieldError from "@/components/ui/FieldError";
import EmptyState from "@/components/ui/EmptyState";
import OrgCustomerProfile from "./OrgCustomerProfile";
import { useOrganization, useUser, useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import {
  sanitizeName, sanitizeEmail, sanitizeMultiline, sanitizeSearch,
  validateEmail, validatePhone10, validateLettersOnlyName,
} from "@/lib/validation";
import SearchSelect from "@/components/ui/SearchSelect";
import {
  Search, Plus, AlertTriangle, Users, ChevronDown, Loader2,
  KeyRound, Copy, Check, ShieldCheck, Phone, MessageCircle,
  IndianRupee, Eye, TrendingDown, UserCheck, Crown, RefreshCw,
  ArrowUpDown, Filter, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { isToday, format } from "date-fns";

// ── Helpers ──────────────────────────────────────────────────────────────────
function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function fmtCurrency(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString()}`;
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  try { return format(toDate(ts), "dd MMM yy"); } catch { return "—"; }
}

type CollectionStatus = "PAID_TODAY" | "PENDING_TODAY" | "OVERDUE" | "INACTIVE";
type FilterTab = "all" | "active" | "pending" | "overdue" | "completed";
type SortKey = "id" | "name" | "pending" | "lastCollection";
type CreatedCredentials = { name: string; email: string; password: string };

const ITEMS_PER_PAGE = 12;

export default function OrgCustomers() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  // ── Firestore data ──────────────────────────────────────────────────────────
  const { data: customers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
  ]);
  const { data: agents } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT"),
  ]);
  const { data: owners } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "OWNER"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);
  const { data: savingsAccounts } = useCollectionRealtime<SavingsAccount>("savings_accounts");
  const { data: loans } = useCollectionRealtime<Loan>("loans");
  const { data: collections } = useCollectionRealtime<Collection>("collections");

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<"list" | "profile">(() => {
    try { return (sessionStorage.getItem("fc_org_active_customer_view") as "list" | "profile") || "list"; } catch { return "list"; }
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => {
    try { return sessionStorage.getItem("fc_org_active_customer") || null; } catch { return null; }
  });
  // Derive selectedCustomer live from the Firestore-backed customers array so
  // profile view always reflects the latest data without a page reload.
  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId],
  );

  // ── Filter / sort state ─────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [currentPage, setCurrentPage] = useState(1);

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collectingCustomer, setCollectingCustomer] = useState<any>(null);
  const [deactivateCustomer, setDeactivateCustomer] = useState<Membership | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // ── Add customer form ───────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCollectorId, setSelectedCollectorId] = useState("");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Migration ───────────────────────────────────────────────────────────────
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  // ── Derived data ────────────────────────────────────────────────────────────
  const activeAgents = useMemo(() => agents.filter((a: any) => (a.status || "").toUpperCase() === "ACTIVE"), [agents]);
  const activeOwners = useMemo(() => owners.filter((o: any) => (o.status || "").toUpperCase() === "ACTIVE"), [owners]);
  const collectorsForAssignment = useMemo(() => [...activeOwners, ...activeAgents], [activeOwners, activeAgents]);
  const allCollectors = useMemo(() => [...owners, ...agents], [owners, agents]);

  const savingsBalanceByCustomer = useMemo(() => {
    const m: Record<string, number> = {};
    savingsAccounts.forEach((sa: any) => {
      if (sa.customerId) m[sa.customerId] = (m[sa.customerId] || 0) + (sa.totalBalance || 0);
    });
    return m;
  }, [savingsAccounts]);

  const loanDataByCustomer = useMemo(() => {
    const m: Record<string, { principal: number; outstanding: number; overdue: boolean }> = {};
    loans.forEach((l: any) => {
      if (!l.customerId) return;
      const st = (l.status || "").toUpperCase();
      const isActive = ["ACTIVE", "OVERDUE", "PARTIALLY_PAID"].includes(st);
      if (!isActive) return;
      if (!m[l.customerId]) m[l.customerId] = { principal: 0, outstanding: 0, overdue: false };
      m[l.customerId].principal += (l.principalAmount || l.principal || 0);
      m[l.customerId].outstanding += (l.outstandingBalance || l.balanceRemaining || 0);
      if (st === "OVERDUE") m[l.customerId].overdue = true;
    });
    return m;
  }, [loans]);

  const todayCollectionsByCustomer = useMemo(() => {
    const m: Record<string, number> = {};
    collections.forEach((c: any) => {
      const d = toDate(c.collectedAt || c.timestamp);
      if (isToday(d) && c.customerId) {
        m[c.customerId] = (m[c.customerId] || 0) + (c.amount || 0);
      }
    });
    return m;
  }, [collections]);

  const lastCollectionByCustomer = useMemo(() => {
    const m: Record<string, any> = {};
    [...collections].sort((a, b) => toDate(b.collectedAt || (b as any).timestamp).getTime() - toDate(a.collectedAt || (a as any).timestamp).getTime())
      .forEach((c: any) => {
        if (c.customerId && !m[c.customerId]) m[c.customerId] = c.collectedAt || c.timestamp;
      });
    return m;
  }, [collections]);

  const getCollectionStatus = useCallback((customer: Membership): CollectionStatus => {
    const status = (customer.status as string || "").toUpperCase();
    if (status === "INACTIVE") return "INACTIVE";
    const loanData = loanDataByCustomer[customer.id];
    if (loanData?.overdue) return "OVERDUE";
    if (todayCollectionsByCustomer[customer.id] > 0) return "PAID_TODAY";
    const hasAccount = (savingsBalanceByCustomer[customer.id] || 0) > 0 || !!loanData;
    if (hasAccount && status === "ACTIVE") return "PENDING_TODAY";
    return "PENDING_TODAY";
  }, [loanDataByCustomer, todayCollectionsByCustomer, savingsBalanceByCustomer]);

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";

  const needsMigration = !migrationDone && customers.some((c: any) => {
    const aid: string = (c as any).assignedAgentId || "";
    return aid && !aid.startsWith("user_") && aid.includes("_");
  });

  // ── Stats for top cards ─────────────────────────────────────────────────────
  const statsData = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c: any) => (c.status || "").toUpperCase() === "ACTIVE").length;
    const overdue = customers.filter((c: any) => loanDataByCustomer[c.id]?.overdue).length;
    const pending = customers.filter((c: any) => {
      const st = getCollectionStatus(c);
      return st === "PENDING_TODAY";
    }).length;
    return { total, active, pending, overdue };
  }, [customers, loanDataByCustomer, getCollectionStatus]);

  const maxCustomers = orgDoc?.limits?.maxCustomers || 10;
  const atLimit = statsData.active >= maxCustomers;

  // ── Filtering + Sorting ─────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let list = [...customers];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.fullName || (c as any).name || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        c.id.slice(-8).toLowerCase().includes(q)
      );
    }

    if (agentFilter !== "all") {
      list = list.filter(c => {
        const aid = (c as any).assignedAgentId || "";
        return allCollectors.some(col => (col.id === agentFilter) && (col.clerkUserId === aid || col.id === aid));
      });
    }

    if (filterTab !== "all") {
      list = list.filter(c => {
        const st = getCollectionStatus(c);
        if (filterTab === "active") return (c.status || "").toUpperCase() === "ACTIVE";
        if (filterTab === "pending") return st === "PENDING_TODAY";
        if (filterTab === "overdue") return st === "OVERDUE";
        if (filterTab === "completed") return st === "PAID_TODAY";
        return true;
      });
    }

    list.sort((a, b) => {
      if (sortBy === "name") return (a.fullName || (a as any).name || "").localeCompare(b.fullName || (b as any).name || "");
      if (sortBy === "id") return a.id.localeCompare(b.id);
      if (sortBy === "pending") {
        const pa = loanDataByCustomer[a.id]?.outstanding || 0;
        const pb = loanDataByCustomer[b.id]?.outstanding || 0;
        return pb - pa;
      }
      if (sortBy === "lastCollection") {
        const da = toDate(lastCollectionByCustomer[a.id] || null).getTime();
        const db2 = toDate(lastCollectionByCustomer[b.id] || null).getTime();
        return db2 - da;
      }
      return 0;
    });

    return list;
  }, [customers, searchTerm, agentFilter, filterTab, sortBy, getCollectionStatus, loanDataByCustomer, lastCollectionByCustomer, allCollectors]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = useMemo(() =>
    filteredCustomers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filteredCustomers, currentPage]
  );

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterTab, agentFilter, sortBy]);

  useEffect(() => {
    if (isAddOpen && collectorsForAssignment.length === 1) {
      setSelectedCollectorId(collectorsForAssignment[0].id);
    }
  }, [isAddOpen, collectorsForAssignment.length]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setAddress(""); setNotes("");
    setSelectedCollectorId(""); setCredentials(null); setCopiedField(null);
    setFormErrors({});
  };

  const validateCustomerField = (field: string, value: string) => {
    let error = "";
    if (field === "firstName") {
      const r = validateLettersOnlyName(value, { label: "First name" });
      error = r.valid ? "" : (r.error ?? "");
    } else if (field === "lastName") {
      if (!value.trim()) error = "Last name is required";
      else if (value.trim().length < 2) error = "Minimum 2 characters";
    } else if (field === "email") {
      const r = validateEmail(value);
      error = r.valid ? "" : (r.error ?? "");
    } else if (field === "phone") {
      if (value.trim()) {
        const r = validatePhone10(value);
        error = r.valid ? "" : (r.error ?? "");
      }
    }
    setFormErrors(prev => ({ ...prev, [field]: error }));
  };

  const copyToClipboard = async (text: string, field: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("Could not copy."); }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !user?.id) { toast.error("No active organization."); return; }
    if (atLimit) { toast.error(`Customer limit of ${maxCustomers} reached.`); return; }

    const submitErrors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) submitErrors.firstName = fnRes.error!;
    if (!lastName.trim()) submitErrors.lastName = "Last name is required";
    else if (lastName.trim().length < 2) submitErrors.lastName = "Minimum 2 characters";
    const emailRes = validateEmail(email);
    if (!emailRes.valid) submitErrors.email = emailRes.error!;
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) submitErrors.phone = phoneRes.error!;
    }
    if (Object.values(submitErrors).some(Boolean)) { setFormErrors(submitErrors); fcToast.formError(); return; }
    setFormErrors({});

    const collectorToAssign = collectorsForAssignment.length === 1
      ? collectorsForAssignment[0]
      : collectorsForAssignment.find(c => c.id === selectedCollectorId);
    if (!collectorToAssign) { toast.error("Please select an assigned collector."); return; }

    const emailKey = email.trim().toLowerCase();
    setIsValidating(true);
    try { await validateCustomerEmail(organization.id, emailKey, phone.trim()); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Validation failed"); setIsValidating(false); return; }
    finally { setIsValidating(false); }

    setIsSubmitting(true);
    try {
      let authToken = await getToken();
      if (!authToken) authToken = await getToken({ skipCache: true });
      const { generatedPassword } = await createDirectMember({
        firstName: sanitizeName(firstName),
        lastName: sanitizeName(lastName),
        email: emailKey,
        phone: phone.replace(/\D/g, "").slice(0, 10),
        address: sanitizeMultiline(address, 500),
        notes: sanitizeMultiline(notes, 500),
        role: "CUSTOMER",
        organizationId: organization.id,
        organizationName: organization.name || "",
        assignedAgentId: (collectorToAssign as any).clerkUserId || collectorToAssign.id,
        assignedAgentName: collectorToAssign.fullName || (collectorToAssign as any).name || "",
        assignedCollectorRole: (collectorToAssign.role as string) || "AGENT",
        createdBy: user.id,
        actorName: user.fullName || user.firstName || "",
        authToken: authToken || undefined,
      });
      setCredentials({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), email: emailKey, password: generatedPassword });
      fcToast.customerCreated(`${firstName.trim()} ${lastName.trim()}`);
    } catch (error) {
      fcToast.customerCreationFailed(error instanceof Error ? error.message : undefined);
    } finally { setIsSubmitting(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateCustomer) return;
    if (loanDataByCustomer[deactivateCustomer.id]?.outstanding > 0) {
      toast.error("Cannot deactivate: customer has active loans. Close loans first.");
      setDeactivateCustomer(null);
      return;
    }
    setDeactivating(true);
    try {
      const isActive = ((deactivateCustomer.status as string) || "ACTIVE") === "ACTIVE";
      const update = { status: isActive ? "INACTIVE" : "ACTIVE", updatedAt: serverTimestamp() };
      await updateDoc(doc(db, "organizationMembers", deactivateCustomer.id), update);
      try { await updateDoc(doc(db, "customers", deactivateCustomer.id), update); } catch {}
      const n = deactivateCustomer.fullName || (deactivateCustomer as any).name || "Customer";
      if (isActive) fcToast.customerDeactivated(n);
      else fcToast.customerReactivated(n);
      setDeactivateCustomer(null);
    } catch { fcToast.customerUpdateFailed(); }
    finally { setDeactivating(false); }
  };

  const handleRunMigration = async () => {
    if (!organization?.id) return;
    setIsMigrating(true);
    try {
      const result = await migrateCustomerAssignments(organization.id);
      setMigrationDone(true);
      toast.success(`Migration complete — ${result.migrated} customer${result.migrated !== 1 ? "s" : ""} fixed`);
    } catch (err: any) { toast.error("Migration failed: " + (err?.message || "Unknown error")); }
    finally { setIsMigrating(false); }
  };

  // ── Customer card helpers ────────────────────────────────────────────────────
  const getStatusBadge = (status: CollectionStatus) => {
    if (status === "PAID_TODAY") return { label: "Paid Today", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> };
    if (status === "OVERDUE") return { label: "Overdue", className: "bg-rose-100 text-rose-700 border-rose-200", icon: <AlertTriangle className="w-3 h-3" /> };
    if (status === "INACTIVE") return { label: "Inactive", className: "bg-slate-100 text-slate-500 border-slate-200", icon: <XCircle className="w-3 h-3" /> };
    return { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> };
  };

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All", count: customers.length },
    { key: "active", label: "Active", count: statsData.active },
    { key: "pending", label: "Pending", count: statsData.pending },
    { key: "overdue", label: "Overdue", count: statsData.overdue },
    { key: "completed", label: "Paid Today" },
  ];

  // Restore view to profile when we have a persisted customer ID and customers have loaded
  useEffect(() => {
    if (!selectedCustomerId || view === "profile") return;
    if (customers.length > 0) {
      const found = customers.find((c) => c.id === selectedCustomerId);
      if (found) {
        setView("profile");
      } else {
        // Customer ID not found once data is loaded — clear stale session
        try { sessionStorage.removeItem("fc_org_active_customer"); sessionStorage.removeItem("fc_org_active_customer_view"); } catch {}
        setSelectedCustomerId(null);
      }
    }
  }, [customers, selectedCustomerId, view]);

  const handleSelectCustomer = (customer: Membership) => {
    setSelectedCustomerId(customer.id);
    setView("profile");
    try { sessionStorage.setItem("fc_org_active_customer", customer.id); sessionStorage.setItem("fc_org_active_customer_view", "profile"); } catch {}
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedCustomerId(null);
    try { sessionStorage.removeItem("fc_org_active_customer"); sessionStorage.removeItem("fc_org_active_customer_view"); } catch {}
  };

  // ── Profile view ─────────────────────────────────────────────────────────────
  if (view === "profile" && selectedCustomer) {
    return (
      <OrgCustomerProfile
        customer={selectedCustomer}
        orgId={organization?.id || ""}
        orgName={organization?.name || ""}
        onBack={handleBackToList}
        collectors={collectorsForAssignment}
        currentUser={user}
      />
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Migration Banner ── */}
      {needsMigration && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Agent assignment data needs a one-time fix</p>
            <p className="text-amber-700 mt-0.5 text-xs">Some customers use an older format that prevents agents from seeing assigned customers.</p>
          </div>
          <Button size="sm" className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleRunMigration} disabled={isMigrating}>
            {isMigrating ? "Fixing…" : "Fix Now"}
          </Button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Customer Management</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Financial CRM · {statsData.active}/{maxCustomers} active customers
          </p>
        </div>
        {atLimit ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4" />
            <span>Customer limit reached</span>
          </div>
        ) : (
          <Dialog open={isAddOpen} onOpenChange={open => { setIsAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={
              <Button className="shrink-0 bg-indigo-600 hover:bg-indigo-700 gap-1.5">
                <Plus className="w-4 h-4" /> Add Customer
              </Button>
            } />
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">
                  {credentials ? "Customer Created" : "Add New Customer"}
                </DialogTitle>
              </DialogHeader>

              {credentials ? (
                <div className="space-y-4 mt-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-sm font-bold text-emerald-800">{credentials.name} — Account Ready</p>
                    </div>
                    <p className="text-xs text-emerald-600 ml-7">Share these credentials with the customer.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                    {[
                      { label: "Email", value: credentials.email, field: "email" as const },
                      { label: "Temporary Password", value: credentials.password, field: "password" as const },
                    ].map(({ label, value, field }) => (
                      <div key={field} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                          <p className={`text-sm ${field === "password" ? "font-mono font-bold tracking-wider" : "font-medium"} text-slate-900 truncate`}>{value}</p>
                        </div>
                        <button onClick={() => copyToClipboard(value, field)} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
                          {copiedField === field ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
                    <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Customer will be prompted to set a new password on first sign in.</p>
                  </div>
                  <Button className="w-full" onClick={() => { setIsAddOpen(false); resetForm(); }}>Done</Button>
                </div>
              ) : (
                <form onSubmit={handleAddCustomer} className="space-y-4 mt-2">
                  <p className="text-sm text-slate-500 -mt-2">A temporary password will be generated and shared with the customer.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "fn", label: "First Name", value: firstName, onChange: setFirstName, field: "firstName", placeholder: "Jane" },
                      { id: "ln", label: "Last Name", value: lastName, onChange: setLastName, field: "lastName", placeholder: "Doe" },
                    ].map(({ id, label, value, onChange, field, placeholder }) => (
                      <div key={id} className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-700">{label} <span className="text-red-500">*</span></Label>
                        <Input placeholder={placeholder} value={value}
                          onChange={e => { onChange(e.target.value); validateCustomerField(field, e.target.value); }}
                          className={`h-11 ${formErrors[field] ? "border-red-400" : ""}`} />
                        <FieldError error={formErrors[field]} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Email <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder="customer@example.com"
                      value={email}
                      onChange={e => {
                        const v = e.target.value.toLowerCase().trimStart();
                        setEmail(v);
                        validateCustomerField("email", v);
                      }}
                      className={`h-11 ${formErrors.email ? "border-red-400" : ""}`}
                    />
                    <FieldError error={formErrors.email} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Phone Number</Label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="10-digit mobile number"
                      value={phone}
                      maxLength={10}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setPhone(digits);
                        validateCustomerField("phone", digits);
                      }}
                      className={`h-11 ${formErrors.phone ? "border-red-400" : ""}`}
                    />
                    <FieldError error={formErrors.phone} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Address</Label>
                    <Input placeholder="House no, street, city…" value={address}
                      onChange={e => setAddress(e.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Notes</Label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…"
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Assigned Collector <span className="text-red-500">*</span></Label>
                    {collectorsForAssignment.length === 0 ? (
                      <div className="h-11 rounded-md border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">No active collectors available</div>
                    ) : collectorsForAssignment.length === 1 ? (
                      <div className="h-11 rounded-md border border-emerald-200 bg-emerald-50 px-3 flex items-center gap-2 text-sm text-emerald-800 font-medium">
                        {isOwnerMember(collectorsForAssignment[0]) && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                        <span className="flex-1 truncate">{collectorsForAssignment[0].fullName || (collectorsForAssignment[0] as any).name}</span>
                        <span className="text-xs text-emerald-600 font-normal shrink-0">Auto-assigned</span>
                      </div>
                    ) : (
                      <SearchSelect
                        options={collectorsForAssignment.map(c => ({
                          value: c.id,
                          label: `${c.fullName || (c as any).name || c.email}${isOwnerMember(c) ? " (Owner)" : ""}`,
                          sublabel: c.email || "",
                          badge: isOwnerMember(c) ? "Owner" : undefined,
                        }))}
                        value={selectedCollectorId}
                        onChange={setSelectedCollectorId}
                        placeholder="Select a collector…"
                        searchPlaceholder="Search collectors…"
                      />
                    )}
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold bg-indigo-600 hover:bg-indigo-700"
                    disabled={isValidating || isSubmitting || collectorsForAssignment.length === 0 || !firstName.trim() || !email.trim() || Object.values(formErrors).some(Boolean)}>
                    {isValidating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</> :
                      isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> :
                        "Create Customer"}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Customers", value: statsData.total, icon: <Users className="w-5 h-5" />, color: "text-slate-900", iconBg: "bg-slate-100 text-slate-600", active: filterTab === "all", tab: "all" as FilterTab },
          { label: "Active Customers", value: statsData.active, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-emerald-700", iconBg: "bg-emerald-100 text-emerald-600", active: filterTab === "active", tab: "active" as FilterTab },
          { label: "Pending Today", value: statsData.pending, icon: <Clock className="w-5 h-5" />, color: "text-amber-700", iconBg: "bg-amber-100 text-amber-600", active: filterTab === "pending", tab: "pending" as FilterTab },
          { label: "Overdue", value: statsData.overdue, icon: <AlertTriangle className="w-5 h-5" />, color: "text-rose-700", iconBg: "bg-rose-100 text-rose-600", active: filterTab === "overdue", tab: "overdue" as FilterTab },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setFilterTab(stat.active ? "all" : stat.tab)}
            className={`rounded-2xl border bg-white p-4 text-left transition-all hover:shadow-sm ${stat.active ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"}`}
          >
            <div className="flex items-start justify-between">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                {stat.icon}
              </div>
              {stat.active && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />}
            </div>
            <p className={`text-2xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* ── Search + Filters + Sort ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search by name, phone, email or ID…"
            className="pl-10 h-11 bg-slate-50 border-slate-200"
            value={searchTerm}
            onChange={e => setSearchTerm(sanitizeSearch(e.target.value))}
          />
        </div>

        {/* Filter chips + Agent filter + Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Status filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterTab === tab.key
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filterTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Agent filter */}
            {(agents.length > 0 || owners.length > 0) && (
              <div className="relative">
                <UserCheck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <select
                  value={agentFilter}
                  onChange={e => setAgentFilter(e.target.value)}
                  className="appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-2 text-xs font-medium text-slate-700 focus:outline-none h-9"
                >
                  <option value="all">All Agents</option>
                  {allCollectors.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.fullName || (c as any).name || c.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            )}

            {/* Sort */}
            <div className="relative">
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-2 text-xs font-medium text-slate-700 focus:outline-none h-9"
              >
                <option value="name">Sort: Name</option>
                <option value="id">Sort: Customer ID</option>
                <option value="pending">Sort: Pending Amount</option>
                <option value="lastCollection">Sort: Last Collection</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Customer Cards Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full" />
              <div className="grid grid-cols-3 gap-2">
                {[...Array(3)].map((_, j) => <div key={j} className="h-12 bg-slate-100 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12">
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={searchTerm ? "No customers match your search." : filterTab !== "all" ? "No customers in this category." : "No customers yet."}
            description={!searchTerm && filterTab === "all" ? "Click \"Add Customer\" to add your first member." : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedCustomers.map((customer) => {
            const custName = customer.fullName || (customer as any).name || customer.email || "Unknown";
            const initials = custName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
            const aid = (customer as any).assignedAgentId || "";
            const assignedCollector = allCollectors.find((c: any) => c.clerkUserId === aid || c.id === aid);
            const agentName = (customer as any).assignedAgentName || assignedCollector?.fullName || (assignedCollector as any)?.name || "Unassigned";

            const loanData = loanDataByCustomer[customer.id];
            const savings = savingsBalanceByCustomer[customer.id] || 0;
            const loanPrincipal = loanData?.principal || 0;
            const loanOutstanding = loanData?.outstanding || 0;
            const loanPaid = loanPrincipal - loanOutstanding;
            const totalAmt = savings + loanPrincipal;
            const paidAmt = savings + loanPaid;
            const progress = totalAmt > 0 ? Math.min(100, Math.round((paidAmt / totalAmt) * 100)) : 0;

            const colStatus = getCollectionStatus(customer);
            const { label: statusLabel, className: statusClass, icon: statusIcon } = getStatusBadge(colStatus);
            const lastColDate = lastCollectionByCustomer[customer.id];
            const todayAmount = todayCollectionsByCustomer[customer.id] || 0;

            const progressColor = colStatus === "PAID_TODAY" ? "bg-emerald-500" :
              colStatus === "OVERDUE" ? "bg-rose-500" : "bg-amber-400";

            return (
              <div
                key={customer.id}
                className={`group rounded-2xl border bg-white overflow-hidden flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5 ${colStatus === "OVERDUE" ? "border-rose-200" : colStatus === "PAID_TODAY" ? "border-emerald-200" : "border-slate-200"}`}
              >
                {/* Card header stripe */}
                <div className={`h-1 ${colStatus === "OVERDUE" ? "bg-rose-400" : colStatus === "PAID_TODAY" ? "bg-emerald-400" : "bg-amber-300"}`} />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Top row: Avatar + Name + Status */}
                  <div className="flex items-start gap-3">
                    <Avatar className="w-11 h-11 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 font-bold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate text-sm">{custName}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">#{customer.id.slice(-8).toUpperCase()}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap shrink-0 ${statusClass}`}>
                          {statusIcon}{statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {customer.phone && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone className="w-3 h-3 text-slate-400" /> {customer.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[100px]">{agentName}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financials */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                      <p className="text-[10px] text-slate-400 font-medium">Total</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{totalAmt > 0 ? fmtCurrency(totalAmt) : "—"}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
                      <p className="text-[10px] text-emerald-600 font-medium">Paid</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5">{paidAmt > 0 ? fmtCurrency(paidAmt) : "—"}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center ${loanOutstanding > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
                      <p className={`text-[10px] font-medium ${loanOutstanding > 0 ? "text-rose-500" : "text-slate-400"}`}>Pending</p>
                      <p className={`text-sm font-bold mt-0.5 ${loanOutstanding > 0 ? "text-rose-600" : "text-slate-400"}`}>
                        {loanOutstanding > 0 ? fmtCurrency(loanOutstanding) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {totalAmt > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-slate-500">Collection Progress</span>
                        <span className="text-[10px] font-bold text-slate-600">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Today + Last collection */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
                    {todayAmount > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> ₹{todayAmount.toLocaleString()} today
                      </span>
                    ) : (
                      <span>No collection today</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {lastColDate ? fmtDate(lastColDate) : "Never"}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSelectCustomer(customer)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    {(customer.status as string) === "ACTIVE" && (
                      <button
                        onClick={() => setCollectingCustomer(customer)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                      >
                        <IndianRupee className="w-3.5 h-3.5" /> Collect
                      </button>
                    )}
                    {customer.phone && (
                      <>
                        <a
                          href={`tel:${customer.phone}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
                          title="Call"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/91${customer.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-green-600 transition-colors"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)}
            </span>{" "}
            of <span className="font-semibold text-slate-700">{filteredCustomers.length}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 5) {
                if (currentPage <= 3) page = i + 1;
                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                else page = currentPage - 2 + i;
              }
              return (
                <button key={page} onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${currentPage === page ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirm ── */}
      {deactivateCustomer && (() => {
        const isActive = ((deactivateCustomer.status as string) || "ACTIVE") === "ACTIVE";
        const hasLoans = (loanDataByCustomer[deactivateCustomer.id]?.outstanding || 0) > 0;
        const custName = deactivateCustomer.fullName || (deactivateCustomer as any).name || "Customer";
        return (
          <ConfirmDialog
            open={!!deactivateCustomer}
            onOpenChange={o => !o && setDeactivateCustomer(null)}
            variant={isActive ? "warning" : "info"}
            title={isActive ? `Deactivate ${custName}?` : `Reactivate ${custName}?`}
            description={isActive
              ? hasLoans ? "Cannot deactivate: customer has active loans. Close all loans first."
              : "They will be marked Inactive and blocked from signing in. All records are preserved."
              : "This customer will be able to sign in again."}
            details={[
              { label: "Customer", value: custName },
              { label: "Email", value: deactivateCustomer.email || "—" },
              { label: "Status after", value: isActive ? "Inactive" : "Active" },
            ]}
            confirmLabel={isActive ? "Deactivate" : "Reactivate"}
            loading={deactivating}
            onConfirm={handleDeactivate}
          />
        );
      })()}

      {/* ── Owner Collect Dialog ── */}
      <CollectDialog
        customer={collectingCustomer}
        orgId={organization?.id || ""}
        orgName={organization?.name || ""}
        agentId={user?.id || ""}
        agentName={user?.fullName || user?.firstName || "Owner"}
        collectedByRole="OWNER"
        collectedById={user?.id || ""}
        onClose={() => setCollectingCustomer(null)}
      />
    </div>
  );
}

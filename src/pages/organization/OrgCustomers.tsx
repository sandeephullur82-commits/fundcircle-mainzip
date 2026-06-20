import React, { useState, useEffect } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership, SavingsAccount, Loan } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectMember, validateCustomerEmail, reassignCustomer, createAuditLog, migrateCustomerAssignments } from "@/lib/services";
import { useOrganization, useUser, useAuth } from "@clerk/clerk-react";
import { where, doc, updateDoc, serverTimestamp, getDocs, query, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search, Plus, AlertTriangle, Crown, Users, ChevronDown, RefreshCw,
  Loader2, KeyRound, Copy, Check, ShieldCheck, Pencil, UserX, Phone,
  MapPin, FileText, UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import FieldError from "@/components/ui/FieldError";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import {
  sanitizeName, sanitizeEmail, sanitizeMultiline, sanitizeSearch,
  validateEmail, validatePhone10, validateLettersOnlyName,
} from "@/lib/validation";

type CreatedCredentials = {
  name: string;
  email: string;
  password: string;
};

export default function OrgCustomers() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  const { data: customers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
  ]);
  const { data: agents, loading: agentsLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT"),
  ]);
  const { data: owners, loading: ownersLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "OWNER"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);
  const { data: savingsAccounts } = useCollectionRealtime<SavingsAccount>("savings_accounts");
  const { data: loans } = useCollectionRealtime<Loan>("loans");

  const [searchTerm, setSearchTerm] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCollectorId, setSelectedCollectorId] = useState("");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);

  const [reassigningCustomer, setReassigningCustomer] = useState<any>(null);
  const [newCollectorId, setNewCollectorId] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  // Edit customer state
  const [editCustomer, setEditCustomer] = useState<Membership | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNominee, setEditNominee] = useState({ name: "", relation: "", phone: "", address: "" });
  const [nomineePhoneError, setNomineePhoneError] = useState("");
  const [editCollectorId, setEditCollectorId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // Nominee override reason (required when customer has an active loan)
  const [nomineeOverrideReason, setNomineeOverrideReason] = useState("");
  const [showNomineeOverride, setShowNomineeOverride] = useState(false);

  // Deactivate state
  const [deactivateCustomer, setDeactivateCustomer] = useState<Membership | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  const activeOwners = owners.filter((o: any) => o.status === "ACTIVE" || o.status === "active");
  const activeAgents = agents.filter((a: any) => a.status === "ACTIVE" || a.status === "active");
  const collectorsForAssignment = [...activeOwners, ...activeAgents];
  const collectorsLoading = ownersLoading || agentsLoading;

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // ── Current user's membership (for agent visibility scoping) ───────────────
  const myMembershipId = organization?.id && user?.id ? `${organization.id}_${user.id}` : null;
  const { data: myMembership } = useDocumentRealtime<Membership>("organizationMembers", myMembershipId);
  const isAgent = (myMembership?.role || "").toUpperCase() === "AGENT";

  // ── Visibility scope: agents see only their assigned customers ─────────────
  const visibleCustomers = isAgent
    ? customers.filter((c: any) => (c as any).assignedAgentId === user?.id)
    : customers;

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";

  const customerCountByCollector: Record<string, number> = {};
  customers.forEach((c: any) => {
    const aid = (c as any).assignedAgentId || c.agentId || "";
    if (aid) customerCountByCollector[aid] = (customerCountByCollector[aid] || 0) + 1;
  });

  const allCollectors = [...owners, ...agents];

  const collectorLabel = (c: any) => {
    const name = c.fullName || (c as any).name || c.email || c.id;
    // Look up by Clerk user ID first (used in new docs), fall back to doc ID (legacy)
    const lookupKey = (c as any).clerkUserId || c.id;
    const count = customerCountByCollector[lookupKey] || customerCountByCollector[c.id] || 0;
    const ownerTag = isOwnerMember(c) ? " · Owner" : "";
    return `${name} (${count})${ownerTag}`;
  };

  // Savings balance per customer membership ID
  const savingsBalanceByCustomer: Record<string, number> = {};
  savingsAccounts.forEach((sa: any) => {
    if (sa.customerId) {
      savingsBalanceByCustomer[sa.customerId] = (savingsBalanceByCustomer[sa.customerId] || 0) + (sa.totalBalance || 0);
    }
  });

  // Active loan count per customer membership ID (includes ACTIVE, OVERDUE, PARTIALLY_PAID)
  const ACTIVE_LOAN_STATUSES_SET = new Set(["ACTIVE", "OVERDUE", "PARTIALLY_PAID"]);
  const activeLoansByCustomer: Record<string, number> = {};
  loans.forEach((l: any) => {
    const st = (l.status || "").toUpperCase();
    if (ACTIVE_LOAN_STATUSES_SET.has(st) && l.customerId) {
      activeLoansByCustomer[l.customerId] = (activeLoansByCustomer[l.customerId] || 0) + 1;
    }
  });

  useEffect(() => {
    if (isInviteOpen && collectorsForAssignment.length === 1) {
      setSelectedCollectorId(collectorsForAssignment[0].id);
    }
  }, [isInviteOpen, collectorsForAssignment.length]);

  const maxCustomers = orgDoc?.limits?.maxCustomers || 10;
  const activeCustomers = customers.filter((c: any) => c.status === "ACTIVE").length;
  const atLimit = activeCustomers >= maxCustomers;

  // ── Check if any customer has legacy membership-doc-ID format in assignedAgentId ──
  const needsMigration = !migrationDone && customers.some((c: any) => {
    const aid: string = (c as any).assignedAgentId || "";
    return aid && !aid.startsWith("user_") && aid.includes("_");
  });

  const handleRunMigration = async () => {
    if (!organization?.id) return;
    setIsMigrating(true);
    try {
      const result = await migrateCustomerAssignments(organization.id);
      setMigrationDone(true);
      toast.success(
        `Migration complete — ${result.migrated} customer${result.migrated !== 1 ? "s" : ""} fixed` +
        (result.errors.length ? ` (${result.errors.length} errors — check console)` : "")
      );
      if (result.errors.length) console.error("[FC Migration] Errors:", result.errors);
    } catch (err: any) {
      toast.error("Migration failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsMigrating(false);
    }
  };

  // ── Search filter → pagination ────────────────────────────────────────────
  const countAll = visibleCustomers.length;

  const filteredCustomers = visibleCustomers.filter((u) =>
    ((u?.fullName || (u as any)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((u?.phone || "").includes(searchTerm)) ||
    ((u?.email || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when search changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const statusClass = (status?: string) => {
    if (status === "ACTIVE")          return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "PENDING_SETUP")   return "bg-amber-50 text-amber-700 border-amber-100";
    if (status === "PENDING_INVITED") return "bg-violet-50 text-violet-700 border-violet-100";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  const statusLabel = (status?: string) => {
    if (status === "ACTIVE")          return "Active";
    if (status === "PENDING_SETUP")   return "Setup Pending";
    if (status === "PENDING_INVITED") return "Invited";
    return status || "Pending";
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
      else if (value.trim().length > 50) error = "Maximum 50 characters";
    } else if (field === "email") {
      const r = validateEmail(value);
      error = r.valid ? "" : (r.error ?? "");
    } else if (field === "phone") {
      if (value.trim()) {
        const r = validatePhone10(value);
        error = r.valid ? "" : (r.error ?? "");
      }
    } else if (field === "address") {
      if (value.trim().length > 500) error = "Maximum 500 characters";
    }
    setFormErrors((prev) => ({ ...prev, [field]: error }));
  };

  const copyToClipboard = async (text: string, field: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("[FC OrgCustomers] ▶ Add Customer clicked");
    console.log("[FC OrgCustomers]   Org ID :", organization?.id ?? "MISSING");
    console.log("[FC OrgCustomers]   User ID:", user?.id ?? "MISSING");
    console.log("[FC OrgCustomers]   Role   : OWNER (org dashboard)");

    if (!organization?.id) { toast.error("No active organization selected."); return; }
    if (!user?.id) { toast.error("Missing authenticated owner identity."); return; }
    if (atLimit) { toast.error(`Customer limit of ${maxCustomers} reached.`); return; }

    const submitErrors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) submitErrors.firstName = fnRes.error!;
    if (!lastName.trim()) submitErrors.lastName = "Last name is required";
    else if (lastName.trim().length < 2) submitErrors.lastName = "Minimum 2 characters";
    else if (lastName.trim().length > 50) submitErrors.lastName = "Maximum 50 characters";
    const emailRes = validateEmail(email);
    if (!emailRes.valid) submitErrors.email = emailRes.error!;
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) submitErrors.phone = phoneRes.error!;
    }
    if (address.trim().length > 500) submitErrors.address = "Maximum 500 characters";
    if (Object.values(submitErrors).some(Boolean)) {
      setFormErrors(submitErrors);
      fcToast.formError();
      return;
    }
    setFormErrors({});

    const collectorToAssign =
      collectorsForAssignment.length === 1
        ? collectorsForAssignment[0]
        : collectorsForAssignment.find((c) => c.id === selectedCollectorId);

    if (!collectorToAssign) {
      toast.error("Please select an assigned collector.");
      return;
    }

    const emailKey = email.trim().toLowerCase();

    setIsValidating(true);
    try {
      await validateCustomerEmail(organization.id, emailKey, phone.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
      setIsValidating(false);
      return;
    } finally {
      setIsValidating(false);
    }

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
      const collectorName = credentials
        ? (collectorsForAssignment.find(c => c.id === selectedCollectorId)?.fullName || (collectorsForAssignment.find(c => c.id === selectedCollectorId) as any)?.name)
        : undefined;
      fcToast.customerCreated(`${firstName.trim()} ${lastName.trim()}`, collectorName);
    } catch (error) {
      fcToast.customerCreationFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (customer: Membership) => {
    setEditCustomer(customer);
    setEditPhone(customer.phone || "");
    setEditAddress(customer.address || "");
    // Read top-level nominee fields first (master source), fallback to nested object
    setEditNominee({
      name: customer.nomineeName || customer.nominee?.name || "",
      relation: customer.nomineeRelation || customer.nominee?.relation || "",
      phone: customer.nomineePhone || customer.nominee?.phone || "",
      address: customer.nomineeAddress || customer.nominee?.address || "",
    });
    const assignedId = (customer as any).assignedAgentId || "";
    const matchedColl = allCollectors.find(
      (c: any) => c.id === assignedId || c.clerkUserId === assignedId
    );
    setEditCollectorId(matchedColl?.id || "");
    setEditNotes((customer as any).notes || "");
    setNomineeOverrideReason("");
    setShowNomineeOverride(false);
    setNomineePhoneError("");
  };

  const handleSaveEdit = async () => {
    if (!editCustomer) return;
    if (editPhone.trim()) {
      const phoneRes = validatePhone10(editPhone);
      if (!phoneRes.valid) { toast.error(phoneRes.error); return; }
    }
    if (editAddress.trim().length > 500) { toast.error("Address cannot exceed 500 characters."); return; }

    const cleanPhone          = editPhone ? editPhone.replace(/\D/g, "").slice(0, 10) : "";
    const cleanAddress        = sanitizeMultiline(editAddress, 500);
    const cleanNomineeName    = sanitizeName(editNominee.name);
    const cleanNomineeRelation = (editNominee.relation || "").trim();
    const cleanNomineePhone   = editNominee.phone ? editNominee.phone.replace(/\D/g, "").slice(0, 10) : "";
    const cleanNomineeAddress = sanitizeMultiline(editNominee.address || "", 300);
    const cleanNotes          = sanitizeMultiline(editNotes, 500);

    const custActiveLoans = activeLoansByCustomer[editCustomer.id] || 0;

    // ── Detect nominee change — require override reason when loans active ──
    const prevNomineeName     = editCustomer.nomineeName     || editCustomer.nominee?.name     || "";
    const prevNomineeRelation = editCustomer.nomineeRelation || editCustomer.nominee?.relation || "";
    const nomineeChanged = cleanNomineeName !== prevNomineeName || cleanNomineeRelation !== prevNomineeRelation;

    if (nomineeChanged && custActiveLoans > 0) {
      if (!showNomineeOverride) {
        setShowNomineeOverride(true);
        toast.warning("This customer has an active loan. Provide a reason to override the locked nominee.");
        return;
      }
      if (!nomineeOverrideReason.trim()) {
        toast.error("A reason is required to change a nominee on an active loan.");
        return;
      }
    }

    setSavingEdit(true);
    const newCollector = collectorsForAssignment.find((c) => c.id === editCollectorId);

    try {
      const authToken = await getToken();

      const body: Record<string, any> = {
        organizationId:   organization?.id,
        phone:            cleanPhone || editPhone,
        address:          cleanAddress,
        nomineeName:      cleanNomineeName,
        nomineeRelation:  cleanNomineeRelation,
        nomineePhone:     cleanNomineePhone,
        nomineeAddress:   cleanNomineeAddress,
        notes:            cleanNotes,
      };
      if (newCollector) {
        body.assignedAgentId   = (newCollector as any).clerkUserId || newCollector.id;
        body.assignedAgentName = newCollector.fullName || (newCollector as any).name || "";
      }

      const resp = await fetch(`/api/update-customer/${editCustomer.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast.error((data as any).error || "Failed to update customer.");
        return;
      }

      // ── Audit log when nominee is overridden on an active loan ──
      if (nomineeChanged && custActiveLoans > 0 && nomineeOverrideReason.trim()) {
        try {
          await createAuditLog({
            organizationId: organization?.id || "",
            actorId:   user?.id || "",
            actorRole: "OWNER",
            actorName: user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner",
            action:    "NOMINEE_OVERRIDE",
            entityType: "Customer",
            entityId:  editCustomer.id,
            metadata: {
              previousNomineeName:     prevNomineeName,
              previousNomineeRelation: prevNomineeRelation,
              newNomineeName:          cleanNomineeName,
              newNomineeRelation:      cleanNomineeRelation,
              reason:                  nomineeOverrideReason.trim(),
              activeLoanCount:         custActiveLoans,
            },
          });
        } catch (_) {}
      }

      fcToast.customerUpdated(editCustomer?.fullName || (editCustomer as any)?.name || undefined);
      setEditCustomer(null);
      setNomineeOverrideReason("");
      setShowNomineeOverride(false);
    } catch (err) {
      fcToast.customerUpdateFailed();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateCustomer) return;
    // Guard: check for active loans
    const custActiveLoans = activeLoansByCustomer[deactivateCustomer.id] || 0;
    if (custActiveLoans > 0) {
      toast.error("Cannot deactivate: customer has active loans. Close loans first.");
      setDeactivateCustomer(null);
      return;
    }
    setDeactivating(true);
    try {
      const isActive = (deactivateCustomer.status as string || "ACTIVE") === "ACTIVE";
      const statusUpdate = { status: isActive ? "INACTIVE" : "ACTIVE", updatedAt: serverTimestamp() };
      await updateDoc(doc(db, "organizationMembers", deactivateCustomer.id), statusUpdate);
      try {
        await updateDoc(doc(db, "customers", deactivateCustomer.id), statusUpdate);
      } catch (_) {}
      const toggledName = (deactivateCustomer as any)?.fullName || (deactivateCustomer as any)?.name || "Customer";
      if (isActive) fcToast.customerDeactivated(toggledName);
      else fcToast.customerReactivated(toggledName);
      setDeactivateCustomer(null);
    } catch { fcToast.customerUpdateFailed("Failed to update customer status."); }
    finally { setDeactivating(false); }
  };

  const handleReassign = async () => {
    if (!reassigningCustomer || !newCollectorId || !organization?.id || !user?.id) return;
    const newCollector = collectorsForAssignment.find((c) => c.id === newCollectorId);
    if (!newCollector) return;
    setIsReassigning(true);
    try {
      await reassignCustomer({
        customerId: reassigningCustomer.id,
        newCollectorId: (newCollector as any).clerkUserId || newCollectorId,
        newCollectorName: newCollector.fullName || (newCollector as any).name || "",
        oldCollectorId: (reassigningCustomer as any).assignedAgentId || "",
        oldCollectorName: (reassigningCustomer as any).assignedAgentName || "",
        changedBy: user.id,
        organizationId: organization.id,
      });
      const newColl = collectorsForAssignment.find((c) => c.id === newCollectorId);
      fcToast.customerReassigned(
        (reassigningCustomer as any).fullName || (reassigningCustomer as any).name || "Customer",
        newColl?.fullName || (newColl as any)?.name || "new collector"
      );
      setReassigningCustomer(null);
      setNewCollectorId("");
    } catch (err) {
      fcToast.customerUpdateFailed(err instanceof Error ? err.message : "Failed to reassign customer");
    } finally {
      setIsReassigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Migration banner: shown only when legacy assignedAgentId data is detected ── */}
      {needsMigration && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Agent assignment data needs a one-time fix</p>
            <p className="text-amber-700 mt-0.5">Some customers were saved with an older format that prevents agents from seeing their assigned customers. This takes a few seconds and is safe to run.</p>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleRunMigration}
            disabled={isMigrating}
          >
            {isMigrating ? "Fixing…" : "Fix Now"}
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Customers</h2>
          <p className="text-slate-500 text-sm">
            Create and manage pigmy savings customers.{" "}
            <span className={`font-semibold ${atLimit ? "text-red-500" : "text-slate-600"}`}>
              {activeCustomers}/{maxCustomers} active
            </span>
          </p>
        </div>

        {atLimit ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Customer limit reached</span>
          </div>
        ) : (
          <Dialog
            open={isInviteOpen}
            onOpenChange={(open) => { setIsInviteOpen(open); if (!open) resetForm(); }}
          >
            <DialogTrigger render={
              <Button className="shrink-0">
                <Plus className="w-4 h-4 mr-2" /> Add Customer
              </Button>
            } />
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">
                  {credentials ? "Customer Created" : "Add Customer"}
                </DialogTitle>
              </DialogHeader>

              {credentials ? (
                <div className="space-y-4 mt-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-sm font-bold text-emerald-800">{credentials.name} — Account Ready</p>
                    </div>
                    <p className="text-xs text-emerald-600 ml-7">
                      Share these credentials with the customer. They must change their password on first sign in.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                    <div className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</p>
                        <p className="text-sm font-medium text-slate-900 truncate">{credentials.email}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(credentials.email, "email")}
                        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                        title="Copy email"
                      >
                        {copiedField === "email" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Temporary Password</p>
                        <p className="text-sm font-mono font-bold text-slate-900 tracking-wider">{credentials.password}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(credentials.password, "password")}
                        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                        title="Copy password"
                      >
                        {copiedField === "password" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
                    <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      The customer will be prompted to set a new password on their first sign in. Keep this credential secure.
                    </p>
                  </div>

                  <Button className="w-full" onClick={() => { setIsInviteOpen(false); resetForm(); }}>
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleAddCustomer} className="space-y-4 mt-2">
                  <p className="text-sm text-slate-500 -mt-2">
                    A temporary password will be generated. Share it with the customer — they'll change it on first sign in.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cust-firstname" className="text-sm font-semibold text-slate-700">
                        First Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cust-firstname"
                        type="text"
                        placeholder="Jane"
                        value={firstName}
                        onChange={(e) => { setFirstName(e.target.value); validateCustomerField("firstName", e.target.value); }}
                        autoComplete="off"
                        className={`h-11 ${formErrors.firstName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={formErrors.firstName} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cust-lastname" className="text-sm font-semibold text-slate-700">
                        Last Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cust-lastname"
                        type="text"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => { setLastName(e.target.value); validateCustomerField("lastName", e.target.value); }}
                        autoComplete="off"
                        className={`h-11 ${formErrors.lastName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={formErrors.lastName} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cust-email" className="text-sm font-semibold text-slate-700">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="cust-email"
                      type="email"
                      placeholder="customer@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); validateCustomerField("email", e.target.value); }}
                      autoComplete="off"
                      className={`h-11 ${formErrors.email ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    />
                    <FieldError error={formErrors.email} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cust-phone" className="text-sm font-semibold text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="cust-phone"
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); validateCustomerField("phone", e.target.value); }}
                      autoComplete="off"
                      maxLength={10}
                      className={`h-11 ${formErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    />
                    <FieldError error={formErrors.phone} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cust-address" className="text-sm font-semibold text-slate-700">
                      Address
                    </Label>
                    <Input
                      id="cust-address"
                      type="text"
                      placeholder="House no, street, city…"
                      value={address}
                      onChange={(e) => { setAddress(e.target.value); validateCustomerField("address", e.target.value); }}
                      autoComplete="off"
                      className={`h-11 ${formErrors.address ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    />
                    <FieldError error={formErrors.address} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cust-notes" className="text-sm font-semibold text-slate-700">
                      Notes
                    </Label>
                    <textarea
                      id="cust-notes"
                      placeholder="Any additional notes…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">
                      Assigned Collector <span className="text-red-500">*</span>
                    </Label>
                    {collectorsLoading ? (
                      <div className="h-11 rounded-md bg-slate-100 animate-pulse" />
                    ) : collectorsForAssignment.length === 0 ? (
                      <div className="h-11 rounded-md border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-400">
                        No active collectors available
                      </div>
                    ) : collectorsForAssignment.length === 1 ? (
                      <div className="h-11 rounded-md border border-emerald-200 bg-emerald-50 px-3 flex items-center gap-2 text-sm text-emerald-800 font-medium">
                        {isOwnerMember(collectorsForAssignment[0]) && (
                          <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="flex-1">
                          {collectorsForAssignment[0].fullName || (collectorsForAssignment[0] as any).name || "Owner"}
                          {isOwnerMember(collectorsForAssignment[0]) && " (Owner)"}
                        </span>
                        <span className="text-xs text-emerald-600 font-normal shrink-0">Auto-assigned</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          value={selectedCollectorId}
                          onChange={(e) => setSelectedCollectorId(e.target.value)}
                          className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 h-11 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          required
                        >
                          <option value="">Select a collector…</option>
                          {collectorsForAssignment.map((c) => (
                            <option key={c.id} value={c.id}>
                              {collectorLabel(c)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold"
                    disabled={isValidating || isSubmitting || collectorsLoading || collectorsForAssignment.length === 0 || !firstName.trim() || !email.trim() || Object.values(formErrors).some(Boolean)}
                  >
                    {isValidating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                    ) : isSubmitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating customer…</>
                    ) : (
                      "Create Customer"
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {atLimit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Customer limit reached ({activeCustomers}/{maxCustomers})
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Upgrade your plan to add more customers.</p>
          </div>
          <button className="flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold shrink-0 transition-all">
            Upgrade
          </button>
        </div>
      )}

      {/* ── Count Stat Card ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 w-fit">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Customers</p>
        <p className="text-2xl font-bold mt-1 text-slate-900">{countAll}</p>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search customers…"
              className="pl-10 h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(sanitizeSearch(e.target.value))}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Assigned Collector</TableHead>
                  <TableHead className="text-right">Savings Balance</TableHead>
                  <TableHead className="text-center">Active Loans</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-0">
                      <EmptyState
                        icon={<Users className="w-8 h-8" />}
                        title={searchTerm ? "No customers match your search." : "No customers yet."}
                        description={!searchTerm ? "Click \"Add Customer\" to add your first savings member." : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((customer) => {
                    const _aid = (customer as any).assignedAgentId || customer.agentId || "";
                    const assignedCollector = allCollectors.find(
                      (c: any) => c.id === _aid || c.clerkUserId === _aid
                    );
                    const savingsBalance = savingsBalanceByCustomer[customer.id] || 0;
                    const activeLoans = activeLoansByCustomer[customer.id] || 0;
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">
                              {customer.fullName || (customer as any).name || (
                                <span className="text-slate-400 italic text-xs">Pending</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 truncate max-w-[160px]">{customer.email || "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {customer.phone || <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                            {assignedCollector && isOwnerMember(assignedCollector) && (
                              <Crown className="w-3 h-3 text-amber-500" />
                            )}
                            {(customer as any).assignedAgentName ||
                              assignedCollector?.fullName ||
                              (assignedCollector as any)?.name || (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold text-sm ${savingsBalance > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                            {savingsBalance > 0 ? `₹${Number(savingsBalance).toLocaleString()}` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {activeLoans > 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                              {activeLoans}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${statusClass(customer.status as string)}`}>
                            {statusLabel(customer.status as string)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenEdit(customer)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Edit customer">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {collectorsForAssignment.length > 1 && (
                              <button onClick={() => {
                              setReassigningCustomer(customer);
                              const _aid2 = (customer as any).assignedAgentId || "";
                              const _mc = collectorsForAssignment.find((c: any) => c.id === _aid2 || c.clerkUserId === _aid2);
                              setNewCollectorId(_mc?.id || "");
                            }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="Reassign">
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => setDeactivateCustomer(customer)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Deactivate/Activate">
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title={searchTerm ? "No customers match your search." : "No customers yet."}
                description={!searchTerm ? "Click \"Add Customer\" to add your first savings member." : undefined}
                compact
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {paginatedCustomers.map((customer) => {
                  const _aidM = (customer as any).assignedAgentId || customer.agentId || "";
                  const assignedCollector = allCollectors.find(
                    (c: any) => c.id === _aidM || c.clerkUserId === _aidM
                  );
                  const savingsBalance = savingsBalanceByCustomer[customer.id] || 0;
                  const activeLoans = activeLoansByCustomer[customer.id] || 0;
                  return (
                    <div key={customer.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {customer.fullName || (customer as any).name || (
                              <span className="text-slate-400 italic">Pending</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{customer.email || "—"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {customer.phone || "—"} ·{" "}
                            {(customer as any).assignedAgentName ||
                              assignedCollector?.fullName ||
                              (assignedCollector as any)?.name ||
                              "Unassigned"}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {savingsBalance > 0 && (
                              <span className="text-xs text-emerald-700 font-semibold">₹{Number(savingsBalance).toLocaleString()} savings</span>
                            )}
                            {activeLoans > 0 && (
                              <span className="text-xs text-indigo-700 font-semibold">{activeLoans} active loan{activeLoans !== 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${statusClass(customer.status as string)}`}>
                            {statusLabel(customer.status as string)}
                          </span>
                          <div className="flex gap-1">
                            <button onClick={() => handleOpenEdit(customer)} className="p-1 rounded text-slate-400 hover:text-emerald-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            {collectorsForAssignment.length > 1 && (
                              <button onClick={() => {
                                setReassigningCustomer(customer);
                                const _aid3 = (customer as any).assignedAgentId || "";
                                const _mc3 = collectorsForAssignment.find((c: any) => c.id === _aid3 || c.clerkUserId === _aid3);
                                setNewCollectorId(_mc3?.id || "");
                              }}
                                className="p-1 rounded text-slate-400 hover:text-sky-600 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => setDeactivateCustomer(customer)} className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors"><UserX className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)}
            </span>{" "}
            of <span className="font-semibold text-slate-700">{filteredCustomers.length}</span> customers
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                      currentPage === page
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Edit Customer Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={(o) => !o && setEditCustomer(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-emerald-600" /> Edit Customer
            </DialogTitle>
          </DialogHeader>
          {editCustomer && (
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="font-semibold text-slate-900 text-sm">{editCustomer.fullName || (editCustomer as any).name || editCustomer.email}</p>
                <p className="text-xs text-slate-500">{editCustomer.email}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+91 98765 43210" />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Address</Label>
                <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="House no, street, city…" />
              </div>

              <div className="space-y-1.5">
                <Label>Assigned Collector</Label>
                <div className="relative">
                  <select value={editCollectorId} onChange={(e) => setEditCollectorId(e.target.value)}
                    className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 h-11 focus:border-slate-400 focus:outline-none">
                    <option value="">— Unassigned —</option>
                    {collectorsForAssignment.map((c) => (
                      <option key={c.id} value={c.id}>{c.fullName || (c as any).name || c.email}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Nominee Name</Label>
                <Input value={editNominee.name} onChange={(e) => setEditNominee({ ...editNominee, name: e.target.value })} placeholder="Nominee full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Relation</Label>
                  <select value={editNominee.relation} onChange={(e) => setEditNominee({ ...editNominee, relation: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:border-slate-400 focus:outline-none">
                    <option value="">Select…</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Son">Son</option>
                    <option value="Daughter">Daughter</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nominee Phone</Label>
                  <Input
                    value={editNominee.phone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditNominee({ ...editNominee, phone: val });
                      if (val.trim()) {
                        const r = validatePhone10(val);
                        setNomineePhoneError(r.valid ? "" : (r.error ?? ""));
                      } else {
                        setNomineePhoneError("");
                      }
                    }}
                    placeholder="+91…"
                  />
                  <FieldError error={nomineePhoneError} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Nominee Address</Label>
                <Input value={editNominee.address} onChange={(e) => setEditNominee({ ...editNominee, address: e.target.value })} placeholder="Nominee's residential address" />
              </div>

              {/* Nominee override reason — required when customer has an active loan */}
              {showNomineeOverride && editCustomer && (activeLoansByCustomer[editCustomer.id] || 0) > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Nominee Override — Active Loan</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        This customer has an active loan. Changing the nominee requires an explicit reason. This action will be logged.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-amber-700">Override Reason *</Label>
                    <textarea
                      value={nomineeOverrideReason}
                      onChange={(e) => setNomineeOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Nominee deceased, court order, customer request with documentation…"
                      className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400" /> Notes</Label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2}
                  placeholder="Internal notes…"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none" />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setEditCustomer(null)}>Cancel</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveEdit} disabled={savingEdit}>
                  {savingEdit ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate Customer Confirm */}
      {deactivateCustomer && (() => {
        const isActive = (deactivateCustomer.status as string || "ACTIVE") === "ACTIVE";
        const hasLoans = (activeLoansByCustomer[deactivateCustomer.id] || 0) > 0;
        const custName = deactivateCustomer.fullName || (deactivateCustomer as any).name || deactivateCustomer.email || "Customer";
        return (
          <ConfirmDialog
            open={!!deactivateCustomer}
            onOpenChange={(o) => !o && setDeactivateCustomer(null)}
            variant={isActive ? "warning" : "info"}
            title={isActive ? `Deactivate ${custName}?` : `Reactivate ${custName}?`}
            description={
              isActive
                ? hasLoans
                  ? `This customer has ${activeLoansByCustomer[deactivateCustomer.id]} active loan(s). Close all loans before deactivating.`
                  : "They will be marked Inactive and blocked from signing in. All records are preserved."
                : "This customer will be able to sign in again."
            }
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

      {/* Reassign Dialog */}
      <Dialog open={!!reassigningCustomer} onOpenChange={(open) => { if (!open) { setReassigningCustomer(null); setNewCollectorId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              Reassign <span className="font-semibold">{reassigningCustomer?.fullName || (reassigningCustomer as any)?.name}</span> to a different collector.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">New Collector</Label>
              <div className="relative">
                <select
                  value={newCollectorId}
                  onChange={(e) => setNewCollectorId(e.target.value)}
                  className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 h-11 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">Select collector…</option>
                  {collectorsForAssignment.map((c) => (
                    <option key={c.id} value={c.id}>{collectorLabel(c)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setReassigningCustomer(null); setNewCollectorId(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!newCollectorId || isReassigning}
                onClick={handleReassign}
              >
                {isReassigning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reassigning…</> : "Reassign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

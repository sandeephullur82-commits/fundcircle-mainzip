import React, { useState, useEffect } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectMember, validateAgentEmail } from "@/lib/services";
import { useOrganization, useUser, useAuth } from "@clerk/clerk-react";
import { where, doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search, Plus, AlertTriangle, UserCheck, Info, Loader2,
  KeyRound, Copy, Check, ShieldCheck, Eye, Pencil, Archive,
  Phone, MapPin, Hash, FileText, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { fcToast } from "@/lib/toast";
import { format } from "date-fns";
import FieldError from "@/components/ui/FieldError";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import {
  sanitizeName, sanitizeEmail, sanitizeMultiline, sanitizeSearch,
  validateEmail, validatePhone10, validateLettersOnlyName,
} from "@/lib/validation";

type CreatedCredentials = { name: string; email: string; password: string; employeeCode?: string };
type AgentStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export default function OrgAgents() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  const { data: members, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT"),
  ]);
  const { data: allCustomers } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AgentStatus>("ALL");

  // Create form
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [address, setAddress] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);

  // View dialog
  const [viewAgent, setViewAgent] = useState<Membership | null>(null);
  const [viewStats, setViewStats] = useState<{ customers: number; collections: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Edit dialog
  const [editAgent, setEditAgent] = useState<Membership | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editStatus, setEditStatus] = useState<AgentStatus>("ACTIVE");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Archive confirm
  const [archiveAgent, setArchiveAgent] = useState<Membership | null>(null);
  const [archiving, setArchiving] = useState(false);

  const filteredCollectors = members.filter((u) => {
    const matchesSearch =
      ((u?.fullName || (u as any)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
      ((u?.phone || "").includes(searchTerm)) ||
      ((u?.email || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
      (((u as any)?.employeeCode || "").toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || ((u as any)?.status || "ACTIVE").toUpperCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const maxCollectors = orgDoc?.limits?.maxAgents || 1;
  const activeCollectors = members.filter((a: any) => (a.status || "ACTIVE").toUpperCase() === "ACTIVE").length;
  const atLimit = activeCollectors >= maxCollectors;

  const customersByAgent: Record<string, number> = {};
  allCustomers.forEach((c: any) => {
    const aid = (c as any).assignedAgentId || c.agentId || "";
    if (aid) customersByAgent[aid] = (customersByAgent[aid] || 0) + 1;
  });

  const statusConfig: Record<string, { label: string; className: string }> = {
    ACTIVE:          { label: "Active",        className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    INACTIVE:        { label: "Inactive",       className: "bg-slate-50 text-slate-600 border-slate-200" },
    ARCHIVED:        { label: "Archived",       className: "bg-red-50 text-red-600 border-red-100" },
    PENDING_SETUP:   { label: "Setup Pending",  className: "bg-amber-50 text-amber-700 border-amber-100" },
    PENDING_INVITED: { label: "Active",         className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    SUSPENDED:       { label: "Suspended",      className: "bg-red-50 text-red-700 border-red-100" },
  };

  const getStatus = (m: any) => {
    const key = ((m.status as string) || "PENDING_SETUP").toUpperCase();
    return statusConfig[key] || { label: key, className: "bg-slate-50 text-slate-600 border-slate-100" };
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setEmployeeCode(""); setAddress(""); setCreateNotes("");
    setCredentials(null); setCopiedField(null); setFormErrors({});
  };

  const validateAgentField = (field: string, value: string) => {
    let error = "";
    if (field === "firstName") {
      const r = validateLettersOnlyName(value, { label: "First name" });
      error = r.valid ? "" : (r.error ?? "");
    } else if (field === "lastName") {
      if (value.trim() && value.trim().length < 2) error = "Minimum 2 characters";
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
    } catch { fcToast.clipboardFailed(); }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    // STEP 1 — Frontend Submit
    console.log("[FC CreateAgent] STEP 1 — Frontend Submit");
    console.log("[FC CreateAgent]   Org ID :", organization?.id ?? "MISSING");
    console.log("[FC CreateAgent]   User ID:", user?.id ?? "MISSING");
    console.log("[FC CreateAgent]   Email  :", email.trim() || "MISSING");

    if (!organization?.id) {
      toast.error("❌ No active organization found. Please sign out and sign back in.");
      return;
    }
    if (!user?.id) {
      toast.error("❌ Authentication Failed — No authenticated user found.");
      return;
    }
    if (atLimit) {
      toast.error(`Collector limit of ${maxCollectors} reached. Upgrade your plan to add more agents.`);
      return;
    }

    // Validate fields
    const submitErrors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) submitErrors.firstName = fnRes.error!;
    const emailRes = validateEmail(email);
    if (!emailRes.valid) submitErrors.email = emailRes.error!;
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) submitErrors.phone = phoneRes.error!;
    }
    if (employeeCode.trim().length > 20) submitErrors.employeeCode = "Maximum 20 characters";
    if (address.trim().length > 500) submitErrors.address = "Maximum 500 characters";
    if (Object.values(submitErrors).some(Boolean)) {
      setFormErrors(submitErrors);
      fcToast.formError();
      return;
    }
    setFormErrors({});

    const emailKey = email.trim().toLowerCase();

    // STEP 1b — Email uniqueness check
    console.log("[FC CreateAgent] STEP 1b — Validating email uniqueness");
    setIsValidating(true);
    try {
      await validateAgentEmail(organization.id, emailKey);
      console.log("[FC CreateAgent] STEP 1b — Email OK");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Email validation failed";
      console.error("[FC CreateAgent] STEP 1b — Email validation failed:", msg);
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("exist")) {
        fcToast.agentCreationFailed("An account with this email already exists.");
      } else {
        fcToast.agentCreationFailed(msg);
      }
      setIsValidating(false);
      return;
    } finally { setIsValidating(false); }

    // STEP 2 — Get auth token and call API
    console.log("[FC CreateAgent] STEP 2 — Obtaining auth token");
    setIsSubmitting(true);
    try {
      let authToken = await getToken();
      if (!authToken) authToken = await getToken({ skipCache: true });
      if (!authToken) {
        fcToast.authError();
        return;
      }
      console.log("[FC CreateAgent] STEP 2 — Auth token obtained, calling API");

      const { generatedPassword, employeeCode: generatedEmpCode } = await createDirectMember({
        firstName: sanitizeName(firstName),
        lastName:  sanitizeName(lastName),
        email:     emailKey,
        phone:     phone.replace(/\D/g, "").slice(0, 10),
        role:      "AGENT",
        organizationId:   organization.id,
        organizationName: organization.name || "",
        createdBy:  user.id,
        actorName:  user.fullName || user.firstName || "",
        address:    sanitizeMultiline(address, 500),
        notes:      sanitizeMultiline(createNotes, 500),
        employeeCode: employeeCode.trim() || undefined,
        authToken:  authToken,
      });

      // STEP 6 — Success
      console.log("[FC CreateAgent] STEP 6 — Success. Employee code:", generatedEmpCode);
      setCredentials({
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: emailKey,
        password: generatedPassword,
        employeeCode: generatedEmpCode,
      });
      fcToast.agentCreated(`${firstName.trim()} ${lastName.trim()}`, undefined);

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create agent";
      console.error("[FC CreateAgent] ✗ Creation failed:", msg);

      // Map server error context to specific user-facing label
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already exist") || msg.toLowerCase().includes("already in use")) {
        fcToast.agentCreationFailed("An account with this email already exists.");
      } else if (msg.includes("token") || msg.includes("Token") || msg.includes("401")) {
        fcToast.authError();
      } else {
        fcToast.agentCreationFailed(msg);
      }
    } finally { setIsSubmitting(false); }
  };

  const handleOpenView = (agent: Membership) => {
    setViewAgent(agent);
  };

  // Real-time collections count listener — fires whenever the view dialog is open
  useEffect(() => {
    if (!viewAgent) {
      setViewStats(null);
      setLoadingStats(false);
      return;
    }
    setLoadingStats(true);
    const agentLookupId = viewAgent.clerkUserId || viewAgent.id;
    const q = query(collection(db, "collections"), where("agentId", "==", agentLookupId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setViewStats({ customers: customersByAgent[viewAgent.id] || 0, collections: snap.size });
        setLoadingStats(false);
      },
      (err) => {
        console.error("[OrgAgents] collections listener error:", err);
        setViewStats({ customers: customersByAgent[viewAgent.id] || 0, collections: 0 });
        setLoadingStats(false);
      }
    );
    return () => unsub();
  }, [viewAgent?.id, viewAgent?.clerkUserId]);

  const handleOpenEdit = (agent: Membership) => {
    setEditAgent(agent);
    setEditPhone(agent.phone || "");
    setEditAddress(agent.address || "");
    setEditStatus((((agent as any).status as AgentStatus) || "ACTIVE"));
    setEditNotes((agent as any).notes || "");
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    if (editPhone.trim()) {
      const phoneRes = validatePhone10(editPhone);
      if (!phoneRes.valid) { toast.error(phoneRes.error); return; }
    }
    if (editAddress.trim().length > 500) { toast.error("Address cannot exceed 500 characters."); return; }
    const cleanPhone = editPhone ? editPhone.replace(/\D/g, "").slice(0, 10) : "";
    const cleanAddress = sanitizeMultiline(editAddress, 500);
    const cleanNotes = sanitizeMultiline(editNotes, 500);
    setSaving(true);
    try {
      await updateDoc(doc(db, "organizationMembers", editAgent.id), {
        phone: cleanPhone || editPhone, address: cleanAddress,
        status: editStatus, notes: cleanNotes, updatedAt: serverTimestamp(),
      });
      fcToast.agentUpdated((editAgent as any)?.fullName || (editAgent as any)?.name);
      setEditAgent(null);
    } catch (err) {
      fcToast.agentUpdateFailed();
    } finally { setSaving(false); }
  };

  const handleArchive = async () => {
    if (!archiveAgent) return;
    setArchiving(true);
    try {
      const currentStatus = ((archiveAgent as any).status || "ACTIVE").toUpperCase();
      const newStatus: AgentStatus = currentStatus === "ACTIVE" ? "INACTIVE"
        : currentStatus === "INACTIVE" ? "ARCHIVED" : "INACTIVE";
      await updateDoc(doc(db, "organizationMembers", archiveAgent.id), {
        status: newStatus, updatedAt: serverTimestamp(),
      });
      fcToast.agentStatusChanged(
        (archiveAgent as any)?.fullName || (archiveAgent as any)?.name || "Agent",
        newStatus
      );
      setArchiveAgent(null);
    } catch { fcToast.agentUpdateFailed("Failed to update agent status."); }
    finally { setArchiving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Agents</h2>
          <p className="text-slate-500 text-sm">Create and manage pigmy collectors for your organization.</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
              <UserCheck className="w-3 h-3" /> Active: {activeCollectors}/{maxCollectors}
            </span>
            {members.filter((a: any) => (a.status || "").toUpperCase() === "INACTIVE").length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                Inactive: {members.filter((a: any) => (a.status || "").toUpperCase() === "INACTIVE").length}
              </span>
            )}
          </div>
        </div>

        {atLimit ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" /> <span>Agent limit reached</span>
          </div>
        ) : (
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={<Button className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Add Agent</Button>} />
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">{credentials ? "Agent Created" : "Add Agent"}</DialogTitle>
              </DialogHeader>

              {credentials ? (
                <div className="space-y-4 mt-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-sm font-bold text-emerald-800">{credentials.name} — Account Ready</p>
                    </div>
                    <p className="text-xs text-emerald-600 ml-7">Share these credentials with the agent.</p>
                  </div>
                  {credentials.employeeCode && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center gap-3">
                      <Hash className="w-4 h-4 text-violet-600 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide">Employee Code</p>
                        <p className="text-base font-mono font-bold text-violet-900 tracking-widest">{credentials.employeeCode}</p>
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                    {[{ label: "Email", value: credentials.email, field: "email" as const },
                      { label: "Temporary Password", value: credentials.password, field: "password" as const }].map(({ label, value, field }) => (
                      <div key={field} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                          <p className={`text-sm font-${field === "password" ? "mono font-bold" : "medium"} text-slate-900 truncate`}>{value}</p>
                        </div>
                        <button onClick={() => copyToClipboard(value, field)}
                          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
                          {copiedField === field ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
                    <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Agent will be prompted to set a new password on first sign in.</p>
                  </div>
                  <Button className="w-full" onClick={() => { setIsOpen(false); resetForm(); }}>Done</Button>
                </div>
              ) : (
                <form onSubmit={handleAddAgent} className="space-y-4 mt-2">
                  <p className="text-sm text-slate-500 -mt-2">A temporary password will be generated and shared with the agent.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>First Name <span className="text-red-500">*</span></Label>
                      <Input placeholder="John" value={firstName}
                        onChange={(e) => { setFirstName(e.target.value); validateAgentField("firstName", e.target.value); }}
                        autoComplete="off"
                        className={formErrors.firstName ? "border-red-400 focus-visible:ring-red-300" : ""} />
                      <FieldError error={formErrors.firstName} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name</Label>
                      <Input placeholder="Doe" value={lastName}
                        onChange={(e) => { setLastName(e.target.value); validateAgentField("lastName", e.target.value); }}
                        autoComplete="off"
                        className={formErrors.lastName ? "border-red-400 focus-visible:ring-red-300" : ""} />
                      <FieldError error={formErrors.lastName} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email Address <span className="text-red-500">*</span></Label>
                    <Input type="email" placeholder="agent@example.com" value={email}
                      onChange={(e) => { setEmail(e.target.value); validateAgentField("email", e.target.value); }}
                      autoComplete="off"
                      className={formErrors.email ? "border-red-400 focus-visible:ring-red-300" : ""} />
                    <FieldError error={formErrors.email} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number</Label>
                    <Input type="tel" placeholder="10-digit mobile" value={phone}
                      onChange={(e) => { setPhone(e.target.value); validateAgentField("phone", e.target.value); }}
                      maxLength={10}
                      className={formErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""} />
                    <FieldError error={formErrors.phone} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee Code <span className="text-slate-400 font-normal text-xs">(optional — auto-generated if blank)</span></Label>
                    <Input
                      placeholder="e.g. EMP001"
                      value={employeeCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, "");
                        setEmployeeCode(val);
                        setFormErrors((prev) => ({ ...prev, employeeCode: val.length > 20 ? "Maximum 20 characters" : "" }));
                      }}
                      maxLength={20}
                      autoComplete="off"
                      className={`font-mono ${formErrors.employeeCode ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    />
                    <FieldError error={formErrors.employeeCode} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input placeholder="Street, City, State" value={address}
                      onChange={(e) => { setAddress(e.target.value); validateAgentField("address", e.target.value); }}
                      className={formErrors.address ? "border-red-400 focus-visible:ring-red-300" : ""} />
                    <FieldError error={formErrors.address} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} rows={2}
                      placeholder="Internal notes about this agent…"
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none" />
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold"
                    disabled={isValidating || isSubmitting || !firstName.trim() || !email.trim() || Object.values(formErrors).some(Boolean)}>
                    {isValidating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                      : isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating agent…</>
                      : "Create Agent"}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sky-800">You can collect payments directly</p>
          <p className="text-xs text-sky-600 mt-0.5">As organization owner, you can record customer collections without an agent. Add agents to expand your team.</p>
        </div>
      </div>

      {atLimit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Agent limit reached ({activeCollectors}/{maxCollectors})</p>
            <p className="text-xs text-amber-600 mt-0.5">Upgrade your plan to add more pigmy collectors.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder="Search by name, email, phone, code…" className="pl-10 h-11"
                value={searchTerm} onChange={(e) => setSearchTerm(sanitizeSearch(e.target.value))} maxLength={100} />
            </div>
            <div className="flex gap-2">
              {(["ALL", "ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Employee Code</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => <TableCell key={j}><div className="h-4 bg-slate-100 rounded animate-pulse w-24" /></TableCell>)}
                    </TableRow>
                  ))
                ) : filteredCollectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-0">
                      <EmptyState
                        icon={<UserCheck className="w-8 h-8" />}
                        title={searchTerm ? "No agents match your search." : "No agents yet."}
                        description={!searchTerm ? "Add your first pigmy collector to start assigning customers." : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCollectors.map((collector) => {
                    const s = getStatus(collector);
                    const custCount = customersByAgent[collector.id] || 0;
                    return (
                      <TableRow key={collector.id}>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {collector.fullName || (collector as any).name || <span className="text-slate-400 italic text-xs">Pending</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{collector.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-600">
                            <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {collector.phone || "—"}</div>
                            {(collector as any).address && <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400"><MapPin className="w-3 h-3" />{(collector as any).address}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-slate-600">{(collector as any).employeeCode || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-700">{custCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${s.className}`}>{s.label}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(collector)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View details">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleOpenEdit(collector)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Edit agent">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setArchiveAgent(collector)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Change status">
                              <Archive className="w-4 h-4" />
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

          {/* Mobile cards */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : filteredCollectors.length === 0 ? (
              <EmptyState
                icon={<UserCheck className="w-7 h-7" />}
                title={searchTerm ? "No agents match your search." : "No agents yet."}
                description={!searchTerm ? "Add your first pigmy collector to start assigning customers." : undefined}
                compact
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCollectors.map((collector) => {
                  const s = getStatus(collector);
                  const custCount = customersByAgent[collector.id] || 0;
                  return (
                    <div key={collector.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {collector.fullName || (collector as any).name || <span className="text-slate-400 italic">Pending</span>}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{collector.email || "—"}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{collector.phone || "—"} · {custCount} customers</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${s.className}`}>{s.label}</span>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => handleOpenView(collector)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleOpenEdit(collector)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600"><Pencil className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Agent Dialog */}
      <Dialog open={!!viewAgent} onOpenChange={(o) => !o && setViewAgent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-sky-600" /> Agent Profile
            </DialogTitle>
          </DialogHeader>
          {viewAgent && (
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xl font-bold text-slate-900">{viewAgent.fullName || (viewAgent as any).name || "—"}</p>
                  <p className="text-sm text-slate-500">{viewAgent.email}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: <Phone className="w-3.5 h-3.5" />, label: "Phone", value: viewAgent.phone || "—" },
                    { icon: <Hash className="w-3.5 h-3.5" />, label: "Employee Code", value: (viewAgent as any).employeeCode || "—" },
                    { icon: <MapPin className="w-3.5 h-3.5" />, label: "Address", value: viewAgent.address || "—" },
                    { icon: <UserCheck className="w-3.5 h-3.5" />, label: "Status", value: ((viewAgent as any).status || "ACTIVE").toUpperCase() },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="bg-white rounded-lg p-2.5 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">{icon}<span className="text-xs">{label}</span></div>
                      <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
                    </div>
                  ))}
                </div>
                {(viewAgent as any).notes && (
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1"><FileText className="w-3.5 h-3.5" /><span className="text-xs">Notes</span></div>
                    <p className="text-sm text-slate-700">{(viewAgent as any).notes}</p>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-center">
                  {loadingStats ? <div className="h-6 bg-sky-100 rounded animate-pulse w-8 mx-auto" /> : <p className="text-2xl font-black text-sky-700">{viewStats?.customers ?? 0}</p>}
                  <p className="text-xs text-sky-600 mt-0.5">Assigned Customers</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  {loadingStats ? <div className="h-6 bg-emerald-100 rounded animate-pulse w-8 mx-auto" /> : <p className="text-2xl font-black text-emerald-700">{viewStats?.collections ?? 0}</p>}
                  <p className="text-xs text-emerald-600 mt-0.5">Total Collections</p>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Joined: {toDate(viewAgent.createdAt).getTime() > 0 ? format(toDate(viewAgent.createdAt), "MMM d, yyyy") : "—"}
              </p>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setViewAgent(null)}>Close</Button>
                <Button className="flex-1 bg-sky-600 hover:bg-sky-700" onClick={() => { setViewAgent(null); handleOpenEdit(viewAgent); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit Agent
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editAgent} onOpenChange={(o) => !o && setEditAgent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-emerald-600" /> Edit Agent
            </DialogTitle>
          </DialogHeader>
          {editAgent && (
            <div className="space-y-4 mt-2">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="font-semibold text-slate-900 text-sm">{editAgent.fullName || (editAgent as any).name || editAgent.email}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Address</Label>
                <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Street, City, State" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["ACTIVE", "INACTIVE", "ARCHIVED"] as AgentStatus[]).map((s) => {
                    const cls = {
                      ACTIVE: editStatus === s ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200",
                      INACTIVE: editStatus === s ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200",
                      ARCHIVED: editStatus === s ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200",
                    }[s];
                    return (
                      <button key={s} type="button" onClick={() => setEditStatus(s)}
                        className={`py-1.5 rounded-lg border text-xs font-bold transition-colors ${cls}`}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400" /> Notes</Label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                  placeholder="Internal notes…"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setEditAgent(null)}>Cancel</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive / Status Change Confirm */}
      {archiveAgent && (() => {
        const currentStatus = ((archiveAgent as any).status || "ACTIVE").toUpperCase();
        const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : currentStatus === "INACTIVE" ? "ARCHIVED" : "INACTIVE";
        const agentName = archiveAgent.fullName || (archiveAgent as any).name || archiveAgent.email || "Agent";
        const custCount = customersByAgent[archiveAgent.id] || 0;
        return (
          <ConfirmDialog
            open={!!archiveAgent}
            onOpenChange={(o) => !o && setArchiveAgent(null)}
            variant={nextStatus === "ARCHIVED" ? "danger" : "warning"}
            title={nextStatus === "ARCHIVED" ? `Archive ${agentName}?` : `Deactivate ${agentName}?`}
            description={
              nextStatus === "INACTIVE"
                ? "Agent will be deactivated. Their assigned customers will remain unchanged."
                : "Agent will be archived (soft delete). All data and collection history is preserved."
            }
            details={[
              { label: "Agent", value: agentName },
              { label: "Assigned Customers", value: String(custCount) },
              { label: "Current Status", value: currentStatus },
              { label: "New Status", value: nextStatus },
            ]}
            confirmLabel={nextStatus === "ARCHIVED" ? "Archive Agent" : "Deactivate Agent"}
            loading={archiving}
            onConfirm={handleArchive}
          />
        );
      })()}
    </div>
  );
}

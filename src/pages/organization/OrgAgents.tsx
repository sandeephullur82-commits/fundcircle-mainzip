import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectMember, validateAgentEmail } from "@/lib/services";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where, doc, updateDoc, serverTimestamp, getDocs, query, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search, Plus, AlertTriangle, UserCheck, Info, Loader2,
  KeyRound, Copy, Check, ShieldCheck, Eye, Pencil, Archive,
  Phone, MapPin, Hash, FileText, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type CreatedCredentials = { name: string; email: string; password: string };
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
    PENDING_INVITED: { label: "Invited",        className: "bg-violet-50 text-violet-700 border-violet-100" },
    SUSPENDED:       { label: "Suspended",      className: "bg-red-50 text-red-700 border-red-100" },
  };

  const getStatus = (m: any) => {
    const key = ((m.status as string) || "PENDING_SETUP").toUpperCase();
    return statusConfig[key] || { label: key, className: "bg-slate-50 text-slate-600 border-slate-100" };
  };

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setEmployeeCode(""); setAddress(""); setCreateNotes("");
    setCredentials(null); setCopiedField(null);
  };

  const copyToClipboard = async (text: string, field: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("Could not copy to clipboard."); }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("[FC OrgAgents] ▶ Add Agent clicked");
    console.log("[FC OrgAgents]   Org ID :", organization?.id ?? "MISSING");
    console.log("[FC OrgAgents]   User ID:", user?.id ?? "MISSING");
    console.log("[FC OrgAgents]   Role   : OWNER (org dashboard)");

    if (!organization?.id) { toast.error("No active organization selected."); return; }
    if (!user?.id) { toast.error("No authenticated owner."); return; }
    if (!firstName.trim()) { toast.error("First name is required."); return; }
    if (!email.trim()) { toast.error("Email address is required."); return; }
    if (atLimit) { toast.error(`Collector limit of ${maxCollectors} reached.`); return; }

    const emailKey = email.trim().toLowerCase();
    setIsValidating(true);
    try {
      await validateAgentEmail(organization.id, emailKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
      setIsValidating(false); return;
    } finally { setIsValidating(false); }

    setIsSubmitting(true);
    try {
      const { generatedPassword } = await createDirectMember({
        firstName: firstName.trim(), lastName: lastName.trim(),
        email: emailKey, phone: phone.trim(),
        role: "AGENT",
        organizationId: organization.id, organizationName: organization.name || "",
        createdBy: user.id, actorName: user.fullName || user.firstName || "",
        address: address.trim(), notes: createNotes.trim(),
        employeeCode: employeeCode.trim() || undefined,
      });
      setCredentials({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), email: emailKey, password: generatedPassword });
      toast.success("Agent account created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create agent");
    } finally { setIsSubmitting(false); }
  };

  const handleOpenView = async (agent: Membership) => {
    setViewAgent(agent);
    setLoadingStats(true);
    try {
      const custCount = customersByAgent[agent.id] || 0;
      const snap = await getDocs(query(collection(db, "collections"), where("agentId", "==", agent.clerkUserId || agent.id)));
      setViewStats({ customers: custCount, collections: snap.size });
    } catch { setViewStats({ customers: customersByAgent[agent.id] || 0, collections: 0 }); }
    finally { setLoadingStats(false); }
  };

  const handleOpenEdit = (agent: Membership) => {
    setEditAgent(agent);
    setEditPhone(agent.phone || "");
    setEditAddress(agent.address || "");
    setEditStatus((((agent as any).status as AgentStatus) || "ACTIVE"));
    setEditNotes((agent as any).notes || "");
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "organizationMembers", editAgent.id), {
        phone: editPhone, address: editAddress,
        status: editStatus, notes: editNotes, updatedAt: serverTimestamp(),
      });
      toast.success("Agent updated successfully.");
      setEditAgent(null);
    } catch (err) {
      toast.error("Failed to update agent.");
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
      toast.success(`Agent status changed to ${newStatus}.`);
      setArchiveAgent(null);
    } catch { toast.error("Failed to update agent status."); }
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
                      <Input placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="off" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name</Label>
                      <Input placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email Address <span className="text-red-500">*</span></Label>
                    <Input type="email" placeholder="agent@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Phone Number</Label>
                      <Input type="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Employee Code</Label>
                      <Input placeholder="EMP001" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input placeholder="Street, City, State" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} rows={2}
                      placeholder="Internal notes about this agent…"
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none" />
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold"
                    disabled={isValidating || isSubmitting || !firstName.trim() || !email.trim()}>
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
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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
                    <TableCell colSpan={6} className="text-center py-12">
                      <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm font-medium">No agents found.</p>
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
              <div className="py-12 text-center">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No agents yet.</p>
              </div>
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

      {/* Archive / Status Change Dialog */}
      <Dialog open={!!archiveAgent} onOpenChange={(o) => !o && setArchiveAgent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Archive className="w-5 h-5" /> Change Agent Status
            </DialogTitle>
          </DialogHeader>
          {archiveAgent && (() => {
            const currentStatus = ((archiveAgent as any).status || "ACTIVE").toUpperCase();
            const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : currentStatus === "INACTIVE" ? "ARCHIVED" : "INACTIVE";
            return (
              <div className="space-y-4 mt-2">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <p className="font-semibold text-amber-900 text-sm">
                    {archiveAgent.fullName || (archiveAgent as any).name || archiveAgent.email}
                  </p>
                  <p className="text-xs text-amber-700">
                    Current status: <strong>{currentStatus}</strong> → New status: <strong>{nextStatus}</strong>
                  </p>
                  <p className="text-xs text-amber-600">
                    {nextStatus === "INACTIVE" && "Agent will be deactivated. Their assigned customers will remain unchanged."}
                    {nextStatus === "ARCHIVED" && "Agent will be archived. This is a soft delete — data is preserved."}
                    {nextStatus === "ACTIVE" && "Agent will be reactivated."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setArchiveAgent(null)}>Cancel</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleArchive} disabled={archiving}>
                    {archiving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : `Set ${nextStatus}`}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

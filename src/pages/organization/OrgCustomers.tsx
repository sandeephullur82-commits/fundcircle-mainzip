import React, { useState, useEffect } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership, SavingsAccount, Loan } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectMember, validateCustomerEmail, reassignCustomer } from "@/lib/services";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where, doc, updateDoc, serverTimestamp, getDocs, query, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search, Plus, AlertTriangle, Crown, Users, ChevronDown, RefreshCw,
  Loader2, KeyRound, Copy, Check, ShieldCheck, Pencil, UserX, Eye, Phone,
  MapPin, FileText, UserCheck,
} from "lucide-react";
import { toast } from "sonner";

type CreatedCredentials = {
  name: string;
  email: string;
  password: string;
};

export default function OrgCustomers() {
  const { user } = useUser();
  const { organization } = useOrganization();

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
  const [customerType, setCustomerType] = useState<"SAVINGS" | "LOAN" | "SAVINGS_LOAN">("SAVINGS_LOAN");
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
  const [editNominee, setEditNominee] = useState({ name: "", relation: "", phone: "" });
  const [editCollectorId, setEditCollectorId] = useState("");
  const [editCustomerType, setEditCustomerType] = useState<"SAVINGS" | "LOAN" | "SAVINGS_LOAN">("SAVINGS_LOAN");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Deactivate state
  const [deactivateCustomer, setDeactivateCustomer] = useState<Membership | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const activeOwners = owners.filter((o: any) => o.status === "ACTIVE" || o.status === "active");
  const activeAgents = agents.filter((a: any) => a.status === "ACTIVE" || a.status === "active");
  const collectorsForAssignment = [...activeOwners, ...activeAgents];
  const collectorsLoading = ownersLoading || agentsLoading;

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";

  const customerCountByCollector: Record<string, number> = {};
  customers.forEach((c: any) => {
    const aid = (c as any).assignedAgentId || c.agentId || "";
    if (aid) customerCountByCollector[aid] = (customerCountByCollector[aid] || 0) + 1;
  });

  const allCollectors = [...owners, ...agents];

  const collectorLabel = (c: any) => {
    const name = c.fullName || (c as any).name || c.email || c.id;
    const count = customerCountByCollector[c.id] || 0;
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

  // Active loan count per customer membership ID
  const activeLoansByCustomer: Record<string, number> = {};
  loans.forEach((l: any) => {
    const st = (l.status || "").toUpperCase();
    if (st === "ACTIVE" && l.customerId) {
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

  const filteredCustomers = customers.filter((u) =>
    ((u?.fullName || (u as any)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((u?.phone || "").includes(searchTerm)) ||
    ((u?.email || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setNotes("");
    setCustomerType("SAVINGS_LOAN");
    setSelectedCollectorId("");
    setCredentials(null);
    setCopiedField(null);
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
    if (!firstName.trim()) { toast.error("First name is required."); return; }
    if (!email.trim()) { toast.error("Email address is required."); return; }
    if (atLimit) { toast.error(`Customer limit of ${maxCustomers} reached.`); return; }

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
      const { generatedPassword } = await createDirectMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: emailKey,
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        role: "CUSTOMER",
        organizationId: organization.id,
        organizationName: organization.name || "",
        assignedAgentId: collectorToAssign.id,
        assignedAgentName: collectorToAssign.fullName || (collectorToAssign as any).name || "",
        assignedCollectorRole: (collectorToAssign.role as string) || "AGENT",
        customerType,
        createdBy: user.id,
        actorName: user.fullName || user.firstName || "",
      });
      setCredentials({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), email: emailKey, password: generatedPassword });
      toast.success("Customer account created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (customer: Membership) => {
    setEditCustomer(customer);
    setEditPhone(customer.phone || "");
    setEditAddress(customer.address || "");
    setEditNominee({
      name: customer.nominee?.name || "",
      relation: customer.nominee?.relation || "",
      phone: customer.nominee?.phone || "",
    });
    setEditCollectorId((customer as any).assignedAgentId || "");
    setEditCustomerType(((customer as any).customerType as any) || "SAVINGS_LOAN");
    setEditNotes((customer as any).notes || "");
  };

  const handleSaveEdit = async () => {
    if (!editCustomer) return;
    setSavingEdit(true);
    const newCollector = collectorsForAssignment.find((c) => c.id === editCollectorId);
    try {
      await updateDoc(doc(db, "organizationMembers", editCustomer.id), {
        phone: editPhone,
        address: editAddress,
        nominee: editNominee,
        customerType: editCustomerType,
        notes: editNotes,
        ...(newCollector ? {
          assignedAgentId: newCollector.id,
          assignedAgentName: newCollector.fullName || (newCollector as any).name || "",
        } : {}),
        updatedAt: serverTimestamp(),
      });
      toast.success("Customer updated successfully.");
      setEditCustomer(null);
    } catch (err) {
      toast.error("Failed to update customer.");
    } finally { setSavingEdit(false); }
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
      await updateDoc(doc(db, "organizationMembers", deactivateCustomer.id), {
        status: isActive ? "INACTIVE" : "ACTIVE",
        updatedAt: serverTimestamp(),
      });
      toast.success(isActive ? "Customer deactivated." : "Customer reactivated.");
      setDeactivateCustomer(null);
    } catch { toast.error("Failed to update customer status."); }
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
        newCollectorId,
        newCollectorName: newCollector.fullName || (newCollector as any).name || "",
        oldCollectorId: (reassigningCustomer as any).assignedAgentId || "",
        oldCollectorName: (reassigningCustomer as any).assignedAgentName || "",
        changedBy: user.id,
        organizationId: organization.id,
      });
      toast.success("Customer reassigned successfully.");
      setReassigningCustomer(null);
      setNewCollectorId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign customer");
    } finally {
      setIsReassigning(false);
    }
  };

  return (
    <div className="space-y-6">
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
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="off"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cust-lastname" className="text-sm font-semibold text-slate-700">
                        Last Name
                      </Label>
                      <Input
                        id="cust-lastname"
                        type="text"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="off"
                        className="h-11"
                      />
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
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="off"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cust-phone" className="text-sm font-semibold text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="cust-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="off"
                      className="h-11"
                    />
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
                      onChange={(e) => setAddress(e.target.value)}
                      autoComplete="off"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">
                      Customer Type <span className="text-red-500">*</span>
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["SAVINGS", "LOAN", "SAVINGS_LOAN"] as const).map((type) => {
                        const labels: Record<string, string> = { SAVINGS: "Savings Only", LOAN: "Loan Only", SAVINGS_LOAN: "Savings + Loan" };
                        const colors: Record<string, string> = {
                          SAVINGS: customerType === type ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-emerald-50",
                          LOAN: customerType === type ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50",
                          SAVINGS_LOAN: customerType === type ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-violet-50",
                        };
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setCustomerType(type)}
                            className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${colors[type]}`}
                          >
                            {labels[type]}
                          </button>
                        );
                      })}
                    </div>
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
                    disabled={isValidating || isSubmitting || collectorsLoading || collectorsForAssignment.length === 0 || !firstName.trim() || !email.trim()}
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

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search customers…"
              className="pl-10 h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
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
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">No customers yet.</p>
                        <p className="text-slate-400 text-xs">Click "Add Customer" to add your first savings member.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const assignedCollector = allCollectors.find(
                      (c) => c.id === ((customer as any).assignedAgentId || customer.agentId)
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
                        <TableCell>
                          {(() => {
                            const ct = (customer as any).customerType as string | undefined;
                            if (ct === "SAVINGS") return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Savings</span>;
                            if (ct === "LOAN") return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">Loan</span>;
                            return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100">S+L</span>;
                          })()}
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
                              <button onClick={() => { setReassigningCustomer(customer); setNewCollectorId((customer as any).assignedAgentId || ""); }}
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
              <div className="py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No customers yet.</p>
                <p className="text-slate-400 text-xs mt-1">Click "Add Customer" to add your first savings member.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const assignedCollector = allCollectors.find(
                    (c) => c.id === ((customer as any).assignedAgentId || customer.agentId)
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
                              <button onClick={() => { setReassigningCustomer(customer); setNewCollectorId((customer as any).assignedAgentId || ""); }}
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
                <Label>Customer Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["SAVINGS", "LOAN", "SAVINGS_LOAN"] as const).map((type) => {
                    const labels: Record<string, string> = { SAVINGS: "Savings Only", LOAN: "Loan Only", SAVINGS_LOAN: "Savings + Loan" };
                    const cls = {
                      SAVINGS: editCustomerType === type ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200",
                      LOAN: editCustomerType === type ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200",
                      SAVINGS_LOAN: editCustomerType === type ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200",
                    }[type];
                    return (
                      <button key={type} type="button" onClick={() => setEditCustomerType(type)}
                        className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${cls}`}>
                        {labels[type]}
                      </button>
                    );
                  })}
                </div>
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
                  <Input value={editNominee.relation} onChange={(e) => setEditNominee({ ...editNominee, relation: e.target.value })} placeholder="Spouse, Child…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nominee Phone</Label>
                  <Input value={editNominee.phone} onChange={(e) => setEditNominee({ ...editNominee, phone: e.target.value })} placeholder="+91…" />
                </div>
              </div>

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

      {/* Deactivate Customer Dialog */}
      <Dialog open={!!deactivateCustomer} onOpenChange={(o) => !o && setDeactivateCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <UserX className="w-5 h-5" /> {deactivateCustomer && (deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" ? "Deactivate" : "Reactivate"} Customer
            </DialogTitle>
          </DialogHeader>
          {deactivateCustomer && (
            <div className="space-y-4 mt-2">
              <div className={`rounded-xl border p-4 space-y-2 ${(deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                <p className="font-semibold text-slate-900 text-sm">{deactivateCustomer.fullName || (deactivateCustomer as any).name || deactivateCustomer.email}</p>
                {(deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" ? (
                  <p className="text-xs text-red-700">
                    This customer will be marked <strong>Inactive</strong>. They will no longer be able to sign in. Existing savings and loan records are preserved.
                    {(activeLoansByCustomer[deactivateCustomer.id] || 0) > 0 && (
                      <><br /><strong className="text-red-800">⚠ This customer has {activeLoansByCustomer[deactivateCustomer.id]} active loan(s). Close them first.</strong></>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700">This customer will be reactivated and can sign in again.</p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setDeactivateCustomer(null)}>Cancel</Button>
                <Button
                  className={`flex-1 ${(deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  onClick={handleDeactivate} disabled={deactivating || ((deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" && (activeLoansByCustomer[deactivateCustomer.id] || 0) > 0)}>
                  {deactivating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> :
                    (deactivateCustomer.status as string || "ACTIVE") === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

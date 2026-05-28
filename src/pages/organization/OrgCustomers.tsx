import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendOrganizationInvitation, validateCustomerInvite } from "@/lib/services";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import { Search, Plus, AlertTriangle, ArrowRight, UserX, Users } from "lucide-react";
import { toast } from "sonner";

const COLLECTION_TYPES = ["Daily", "Weekly", "Monthly"] as const;
type CollectionType = typeof COLLECTION_TYPES[number];

export default function OrgCustomers() {
  const { user } = useUser();
  const { organization } = useOrganization();

  const { data: customers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER")
  ]);
  const { data: agents, loading: agentsLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT")
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);

  const [searchTerm, setSearchTerm] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [initialDeposit, setInitialDeposit] = useState("");
  const [collectionType, setCollectionType] = useState<CollectionType>("Daily");

  const activeAgents = agents.filter((a: any) => a.status === "ACTIVE");
  const noActiveAgent = !agentsLoading && activeAgents.length === 0;

  const filteredCustomers = customers.filter((u) =>
    ((u?.fullName || (u as any)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((u?.phone || "").includes(searchTerm)) ||
    ((u?.email || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const maxCustomers = orgDoc?.limits?.maxCustomers || 10;
  const activeCustomers = customers.filter((c: any) => c.status === "ACTIVE").length;
  const atLimit = activeCustomers >= maxCustomers;

  const statusClass = (status?: string) => {
    if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "INVITED") return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setSelectedAgentId("");
    setInitialDeposit("");
    setCollectionType("Daily");
  };

  const handleInviteCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) { toast.error("No active organization selected."); return; }
    if (!user?.id) { toast.error("Missing authenticated owner identity."); return; }
    if (!fullName.trim()) { toast.error("Customer full name is required."); return; }
    if (!email.trim()) { toast.error("Email address is required."); return; }
    if (!phone.trim()) { toast.error("Phone number is required."); return; }
    if (!selectedAgentId) { toast.error("Please select an assigned collector."); return; }
    if (atLimit) { toast.error(`Customer limit of ${maxCustomers} reached. Please upgrade your plan.`); return; }

    const selectedAgent = activeAgents.find((a) => a.id === selectedAgentId);
    if (!selectedAgent) { toast.error("Assigned agent is not active."); return; }

    const emailKey = email.trim().toLowerCase();

    // Pre-validate
    setIsValidating(true);
    try {
      await validateCustomerInvite(organization.id, emailKey, phone.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
      setIsValidating(false);
      return;
    } finally {
      setIsValidating(false);
    }

    setIsSubmitting(true);
    try {
      const invitedByEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "";
      const result = await sendOrganizationInvitation({
        organization,
        organizationId: organization.id,
        email: emailKey,
        role: "customer",
        clerkRole: "org:customer",
        invitedBy: user.id,
        invitedByEmail,
        fullName: fullName.trim(),
        phone: phone.trim(),
        assignedAgentId: selectedAgent.id,
        assignedAgentName: selectedAgent.fullName || (selectedAgent as any).name || "",
        notes: [
          `Collection Type: ${collectionType}`,
          initialDeposit ? `Initial Deposit: ₹${initialDeposit}` : "",
        ].filter(Boolean).join(" | "),
      });
      toast.success(result.message);
      setIsInviteOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send customer invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!agentsLoading && noActiveAgent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] py-16 px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-7 flex flex-col items-center text-center gap-5 shadow-sm">
            <div className="w-11 h-11 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center">
              <UserX className="w-5 h-5 text-orange-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">No Active Pigmy Collector</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Please add at least one active Pigmy Collector before inviting customers.
              </p>
            </div>
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("fundcircle:switchTab", { detail: "agents" })
                )
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white px-5 py-2.5 text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Collector
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Customers</h2>
          <p className="text-slate-500">
            View and add pigmy savings accounts.{" "}
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
        ) : noActiveAgent ? (
          <div
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 font-medium shrink-0 cursor-not-allowed"
            title="Please add at least one active collector before inviting customers."
          >
            <UserX className="w-4 h-4 shrink-0" />
            <span>No active collector</span>
          </div>
        ) : (
          <Dialog open={isInviteOpen} onOpenChange={(open) => { setIsInviteOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={
              <Button className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Invite Customer</Button>
            } />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">Invite Customer</DialogTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Add a new pigmy savings customer to your organization.
                </p>
              </DialogHeader>

              <form onSubmit={handleInviteCustomer} className="space-y-4 mt-2">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="cust-name" className="text-sm font-semibold text-slate-700">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cust-name"
                    placeholder="e.g. Priya Devi"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    className="h-10"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="cust-email" className="text-sm font-semibold text-slate-700">
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cust-email"
                    type="email"
                    placeholder="customer@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="h-10"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="cust-phone" className="text-sm font-semibold text-slate-700">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cust-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    className="h-10"
                  />
                </div>

                {/* Assigned Agent */}
                <div className="space-y-1.5">
                  <Label htmlFor="cust-agent" className="text-sm font-semibold text-slate-700">
                    Assigned Collector <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="cust-agent"
                    value={selectedAgentId}
                    onChange={e => setSelectedAgentId(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 h-10 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  >
                    <option value="">Select a collector…</option>
                    {activeAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.fullName || (agent as any).name || agent.email || agent.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Collection Type */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Collection Schedule</Label>
                  <div className="flex gap-2">
                    {COLLECTION_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setCollectionType(type)}
                        className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-all ${
                          collectionType === type
                            ? "bg-sky-50 border-sky-300 text-sky-700 shadow-sm"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Initial Deposit (optional) */}
                <div className="space-y-1.5">
                  <Label htmlFor="cust-deposit" className="text-sm font-semibold text-slate-700">
                    Initial Deposit{" "}
                    <span className="text-slate-400 text-xs font-normal">(optional)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                    <Input
                      id="cust-deposit"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={initialDeposit}
                      onChange={e => setInitialDeposit(e.target.value)}
                      className="pl-7 h-10"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={isValidating || isSubmitting}
                >
                  {isValidating ? "Validating…" : isSubmitting ? "Sending Invitation…" : "Send Invitation"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {noActiveAgent && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <UserX className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">No active Pigmy Collector in this organization</p>
            <p className="text-xs text-red-600 mt-0.5">Please add at least one active collector before inviting customers.</p>
          </div>
          <button
            onClick={() => window.location.href = window.location.href.replace("customers", "agents")}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold shrink-0 transition-all"
          >
            Add Collector <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {atLimit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Customer limit reached ({activeCustomers}/{maxCustomers})</p>
            <p className="text-xs text-amber-600 mt-0.5">Upgrade your plan to add more customers.</p>
          </div>
          <button className="flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold shrink-0 transition-all">
            Upgrade <ArrowRight className="w-3.5 h-3.5" />
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
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Assigned Collector</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">No customers found.</p>
                        <p className="text-slate-400 text-xs">Click "Invite Customer" to add your first savings member.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map(customer => {
                    const agent = agents.find(a => a.id === ((customer as any).assignedAgentId || customer.agentId));
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          {customer.fullName || (customer as any).name || (
                            <span className="text-slate-400 italic text-xs">Pending setup</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">{customer.email || "N/A"}</TableCell>
                        <TableCell className="text-slate-600">{customer.phone || <span className="text-slate-400">—</span>}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                            {(customer as any).assignedAgentName || agent?.fullName || (agent as any)?.name || (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${statusClass(customer.status as string)}`}>
                            {(customer as any).status || "INVITED"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List */}
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
                <p className="text-slate-500 text-sm font-medium">No customers found.</p>
                <p className="text-slate-400 text-xs mt-1">Click "Invite Customer" to add your first savings member.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCustomers.map(customer => {
                  const agent = agents.find(a => a.id === ((customer as any).assignedAgentId || customer.agentId));
                  const statusCls = statusClass(customer.status as string);
                  return (
                    <div key={customer.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {customer.fullName || (customer as any).name || <span className="text-slate-400 italic">Pending setup</span>}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{customer.email || "—"} · {customer.phone || "—"}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Collector: {(customer as any).assignedAgentName || agent?.fullName || "Unassigned"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${statusCls}`}>
                        {(customer as any).status || "INVITED"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

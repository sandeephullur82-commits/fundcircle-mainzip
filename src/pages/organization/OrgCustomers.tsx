import React, { useState, useEffect } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendOrganizationInvitation, validateCustomerInvite, reassignCustomer } from "@/lib/services";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import {
  Search, Plus, AlertTriangle, Crown, Users, ChevronDown, RefreshCw, Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function OrgCustomers() {
  const { user } = useUser();
  const { organization } = useOrganization();

  const { data: customers, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "CUSTOMER"),
  ]);
  const { data: agents, loading: agentsLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT"),
  ]);
  // Owner members — owner can also collect payments directly
  const { data: owners, loading: ownersLoading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "OWNER"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);

  const [searchTerm, setSearchTerm] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invite form
  const [email, setEmail] = useState("");
  const [selectedCollectorId, setSelectedCollectorId] = useState("");

  // Reassign modal
  const [reassigningCustomer, setReassigningCustomer] = useState<any>(null);
  const [newCollectorId, setNewCollectorId] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  // Unified collector list: owner first, then active agents
  const activeOwners = owners.filter((o: any) => o.status === "ACTIVE" || o.status === "active");
  const activeAgents = agents.filter((a: any) => a.status === "ACTIVE" || a.status === "active");
  const collectorsForAssignment = [...activeOwners, ...activeAgents];
  const collectorsLoading = ownersLoading || agentsLoading;

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";

  // Customer count per collector
  const customerCountByCollector: Record<string, number> = {};
  customers.forEach((c: any) => {
    const aid = (c as any).assignedAgentId || c.agentId || "";
    if (aid) customerCountByCollector[aid] = (customerCountByCollector[aid] || 0) + 1;
  });

  // All members for display lookups (owner + agent)
  const allCollectors = [...owners, ...agents];

  const collectorLabel = (c: any) => {
    const name = c.fullName || (c as any).name || c.email || c.id;
    const count = customerCountByCollector[c.id] || 0;
    const ownerTag = isOwnerMember(c) ? " · Owner" : "";
    return `${name} (${count})${ownerTag}`;
  };

  // Auto-select if only one active collector
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
    if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "INVITED") return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  const resetInviteForm = () => {
    setEmail("");
    setSelectedCollectorId("");
  };

  const handleInviteCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) { toast.error("No active organization selected."); return; }
    if (!user?.id) { toast.error("Missing authenticated owner identity."); return; }
    if (!email.trim()) { toast.error("Email address is required."); return; }
    if (atLimit) { toast.error(`Customer limit of ${maxCustomers} reached. Please upgrade your plan.`); return; }

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
      await validateCustomerInvite(organization.id, emailKey, "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
      setIsValidating(false);
      return;
    } finally {
      setIsValidating(false);
    }

    setIsSubmitting(true);
    try {
      const invitedByEmail =
        user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "";
      const result = await sendOrganizationInvitation({
        organization,
        organizationId: organization.id,
        email: emailKey,
        role: "customer",
        clerkRole: "org:customer",
        invitedBy: user.id,
        invitedByEmail,
        fullName: "",
        phone: "",
        assignedAgentId: collectorToAssign.id,
        assignedAgentName:
          collectorToAssign.fullName || (collectorToAssign as any).name || "",
      });
      toast.success(result.message);
      setIsInviteOpen(false);
      resetInviteForm();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send customer invitation"
      );
    } finally {
      setIsSubmitting(false);
    }
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Customers</h2>
          <p className="text-slate-500 text-sm">
            View and invite pigmy savings customers.{" "}
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
            onOpenChange={(open) => { setIsInviteOpen(open); if (!open) resetInviteForm(); }}
          >
            <DialogTrigger render={
              <Button className="shrink-0">
                <Plus className="w-4 h-4 mr-2" /> Invite Customer
              </Button>
            } />
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">Invite Customer</DialogTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Send an invitation email. The customer will set up their name, phone, and password when they join.
                </p>
              </DialogHeader>

              <form onSubmit={handleInviteCustomer} className="space-y-5 mt-2">
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
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className="h-11"
                  />
                </div>

                {/* Assigned Collector */}
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
                      <span className="text-xs text-emerald-600 font-normal shrink-0">
                        {customerCountByCollector[collectorsForAssignment[0].id] || 0} customers · Auto-assigned
                      </span>
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
                  disabled={isValidating || isSubmitting || collectorsLoading || collectorsForAssignment.length === 0}
                >
                  {isValidating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                  ) : isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending Invitation…</>
                  ) : (
                    "Send Invitation"
                  )}
                </Button>
              </form>
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

      {/* Customer Table */}
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
                  <TableHead className="w-24"></TableHead>
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
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">No customers yet.</p>
                        <p className="text-slate-400 text-xs">
                          Click "Invite Customer" to add your first savings member.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const assignedCollector = allCollectors.find(
                      (c) => c.id === ((customer as any).assignedAgentId || customer.agentId)
                    );
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          {customer.fullName || (customer as any).name || (
                            <span className="text-slate-400 italic text-xs">Pending setup</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">{customer.email || "—"}</TableCell>
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
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${statusClass(customer.status as string)}`}
                          >
                            {(customer as any).status || "INVITED"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {collectorsForAssignment.length > 1 && (
                            <button
                              onClick={() => {
                                setReassigningCustomer(customer);
                                setNewCollectorId((customer as any).assignedAgentId || "");
                              }}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-sky-600 transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reassign
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
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
                <p className="text-slate-400 text-xs mt-1">
                  Click "Invite Customer" to add your first savings member.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const assignedCollector = allCollectors.find(
                    (c) => c.id === ((customer as any).assignedAgentId || customer.agentId)
                  );
                  return (
                    <div key={customer.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {customer.fullName || (customer as any).name || (
                              <span className="text-slate-400 italic">Pending setup</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {customer.email || "—"} · {customer.phone || "—"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              {assignedCollector && isOwnerMember(assignedCollector) && (
                                <Crown className="w-2.5 h-2.5 text-amber-500" />
                              )}
                              {(customer as any).assignedAgentName || assignedCollector?.fullName || "Unassigned"}
                            </span>
                            {collectorsForAssignment.length > 1 && (
                              <button
                                onClick={() => {
                                  setReassigningCustomer(customer);
                                  setNewCollectorId((customer as any).assignedAgentId || "");
                                }}
                                className="text-xs text-sky-600 underline"
                              >
                                Reassign
                              </button>
                            )}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${statusClass(customer.status as string)}`}
                        >
                          {(customer as any).status || "INVITED"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reassign Customer Modal */}
      <Dialog
        open={!!reassigningCustomer}
        onOpenChange={(open) => { if (!open) { setReassigningCustomer(null); setNewCollectorId(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Reassign Customer</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">
              Change the assigned collector for{" "}
              <span className="font-semibold text-slate-700">
                {reassigningCustomer?.fullName || reassigningCustomer?.name || reassigningCustomer?.email}
              </span>
            </p>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Select New Collector</Label>
              <div className="relative">
                <select
                  value={newCollectorId}
                  onChange={(e) => setNewCollectorId(e.target.value)}
                  className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 h-11 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
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
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setReassigningCustomer(null); setNewCollectorId(""); }}
                disabled={isReassigning}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleReassign}
                disabled={isReassigning || !newCollectorId || newCollectorId === (reassigningCustomer as any)?.assignedAgentId}
              >
                {isReassigning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

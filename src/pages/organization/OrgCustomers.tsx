import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendOrganizationInvitation } from "@/lib/services";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import { Search, Plus, AlertTriangle, ArrowRight, UserX } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  const [email, setEmail] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Realtime active agent gate
  const activeAgents = agents.filter((a) => a.status === "ACTIVE");
  const noActiveAgent = !agentsLoading && activeAgents.length === 0;

  const filteredCustomers = customers.filter((u) =>
    (((u?.fullName || u?.name || "").toLowerCase().includes((searchTerm || "").toLowerCase())) ||
     (u?.phone || "").includes(searchTerm || "") ||
     (u?.email || "").toLowerCase().includes((searchTerm || "").toLowerCase()))
  );

  const maxCustomers = orgDoc?.limits?.maxCustomers ?? -1;
  const activeCustomers = customers.filter((c: any) => c.status === "ACTIVE").length;
  const atLimit = maxCustomers !== -1 && activeCustomers >= maxCustomers;

  const statusClass = (status?: string) => {
    if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "INVITED") return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  const handleInviteCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) { toast.error("No active organization selected. Refresh and try again."); return; }
    if (!email.trim()) { toast.error("Email address is required."); return; }
    if (!selectedAgentId) { toast.error("Please select an assigned Pigmy Collector."); return; }
    if (atLimit) { toast.error(`You've reached the limit of ${maxCustomers} customers for your plan. Please upgrade.`); return; }

    const selectedAgent = activeAgents.find((a) => a.id === selectedAgentId);

    setIsSubmitting(true);
    try {
      if (!user?.id) throw new Error("Missing authenticated owner identity.");
      const invitedByEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "";
      const result = await sendOrganizationInvitation({
        organization,
        organizationId: organization.id,
        email: email.trim().toLowerCase(),
        role: "customer",
        clerkRole: "org:customer",
        invitedBy: user.id,
        invitedByEmail,
        assignedAgentId: selectedAgent?.id || selectedAgentId,
        assignedAgentName: selectedAgent?.fullName || selectedAgent?.name || "",
      });
      toast.success(result.message);
      setIsInviteOpen(false);
      setEmail("");
      setSelectedAgentId("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send customer invitation";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canInvite = !atLimit && !noActiveAgent;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Customers</h2>
          <p className="text-slate-500">
            View and add pigmy savings accounts.
            {maxCustomers !== -1 && (
              <span className={`ml-2 font-semibold ${atLimit ? "text-red-500" : "text-slate-600"}`}>
                {activeCustomers}/{maxCustomers} active
              </span>
            )}
          </p>
        </div>

        {atLimit ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Customer limit reached</span>
          </div>
        ) : noActiveAgent ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 font-medium shrink-0 cursor-not-allowed" title="Please add at least one active Pigmy Collector before inviting customers.">
            <UserX className="w-4 h-4 shrink-0" />
            <span>No active collector</span>
          </div>
        ) : (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger render={
              <Button className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Invite Customer</Button>
            } />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Customer</DialogTitle>
                <p className="text-sm text-slate-500 mt-2">Send an organization invitation to a pigmy savings customer.</p>
              </DialogHeader>
              <form onSubmit={handleInviteCustomer} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cust-email">Email Address</Label>
                  <Input id="cust-email" type="email" placeholder="customer@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-agent">Assigned Pigmy Collector <span className="text-red-500">*</span></Label>
                  <select
                    id="cust-agent"
                    value={selectedAgentId}
                    onChange={e => setSelectedAgentId(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">Select a collector...</option>
                    {activeAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.fullName || agent.name || agent.email || agent.id}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Send Invitation"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* No active agent warning banner */}
      {noActiveAgent && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <UserX className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">No active Pigmy Collector in this organization</p>
            <p className="text-xs text-red-600 mt-0.5">Please add at least one active Pigmy Collector before inviting customers.</p>
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
            <p className="text-sm font-semibold text-amber-800">You've reached your customer limit ({activeCustomers}/{maxCustomers})</p>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input placeholder="Search customers by name or email..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading…</TableCell></TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No customers found.</TableCell></TableRow>
                ) : (
                  filteredCustomers.map(customer => {
                    const agent = agents.find(a => a.id === (customer.assignedAgentId || customer.agentId));
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.fullName || customer.name || "Unnamed Customer"}</TableCell>
                        <TableCell>{customer.email || "N/A"}</TableCell>
                        <TableCell>{customer.phone || "N/A"}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                            {(customer as any).assignedAgentName || agent?.fullName || agent?.name || "Unassigned"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${statusClass(customer.status)}`}>
                            {customer.status || "INVITED"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

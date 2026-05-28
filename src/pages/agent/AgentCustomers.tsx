import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { User } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, IndianRupee, UserPlus } from "lucide-react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { recordCollection, sendOrganizationInvitation, requestPlanUpgrade } from "@/lib/services";
import { where } from "firebase/firestore";
import PlanLimitModal from "@/components/PlanLimitModal";

type AgentCustomersProps = {
  collectorRole?: "OWNER" | "AGENT" | string;
  collectorName?: string;
  collectorId?: string;
};

export default function AgentCustomers({ collectorRole = "AGENT", collectorName = "", collectorId = "" }: AgentCustomersProps) {
  const { user } = useUser();
  const { organization } = useOrganization();

  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id ?? null);
  const { data: allCustomers } = useCollectionRealtime<any>("organizationMembers", [where("role", "==", "CUSTOMER")]);
  const { data: users, loading } = useCollectionRealtime<User>("users");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  // Limit modal state
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [isRequestingUpgrade, setIsRequestingUpgrade] = useState(false);
  const [upgradeRequestSent, setUpgradeRequestSent] = useState(false);

  const agentId = user?.id || "";
  const activeCollectorRole = collectorRole || "AGENT";
  const activeCollectorName = collectorName || user?.fullName || "Collector";
  const activeCollectorId = collectorId || user?.id || "";

  // Plan limits from org doc
  const currentPlan = orgDoc?.plan ?? "free";
  const maxCustomers: number = orgDoc?.limits?.maxCustomers ?? 25;
  const activeCustomerCount = allCustomers.filter((c: any) => c.status === "ACTIVE" || c.status === "INVITED").length;
  const atLimit = activeCustomerCount >= maxCustomers;

  const myCustomers = users.filter(u => u.role === "customer" && u.agentId === agentId &&
    (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.phone?.includes(searchTerm))
  );

  const handleAddCustomerClick = () => {
    if (atLimit) {
      setShowLimitModal(true);
    } else {
      setShowInvite(true);
    }
  };

  const handleRequestUpgrade = async () => {
    if (!organization?.id || !user?.id) return;
    setIsRequestingUpgrade(true);
    try {
      await requestPlanUpgrade({
        organizationId: organization.id,
        agentId: user.id,
        agentName: user.fullName || user.primaryEmailAddress?.emailAddress || "Agent",
        currentPlan,
      });
      setUpgradeRequestSent(true);
      toast.success("Upgrade request sent to your organization owner.");
    } catch {
      toast.error("Failed to send upgrade request.");
    } finally {
      setIsRequestingUpgrade(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !user?.id) return;
    if (atLimit) {
      setShowInvite(false);
      setShowLimitModal(true);
      return;
    }
    setIsInviting(true);
    try {
      await sendOrganizationInvitation({
        organization: organization as any,
        organizationId: organization.id,
        email: inviteEmail.trim(),
        role: "customer",
        clerkRole: "org:customer",
        invitedBy: user.id,
        invitedByEmail: user.primaryEmailAddress?.emailAddress || "",
        assignedAgentId: agentId,
        assignedAgentName: user.fullName || "Agent",
      });
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePhone("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invitation.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedCustomer) return;
    if (Number(amount) <= 0) return toast.error("Enter a valid amount");

    setIsSubmitting(true);
    try {
      await recordCollection(organization.id, {
        customerId: selectedCustomer.id,
        agentId: agentId,
        amount: Number(amount),
        status: "completed",
        collectedByRole: activeCollectorRole,
        collectedByUserId: activeCollectorId,
        collectedByName: activeCollectorName,
      });
      toast.success("Collection recorded successfully");
      setSelectedCustomer(null);
      setAmount("");
    } catch {
      toast.error("Failed to record collection");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <Input
            placeholder="Search your customers..."
            className="pl-10 h-12 bg-white"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button
          onClick={handleAddCustomerClick}
          className="h-12 px-4 gap-2 bg-emerald-600 hover:bg-emerald-700 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Customer</span>
        </Button>
      </div>

      {/* Limit indicator */}
      {atLimit && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm">
          <span className="text-amber-600 font-bold">⚠</span>
          <span className="text-amber-800">
            Customer limit reached ({activeCustomerCount}/{maxCustomers}). Contact your owner to upgrade.
          </span>
          <button
            onClick={() => setShowLimitModal(true)}
            className="ml-auto text-xs font-semibold text-amber-700 underline underline-offset-2 shrink-0"
          >
            Request Upgrade
          </button>
        </div>
      )}

      {/* Customer cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-8">Loading...</div>
        ) : myCustomers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-medium text-slate-500">No customers found</p>
            <p className="text-xs mt-1">Use the "Add Customer" button to invite someone</p>
          </div>
        ) : (
          myCustomers.map(customer => (
            <Card key={customer.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{customer.name}</h3>
                    <p className="text-sm text-slate-500">{customer.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-1">Balance</p>
                    <p className="font-bold text-emerald-600">₹{(customer.balance || 0).toLocaleString()}</p>
                  </div>
                </div>
                <Button
                  onClick={() => setSelectedCustomer(customer)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <IndianRupee className="w-4 h-4 mr-2" /> Collect Daily Savings
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Collect dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Collection</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <form onSubmit={handleCollect} className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg mb-4">
                <p className="text-sm text-slate-500">Customer</p>
                <p className="font-bold text-lg">{selectedCustomer.name}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="text-lg"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Confirm Collection"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite customer dialog */}
      <Dialog open={showInvite} onOpenChange={(open) => { if (!open) { setShowInvite(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4 pt-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-800">
              Customer will be automatically assigned to you.
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                placeholder="Customer's full name"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="customer@email.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                placeholder="Phone number"
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowInvite(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={isInviting}>
                {isInviting ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plan limit modal */}
      <PlanLimitModal
        isOpen={showLimitModal}
        onClose={() => { setShowLimitModal(false); setUpgradeRequestSent(false); }}
        onRequestUpgrade={handleRequestUpgrade}
        isRequesting={isRequestingUpgrade}
        requestSent={upgradeRequestSent}
        currentPlan={currentPlan}
        maxCustomers={maxCustomers}
      />
    </div>
  );
}

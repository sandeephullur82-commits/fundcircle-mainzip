import React, { useState } from "react";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import { Membership } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, IndianRupee, UserPlus, Loader2 } from "lucide-react";
import { useUser, useOrganization, useAuth } from "@clerk/clerk-react";
import { createDirectMember, validateCustomerEmail, requestPlanUpgrade, recordSavingsCollection } from "@/lib/services";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName, sanitizeEmail, validateEmail, validatePhone10, validateLettersOnlyName } from "@/lib/validation";
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
  const { getToken } = useAuth();

  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id ?? null);
  const { data: allCustomers, loading } = useCollectionRealtime<Membership>("organizationMembers", [where("role", "==", "CUSTOMER")]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [isRequestingUpgrade, setIsRequestingUpgrade] = useState(false);
  const [upgradeRequestSent, setUpgradeRequestSent] = useState(false);

  const agentId = user?.id || "";
  const activeCollectorRole = collectorRole || "AGENT";
  const activeCollectorName = collectorName || user?.fullName || "Collector";
  const activeCollectorId = collectorId || user?.id || "";

  const currentPlan = orgDoc?.plan ?? "free";
  const PLAN_CUSTOMER_DEFAULTS: Record<string, number> = { free: 10, starter: 100, growth: 500, enterprise: 5000 };
  const maxCustomers: number = Math.max(orgDoc?.limits?.maxCustomers || PLAN_CUSTOMER_DEFAULTS[currentPlan] || 10, 1);
  const activeCustomerCount = allCustomers.filter((c: any) => c.status === "ACTIVE").length;
  const pendingCustomerCount = allCustomers.filter((c: any) => c.status === "PENDING_SETUP").length;
  const atLimit = activeCustomerCount >= maxCustomers;

  // Show customers assigned to this agent from organizationMembers (correct source)
  const myCustomers = allCustomers.filter((c: any) => {
    const assignedToMe = c.assignedAgentId === agentId || c.assigned_to_user_id === agentId;
    const nameMatch = !searchTerm ||
      ((c.fullName || c.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.phone || "").includes(searchTerm) ||
      (c.email || "").toLowerCase().includes(searchTerm.toLowerCase());
    return assignedToMe && nameMatch;
  });

  const handleAddCustomerClick = () => {
    if (atLimit) {
      setShowLimitModal(true);
    } else {
      setShowAddCustomer(true);
    }
  };

  const handleRequestUpgrade = async () => {
    if (!organization?.id || !user?.id) return;
    setIsRequestingUpgrade(true);
    try {
      await requestPlanUpgrade({
        organizationId: organization.id,
        agentId: user.id,
        agentName: user.fullName || user.primaryEmailAddress?.emailAddress || "Collector",
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

  const resetAddForm = () => {
    setFirstName(""); setLastName(""); setAddEmail(""); setAddPhone("");
    setCreatedPassword(null); setAddErrors({});
  };

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !user?.id) return;
    if (atLimit) {
      setShowAddCustomer(false);
      setShowLimitModal(true);
      return;
    }
    const errors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) errors.firstName = fnRes.error!;
    const emailRes = validateEmail(addEmail);
    if (!emailRes.valid) errors.email = emailRes.error!;
    if (addPhone.trim()) {
      const phoneRes = validatePhone10(addPhone);
      if (!phoneRes.valid) errors.phone = phoneRes.error!;
    }
    if (Object.values(errors).some(Boolean)) {
      setAddErrors(errors);
      toast.error("Please fix the highlighted errors.");
      return;
    }
    setAddErrors({});

    const emailKey = addEmail.trim().toLowerCase();

    setIsValidating(true);
    try {
      await validateCustomerEmail(organization.id, emailKey, addPhone.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
      setIsValidating(false);
      return;
    } finally {
      setIsValidating(false);
    }

    setIsAdding(true);
    try {
      const authToken = await getToken();
      const { generatedPassword } = await createDirectMember({
        firstName: sanitizeName(firstName),
        lastName: sanitizeName(lastName),
        email: emailKey,
        phone: addPhone.replace(/\D/g, "").slice(0, 10),
        role: "CUSTOMER",
        organizationId: organization.id,
        organizationName: organization.name || "",
        assignedAgentId: agentId,
        assignedAgentName: activeCollectorName,
        createdBy: user.id,
        actorName: activeCollectorName,
        authToken: authToken || undefined,
      });
      setCreatedPassword(generatedPassword);
      toast.success("Customer account created successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create customer account.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedCustomer) return;
    const collectAmount = Number(amount);
    if (collectAmount <= 0) return toast.error("Enter a valid amount");

    const memberRecord = selectedCustomer as any;
    if (memberRecord.status !== "ACTIVE") {
      return toast.error("This customer has not activated their account yet.");
    }

    setIsSubmitting(true);
    try {
      await recordSavingsCollection({
        organizationId: organization.id,
        organizationName: organization.name || "FundCircle",
        customerId: memberRecord.id,
        agentId: activeCollectorId,
        agentName: activeCollectorName,
        amount: collectAmount,
      });
      toast.success(`₹${collectAmount.toLocaleString()} collected successfully`);
      setSelectedCustomer(null);
      setAmount("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to record collection");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
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
      {pendingCustomerCount > 0 && !atLimit && (
        <div className="flex items-center gap-2 rounded-2xl bg-sky-50 border border-sky-100 px-4 py-2.5 text-xs text-sky-700">
          <span className="font-semibold">{pendingCustomerCount}</span> customer{pendingCustomerCount > 1 ? "s" : ""} pending account setup
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-8">Loading...</div>
        ) : myCustomers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-medium text-slate-500">No customers found</p>
            <p className="text-xs mt-1">Use the "Add Customer" button to create a new account</p>
          </div>
        ) : (
          myCustomers.map(customer => {
            const c = customer as any;
            const isActive = c.status === "ACTIVE";
            const displayName = c.fullName || c.name || c.email || "Customer";
            return (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-lg text-slate-900">{displayName}</h3>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                          isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {isActive ? "Active" : "Pending"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">{c.phone || c.email}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setSelectedCustomer(customer)}
                    disabled={!isActive}
                    className={`w-full ${isActive ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                    title={isActive ? undefined : "Customer must activate their account first"}
                  >
                    <IndianRupee className="w-4 h-4 mr-2" />
                    {isActive ? "Collect Daily Savings" : "Awaiting Activation"}
                  </Button>
                </CardContent>
              </Card>
            );
          })
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
                <p className="font-bold text-lg">{(selectedCustomer as any).fullName || (selectedCustomer as any).name || selectedCustomer.email}</p>
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
                  min="1"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Confirm Collection"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add customer dialog */}
      <Dialog open={showAddCustomer} onOpenChange={(open) => { if (!open) { setShowAddCustomer(false); resetAddForm(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{createdPassword ? "Customer Created" : "Add New Customer"}</DialogTitle>
          </DialogHeader>

          {createdPassword ? (
            <div className="space-y-4 mt-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-1">
                <p className="text-sm font-semibold text-emerald-800">Account created successfully!</p>
                <p className="text-xs text-emerald-600">Share these credentials with the customer to sign in.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</Label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-mono">{addEmail}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Temporary Password</Label>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-mono">{createdPassword}</div>
                </div>
                <p className="text-xs text-slate-400">Ask the customer to change this after first login.</p>
              </div>
              <Button className="w-full" onClick={() => { setShowAddCustomer(false); resetAddForm(); }}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleAddCustomerSubmit} className="space-y-4 mt-2 pt-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-800">
                Customer will be automatically assigned to you.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="add-fname">First Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="add-fname"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); if (addErrors.firstName) setAddErrors((p) => ({ ...p, firstName: "" })); }}
                    autoComplete="off"
                    className={addErrors.firstName ? "border-red-400 focus-visible:ring-red-300" : ""}
                  />
                  <FieldError error={addErrors.firstName} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-lname">Last Name</Label>
                  <Input
                    id="add-lname"
                    placeholder="Doe"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email <span className="text-red-500">*</span></Label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="customer@email.com"
                  value={addEmail}
                  onChange={(e) => { setAddEmail(e.target.value); if (addErrors.email) setAddErrors((p) => ({ ...p, email: "" })); }}
                  autoComplete="off"
                  className={addErrors.email ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                <FieldError error={addErrors.email} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-phone">Phone</Label>
                <Input
                  id="add-phone"
                  type="tel"
                  placeholder="9876543210"
                  value={addPhone}
                  onChange={(e) => { setAddPhone(e.target.value); if (addErrors.phone) setAddErrors((p) => ({ ...p, phone: "" })); }}
                  autoComplete="off"
                  maxLength={10}
                  className={addErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                <FieldError error={addErrors.phone} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowAddCustomer(false); resetAddForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={isValidating || isAdding || !firstName.trim() || !addEmail.trim() || Object.values(addErrors).some(Boolean)}>
                  {isValidating || isAdding ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isValidating ? "Validating…" : "Creating…"}</>
                  ) : "Create Account"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

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

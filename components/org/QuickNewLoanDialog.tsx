import React, { useState, useMemo, useEffect } from "react";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { createLoan, approveLoan, calculateEMI } from "@/lib/services";
import SearchSelect from "@/components/ui/SearchSelect";
import FieldError from "@/components/ui/FieldError";
import { fcToast } from "@/lib/toast";
import { toast } from "sonner";
import { validateAmount, validateRate, validateTenure } from "@/lib/validation";
import { Loader2, Landmark, IndianRupee } from "lucide-react";
import { Membership } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function QuickNewLoanDialog({ open, onOpenChange }: Props) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = organization?.id || "";

  const { data: members } = useCollectionRealtime<Membership>("organizationMembers");

  const [customerId, setCustomerId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("12");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [createCollectorId, setCreateCollectorId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loanErrors, setLoanErrors] = useState<Record<string, string>>({});

  const customers = useMemo(() =>
    members.filter((m) => ["CUSTOMER", "customer"].includes(m.role as string) && (m as any).status === "ACTIVE"),
    [members]
  );
  const activeOwners = useMemo(() =>
    members.filter((m) => ["OWNER", "owner"].includes(m.role as string) && ["ACTIVE", "active"].includes((m as any).status || "ACTIVE")),
    [members]
  );
  const activeAgents = useMemo(() =>
    members.filter((m) => ["AGENT", "agent"].includes(m.role as string) && ["ACTIVE", "active"].includes((m as any).status || "ACTIVE")),
    [members]
  );
  const collectorsForAssignment = useMemo(() => [...activeOwners, ...activeAgents], [activeOwners, activeAgents]);

  const isOwnerMember = (m: any) => (m?.role || "").toUpperCase() === "OWNER";
  const actorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner";

  const customerOptions = useMemo(() =>
    customers.map((c) => ({
      value: c.id,
      label: c.fullName || (c as any).name || c.email || c.id,
      sublabel: `${c.phone || ""} · ID: ${c.id.slice(-6).toUpperCase()}`,
    })),
    [customers]
  );

  const collectorOptions = useMemo(() =>
    collectorsForAssignment.map((c) => ({
      value: c.id,
      label: isOwnerMember(c) ? `${c.fullName || (c as any).name || c.email} (Owner)` : (c.fullName || (c as any).name || c.email || c.id),
      sublabel: c.email || "",
      badge: isOwnerMember(c) ? "Owner" : undefined,
    })),
    [collectorsForAssignment]
  );

  // Auto-set collector when customer changes
  useEffect(() => {
    if (!customerId) { setCreateCollectorId(""); return; }
    const cust = customers.find((c) => c.id === customerId);
    if (cust && (cust as any).assignedAgentId) {
      const found = collectorsForAssignment.find(
        (c) => c.id === (cust as any).assignedAgentId || (c as any).clerkUserId === (cust as any).assignedAgentId
      );
      if (found) { setCreateCollectorId(found.id); return; }
    }
    if (collectorsForAssignment.length === 1) setCreateCollectorId(collectorsForAssignment[0].id);
    else setCreateCollectorId("");
  }, [customerId, customers, collectorsForAssignment]);

  // Real-time EMI preview
  const principalNum = parseFloat(principal) || 0;
  const rateNum = parseFloat(interestRate) || 0;
  const tenureNum = parseInt(tenureMonths) || 0;
  const previewEMI = principalNum > 0 && rateNum >= 0 && tenureNum > 0
    ? calculateEMI(principalNum, rateNum, tenureNum)
    : null;
  const previewTotal = previewEMI ? previewEMI * tenureNum : 0;
  const previewInterest = previewEMI ? previewTotal - principalNum : 0;

  const resetForm = () => {
    setCustomerId(""); setPrincipal(""); setInterestRate("12");
    setTenureMonths("12"); setCreateCollectorId(""); setLoanErrors({});
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !user?.id) return;

    const errors: Record<string, string> = {};
    if (!customerId) errors.customerId = "Please select a customer";
    const amtRes = validateAmount(principal, { label: "Principal amount", min: 1000, max: 10_000_000 });
    if (!amtRes.valid) errors.principal = amtRes.error!;
    const rateRes = validateRate(interestRate, { label: "Interest rate", max: 100 });
    if (!rateRes.valid) errors.interestRate = rateRes.error!;
    const tenRes = validateTenure(tenureMonths);
    if (!tenRes.valid) errors.tenureMonths = tenRes.error!;
    const tenureN = parseInt(tenureMonths);
    if (!errors.tenureMonths && tenureN > 120) errors.tenureMonths = "Tenure cannot exceed 120 months";
    if (!createCollectorId && collectorsForAssignment.length > 1) errors.collector = "Please select a collector";

    if (Object.values(errors).some(Boolean)) { setLoanErrors(errors); fcToast.formError(); return; }
    setLoanErrors({});

    const collector = collectorsForAssignment.find((c) => c.id === createCollectorId);
    setCreating(true);
    try {
      const loanId = await createLoan({
        organizationId: orgId,
        customerId,
        principalAmount: principalNum,
        interestRate: rateNum,
        tenureMonths: tenureNum,
        createdByActorId: user.id,
        createdByActorRole: "OWNER",
        createdByActorName: actorName,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });

      const firstEmi = new Date();
      firstEmi.setMonth(firstEmi.getMonth() + 1);
      await approveLoan({
        loanId,
        actorId: user.id,
        actorRole: "OWNER",
        actorName,
        approvedAmount: principalNum,
        disbursementDate: new Date(),
        firstEmiDate: firstEmi,
        loanAssignedCollectorId: (collector as any)?.clerkUserId || collector?.id || "",
        loanAssignedCollectorName: collector ? (collector.fullName || (collector as any).name || "") : "",
        loanAssignedCollectorRole: collector ? ((collector.role as string) || "AGENT") : "",
      });

      const custName = customers.find((c) => c.id === customerId);
      fcToast.loanCreated((custName as any)?.fullName || (custName as any)?.name);
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create loan");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Landmark className="w-4 h-4 text-indigo-500" />
            New Loan
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Customer *</Label>
            <SearchSelect
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Search customer…"
              disabled={creating}
            />
            <FieldError error={loanErrors.customerId} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Loan Amount (₹) *</Label>
            <Input
              inputMode="decimal"
              value={principal}
              onChange={e => setPrincipal(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="e.g. 50000"
              className="h-9 text-sm"
              disabled={creating}
            />
            <FieldError error={loanErrors.principal} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Interest Rate (% p.a.) *</Label>
              <Input
                inputMode="decimal"
                value={interestRate}
                onChange={e => setInterestRate(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="12"
                className="h-9 text-sm"
                disabled={creating}
              />
              <FieldError error={loanErrors.interestRate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tenure (months) *</Label>
              <Input
                inputMode="numeric"
                value={tenureMonths}
                onChange={e => setTenureMonths(e.target.value.replace(/\D/g, ""))}
                placeholder="12"
                className="h-9 text-sm"
                disabled={creating}
              />
              <FieldError error={loanErrors.tenureMonths} />
            </div>
          </div>

          {collectorsForAssignment.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Collection Agent *</Label>
              <SearchSelect
                options={collectorOptions}
                value={createCollectorId}
                onChange={setCreateCollectorId}
                placeholder="Select agent"
                disabled={creating}
              />
              <FieldError error={loanErrors.collector} />
            </div>
          )}

          {previewEMI !== null && (
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 space-y-2">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">EMI Preview</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-bold text-indigo-900">₹{previewEMI.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-indigo-500">Monthly EMI</p>
                </div>
                <div>
                  <p className="text-base font-bold text-slate-800">₹{previewInterest.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-slate-400">Interest</p>
                </div>
                <div>
                  <p className="text-base font-bold text-slate-800">₹{previewTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-slate-400">Total Payable</p>
                </div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={creating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-10"
          >
            {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Loan…</> : "Create Loan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

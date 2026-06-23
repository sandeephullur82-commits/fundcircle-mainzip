import React, { useState, useEffect, useMemo } from "react";
import { useUser, useOrganization, useAuth } from "@clerk/clerk-react";
import { where } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollectionRealtime, useDocumentRealtime } from "@/lib/firestore-hooks";
import {
  createDirectMember, validateCustomerEmail,
} from "@/lib/services";
import FieldError from "@/components/ui/FieldError";
import SearchSelect from "@/components/ui/SearchSelect";
import { fcToast } from "@/lib/toast";
import { toast } from "sonner";
import {
  sanitizeName, sanitizeMultiline,
  validateEmail, validatePhone10, validateLettersOnlyName,
} from "@/lib/validation";
import { Loader2, KeyRound, Copy, Check, ShieldCheck, UserPlus } from "lucide-react";
import { Membership } from "@/types";

type CreatedCredentials = { name: string; email: string; password: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function QuickAddCustomerDialog({ open, onOpenChange }: Props) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  const { data: agents } = useCollectionRealtime<Membership>("organizationMembers", [where("role", "==", "AGENT")]);
  const { data: owners } = useCollectionRealtime<Membership>("organizationMembers", [where("role", "==", "OWNER")]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCollectorId, setSelectedCollectorId] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const activeAgents = useMemo(() => agents.filter((a: any) => (a.status || "").toUpperCase() === "ACTIVE"), [agents]);
  const activeOwners = useMemo(() => owners.filter((o: any) => (o.status || "").toUpperCase() === "ACTIVE"), [owners]);
  const collectorsForAssignment = useMemo(() => [...activeOwners, ...activeAgents], [activeOwners, activeAgents]);

  const maxCustomers = orgDoc?.limits?.maxCustomers || 10;

  const collectorOptions = useMemo(() =>
    collectorsForAssignment.map((c) => ({
      value: c.id,
      label: c.fullName || (c as any).name || c.email || c.id,
      sublabel: c.email || "",
      badge: (c.role as string)?.toUpperCase() === "OWNER" ? "Owner" : undefined,
    })),
    [collectorsForAssignment]
  );

  useEffect(() => {
    if (open && collectorsForAssignment.length === 1) {
      setSelectedCollectorId(collectorsForAssignment[0].id);
    }
  }, [open, collectorsForAssignment.length]);

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setAddress(""); setSelectedCollectorId("");
    setCredentials(null); setCopiedField(null); setFormErrors({});
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const copyToClipboard = async (text: string, field: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("Could not copy."); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !user?.id) { toast.error("No active organization."); return; }

    const submitErrors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) submitErrors.firstName = fnRes.error!;
    if (!lastName.trim()) submitErrors.lastName = "Last name is required";
    else if (lastName.trim().length < 2) submitErrors.lastName = "Minimum 2 characters";
    const emailRes = validateEmail(email);
    if (!emailRes.valid) submitErrors.email = emailRes.error!;
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) submitErrors.phone = phoneRes.error!;
    }
    if (Object.values(submitErrors).some(Boolean)) { setFormErrors(submitErrors); fcToast.formError(); return; }
    setFormErrors({});

    const collectorToAssign = collectorsForAssignment.length === 1
      ? collectorsForAssignment[0]
      : collectorsForAssignment.find(c => c.id === selectedCollectorId);
    if (!collectorToAssign) { toast.error("Please select an assigned collector."); return; }

    const emailKey = email.trim().toLowerCase();
    setIsValidating(true);
    try { await validateCustomerEmail(organization.id, emailKey, phone.trim()); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Validation failed"); setIsValidating(false); return; }
    finally { setIsValidating(false); }

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
        notes: "",
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
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      setCredentials({ name: fullName, email: emailKey, password: generatedPassword });
      fcToast.customerCreated(fullName);
    } catch (error) {
      fcToast.customerCreationFailed(error instanceof Error ? error.message : undefined);
    } finally { setIsSubmitting(false); }
  };

  const busy = isValidating || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <UserPlus className="w-4 h-4 text-sky-500" />
            Add Customer
          </DialogTitle>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-900 text-base">{credentials.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Customer created successfully</p>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-100">
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Email</p>
                  <p className="text-sm font-mono text-slate-800 truncate">{credentials.email}</p>
                </div>
                <button onClick={() => copyToClipboard(credentials.email, "email")}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                  {copiedField === "email" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Temp Password</p>
                  <p className="text-sm font-mono text-slate-800 truncate flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    {credentials.password}
                  </p>
                </div>
                <button onClick={() => copyToClipboard(credentials.password, "password")}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                  {copiedField === "password" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Share these credentials with the customer. They can change their password after logging in.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { resetForm(); }}>
                Add Another
              </Button>
              <Button className="flex-1 bg-sky-600 hover:bg-sky-700 text-white" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">First Name *</Label>
                <Input
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value.replace(/[^a-zA-Z\s.]/g, "")); }}
                  onBlur={e => {
                    const r = validateLettersOnlyName(e.target.value, { label: "First name" });
                    setFormErrors(p => ({ ...p, firstName: r.valid ? "" : (r.error ?? "") }));
                  }}
                  placeholder="First name"
                  maxLength={50}
                  className="h-9 text-sm"
                  disabled={busy}
                />
                <FieldError error={formErrors.firstName} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Last Name *</Label>
                <Input
                  value={lastName}
                  onChange={e => setLastName(e.target.value.replace(/[^a-zA-Z\s.]/g, ""))}
                  placeholder="Last name"
                  maxLength={50}
                  className="h-9 text-sm"
                  disabled={busy}
                />
                <FieldError error={formErrors.lastName} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Email *</Label>
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value.toLowerCase())}
                placeholder="customer@email.com"
                className="h-9 text-sm"
                disabled={busy}
              />
              <FieldError error={formErrors.email} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Phone Number</Label>
              <Input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                maxLength={10}
                className="h-9 text-sm"
                disabled={busy}
              />
              <FieldError error={formErrors.phone} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Address</Label>
              <Input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Street, City"
                maxLength={200}
                className="h-9 text-sm"
                disabled={busy}
              />
            </div>

            {collectorsForAssignment.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Assign Collector *</Label>
                <SearchSelect
                  options={collectorOptions}
                  value={selectedCollectorId}
                  onChange={setSelectedCollectorId}
                  placeholder="Select collector"
                  disabled={busy}
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold h-10"
            >
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isValidating ? "Validating…" : "Creating…"}</> : "Create Customer"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

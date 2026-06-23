import React, { useState } from "react";
import { useUser, useOrganization, useAuth } from "@clerk/clerk-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDirectMember, validateAgentEmail } from "@/lib/services";
import FieldError from "@/components/ui/FieldError";
import { fcToast } from "@/lib/toast";
import { toast } from "sonner";
import {
  sanitizeName, sanitizeMultiline,
  validateEmail, validatePhone10, validateLettersOnlyName,
} from "@/lib/validation";
import { Loader2, KeyRound, Copy, Check, ShieldCheck, UserCheck } from "lucide-react";

type CreatedCredentials = { name: string; email: string; password: string; employeeCode?: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function QuickAddAgentDialog({ open, onOpenChange }: Props) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setAddress(""); setCredentials(null); setCopiedField(null); setFormErrors({});
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
    } catch { fcToast.clipboardFailed(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !user?.id) {
      toast.error("No active organization found. Please sign in again.");
      return;
    }

    const submitErrors: Record<string, string> = {};
    const fnRes = validateLettersOnlyName(firstName, { label: "First name" });
    if (!fnRes.valid) submitErrors.firstName = fnRes.error!;
    const emailRes = validateEmail(email);
    if (!emailRes.valid) submitErrors.email = emailRes.error!;
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) submitErrors.phone = phoneRes.error!;
    }
    if (Object.values(submitErrors).some(Boolean)) { setFormErrors(submitErrors); fcToast.formError(); return; }
    setFormErrors({});

    const emailKey = email.trim().toLowerCase();
    setIsValidating(true);
    try {
      await validateAgentEmail(organization.id, emailKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Email validation failed";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exist")) {
        fcToast.agentCreationFailed("An account with this email already exists.");
      } else {
        fcToast.agentCreationFailed(msg);
      }
      setIsValidating(false);
      return;
    } finally { setIsValidating(false); }

    setIsSubmitting(true);
    try {
      let authToken = await getToken();
      if (!authToken) authToken = await getToken({ skipCache: true });
      if (!authToken) { fcToast.authError(); return; }

      const { generatedPassword, employeeCode: generatedEmpCode } = await createDirectMember({
        firstName: sanitizeName(firstName),
        lastName: sanitizeName(lastName),
        email: emailKey,
        phone: phone.replace(/\D/g, "").slice(0, 10),
        role: "AGENT",
        organizationId: organization.id,
        organizationName: organization.name || "",
        createdBy: user.id,
        actorName: user.fullName || user.firstName || "",
        address: sanitizeMultiline(address, 500),
        notes: "",
        authToken,
      });

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      setCredentials({ name: fullName, email: emailKey, password: generatedPassword, employeeCode: generatedEmpCode });
      fcToast.agentCreated(fullName, undefined);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create agent";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already exist")) {
        fcToast.agentCreationFailed("An account with this email already exists.");
      } else if (msg.includes("token") || msg.includes("401")) {
        fcToast.authError();
      } else {
        fcToast.agentCreationFailed(msg);
      }
    } finally { setIsSubmitting(false); }
  };

  const busy = isValidating || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <UserCheck className="w-4 h-4 text-sky-500" />
            Add Collector
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
                {credentials.employeeCode && (
                  <p className="text-xs text-sky-600 font-semibold mt-0.5">ID: {credentials.employeeCode}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">Collector created successfully</p>
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
              Share these credentials with the collector. They can change their password after logging in.
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
                  onChange={e => setFirstName(e.target.value.replace(/[^a-zA-Z\s.]/g, ""))}
                  placeholder="First name"
                  maxLength={50}
                  className="h-9 text-sm"
                  disabled={busy}
                />
                <FieldError error={formErrors.firstName} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Last Name</Label>
                <Input
                  value={lastName}
                  onChange={e => setLastName(e.target.value.replace(/[^a-zA-Z\s.]/g, ""))}
                  placeholder="Last name"
                  maxLength={50}
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Email *</Label>
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value.toLowerCase())}
                placeholder="collector@email.com"
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

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold h-10"
            >
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isValidating ? "Validating…" : "Creating…"}</> : "Create Collector"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

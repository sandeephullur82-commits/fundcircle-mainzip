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
import { where } from "firebase/firestore";
import {
  Search, Plus, AlertTriangle, UserCheck, Info, Loader2,
  KeyRound, Copy, Check, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type CreatedCredentials = {
  name: string;
  email: string;
  password: string;
};

export default function OrgAgents() {
  const { user } = useUser();
  const { organization } = useOrganization();

  const { data: members, loading } = useCollectionRealtime<Membership>("organizationMembers", [
    where("role", "==", "AGENT"),
  ]);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id);

  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);

  const filteredCollectors = members.filter((u) =>
    ((u?.fullName || (u as any)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((u?.phone || "").includes(searchTerm)) ||
    ((u?.email || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const maxCollectors = orgDoc?.limits?.maxAgents || 1;
  const activeCollectors = members.filter((a: any) => a.status === "ACTIVE").length;
  const pendingCollectors = members.filter(
    (a: any) => a.status === "PENDING_SETUP" || a.status === "PENDING_INVITED"
  ).length;
  const atLimit = activeCollectors >= maxCollectors;

  const statusConfig: Record<string, { label: string; className: string }> = {
    ACTIVE:          { label: "Active",        className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    PENDING_SETUP:   { label: "Setup Pending", className: "bg-amber-50 text-amber-700 border-amber-100" },
    PENDING_INVITED: { label: "Invited",       className: "bg-violet-50 text-violet-700 border-violet-100" },
    SUSPENDED:       { label: "Suspended",     className: "bg-red-50 text-red-700 border-red-100" },
  };

  const getStatus = (m: any) => {
    const key = ((m.status as string) || "PENDING_SETUP").toUpperCase();
    return statusConfig[key] || { label: key, className: "bg-slate-50 text-slate-600 border-slate-100" };
  };

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
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

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
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
        role: "AGENT",
        organizationId: organization.id,
        organizationName: organization.name || "",
        createdBy: user.id,
        actorName: user.fullName || user.firstName || "",
      });
      setCredentials({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), email: emailKey, password: generatedPassword });
      toast.success("Agent account created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manage Agents</h2>
          <p className="text-slate-500">Create and manage pigmy collectors for your organization.</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
              <UserCheck className="w-3 h-3" />
              Active: {activeCollectors}/{maxCollectors}
            </span>
            {pendingCollectors > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">
                Pending: {pendingCollectors}
              </span>
            )}
          </div>
        </div>

        {atLimit ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Agent limit reached</span>
          </div>
        ) : (
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={
              <Button className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Add Agent</Button>
            } />
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">
                  {credentials ? "Agent Created" : "Add Agent"}
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
                      Share these credentials with the agent. They must change their password on first sign in.
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
                      The agent will be prompted to set a new password on their first sign in. Keep this credential secure.
                    </p>
                  </div>

                  <Button className="w-full" onClick={() => { setIsOpen(false); resetForm(); }}>
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleAddAgent} className="space-y-4 mt-2">
                  <p className="text-sm text-slate-500 -mt-2">
                    A temporary password will be generated. Share it with the agent — they'll change it on first sign in.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="agent-firstname" className="text-sm font-semibold text-slate-700">
                        First Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="agent-firstname"
                        type="text"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11"
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="agent-lastname" className="text-sm font-semibold text-slate-700">
                        Last Name
                      </Label>
                      <Input
                        id="agent-lastname"
                        type="text"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agent-email" className="text-sm font-semibold text-slate-700">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="agent-email"
                      type="email"
                      placeholder="agent@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11"
                      required
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agent-phone" className="text-sm font-semibold text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="agent-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-11"
                      autoComplete="off"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold"
                    disabled={isValidating || isSubmitting || !firstName.trim() || !email.trim()}
                  >
                    {isValidating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                    ) : isSubmitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating agent…</>
                    ) : (
                      "Create Agent"
                    )}
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
          <p className="text-xs text-sky-600 mt-0.5">
            As the organization owner, you can record customer collections without needing an agent account.
            Add agents below to expand your team and delegate collection routes.
          </p>
        </div>
      </div>

      {atLimit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Agent limit reached ({activeCollectors}/{maxCollectors})</p>
            <p className="text-xs text-amber-600 mt-0.5">Upgrade your plan to add more pigmy collectors.</p>
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
              placeholder="Search agents…"
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
                  <TableHead>Agent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Assigned Area</TableHead>
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
                ) : filteredCollectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <UserCheck className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">No agents yet.</p>
                        <p className="text-slate-400 text-xs">Add your first pigmy collector to get started.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCollectors.map((collector) => {
                    const s = getStatus(collector);
                    return (
                      <TableRow key={collector.id}>
                        <TableCell>
                          <span className="font-medium">
                            {collector.fullName || (collector as any).name || (
                              <span className="text-slate-400 italic text-xs">Pending</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-600">{collector.email || <span className="text-slate-400">—</span>}</TableCell>
                        <TableCell className="text-slate-600">{collector.phone || <span className="text-slate-400">—</span>}</TableCell>
                        <TableCell>{(collector as any).assignedArea || <span className="text-slate-400 text-xs">—</span>}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${s.className}`}>
                            {s.label}
                          </span>
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
                  <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredCollectors.length === 0 ? (
              <div className="py-12 text-center">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No agents yet.</p>
                <p className="text-slate-400 text-xs mt-1">Click "Add Agent" to add your first collector.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCollectors.map((collector) => {
                  const s = getStatus(collector);
                  return (
                    <div key={collector.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {collector.fullName || (collector as any).name || <span className="text-slate-400 italic">Pending</span>}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{collector.email || "—"}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {collector.phone || "—"} · {(collector as any).assignedArea || "—"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border shrink-0 ${s.className}`}>
                        {s.label}
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

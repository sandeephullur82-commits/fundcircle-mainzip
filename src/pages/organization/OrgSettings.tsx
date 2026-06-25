import React, { useState, useEffect, useRef } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { membershipIdFor, createAuditLog } from "@/lib/services";
import { toast } from "sonner";
import ProfileAvatarEditor from "@/components/ui/ProfileAvatarEditor";
import OrgLogoEditor from "@/components/ui/OrgLogoEditor";
import AppSwitch from "@/components/ui/AppSwitch";
import SecuritySection from "@/components/ui/SecuritySection";

import {
  Settings,
  Building2,
  User,
  Bell,
  Save,
  Loader2,
  ChevronRight,
  CheckCircle2,
  Lock,
  Shield,
  Smartphone,
  CreditCard,
  QrCode,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName, validatePhone10 } from "@/lib/validation";

type SectionId = "organization" | "profile" | "notifications" | "security" | "payments";


// ── Save button ────────────────────────────────────────────────────────────────
type SaveState = "idle" | "saving" | "saved";

function SaveButton({ onClick, state, label = "Save Changes" }: {
  onClick: () => void; state: SaveState; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "idle"}
      className={[
        "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold",
        "transition-all duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-offset-2",
        state === "saved"
          ? "bg-emerald-500 text-white"
          : state === "saving"
          ? "bg-sky-400 text-white cursor-not-allowed opacity-90"
          : "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white focus-visible:ring-sky-400 shadow-[0_2px_8px_rgba(14,165,233,0.25)] active:scale-[0.98]",
      ].join(" ")}
    >
      {state === "saving" ? (
        <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
      ) : state === "saved" ? (
        <><CheckCircle2 className="h-4 w-4" />Saved</>
      ) : (
        <><Save className="h-4 w-4" />{label}</>
      )}
    </button>
  );
}

// ── Skeleton loaders ───────────────────────────────────────────────────────────
function SkeletonField() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="h-4 w-28 bg-slate-100 rounded-lg animate-pulse" />
      <div className="h-11 w-full bg-slate-100 rounded-xl animate-pulse" />
    </div>
  );
}

function SkeletonToggleRow() {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-4" aria-hidden="true">
      <div className="space-y-1.5">
        <div className="h-4 w-40 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-3 w-56 bg-slate-100 rounded-lg animate-pulse" />
      </div>
      <div className="h-7 w-14 bg-slate-200 rounded-full animate-pulse ml-4" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OrgSettings() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;

  const { data: membershipDoc, loading: membershipLoading } = useDocumentRealtime<any>("organizationMembers", membershipId);
  const { data: orgDoc, loading: orgLoading } = useDocumentRealtime<any>("organizations", organization?.id || null);

  const [activeSection, setActiveSection] = useState<SectionId>("organization");

  // ── Organization form ──────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState("");
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({});
  const [orgSaveState, setOrgSaveState] = useState<SaveState>("idle");

  // ── Payment settings ───────────────────────────────────────────────────────
  const [upiId,        setUpiId]        = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [upiDefaultNote, setUpiDefaultNote] = useState("");
  const [upiEnabled,   setUpiEnabled]   = useState(true);
  const [paymentErrors,   setPaymentErrors]   = useState<Record<string, string>>({});
  const [paymentSaveState, setPaymentSaveState] = useState<SaveState>("idle");

  // ── Profile form ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaveState, setProfileSaveState] = useState<SaveState>("idle");

  // ── Notification prefs ─────────────────────────────────────────────────────
  const [notifNewCollection, setNotifNewCollection] = useState(true);
  const [notifNewMember, setNotifNewMember] = useState(true);
  const [notifLoanApproval, setNotifLoanApproval] = useState(true);
  const [notifSavingKey, setNotifSavingKey] = useState<string | null>(null);

  const orgLoaded  = useRef(false);
  const profLoaded = useRef(false);

  useEffect(() => {
    if (orgLoading || !orgDoc) return;
    if (orgLoaded.current) return;
    setOrgName(orgDoc.name || organization?.name || "");
    setUpiId(orgDoc.upiId || "");
    setMerchantName(orgDoc.merchantName || "");
    setUpiDefaultNote(orgDoc.upiDefaultNote || "");
    setUpiEnabled(orgDoc.upiEnabled !== false);
    setNotifNewCollection(orgDoc.settings?.notifNewCollection ?? true);
    setNotifNewMember(orgDoc.settings?.notifNewMember ?? true);
    setNotifLoanApproval(orgDoc.settings?.notifLoanApproval ?? true);
    orgLoaded.current = true;
  }, [orgDoc, orgLoading, organization?.name]);

  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as SectionId;
      setActiveSection(section);
    };
    window.addEventListener("fundcircle:settingsSection", handler);
    return () => window.removeEventListener("fundcircle:settingsSection", handler);
  }, []);

  useEffect(() => {
    if (membershipLoading || !membershipDoc) return;
    if (profLoaded.current) return;
    setFullName(membershipDoc.fullName || user?.fullName || "");
    setPhone(membershipDoc.phone || "");
    profLoaded.current = true;
  }, [membershipDoc, membershipLoading, user?.fullName]);

  useEffect(() => {
    orgLoaded.current  = false;
    profLoaded.current = false;
  }, [organization?.id]);

  const actorInfo = {
    id:   user?.id || "",
    role: "OWNER" as const,
    name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner",
  };

  const flashSaved = (setter: (v: SaveState) => void) => {
    setter("saved");
    setTimeout(() => setter("idle"), 2500);
  };

  // ── Save organization settings ─────────────────────────────────────────────
  const saveOrgSettings = async () => {
    if (!organization?.id) return;
    const trimmed = orgName.trim();
    const errors: Record<string, string> = {};
    if (!trimmed) errors.orgName = "Organization name is required.";
    else if (trimmed.length < 3) errors.orgName = "Name must be at least 3 characters.";
    else if (trimmed.length > 100) errors.orgName = "Name cannot exceed 100 characters.";
    if (Object.keys(errors).length) { setOrgErrors(errors); return; }
    setOrgErrors({});
    const prevName = orgDoc?.name || "";
    setOrgSaveState("saving");
    try {
      const sanitized = sanitizeName(trimmed) || trimmed;
      await setDoc(doc(db, "organizations", organization.id), {
        name: sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      try { await organization.update({ name: sanitized }); } catch (_) {}
      setOrgName(sanitized);
      flashSaved(setOrgSaveState);
      toast.success("Organization settings saved.");
      try {
        await createAuditLog({
          organizationId: organization.id,
          actorId: actorInfo.id, actorRole: actorInfo.role, actorName: actorInfo.name,
          action: "SETTINGS_UPDATED", entityType: "Organization", entityId: organization.id,
          metadata: { field: "name", previousValue: prevName, newValue: sanitized },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to save organization settings.");
      setOrgName(prevName);
      setOrgSaveState("idle");
    }
  };

  // ── Auto-save notification toggle ─────────────────────────────────────────
  const handleNotifToggle = async (
    key: "notifNewCollection" | "notifNewMember" | "notifLoanApproval",
    newVal: boolean,
  ) => {
    if (key === "notifNewCollection") setNotifNewCollection(newVal);
    if (key === "notifNewMember")     setNotifNewMember(newVal);
    if (key === "notifLoanApproval")  setNotifLoanApproval(newVal);
    setNotifSavingKey(key);
    try {
      await setDoc(doc(db, "organizations", organization!.id), {
        settings: { [key]: newVal },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Preferences updated.");
    } catch {
      if (key === "notifNewCollection") setNotifNewCollection(!newVal);
      if (key === "notifNewMember")     setNotifNewMember(!newVal);
      if (key === "notifLoanApproval")  setNotifLoanApproval(!newVal);
      toast.error("Failed to save preference.");
    } finally { setNotifSavingKey(null); }
  };

  // ── Save profile ───────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!user || !membershipId) return;
    const errors: Record<string, string> = {};
    const trimmedName = fullName.trim();
    if (!trimmedName) errors.fullName = "Full name is required.";
    else if (trimmedName.length < 2) errors.fullName = "Name must be at least 2 characters.";
    else if (trimmedName.length > 100) errors.fullName = "Name cannot exceed 100 characters.";
    if (phone.trim()) {
      const phoneRes = validatePhone10(phone);
      if (!phoneRes.valid) errors.phone = phoneRes.error!;
    }
    if (Object.keys(errors).length) { setProfileErrors(errors); return; }
    setProfileErrors({});
    const prevName  = membershipDoc?.fullName || user?.fullName || "";
    const prevPhone = membershipDoc?.phone || "";
    const cleanPhone = phone.replace(/\D/g, "").slice(0, 10);
    const sanitizedName = sanitizeName(trimmedName) || trimmedName;
    setProfileSaveState("saving");
    try {
      await setDoc(doc(db, "organizationMembers", membershipId), {
        fullName: sanitizedName, phone: cleanPhone, updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "users", user.id), {
        name: sanitizedName, phone: cleanPhone, updatedAt: serverTimestamp(),
      }, { merge: true });
      setFullName(sanitizedName);
      setPhone(cleanPhone);
      flashSaved(setProfileSaveState);
      toast.success("Profile updated successfully.");
      try {
        await createAuditLog({
          organizationId: organization?.id || "",
          actorId: actorInfo.id, actorRole: actorInfo.role, actorName: actorInfo.name,
          action: "SETTINGS_UPDATED", entityType: "OrganizationMember", entityId: membershipId,
          metadata: { field: "profile", previousValue: { fullName: prevName, phone: prevPhone }, newValue: { fullName: sanitizedName, phone: cleanPhone } },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to update profile.");
      setFullName(prevName);
      setPhone(prevPhone);
      setProfileSaveState("idle");
    }
  };

  // ── Save payment settings ──────────────────────────────────────────────────
  const savePaymentSettings = async () => {
    if (!organization?.id) return;
    const cleanUpi  = upiId.trim().toLowerCase();
    const errors: Record<string, string> = {};
    if (cleanUpi && !/^[a-zA-Z0-9._+\-]{3,}@[a-zA-Z]{3,}$/.test(cleanUpi)) {
      errors.upiId = "Invalid UPI ID. Example: merchant@okaxis or 9876543210@ybl";
    }
    if (Object.keys(errors).length) { setPaymentErrors(errors); return; }
    setPaymentErrors({});
    setPaymentSaveState("saving");
    try {
      await setDoc(doc(db, "organizations", organization.id), {
        upiId:          cleanUpi || null,
        merchantName:   merchantName.trim() || null,
        upiDefaultNote: upiDefaultNote.trim() || null,
        upiEnabled,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      flashSaved(setPaymentSaveState);
      toast.success("Payment settings saved.");
      try {
        await createAuditLog({
          organizationId: organization.id,
          actorId: actorInfo.id, actorRole: actorInfo.role, actorName: actorInfo.name,
          action: "SETTINGS_UPDATED", entityType: "Organization", entityId: organization.id,
          metadata: { field: "paymentSettings" },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to save payment settings.");
      setPaymentSaveState("idle");
    }
  };

  const sections: { id: SectionId; label: string; icon: React.ComponentType<any> }[] = [
    { id: "organization",  label: "Organization",  icon: Building2 },
    { id: "payments",      label: "Payments",      icon: CreditCard },
    { id: "profile",       label: "Profile",       icon: User      },
    { id: "notifications", label: "Notifications", icon: Bell      },
    { id: "security",      label: "Security",      icon: Shield    },
  ];

  const isLoading = orgLoading || membershipLoading;

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-slate-500" />
          Settings
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Manage your organization and account preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">

        {/* ── Sidebar nav ─────────────────────────────────────────────── */}
        <nav aria-label="Settings sections" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm h-fit">
          {sections.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl",
                  "text-sm font-medium transition-all duration-150 outline-none min-h-[48px]",
                  "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1",
                  isActive
                    ? "bg-gradient-to-r from-sky-50 to-blue-50 text-sky-700 shadow-sm border border-sky-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5">
                  <s.icon className={`h-4 w-4 ${isActive ? "text-sky-600" : "text-slate-400"}`} />
                  {s.label}
                </div>
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform duration-150 ${
                    isActive ? "opacity-60 translate-x-0.5" : "opacity-30"
                  }`}
                />
              </button>
            );
          })}
        </nav>

        {/* ── Content panels ──────────────────────────────────────────── */}
        <main className="space-y-5" aria-label="Settings content">

          {/* ── Organization ─────────────────────────────────────────── */}
          {activeSection === "organization" && (
            <>
            {/* Organization Logo Card */}
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-sky-500" />
                  Organization Logo
                </CardTitle>
                <CardDescription>Upload or update your organization's logo. This appears across all dashboards.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-4">
                <OrgLogoEditor size="lg" />
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-sky-500" />
                  Organization Settings
                </CardTitle>
                <CardDescription>Update your organization's basic information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isLoading ? (
                  <div role="status" aria-label="Loading organization settings">
                    <SkeletonField />
                    <div className="mt-5"><SkeletonField /></div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="org-name" className="text-slate-700 font-medium">
                        Organization Name
                      </Label>
                      <Input
                        id="org-name"
                        value={orgName}
                        onChange={(e) => {
                          setOrgName(e.target.value);
                          const v = e.target.value.trim();
                          if (!v) setOrgErrors({ orgName: "Required." });
                          else if (v.length < 3) setOrgErrors({ orgName: "Minimum 3 characters." });
                          else if (v.length > 100) setOrgErrors({ orgName: "Maximum 100 characters." });
                          else setOrgErrors({});
                        }}
                        placeholder="Organization name"
                        maxLength={100}
                        aria-invalid={!!orgErrors.orgName}
                        className={`rounded-xl h-11 ${orgErrors.orgName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={orgErrors.orgName} />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-medium">Owner Email</Label>
                      <div
                        role="textbox"
                        aria-readonly="true"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                    </div>

                    <SaveButton onClick={saveOrgSettings} state={orgSaveState} label="Save Changes" />
                  </>
                )}
              </CardContent>
            </Card>
            </>
          )}

          {/* ── Payments ─────────────────────────────────────────────── */}
          {activeSection === "payments" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-indigo-500" />
                  Payment Settings
                </CardTitle>
                <CardDescription>Configure UPI to accept digital payments from customers and agents.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {orgLoading ? (
                  <div role="status" aria-label="Loading payment settings">
                    <SkeletonField />
                    <div className="mt-5"><SkeletonField /></div>
                    <div className="mt-5"><SkeletonField /></div>
                  </div>
                ) : (
                  <>
                    {/* Enable/Disable toggle */}
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <QrCode className="h-5 w-5 text-indigo-500 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">UPI Payments</p>
                          <p className="text-xs text-slate-500">Enable QR-based UPI collection during EMI recording</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUpiEnabled(!upiEnabled)}
                        aria-label={upiEnabled ? "Disable UPI payments" : "Enable UPI payments"}
                        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 rounded-full"
                      >
                        {upiEnabled
                          ? <ToggleRight className="h-8 w-8 text-indigo-600" />
                          : <ToggleLeft className="h-8 w-8 text-slate-400" />
                        }
                      </button>
                    </div>

                    {/* Merchant Name */}
                    <div className="grid gap-2">
                      <Label htmlFor="merchant-name" className="text-slate-700 font-medium">
                        Merchant / Business Name
                        <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                      </Label>
                      <Input
                        id="merchant-name"
                        type="text"
                        value={merchantName}
                        onChange={(e) => setMerchantName(e.target.value.slice(0, 50))}
                        placeholder={orgDoc?.name || "Your business name"}
                        maxLength={50}
                        className="rounded-xl h-11"
                      />
                      <p className="text-[11px] text-slate-400">
                        Shown to customers during UPI payment. Defaults to your organization name if left empty.
                      </p>
                    </div>

                    {/* UPI ID */}
                    <div className="grid gap-2">
                      <Label htmlFor="upi-id" className="text-slate-700 font-medium flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-indigo-500" />
                        Merchant UPI ID
                      </Label>
                      <Input
                        id="upi-id"
                        type="text"
                        inputMode="email"
                        value={upiId}
                        onChange={(e) => {
                          setUpiId(e.target.value.toLowerCase().replace(/\s/g, ""));
                          setPaymentErrors((p) => ({ ...p, upiId: "" }));
                        }}
                        placeholder="yourorg@okaxis  or  9876543210@ybl"
                        maxLength={80}
                        aria-invalid={!!paymentErrors.upiId}
                        className={`rounded-xl h-11 font-mono text-sm ${paymentErrors.upiId ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      {paymentErrors.upiId
                        ? <FieldError error={paymentErrors.upiId} />
                        : <p className="text-[11px] text-slate-400 leading-relaxed">
                            Agents use this UPI ID to generate QR codes during EMI collection. Accepted by PhonePe, Google Pay, Paytm &amp; BHIM.
                          </p>
                      }

                      {/* Live QR preview */}
                      {upiId.trim() && (
                        <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                          <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">QR Preview</p>
                          <div className="p-2 rounded-xl border-2 border-indigo-200 bg-white shadow-sm">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(merchantName.trim() || orgDoc?.name || "Merchant")}&cu=INR`)}&bgcolor=ffffff&color=1e1b4b&margin=6&qzone=1`}
                              alt="UPI QR preview"
                              width={140}
                              height={140}
                              className="rounded-lg"
                            />
                          </div>
                          <p className="text-[10px] text-indigo-600 font-mono">{upiId.trim()}</p>
                        </div>
                      )}
                    </div>

                    {/* Default Payment Note */}
                    <div className="grid gap-2">
                      <Label htmlFor="upi-note" className="text-slate-700 font-medium">
                        Default Payment Note
                        <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                      </Label>
                      <Input
                        id="upi-note"
                        type="text"
                        value={upiDefaultNote}
                        onChange={(e) => setUpiDefaultNote(e.target.value.slice(0, 80))}
                        placeholder="e.g. EMI Payment, Monthly Installment"
                        maxLength={80}
                        className="rounded-xl h-11 text-sm"
                      />
                      <p className="text-[11px] text-slate-400">
                        Pre-filled in the UPI transaction note. Customers can still edit this in their UPI app.
                      </p>
                    </div>

                    <SaveButton onClick={savePaymentSettings} state={paymentSaveState} label="Save Payment Settings" />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Profile ──────────────────────────────────────────────── */}
          {activeSection === "profile" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-sky-500" />
                  Profile Settings
                </CardTitle>
                <CardDescription>Update your personal information and contact details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {membershipLoading ? (
                  <div role="status" aria-label="Loading profile settings">
                    <SkeletonField />
                    <div className="mt-5"><SkeletonField /></div>
                    <div className="mt-5"><SkeletonField /></div>
                  </div>
                ) : (
                  <>
                    {/* Profile Photo */}
                    <div className="flex flex-col items-center pb-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-700 mb-3 self-start">Profile Photo</p>
                      <ProfileAvatarEditor
                        fallbackLetter={user?.firstName?.charAt(0) || "O"}
                        accentColor="sky"
                        size="lg"
                        membershipId={membershipId}
                        userId={user?.id}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="full-name" className="text-slate-700 font-medium">Full Name</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          const v = e.target.value.trim();
                          if (!v) setProfileErrors((p) => ({ ...p, fullName: "Required." }));
                          else if (v.length < 2) setProfileErrors((p) => ({ ...p, fullName: "Minimum 2 characters." }));
                          else if (v.length > 100) setProfileErrors((p) => ({ ...p, fullName: "Maximum 100 characters." }));
                          else setProfileErrors((p) => ({ ...p, fullName: "" }));
                        }}
                        placeholder="Your full name"
                        maxLength={100}
                        aria-invalid={!!profileErrors.fullName}
                        className={`rounded-xl h-11 ${profileErrors.fullName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={profileErrors.fullName} />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone-number" className="text-slate-700 font-medium">Phone Number</Label>
                      <Input
                        id="phone-number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").substring(0, 10);
                          setPhone(v);
                          if (v && v.length !== 10)
                            setProfileErrors((p) => ({ ...p, phone: "Must be exactly 10 digits." }));
                          else
                            setProfileErrors((p) => ({ ...p, phone: "" }));
                        }}
                        placeholder="9876543210"
                        aria-invalid={!!profileErrors.phone}
                        className={`rounded-xl h-11 ${profileErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={profileErrors.phone} />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-medium">Email Address</Label>
                      <div
                        role="textbox"
                        aria-readonly="true"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                      <p className="text-xs text-slate-400">Email is managed by your authentication provider.</p>
                    </div>

                    <SaveButton onClick={saveProfile} state={profileSaveState} label="Save Profile" />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Notifications ────────────────────────────────────────── */}
          {activeSection === "notifications" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-sky-500" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>Changes save automatically when you toggle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {orgLoading ? (
                  <div role="status" aria-label="Loading notification preferences">
                    <SkeletonToggleRow />
                    <div className="mt-3"><SkeletonToggleRow /></div>
                    <div className="mt-3"><SkeletonToggleRow /></div>
                  </div>
                ) : (
                  <fieldset className="space-y-3 border-0 p-0 m-0">
                    <legend className="sr-only">Notification preferences</legend>
                    {([
                      { key: "notifNewCollection" as const, label: "New Collection Recorded", desc: "Notify when any agent records a collection.", value: notifNewCollection },
                      { key: "notifNewMember"     as const, label: "New Member Added",         desc: "Notify when a new agent or customer is added to the organization.", value: notifNewMember },
                      { key: "notifLoanApproval"  as const, label: "Loan Approval Requests",  desc: "Notify when a customer submits a new loan application.", value: notifLoanApproval },
                    ] as const).map((item) => (
                      <div
                        key={item.key}
                        className={[
                          "flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all duration-200",
                          item.value
                            ? "border-sky-100 bg-gradient-to-r from-sky-50/60 to-blue-50/40 shadow-sm"
                            : "border-slate-100 bg-slate-50/60",
                        ].join(" ")}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                        </div>
                        {notifSavingKey === item.key ? (
                          <Loader2 className="h-5 w-5 text-slate-400 animate-spin shrink-0" />
                        ) : (
                          <AppSwitch
                            value={item.value}
                            ariaLabel={`${item.label}: ${item.value ? "enabled" : "disabled"}`}
                            onChange={(v) => handleNotifToggle(item.key, v)}
                          />
                        )}
                      </div>
                    ))}
                  </fieldset>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Security ─────────────────────────────────────────────── */}
          {activeSection === "security" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-sky-500" />
                  Security
                </CardTitle>
                <CardDescription>Manage your password, active sessions, and email addresses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SecuritySection title={false} />
              </CardContent>
            </Card>
          )}

        </main>
      </div>
    </div>
  );
}

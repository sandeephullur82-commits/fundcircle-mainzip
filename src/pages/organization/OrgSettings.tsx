import React, { useState, useEffect, useRef } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { doc, setDoc, serverTimestamp, updateDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { membershipIdFor, createAuditLog } from "@/lib/services";
import { toast } from "sonner";

import {
  Settings,
  Building2,
  User,
  Shield,
  Bell,
  Save,
  Loader2,
  ChevronRight,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Check,
  Lock,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName, validatePhone10 } from "@/lib/validation";

type SectionId = "organization" | "profile" | "notifications" | "ui" | "security";

// ── Premium Toggle ────────────────────────────────────────────────────────────
interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

function Toggle({ value, onChange, ariaLabel, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !disabled) {
            e.preventDefault();
            onChange(!value);
          }
        }}
        className={[
          "relative shrink-0 rounded-full transition-all duration-200 outline-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500",
          "min-w-[56px] h-7",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          value
            ? "bg-gradient-to-r from-sky-500 to-sky-600 shadow-[0_0_0_1px_rgba(14,165,233,0.3),0_2px_8px_rgba(14,165,233,0.3)]"
            : "bg-slate-200 hover:bg-slate-300",
        ].join(" ")}
        style={{ minHeight: 48, minWidth: 56, display: "flex", alignItems: "center" }}
      >
        <span
          className={[
            "absolute top-1/2 -translate-y-1/2 flex items-center justify-center",
            "h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200",
            value ? "translate-x-[calc(56px-24px)]" : "translate-x-1",
          ].join(" ")}
        >
          {value && (
            <Check
              className="w-2.5 h-2.5 text-sky-600"
              strokeWidth={3}
              aria-hidden="true"
            />
          )}
        </span>
      </button>
      <span
        className={[
          "text-xs font-semibold tracking-wide select-none transition-colors duration-200 min-w-[52px]",
          value ? "text-sky-600" : "text-slate-400",
        ].join(" ")}
        aria-hidden="true"
      >
        {value ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

// ── Save button ───────────────────────────────────────────────────────────────
type SaveState = "idle" | "saving" | "saved";

function SaveButton({
  onClick,
  state,
  label = "Save Changes",
}: {
  onClick: () => void;
  state: SaveState;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "idle"}
      aria-live="polite"
      aria-label={
        state === "saving" ? "Saving changes…" :
        state === "saved"  ? "Changes saved successfully" :
        label
      }
      className={[
        "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold",
        "transition-all duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-offset-2",
        state === "saved"
          ? "bg-emerald-500 hover:bg-emerald-600 text-white focus-visible:ring-emerald-400 shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
          : state === "saving"
          ? "bg-sky-400 text-white cursor-not-allowed opacity-90"
          : "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white focus-visible:ring-sky-400 shadow-[0_2px_8px_rgba(14,165,233,0.25)] hover:shadow-[0_4px_12px_rgba(14,165,233,0.35)] active:scale-[0.98]",
      ].join(" ")}
    >
      {state === "saving" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Saving…
        </>
      ) : state === "saved" ? (
        <>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Saved Successfully
        </>
      ) : (
        <>
          <Save className="h-4 w-4" aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────
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
    <div
      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
      aria-hidden="true"
    >
      <div className="space-y-1.5">
        <div className="h-4 w-40 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-3 w-56 bg-slate-100 rounded-lg animate-pulse" />
      </div>
      <div className="h-7 w-14 bg-slate-200 rounded-full animate-pulse ml-4" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrgSettings() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;

  const { data: membershipDoc, loading: membershipLoading } = useDocumentRealtime<any>(
    "organizationMembers", membershipId
  );
  const { data: orgDoc, loading: orgLoading } = useDocumentRealtime<any>(
    "organizations", organization?.id || null
  );

  const [activeSection, setActiveSection] = useState<SectionId>("organization");

  // ── Organization form ──────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState("");
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({});
  const [orgSaveState, setOrgSaveState] = useState<SaveState>("idle");

  // ── Profile form ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaveState, setProfileSaveState] = useState<SaveState>("idle");

  // ── Notification prefs ─────────────────────────────────────────────────────
  const [notifNewCollection, setNotifNewCollection] = useState(true);
  const [notifNewMember, setNotifNewMember] = useState(true);
  const [notifLoanApproval, setNotifLoanApproval] = useState(true);
  const [notifSaveState, setNotifSaveState] = useState<SaveState>("idle");

  // ── FAB reset ──────────────────────────────────────────────────────────────
  const [isResettingFab, setIsResettingFab] = useState(false);

  const orgLoaded  = useRef(false);
  const profLoaded = useRef(false);

  // ── Sync org settings from Firestore on first load ────────────────────────
  useEffect(() => {
    if (orgLoading || !orgDoc) return;
    if (orgLoaded.current) return;
    setOrgName(orgDoc.name || organization?.name || "");
    setNotifNewCollection(orgDoc.settings?.notifNewCollection ?? true);
    setNotifNewMember(orgDoc.settings?.notifNewMember ?? true);
    setNotifLoanApproval(orgDoc.settings?.notifLoanApproval ?? true);
    orgLoaded.current = true;
  }, [orgDoc, orgLoading, organization?.name]);

  // ── Sync profile from Firestore on first load ─────────────────────────────
  useEffect(() => {
    if (membershipLoading || !membershipDoc) return;
    if (profLoaded.current) return;
    setFullName(membershipDoc.fullName || user?.fullName || "");
    setPhone(membershipDoc.phone || "");
    profLoaded.current = true;
  }, [membershipDoc, membershipLoading, user?.fullName]);

  // ── Reset loaded refs when org changes ────────────────────────────────────
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
      setOrgName(sanitized);
      flashSaved(setOrgSaveState);
      toast.success("Organization settings saved.");
      try {
        await createAuditLog({
          organizationId: organization.id,
          actorId:   actorInfo.id,
          actorRole: actorInfo.role,
          actorName: actorInfo.name,
          action:    "SETTINGS_UPDATED",
          entityType: "Organization",
          entityId:   organization.id,
          metadata: { field: "name", previousValue: prevName, newValue: sanitized },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to save organization settings.");
      setOrgName(prevName);
      setOrgSaveState("idle");
    }
  };

  // ── Notification toggle handler (auto-toast) ───────────────────────────────
  const handleNotifToggle = (
    key: "notifNewCollection" | "notifNewMember" | "notifLoanApproval",
    label: string,
    newVal: boolean,
  ) => {
    if (key === "notifNewCollection") setNotifNewCollection(newVal);
    if (key === "notifNewMember")     setNotifNewMember(newVal);
    if (key === "notifLoanApproval")  setNotifLoanApproval(newVal);
    toast(newVal ? `${label} — Notification Enabled` : `${label} — Notification Disabled`, {
      icon: newVal ? "🔔" : "🔕",
    });
  };

  // ── Save notification preferences ──────────────────────────────────────────
  const saveNotifications = async () => {
    if (!organization?.id) return;
    const prevNotif = {
      notifNewCollection:  orgDoc?.settings?.notifNewCollection ?? true,
      notifNewMember:      orgDoc?.settings?.notifNewMember     ?? true,
      notifLoanApproval:   orgDoc?.settings?.notifLoanApproval  ?? true,
    };
    setNotifSaveState("saving");
    try {
      await setDoc(doc(db, "organizations", organization.id), {
        settings: { notifNewCollection, notifNewMember, notifLoanApproval },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      flashSaved(setNotifSaveState);
      toast.success("Notification preferences saved.");
      try {
        await createAuditLog({
          organizationId: organization.id,
          actorId:   actorInfo.id,
          actorRole: actorInfo.role,
          actorName: actorInfo.name,
          action:    "SETTINGS_UPDATED",
          entityType: "Organization",
          entityId:   organization.id,
          metadata: {
            field: "notifications",
            previousValue: prevNotif,
            newValue: { notifNewCollection, notifNewMember, notifLoanApproval },
          },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to save notification preferences.");
      setNotifNewCollection(prevNotif.notifNewCollection);
      setNotifNewMember(prevNotif.notifNewMember);
      setNotifLoanApproval(prevNotif.notifLoanApproval);
      setNotifSaveState("idle");
    }
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
        fullName: sanitizedName,
        phone:    cleanPhone,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "users", user.id), {
        name:     sanitizedName,
        phone:    cleanPhone,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setFullName(sanitizedName);
      setPhone(cleanPhone);
      flashSaved(setProfileSaveState);
      toast.success("Profile updated successfully.");
      try {
        await createAuditLog({
          organizationId: organization?.id || "",
          actorId:   actorInfo.id,
          actorRole: actorInfo.role,
          actorName: actorInfo.name,
          action:    "SETTINGS_UPDATED",
          entityType: "OrganizationMember",
          entityId:   membershipId,
          metadata: {
            field: "profile",
            previousValue: { fullName: prevName, phone: prevPhone },
            newValue:      { fullName: sanitizedName, phone: cleanPhone },
          },
        });
      } catch (_) {}
    } catch {
      toast.error("Failed to update profile.");
      setFullName(prevName);
      setPhone(prevPhone);
      setProfileSaveState("idle");
    }
  };

  // ── Reset FAB position ─────────────────────────────────────────────────────
  const resetFabPosition = async () => {
    if (!organization?.id) return;
    setIsResettingFab(true);
    try {
      await updateDoc(
        doc(db, "organizations", organization.id, "settings", "ui"),
        { fabPosition: deleteField() }
      );
      toast.success("FAB position reset to default.");
    } catch {
      toast.success("FAB position reset to default.");
    } finally {
      setIsResettingFab(false);
    }
  };

  // ── Sections nav ───────────────────────────────────────────────────────────
  const sections: { id: SectionId; label: string; icon: React.ComponentType<any>; badge?: string }[] = [
    { id: "organization",  label: "Organization",   icon: Building2 },
    { id: "profile",       label: "Profile",        icon: User      },
    { id: "notifications", label: "Notifications",  icon: Bell      },
    { id: "ui",            label: "UI Preferences", icon: Sliders   },
    { id: "security",      label: "Security",       icon: Shield    },
  ];

  const isLoading = orgLoading || membershipLoading;

  return (
    <div className="space-y-6">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-slate-500" aria-hidden="true" />
          Settings
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Manage your organization and account preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">

        {/* ── Sidebar nav ─────────────────────────────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm h-fit"
        >
          {sections.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl",
                  "text-sm font-medium transition-all duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1",
                  "min-h-[48px]",
                  isActive
                    ? "bg-gradient-to-r from-sky-50 to-blue-50 text-sky-700 shadow-sm border border-sky-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5">
                  <s.icon
                    className={`h-4 w-4 ${isActive ? "text-sky-600" : "text-slate-400"}`}
                    aria-hidden="true"
                  />
                  {s.label}
                </div>
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform duration-150 ${
                    isActive ? "opacity-60 translate-x-0.5" : "opacity-30"
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>

        {/* ── Content panels ──────────────────────────────────────────────── */}
        <main className="space-y-5" aria-label="Settings content">

          {/* ── Organization ─────────────────────────────────────────────── */}
          {activeSection === "organization" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-sky-500" aria-hidden="true" />
                  Organization Settings
                </CardTitle>
                <CardDescription>Update your organization's basic information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isLoading ? (
                  <div role="status" aria-label="Loading organization settings">
                    <SkeletonField />
                    <div className="mt-5"><SkeletonField /></div>
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
                        aria-describedby={orgErrors.orgName ? "org-name-error" : undefined}
                        aria-invalid={!!orgErrors.orgName}
                        className={`rounded-xl h-11 ${
                          orgErrors.orgName ? "border-red-400 focus-visible:ring-red-300" : ""
                        }`}
                      />
                      <FieldError error={orgErrors.orgName} />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-medium">Organization ID</Label>
                      <div
                        role="textbox"
                        aria-readonly="true"
                        aria-label="Organization ID (read-only)"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 font-mono select-all flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        {organization?.id || "—"}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Info className="h-3 w-3" aria-hidden="true" />
                        Read-only — used for Firestore scoping.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-medium">Owner Email</Label>
                      <div
                        role="textbox"
                        aria-readonly="true"
                        aria-label="Owner email address (read-only)"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                    </div>

                    <SaveButton
                      onClick={saveOrgSettings}
                      state={orgSaveState}
                      label="Save Changes"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Profile ──────────────────────────────────────────────────── */}
          {activeSection === "profile" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-sky-500" aria-hidden="true" />
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
                    <div className="grid gap-2">
                      <Label htmlFor="full-name" className="text-slate-700 font-medium">
                        Full Name
                      </Label>
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
                        aria-describedby={profileErrors.fullName ? "full-name-error" : undefined}
                        aria-invalid={!!profileErrors.fullName}
                        className={`rounded-xl h-11 ${
                          profileErrors.fullName ? "border-red-400 focus-visible:ring-red-300" : ""
                        }`}
                      />
                      <FieldError error={profileErrors.fullName} />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone-number" className="text-slate-700 font-medium">
                        Phone Number
                      </Label>
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
                        aria-describedby={profileErrors.phone ? "phone-error" : undefined}
                        aria-invalid={!!profileErrors.phone}
                        className={`rounded-xl h-11 ${
                          profileErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""
                        }`}
                      />
                      <FieldError error={profileErrors.phone} />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-medium">Email Address</Label>
                      <div
                        role="textbox"
                        aria-readonly="true"
                        aria-label="Email address (read-only, managed by Clerk)"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Info className="h-3 w-3" aria-hidden="true" />
                        Email is managed by Clerk and cannot be changed here.
                      </p>
                    </div>

                    <SaveButton
                      onClick={saveProfile}
                      state={profileSaveState}
                      label="Save Profile"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Notifications ────────────────────────────────────────────── */}
          {activeSection === "notifications" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-sky-500" aria-hidden="true" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>Control which events trigger dashboard notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {orgLoading ? (
                  <div role="status" aria-label="Loading notification preferences">
                    <SkeletonToggleRow />
                    <div className="mt-3"><SkeletonToggleRow /></div>
                    <div className="mt-3"><SkeletonToggleRow /></div>
                  </div>
                ) : (
                  <>
                    <fieldset className="space-y-3 border-0 p-0 m-0">
                      <legend className="sr-only">Notification preferences</legend>

                      {([
                        {
                          key: "notifNewCollection" as const,
                          label: "New Collection Recorded",
                          desc:  "Notify when any agent records a collection.",
                          value: notifNewCollection,
                        },
                        {
                          key: "notifNewMember" as const,
                          label: "New Member Joined",
                          desc:  "Notify when an invited agent or customer accepts the invitation.",
                          value: notifNewMember,
                        },
                        {
                          key: "notifLoanApproval" as const,
                          label: "Loan Approval Requests",
                          desc:  "Notify when a customer submits a new loan application.",
                          value: notifLoanApproval,
                        },
                      ] as const).map((item) => (
                        <div
                          key={item.key}
                          className={[
                            "flex items-center justify-between gap-4 rounded-2xl border p-4",
                            "transition-all duration-200",
                            item.value
                              ? "border-sky-100 bg-gradient-to-r from-sky-50/60 to-blue-50/40 shadow-sm"
                              : "border-slate-100 bg-slate-50/60",
                          ].join(" ")}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                          </div>
                          <Toggle
                            value={item.value}
                            ariaLabel={`${item.label}: ${item.value ? "enabled" : "disabled"}`}
                            onChange={(v) => handleNotifToggle(item.key, item.label, v)}
                          />
                        </div>
                      ))}
                    </fieldset>

                    <div className="pt-2">
                      <SaveButton
                        onClick={saveNotifications}
                        state={notifSaveState}
                        label="Save Preferences"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── UI Preferences ───────────────────────────────────────────── */}
          {activeSection === "ui" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-sky-500" aria-hidden="true" />
                  UI Preferences
                </CardTitle>
                <CardDescription>Customize the dashboard layout and interface elements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Quick Actions Button Position</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Drag the floating action button (FAB) anywhere on the Dashboard. Its position saves
                      automatically. Use the button below to snap it back to the default bottom-right corner.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetFabPosition}
                    disabled={isResettingFab}
                    aria-label="Reset floating action button to default position"
                    className={[
                      "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                      "border border-slate-200 bg-white text-slate-700",
                      "transition-all duration-150 outline-none min-h-[48px]",
                      "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1",
                      isResettingFab
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-slate-100 hover:border-slate-300 active:scale-[0.98]",
                    ].join(" ")}
                  >
                    {isResettingFab
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    }
                    Reset FAB Position
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Security ─────────────────────────────────────────────────── */}
          {activeSection === "security" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-sky-500" aria-hidden="true" />
                  Security Settings
                </CardTitle>
                <CardDescription>Your account security is managed by Clerk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-green-50 p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Shield className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Enterprise Auth Enabled</p>
                    <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                      Your account is secured by Clerk's enterprise authentication with OTP verification
                      and session management.
                    </p>
                  </div>
                </div>

                <ul className="space-y-2.5" aria-label="Security feature list">
                  {[
                    { label: "Multi-factor Authentication", value: "Managed by Clerk",                        ok: true  },
                    { label: "Session Management",          value: "Active — auto-renews",                    ok: true  },
                    { label: "Organization Isolation",      value: "Enforced via Firestore rules",            ok: true  },
                    { label: "Role-Based Access",           value: `org:owner (${organization?.name || "—"})`, ok: true },
                  ].map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2
                          className="h-4 w-4 text-emerald-500 shrink-0"
                          aria-hidden="true"
                        />
                        <p className="text-sm font-medium text-slate-700 truncate">{item.label}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                        {item.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

        </main>
      </div>
    </div>
  );
}

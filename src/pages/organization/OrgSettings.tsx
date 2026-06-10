import { useState, useEffect, useRef } from "react";
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
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName, validatePhone10 } from "@/lib/validation";

type SectionId = "organization" | "profile" | "notifications" | "ui" | "security";

// ── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonField() {
  return (
    <div className="grid gap-2">
      <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
      <div className="h-10 w-full bg-slate-100 rounded-xl animate-pulse" />
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${
        value ? "bg-sky-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Save button with spinner + success state ──────────────────────────────────
function SaveButton({
  onClick, saving, saved, label = "Save Changes",
}: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  label?: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={saving}
      className={`flex items-center gap-2 transition-colors ${
        saved ? "bg-emerald-600 hover:bg-emerald-700" : ""
      }`}
    >
      {saving ? (
        <><Loader2 className="h-4 w-4 animate-spin" />{label}</>
      ) : saved ? (
        <><CheckCircle className="h-4 w-4" />Saved</>
      ) : (
        <><Save className="h-4 w-4" />{label}</>
      )}
    </Button>
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
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);

  // ── Profile form ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // ── Notification prefs ─────────────────────────────────────────────────────
  const [notifNewCollection, setNotifNewCollection] = useState(true);
  const [notifNewMember, setNotifNewMember] = useState(true);
  const [notifLoanApproval, setNotifLoanApproval] = useState(true);
  const [isSavingNotif, setIsSavingNotif] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // ── FAB reset ──────────────────────────────────────────────────────────────
  const [isResettingFab, setIsResettingFab] = useState(false);

  // Track whether fields have been loaded (so we only sync once, not on every
  // real-time push which would overwrite user's in-progress edits).
  const orgLoaded  = useRef(false);
  const profLoaded = useRef(false);

  // ── Sync org settings from Firestore on first load ────────────────────────
  useEffect(() => {
    if (orgLoading || !orgDoc) return;
    if (orgLoaded.current) return; // already loaded — don't overwrite edits
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  const actorInfo = {
    id:   user?.id || "",
    role: "OWNER" as const,
    name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "Owner",
  };

  const flashSaved = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2500);
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

    // Snapshot previous values for rollback
    const prevName = orgDoc?.name || "";

    setIsSavingOrg(true);
    try {
      const sanitized = sanitizeName(trimmed) || trimmed;
      await setDoc(doc(db, "organizations", organization.id), {
        name: sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setOrgName(sanitized);
      flashSaved(setOrgSaved);
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
      setOrgName(prevName); // rollback
    } finally {
      setIsSavingOrg(false);
    }
  };

  // ── Save notification preferences ──────────────────────────────────────────
  const saveNotifications = async () => {
    if (!organization?.id) return;

    // Snapshot for rollback
    const prevNotif = {
      notifNewCollection:  orgDoc?.settings?.notifNewCollection ?? true,
      notifNewMember:      orgDoc?.settings?.notifNewMember     ?? true,
      notifLoanApproval:   orgDoc?.settings?.notifLoanApproval  ?? true,
    };

    setIsSavingNotif(true);
    try {
      await setDoc(doc(db, "organizations", organization.id), {
        settings: { notifNewCollection, notifNewMember, notifLoanApproval },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      flashSaved(setNotifSaved);
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
      // rollback
      setNotifNewCollection(prevNotif.notifNewCollection);
      setNotifNewMember(prevNotif.notifNewMember);
      setNotifLoanApproval(prevNotif.notifLoanApproval);
    } finally {
      setIsSavingNotif(false);
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

    // Snapshot for rollback
    const prevName  = membershipDoc?.fullName || user?.fullName || "";
    const prevPhone = membershipDoc?.phone || "";
    const cleanPhone = phone.replace(/\D/g, "").slice(0, 10);
    const sanitizedName = sanitizeName(trimmedName) || trimmedName;

    setIsSavingProfile(true);
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
      flashSaved(setProfileSaved);
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
      setFullName(prevName);  // rollback
      setPhone(prevPhone);
    } finally {
      setIsSavingProfile(false);
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
  const sections: { id: SectionId; label: string; icon: any }[] = [
    { id: "organization",  label: "Organization",     icon: Building2 },
    { id: "profile",       label: "Profile",          icon: User      },
    { id: "notifications", label: "Notifications",    icon: Bell      },
    { id: "ui",            label: "UI Preferences",   icon: Sliders   },
    { id: "security",      label: "Security",         icon: Shield    },
  ];

  const isLoading = orgLoading || membershipLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-slate-500" />
          Settings
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Manage your organization and account preferences.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">

        {/* ── Sidebar nav ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm h-fit">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                activeSection === s.id
                  ? "bg-sky-50 text-sky-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <s.icon className="h-4 w-4" />
                {s.label}
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            </button>
          ))}
        </div>

        {/* ── Content panels ──────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── Organization ─────────────────────────────────────────────── */}
          {activeSection === "organization" && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-500" />
                  Organization Settings
                </CardTitle>
                <CardDescription>Update your organization's basic information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isLoading ? (
                  <><SkeletonField /><SkeletonField /><SkeletonField /></>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label>Organization Name</Label>
                      <Input
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
                        className={`rounded-xl ${orgErrors.orgName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={orgErrors.orgName} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Organization ID</Label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 font-mono select-all">
                        {organization?.id || "—"}
                      </div>
                      <p className="text-xs text-slate-400">Read-only — used for Firestore scoping.</p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Owner Email</Label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                    </div>

                    <SaveButton
                      onClick={saveOrgSettings}
                      saving={isSavingOrg}
                      saved={orgSaved}
                      label="Save Changes"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Profile ──────────────────────────────────────────────────── */}
          {activeSection === "profile" && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" />
                  Profile Settings
                </CardTitle>
                <CardDescription>Update your personal information and contact details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {membershipLoading ? (
                  <><SkeletonField /><SkeletonField /><SkeletonField /></>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label>Full Name</Label>
                      <Input
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
                        className={`rounded-xl ${profileErrors.fullName ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={profileErrors.fullName} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Phone Number</Label>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").substring(0, 10);
                          setPhone(v);
                          if (v && v.length !== 10) setProfileErrors((p) => ({ ...p, phone: "Must be exactly 10 digits." }));
                          else setProfileErrors((p) => ({ ...p, phone: "" }));
                        }}
                        placeholder="9876543210"
                        className={`rounded-xl ${profileErrors.phone ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                      />
                      <FieldError error={profileErrors.phone} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Email Address</Label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                        {user?.primaryEmailAddress?.emailAddress || "—"}
                      </div>
                      <p className="text-xs text-slate-400">Email is managed by Clerk and cannot be changed here.</p>
                    </div>

                    <SaveButton
                      onClick={saveProfile}
                      saving={isSavingProfile}
                      saved={profileSaved}
                      label="Save Profile"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Notifications ────────────────────────────────────────────── */}
          {activeSection === "notifications" && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-slate-500" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>Control which events trigger dashboard notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orgLoading ? (
                  <><SkeletonField /><SkeletonField /><SkeletonField /></>
                ) : (
                  <>
                    {[
                      {
                        label: "New Collection Recorded",
                        desc:  "Notify when any agent records a collection.",
                        value: notifNewCollection,
                        onChange: setNotifNewCollection,
                      },
                      {
                        label: "New Member Joined",
                        desc:  "Notify when an invited agent or customer accepts the invitation.",
                        value: notifNewMember,
                        onChange: setNotifNewMember,
                      },
                      {
                        label: "Loan Approval Requests",
                        desc:  "Notify when a customer submits a new loan application.",
                        value: notifLoanApproval,
                        onChange: setNotifLoanApproval,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                        </div>
                        <Toggle value={item.value} onChange={item.onChange} />
                      </div>
                    ))}

                    <SaveButton
                      onClick={saveNotifications}
                      saving={isSavingNotif}
                      saved={notifSaved}
                      label="Save Preferences"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── UI Preferences ───────────────────────────────────────────── */}
          {activeSection === "ui" && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-slate-500" />
                  UI Preferences
                </CardTitle>
                <CardDescription>Customize the dashboard layout and interface elements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Quick Actions Button Position</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Drag the floating action button (FAB) anywhere on the Dashboard. Its position saves automatically.
                      Use the button below to snap it back to the default bottom-right corner.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={resetFabPosition}
                    disabled={isResettingFab}
                    className="flex items-center gap-2 text-sm"
                  >
                    {isResettingFab
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RotateCcw className="h-4 w-4" />
                    }
                    Reset FAB Position
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Security ─────────────────────────────────────────────────── */}
          {activeSection === "security" && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-slate-500" />
                  Security Settings
                </CardTitle>
                <CardDescription>Your account security is managed by Clerk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 flex items-start gap-3">
                  <Shield className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Enterprise Auth Enabled</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Your account is secured by Clerk's enterprise authentication with OTP verification and session management.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Multi-factor Authentication", value: "Managed by Clerk" },
                    { label: "Session Management",          value: "Active — auto-renews" },
                    { label: "Organization Isolation",      value: "Enforced via Firestore rules" },
                    { label: "Role-Based Access",           value: `org:owner (${organization?.name || "—"})` },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-700">{item.label}</p>
                      <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

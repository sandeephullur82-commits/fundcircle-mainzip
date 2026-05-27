import { useState } from "react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { membershipIdFor } from "@/lib/services";
import { toast } from "sonner";
import {
  Settings,
  Building2,
  User,
  Shield,
  Bell,
  Save,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OrgSettings() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;
  const { data: membershipDoc } = useDocumentRealtime<any>("organizationMembers", membershipId);
  const { data: orgDoc } = useDocumentRealtime<any>("organizations", organization?.id || null);

  const [activeSection, setActiveSection] = useState<"organization" | "profile" | "notifications" | "security">("organization");
  const [isSaving, setIsSaving] = useState(false);

  // Organization form state
  const [orgName, setOrgName] = useState(organization?.name || "");

  // Profile form state
  const [fullName, setFullName] = useState(membershipDoc?.fullName || user?.fullName || "");
  const [phone, setPhone] = useState(membershipDoc?.phone || "");

  // Notification prefs
  const [notifNewCollection, setNotifNewCollection] = useState(orgDoc?.settings?.notifNewCollection ?? true);
  const [notifNewMember, setNotifNewMember] = useState(orgDoc?.settings?.notifNewMember ?? true);
  const [notifLoanApproval, setNotifLoanApproval] = useState(orgDoc?.settings?.notifLoanApproval ?? true);

  const saveOrgSettings = async () => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "organizations", organization.id), {
        name: orgName.trim() || organization.name,
        settings: {
          notifNewCollection,
          notifNewMember,
          notifLoanApproval,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Organization settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!user || !membershipId) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "organizationMembers", membershipId), {
        fullName: fullName.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "users", user.id), {
        name: fullName.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Profile updated successfully.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
  ] as const;

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
        {/* Sidebar nav */}
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

        {/* Content */}
        <div className="space-y-5">
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
                <div className="grid gap-2">
                  <Label>Organization Name</Label>
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={organization?.name}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Organization ID</Label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 font-mono select-all">
                    {organization?.id || "—"}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Owner Email</Label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    {user?.primaryEmailAddress?.emailAddress || "—"}
                  </div>
                </div>
                <Button onClick={saveOrgSettings} disabled={isSaving} className="flex items-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}

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
                <div className="grid gap-2">
                  <Label>Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Email Address</Label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    {user?.primaryEmailAddress?.emailAddress || "—"}
                  </div>
                  <p className="text-xs text-slate-400">Email is managed by Clerk and cannot be changed here.</p>
                </div>
                <Button onClick={saveProfile} disabled={isSaving} className="flex items-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Profile
                </Button>
              </CardContent>
            </Card>
          )}

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
                {[
                  {
                    label: "New Collection Recorded",
                    desc: "Notify when any agent records a collection.",
                    value: notifNewCollection,
                    onChange: setNotifNewCollection,
                  },
                  {
                    label: "New Member Joined",
                    desc: "Notify when an invited agent or customer accepts the invitation.",
                    value: notifNewMember,
                    onChange: setNotifNewMember,
                  },
                  {
                    label: "Loan Approval Requests",
                    desc: "Notify when a customer submits a new loan application.",
                    value: notifLoanApproval,
                    onChange: setNotifLoanApproval,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => item.onChange(!item.value)}
                      className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${
                        item.value ? "bg-sky-500" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          item.value ? "translate-x-5.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                ))}
                <Button onClick={saveOrgSettings} disabled={isSaving} className="flex items-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}

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
                    { label: "Session Management", value: "Active — auto-renews" },
                    { label: "Organization Isolation", value: "Enforced via Firestore rules" },
                    { label: "Role-Based Access", value: `org:owner (${organization?.name || "—"})` },
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

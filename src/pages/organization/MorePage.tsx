import React, { useState, useEffect, useRef } from "react";
import { useUser, useOrganization, SignOutButton } from "@clerk/clerk-react";
import {
  doc, setDoc, serverTimestamp, getCountFromServer,
  collection as fsCollection, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocumentRealtime } from "@/lib/firestore-hooks";
import { membershipIdFor } from "@/lib/services";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  User, Building2, Users, CreditCard, Bell, Wallet,
  MessageCircle, Info, ClipboardList, LogOut, Phone, Mail,
  Edit2, Loader2, Lock, Shield, HelpCircle, Flag,
  FileText, Star, ExternalLink, Check,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldError from "@/components/ui/FieldError";
import { sanitizeName } from "@/lib/validation";
import { BrandMark } from "@/components/BrandLogo";

type MoreSubPage = "list" | "profile" | "organization" | "notifications" | "support" | "about";

function switchTab(tab: string) {
  window.dispatchEvent(new CustomEvent("fundcircle:switchTab", { detail: tab }));
}

// ── Premium Toggle ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled = false }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={[
        "relative flex-shrink-0 rounded-full transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500",
        "w-[52px] h-7",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        value ? "bg-sky-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" : "bg-slate-200 hover:bg-slate-300",
      ].join(" ")}
    >
      <span className={[
        "absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200",
        value ? "translate-x-[28px]" : "translate-x-1",
      ].join(" ")} />
    </button>
  );
}

// ── Sub-page back header ───────────────────────────────────────────────────────
function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors"
        aria-label="Go back"
      >
        <ChevronLeft className="w-5 h-5 text-slate-600" />
      </button>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
    </div>
  );
}

// ── Info row card ──────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, badge }: {
  icon: React.ComponentType<any>; label: string; value: string; badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-slate-100">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{value}</p>
      </div>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{badge}</span>
      )}
    </div>
  );
}

// ── PROFILE SUB-PAGE ──────────────────────────────────────────────────────────
function ProfileSubPage({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;
  const { data: membershipDoc, loading } = useDocumentRealtime<any>("organizationMembers", membershipId);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (loading || !membershipDoc || initRef.current) return;
    setFullName(membershipDoc.fullName || user?.fullName || "");
    setPhone(membershipDoc.phone || "");
    initRef.current = true;
  }, [membershipDoc, loading]);

  useEffect(() => { initRef.current = false; }, [membershipId]);

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    const name = fullName.trim();
    if (!name || name.length < 2) errs.fullName = "Name must be at least 2 characters.";
    if (phone && phone.replace(/\D/g, "").length !== 10) errs.phone = "Must be exactly 10 digits.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    try {
      const sanitized = sanitizeName(name) || name;
      const cleanPhone = phone.replace(/\D/g, "").slice(0, 10);
      await setDoc(doc(db, "organizationMembers", membershipId!), {
        fullName: sanitized, phone: cleanPhone, updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "users", user!.id), {
        name: sanitized, phone: cleanPhone, updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Profile updated.");
      setEditing(false);
    } catch { toast.error("Failed to update profile."); }
    finally { setSaving(false); }
  };

  const displayName = membershipDoc?.fullName || user?.fullName || "—";
  const displayPhone = membershipDoc?.phone;

  return (
    <div>
      <SubPageHeader title="My Profile" onBack={onBack} />

      {/* Avatar hero */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="relative">
          <Avatar className="h-24 w-24 ring-4 ring-sky-100">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-3xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">{displayName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
          <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-bold">
            <Shield className="w-3 h-3" /> Owner
          </span>
        </div>
      </div>

      {!editing ? (
        <div className="space-y-2.5">
          <InfoRow icon={User}   label="Full Name" value={displayName} />
          <InfoRow icon={Mail}   label="Email"     value={user?.primaryEmailAddress?.emailAddress || "—"} badge="Read-only" />
          <InfoRow icon={Phone}  label="Phone"     value={displayPhone ? `+91 ${displayPhone}` : "Not set"} />
          <InfoRow icon={Shield} label="Role"      value="Owner" badge="Admin" />

          <div className="pt-4 space-y-2.5">
            <button
              onClick={() => setEditing(true)}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-semibold text-sm transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Edit Profile
            </button>
            <SignOutButton>
              <button className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100 font-semibold text-sm transition-colors">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: "" })); }}
              placeholder="Your full name"
              maxLength={100}
              className={`h-12 rounded-2xl ${errors.fullName ? "border-red-400" : ""}`}
            />
            <FieldError error={errors.fullName} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Phone Number</Label>
            <Input
              type="tel" inputMode="numeric" maxLength={10}
              value={phone}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 10); setPhone(v); setErrors(p => ({ ...p, phone: "" })); }}
              placeholder="10-digit mobile number"
              className={`h-12 rounded-2xl ${errors.phone ? "border-red-400" : ""}`}
            />
            <FieldError error={errors.phone} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
            <div className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 text-sm">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              {user?.primaryEmailAddress?.emailAddress}
            </div>
          </div>
          <div className="flex gap-2.5 pt-2">
            <button
              onClick={() => { setEditing(false); setErrors({}); }}
              disabled={saving}
              className="flex-1 h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ORGANIZATION SUB-PAGE ──────────────────────────────────────────────────────
function OrganizationSubPage({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = organization?.id || null;
  const { data: orgDoc, loading: orgLoading } = useDocumentRealtime<any>("organizations", orgId);

  const [orgName, setOrgName] = useState("");
  const [orgNameError, setOrgNameError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stats, setStats] = useState<{ customers: number; collectors: number; collections: number } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (orgLoading || !orgDoc || initRef.current) return;
    setOrgName(orgDoc.name || organization?.name || "");
    initRef.current = true;
  }, [orgDoc, orgLoading]);

  useEffect(() => { initRef.current = false; }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const [custSnap, agentSnap, collSnap] = await Promise.all([
          getCountFromServer(query(fsCollection(db, "organizationMembers"), where("organizationId", "==", orgId), where("role", "==", "CUSTOMER"))),
          getCountFromServer(query(fsCollection(db, "organizationMembers"), where("organizationId", "==", orgId), where("role", "==", "AGENT"))),
          getCountFromServer(query(fsCollection(db, "collections"), where("organizationId", "==", orgId))),
        ]);
        setStats({ customers: custSnap.data().count, collectors: agentSnap.data().count, collections: collSnap.data().count });
      } catch { /* silent — composite index may not exist */ }
    })();
  }, [orgId]);

  const handleSaveName = async () => {
    const name = orgName.trim();
    if (!name || name.length < 3) { setOrgNameError("Minimum 3 characters."); return; }
    if (name.length > 100) { setOrgNameError("Maximum 100 characters."); return; }
    setOrgNameError("");
    setSavingName(true);
    try {
      const sanitized = sanitizeName(name) || name;
      await setDoc(doc(db, "organizations", orgId!), { name: sanitized, updatedAt: serverTimestamp() }, { merge: true });
      setOrgName(sanitized);
      setEditingName(false);
      toast.success("Organization name updated.");
    } catch { toast.error("Failed to update organization."); }
    finally { setSavingName(false); }
  };

  const createdAt: Date | null = orgDoc?.createdAt?.toDate?.() ?? null;

  return (
    <div>
      <SubPageHeader title="Organization" onBack={onBack} />

      {/* Org identity */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-indigo-200">
          <Building2 className="w-9 h-9 text-white" />
        </div>
        {editingName ? (
          <div className="flex items-center gap-2 w-full max-w-xs">
            <Input
              value={orgName}
              onChange={(e) => { setOrgName(e.target.value); setOrgNameError(""); }}
              className={`h-10 rounded-xl text-center font-bold ${orgNameError ? "border-red-400" : ""}`}
              maxLength={100}
              autoFocus
            />
            <button onClick={handleSaveName} disabled={savingName}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shrink-0">
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button onClick={() => { setEditingName(false); setOrgNameError(""); }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-slate-900">{orgName || organization?.name}</p>
            <button onClick={() => setEditingName(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200">
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        )}
        {orgNameError && <p className="text-xs text-red-500">{orgNameError}</p>}
      </div>

      {/* Owner info */}
      <div className="space-y-2.5 mb-6">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">Owner</p>
        <InfoRow icon={User} label="Name"  value={user?.fullName || "—"} />
        <InfoRow icon={Mail} label="Email" value={user?.primaryEmailAddress?.emailAddress || "—"} badge="Read-only" />
        {createdAt && (
          <InfoRow icon={FileText} label="Member Since"
            value={createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} />
        )}
      </div>

      {/* Stats */}
      <div className="mb-6">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-3">Statistics</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Customers",   value: stats?.customers,   from: "from-sky-400",     to: "to-sky-600"     },
            { label: "Collectors",  value: stats?.collectors,  from: "from-indigo-400",  to: "to-indigo-600"  },
            { label: "Collections", value: stats?.collections, from: "from-emerald-400", to: "to-emerald-600" },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-3 bg-gradient-to-br ${s.from} ${s.to} text-center shadow-sm`}>
              <p className="text-2xl font-black text-white">
                {s.value === undefined ? "—" : s.value}
              </p>
              <p className="text-[10px] font-semibold text-white/80 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced (collapsed) */}
      <button
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-semibold"
      >
        <span>Advanced Settings</span>
        {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {advancedOpen && (
        <div className="mt-2 px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Organization ID</p>
            <p className="font-mono text-xs text-slate-600 break-all select-all bg-white border border-slate-200 rounded-xl px-3 py-2">
              {orgId || "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NOTIFICATIONS SUB-PAGE ────────────────────────────────────────────────────
function NotificationsSubPage({ onBack }: { onBack: () => void }) {
  const { organization } = useOrganization();
  const orgId = organization?.id || null;
  const { data: orgDoc, loading } = useDocumentRealtime<any>("organizations", orgId);

  const [notifs, setNotifs] = useState({
    newCollection:    true,
    newCustomer:      true,
    newCollector:     true,
    missedCollection: false,
    systemAlerts:     true,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (loading || !orgDoc || initRef.current) return;
    setNotifs({
      newCollection:    orgDoc.settings?.notifNewCollection    ?? true,
      newCustomer:      orgDoc.settings?.notifNewMember        ?? true,
      newCollector:     orgDoc.settings?.notifNewMember        ?? true,
      missedCollection: orgDoc.settings?.notifMissedCollection ?? false,
      systemAlerts:     orgDoc.settings?.notifSystemAlerts     ?? true,
    });
    initRef.current = true;
  }, [orgDoc, loading]);

  useEffect(() => { initRef.current = false; }, [orgId]);

  const FS_KEY_MAP: Record<string, string> = {
    newCollection:    "notifNewCollection",
    newCustomer:      "notifNewMember",
    newCollector:     "notifNewMember",
    missedCollection: "notifMissedCollection",
    systemAlerts:     "notifSystemAlerts",
  };

  const handleToggle = async (key: keyof typeof notifs, value: boolean) => {
    setNotifs(prev => ({ ...prev, [key]: value }));
    setSavingKey(key);
    try {
      await setDoc(doc(db, "organizations", orgId!), {
        settings: { [FS_KEY_MAP[key]]: value },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Preferences updated.");
    } catch {
      setNotifs(prev => ({ ...prev, [key]: !value }));
      toast.error("Failed to save preference.");
    } finally { setSavingKey(null); }
  };

  const ITEMS = [
    { key: "newCollection"    as const, label: "New Collection",    desc: "When any agent records a collection"      },
    { key: "newCustomer"      as const, label: "New Customer",      desc: "When a customer joins your organization"  },
    { key: "newCollector"     as const, label: "New Collector",     desc: "When an agent accepts an invitation"      },
    { key: "missedCollection" as const, label: "Collection Missed", desc: "When an EMI installment is past due"      },
    { key: "systemAlerts"     as const, label: "System Alerts",     desc: "Platform updates & important notices"     },
  ];

  return (
    <div>
      <SubPageHeader title="Notifications" onBack={onBack} />
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
        Choose which events send you alerts. Changes save instantly.
      </p>
      <div className="space-y-2.5">
        {loading
          ? [...Array(5)].map((_, i) => <div key={i} className="h-[72px] bg-slate-100 rounded-2xl animate-pulse" />)
          : ITEMS.map((item) => (
            <div
              key={item.key}
              className={[
                "flex items-center justify-between gap-4 px-4 py-4 rounded-2xl border transition-all",
                notifs[item.key] ? "bg-sky-50/80 border-sky-100" : "bg-white border-slate-100",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              {savingKey === item.key
                ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                : <Toggle value={notifs[item.key]} onChange={(v) => handleToggle(item.key, v)} />
              }
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── SUPPORT SUB-PAGE ───────────────────────────────────────────────────────────
function SupportSubPage({ onBack }: { onBack: () => void }) {
  const ITEMS = [
    { label: "Contact Support", desc: "Reach our support team",     icon: MessageCircle, href: "mailto:support@fundcircle.app" },
    { label: "Help Center",     desc: "Guides & tutorials",          icon: HelpCircle,    href: "https://fundcircle.app/help"  },
    { label: "FAQs",            desc: "Frequently asked questions",  icon: FileText,      href: "https://fundcircle.app/faq"   },
    { label: "Report an Issue", desc: "Tell us what went wrong",    icon: Flag,          href: "mailto:bugs@fundcircle.app"   },
  ];
  return (
    <div>
      <SubPageHeader title="Support" onBack={onBack} />
      <div className="space-y-2.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 active:bg-slate-100 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 shrink-0">
                <Icon className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-300 shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── ABOUT SUB-PAGE ─────────────────────────────────────────────────────────────
function AboutSubPage({ onBack }: { onBack: () => void }) {
  const LINKS = [
    { label: "Privacy Policy",     icon: Lock,     href: "https://fundcircle.app/privacy" },
    { label: "Terms & Conditions", icon: FileText,  href: "https://fundcircle.app/terms"   },
    { label: "Rate FundCircle",    icon: Star,      href: "#"                              },
  ];
  return (
    <div>
      <SubPageHeader title="About" onBack={onBack} />
      <div className="flex flex-col items-center gap-3 mb-10">
        <BrandMark size="lg" />
        <div className="text-center">
          <p className="text-2xl font-black text-slate-900 tracking-tight">FundCircle</p>
          <p className="text-sm text-slate-500 mt-1">Modern Pigmy Collection Platform</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-semibold">Version 1.0.0</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-semibold">Build 2025.1</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 shrink-0">
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <p className="flex-1 text-sm font-semibold text-slate-800">{item.label}</p>
              <ExternalLink className="w-4 h-4 text-slate-300 shrink-0" />
            </a>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-400 mt-10">
        © {new Date().getFullYear()} FundCircle. All rights reserved.
      </p>
    </div>
  );
}

// ── MAIN MORE PAGE ─────────────────────────────────────────────────────────────
const MORE_ITEMS = [
  { id: "profile",       label: "My Profile",       sub: "Photo, name, phone & role",      icon: User,          color: "sky",     internal: true  },
  { id: "organization",  label: "Organization",      sub: "Business details & statistics",  icon: Building2,     color: "indigo",  internal: true  },
  { id: "agents",        label: "Collectors",        sub: "Manage your field team",          icon: Users,         color: "violet",  internal: false },
  { id: "loans",         label: "Loans & EMI",       sub: "Loan book & installments",       icon: CreditCard,    color: "emerald", internal: false },
  { id: "auditLogs",     label: "Audit Logs",        sub: "Full activity history",           icon: ClipboardList, color: "amber",   internal: false },
  { id: "notifications", label: "Notifications",     sub: "Alert preferences",               icon: Bell,          color: "orange",  internal: true  },
  { id: "billing",       label: "Billing",           sub: "Plan, usage & invoices",          icon: Wallet,        color: "rose",    internal: false },
  { id: "support",       label: "Support",           sub: "Get help & contact us",           icon: MessageCircle, color: "teal",    internal: true  },
  { id: "about",         label: "About FundCircle",  sub: "Version, privacy & terms",        icon: Info,          color: "slate",   internal: true  },
] as const;

const COLOR_CLS: Record<string, string> = {
  sky:     "bg-sky-100 text-sky-600",
  indigo:  "bg-indigo-100 text-indigo-600",
  violet:  "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber:   "bg-amber-100 text-amber-600",
  orange:  "bg-orange-100 text-orange-600",
  rose:    "bg-rose-100 text-rose-600",
  teal:    "bg-teal-100 text-teal-600",
  slate:   "bg-slate-100 text-slate-600",
};

export default function MorePage() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;
  const { data: membershipDoc } = useDocumentRealtime<any>("organizationMembers", membershipId);

  const [page, setPage] = useState<MoreSubPage>(() => {
    try {
      const saved = sessionStorage.getItem("fc_more_subpage");
      if (saved) { sessionStorage.removeItem("fc_more_subpage"); return saved as MoreSubPage; }
    } catch {}
    return "list";
  });

  // Allow other parts of the app to navigate into a sub-page
  useEffect(() => {
    const handler = (e: Event) => {
      const sub = (e as CustomEvent).detail as MoreSubPage;
      setPage(sub);
    };
    window.addEventListener("fundcircle:morePage", handler);
    return () => window.removeEventListener("fundcircle:morePage", handler);
  }, []);

  if (page !== "list") {
    return (
      <div className="max-w-lg mx-auto px-1">
        {page === "profile"       && <ProfileSubPage       onBack={() => setPage("list")} />}
        {page === "organization"  && <OrganizationSubPage  onBack={() => setPage("list")} />}
        {page === "notifications" && <NotificationsSubPage onBack={() => setPage("list")} />}
        {page === "support"       && <SupportSubPage       onBack={() => setPage("list")} />}
        {page === "about"         && <AboutSubPage         onBack={() => setPage("list")} />}
      </div>
    );
  }

  const displayName = membershipDoc?.fullName || user?.fullName || "Owner";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const orgName = organization?.name || "My Organization";

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-6">
      {/* Profile hero card */}
      <button
        onClick={() => setPage("profile")}
        className="w-full flex items-center gap-4 px-5 py-4 rounded-3xl bg-gradient-to-r from-sky-500 to-indigo-600 shadow-lg shadow-indigo-100 text-left active:opacity-90 transition-opacity"
      >
        <Avatar className="h-14 w-14 ring-2 ring-white/40 shrink-0">
          <AvatarImage src={user?.imageUrl} />
          <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white truncate">{displayName}</p>
          <p className="text-xs text-sky-100 truncate mt-0.5">{email}</p>
          <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold tracking-wide">
            Owner · {orgName}
          </span>
        </div>
        <ChevronRight className="w-5 h-5 text-white/50 shrink-0" />
      </button>

      {/* Navigation list */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {MORE_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const colorCls = COLOR_CLS[item.color] ?? "bg-slate-100 text-slate-500";
          const isLast = idx === MORE_ITEMS.length - 1;
          return (
            <button
              key={item.id + idx}
              onClick={() => item.internal ? setPage(item.id as MoreSubPage) : switchTab(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors ${!isLast ? "border-b border-slate-50" : ""}`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl shrink-0 ${colorCls}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{item.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Sign out */}
      <SignOutButton>
        <button className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 font-semibold text-sm transition-colors">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </SignOutButton>
    </div>
  );
}

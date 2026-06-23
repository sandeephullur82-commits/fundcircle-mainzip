import React, { useState, useEffect } from "react";
import { useUser, useClerk, useOrganization } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  User, Mail, Shield, LogOut, Trash2, Check,
  ArrowLeft, RefreshCw, Phone, Lock,
} from "lucide-react";
import ProfileAvatarEditor from "@/components/ui/ProfileAvatarEditor";
import SecuritySection from "@/components/ui/SecuritySection";
import { membershipIdFor } from "@/lib/services";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocumentRealtime } from "@/lib/firestore-hooks";

const nameRx = /^[A-Za-z\s.]*$/;

export default function UserProfilePage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const membershipId = user && organization ? membershipIdFor(organization.id, user.id) : null;
  const { data: membershipDoc } = useDocumentRealtime<any>("organizationMembers", membershipId);

  const [firstName, setFirstName]           = useState("");
  const [lastName, setLastName]             = useState("");
  const [phone, setPhone]                   = useState("");
  const [isUpdating, setIsUpdating]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput]       = useState("");
  const [nameErrors, setNameErrors]         = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
    }
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    if (membershipDoc?.phone !== undefined) {
      setPhone(membershipDoc.phone || "");
    }
  }, [membershipDoc?.phone]);

  const validateName = () => {
    const errs: Record<string, string> = {};
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn) errs.firstName = "First name is required.";
    else if (fn.length < 2) errs.firstName = "At least 2 characters.";
    else if (!nameRx.test(fn)) errs.firstName = "Only letters, spaces and periods.";
    if (ln && !nameRx.test(ln)) errs.lastName = "Only letters, spaces and periods.";
    return errs;
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const errs = validateName();
    if (Object.keys(errs).length) { setNameErrors(errs); return; }
    setNameErrors({});
    setIsUpdating(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });

      if (membershipId && phone !== undefined) {
        const cleanPhone = phone.replace(/\D/g, "").slice(0, 10);
        await setDoc(doc(db, "organizationMembers", membershipId), {
          fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone: cleanPhone,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await setDoc(doc(db, "users", user.id), {
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone: cleanPhone,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.message || err.message || "Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") return toast.error("Please type DELETE to confirm");
    if (!user) return;
    setIsUpdating(true);
    try {
      await user.delete();
      await signOut();
      navigate("/");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.message || "Action requires recent sign-in. Please re-login and try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 text-sky-600 animate-spin" />
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Loading Profile…</span>
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 text-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-xl space-y-4">
          <Shield className="w-12 h-12 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800">Authentication Required</h1>
          <p className="text-sm text-slate-500">You must be signed in to manage your profile.</p>
          <Link to="/" className="inline-block bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-5 py-2.5 text-xs font-bold transition-all">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const initials = (user.firstName?.charAt(0) || user.fullName?.charAt(0) || "U").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Back link */}
        <div className="flex justify-between items-center px-1">
          <Link
            to="/router"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Account Settings</span>
        </div>

        {/* ── Profile Header ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar with upload/remove */}
            <ProfileAvatarEditor
              fallbackLetter={initials}
              accentColor="sky"
              size="xl"
              membershipId={membershipId}
              userId={user.id}
            />

            <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
              <h1 className="text-2xl font-black text-slate-900 truncate">
                {user.fullName || "Your Account"}
              </h1>
              <p className="text-sm text-slate-500 flex items-center justify-center sm:justify-start gap-1.5">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                {user.primaryEmailAddress?.emailAddress}
              </p>
              {organization && (
                <p className="text-xs text-slate-400 font-medium">{organization.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Personal Details ───────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-5">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider pb-3 border-b border-slate-100">
            Personal Details
          </h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* First Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => {
                    setFirstName(e.target.value);
                    setNameErrors(p => ({ ...p, firstName: "" }));
                  }}
                  placeholder="First name"
                  className={`h-11 w-full px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-4 transition-colors ${
                    nameErrors.firstName
                      ? "border-red-400 bg-red-50 focus:ring-red-400/10"
                      : "border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-sky-500/10 focus:border-sky-500"
                  }`}
                />
                {nameErrors.firstName && <p className="text-[11px] text-red-500">{nameErrors.firstName}</p>}
              </div>

              {/* Last Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => {
                    setLastName(e.target.value);
                    setNameErrors(p => ({ ...p, lastName: "" }));
                  }}
                  placeholder="Last name"
                  className={`h-11 w-full px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-4 transition-colors ${
                    nameErrors.lastName
                      ? "border-red-400 bg-red-50 focus:ring-red-400/10"
                      : "border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-sky-500/10 focus:border-sky-500"
                  }`}
                />
                {nameErrors.lastName && <p className="text-[11px] text-red-500">{nameErrors.lastName}</p>}
              </div>
            </div>

            {/* Phone */}
            {membershipId && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile number"
                    className="h-11 w-full pl-10 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email Address</label>
              <div className="h-11 flex items-center gap-2.5 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                {user.primaryEmailAddress?.emailAddress}
              </div>
              <p className="text-[11px] text-slate-400">Manage email addresses in the Security section below.</p>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                disabled={isUpdating}
                className="h-11 px-6 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors active:scale-[0.98]"
              >
                {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* ── Security Section ───────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" /> Security
          </h2>
          <SecuritySection title={false} />
        </div>

        {/* ── Danger Zone ────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider pb-3 border-b border-slate-100">
            Account Actions
          </h2>

          {/* Logout */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-800">Sign Out</p>
              <p className="text-xs text-slate-500">Sign out of your current session on this device.</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>

          {/* Delete Account */}
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-rose-900">Delete Account</p>
                <p className="text-xs text-rose-500">Permanently deletes your account and all associated data.</p>
              </div>
              {!showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="h-9 px-4 border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition-all"
                >
                  Delete Account
                </button>
              )}
            </div>

            {showDeleteConfirm && (
              <div className="space-y-3 pt-3 border-t border-rose-200/40">
                <p className="text-[11px] text-rose-700 font-medium leading-relaxed bg-rose-100/60 rounded-xl p-3">
                  This is irreversible. Your login access will be permanently removed.
                </p>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-rose-700 uppercase">
                    Type <span className="underline">DELETE</span> to confirm:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type DELETE…"
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-rose-200 bg-white text-xs focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 text-rose-900 placeholder-rose-300 flex-1 focus:outline-none"
                    />
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isUpdating}
                      className="h-10 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                      className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

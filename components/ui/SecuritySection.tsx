import React, { useState } from "react";
import { useUser, useClerk, useSession } from "@clerk/clerk-react";
import {
  Shield, Key, Monitor, Mail, Plus, Trash2,
  Eye, EyeOff, RefreshCw, Check, X, Loader2,
  Star, ChevronDown, LogOut, Laptop, Smartphone,
} from "lucide-react";
import { toast } from "sonner";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return String(d);
  }
}

function deviceIcon(deviceType?: string) {
  if (!deviceType) return <Laptop className="w-4 h-4 text-slate-400" />;
  return deviceType.toLowerCase().includes("mobile")
    ? <Smartphone className="w-4 h-4 text-slate-400" />
    : <Laptop className="w-4 h-4 text-slate-400" />;
}

// ─── Change Password ─────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    setErrors({}); setShowCurrent(false); setShowNew(false);
  };

  const toggle = () => { setOpen(o => !o); if (open) reset(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currentPwd) errs.current = "Current password is required.";
    if (newPwd.length < 8) errs.newPwd = "New password must be at least 8 characters.";
    if (newPwd !== confirmPwd) errs.confirm = "Passwords do not match.";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true); setErrors({});
    try {
      await (user as any)?.updatePassword({ currentPassword: currentPwd, newPassword: newPwd });
      toast.success("Password updated successfully!");
      reset(); setOpen(false);
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (err?: string) =>
    `w-full h-11 px-3 pr-10 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors ${
      err
        ? "border-red-400 bg-red-50 focus:ring-red-400/30"
        : "border-slate-200 bg-slate-50 focus:ring-sky-400/30 focus:border-sky-400"
    }`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center shrink-0">
            <Key className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Change Password</p>
            <p className="text-xs text-slate-400">Update your account password</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          {/* Current Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                placeholder="Enter current password"
                className={inputCls(errors.current)}
              />
              <button type="button" onClick={() => setShowCurrent(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.current && <p className="text-[11px] text-red-500">{errors.current}</p>}
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Minimum 8 characters"
                className={inputCls(errors.newPwd)}
              />
              <button type="button" onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPwd && <p className="text-[11px] text-red-500">{errors.newPwd}</p>}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Repeat new password"
              className={inputCls(errors.confirm)}
            />
            {errors.confirm && <p className="text-[11px] text-red-500">{errors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</> : <><Check className="w-4 h-4" />Update Password</>}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Session Management ──────────────────────────────────────────────────────
function SessionsSection() {
  const { client } = useClerk();
  const { session: currentSession } = useSession();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const sessions = (client?.sessions ?? []) as any[];

  const handleRevoke = async (s: any) => {
    if (s.id === currentSession?.id) {
      toast.error("You cannot revoke your current session.");
      return;
    }
    setRevoking(s.id);
    try {
      await s.revoke();
      toast.success("Session revoked.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke session.");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Active Sessions</p>
            <p className="text-xs text-slate-400">
              {sessions.length > 0 ? `${sessions.length} active session${sessions.length !== 1 ? "s" : ""}` : "Manage your logged-in devices"}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">No sessions found.</p>
          ) : (
            sessions.map((s: any) => {
              const isCurrent = s.id === currentSession?.id;
              const activity = s.latestActivity;
              const deviceType = activity?.deviceType;
              const browser = activity?.browserName || "Browser";
              const os = activity?.osName || "";
              const location = [activity?.city, activity?.country].filter(Boolean).join(", ") || "";

              return (
                <div
                  key={s.id}
                  className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border ${
                    isCurrent
                      ? "border-sky-200 bg-sky-50/60"
                      : "border-slate-100 bg-slate-50/40"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isCurrent ? "bg-sky-100" : "bg-slate-100"}`}>
                      {deviceIcon(deviceType)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {browser}{os ? ` · ${os}` : ""}
                        </p>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 text-[9px] font-bold uppercase shrink-0">
                            Current
                          </span>
                        )}
                      </div>
                      {location && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{location}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Last active: {fmtDate(s.lastActiveAt)}
                      </p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(s)}
                      disabled={revoking === s.id}
                      className="shrink-0 h-8 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-500 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {revoking === s.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <LogOut className="w-3.5 h-3.5" />}
                      Revoke
                    </button>
                  )}
                </div>
              );
            })
          )}
          <p className="text-[11px] text-slate-400 text-center pt-1">
            Revoking a session will immediately sign out that device.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Email Management ────────────────────────────────────────────────────────
function EmailSection() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const emails = user?.emailAddresses ?? [];
  const primaryId = user?.primaryEmailAddressId;

  const handleAdd = async () => {
    if (!newEmail.trim() || !user) return;
    setSendingOtp(true);
    try {
      const ea = await user.createEmailAddress({ email: newEmail.trim().toLowerCase() });
      await ea.prepareVerification({ strategy: "email_code" });
      setPendingId(ea.id);
      setAdding(false);
      toast.success("Verification code sent to " + newEmail.trim().toLowerCase());
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to add email.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingId || !otpCode || !user) return;
    setVerifying(true);
    try {
      const ea = user.emailAddresses.find(e => e.id === pendingId);
      if (!ea) throw new Error("Email not found.");
      await ea.attemptVerification({ code: otpCode });
      setPendingId(null); setOtpCode(""); setNewEmail("");
      toast.success("Email verified and added!");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Invalid code. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleMakePrimary = async (emailId: string) => {
    if (!user) return;
    setLoadingId(emailId);
    try {
      const ea = user.emailAddresses.find(e => e.id === emailId);
      if (!ea) throw new Error("Email not found.");
      await ea.makeDefaultPrimary();
      toast.success("Primary email updated!");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to update primary email.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (emailId: string) => {
    if (!user) return;
    if (emailId === primaryId) {
      toast.error("You cannot remove your primary email address.");
      return;
    }
    setLoadingId(emailId);
    try {
      const ea = user.emailAddresses.find(e => e.id === emailId);
      if (!ea) throw new Error("Email not found.");
      await ea.destroy();
      toast.success("Email address removed.");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to remove email.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Email Addresses</p>
            <p className="text-xs text-slate-400">
              {emails.length} email{emails.length !== 1 ? "s" : ""} · manage and add addresses
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          {/* Email list */}
          {emails.map((ea: any) => {
            const isPrimary = ea.id === primaryId;
            const isVerified = ea.verification?.status === "verified";
            const isLoading = loadingId === ea.id;
            return (
              <div
                key={ea.id}
                className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${
                  isPrimary ? "border-emerald-200 bg-emerald-50/60" : "border-slate-100 bg-slate-50/40"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isVerified ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{ea.emailAddress}</p>
                    <p className="text-[11px] text-slate-400">
                      {isPrimary ? "Primary" : isVerified ? "Verified" : "Unverified"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isPrimary && isVerified && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleMakePrimary(ea.id)}
                      title="Set as primary"
                      className="h-7 w-7 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-400 hover:text-emerald-600 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                    </button>
                  )}
                  {!isPrimary && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleRemove(ea.id)}
                      title="Remove email"
                      className="h-7 w-7 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                  {isPrimary && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase">Primary</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* OTP verification for newly added email */}
          {pendingId && (
            <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50 space-y-3">
              <p className="text-xs font-semibold text-sky-800">Enter the verification code sent to your new email:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  className="flex-1 h-10 px-3 rounded-xl border border-sky-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                />
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying || otpCode.length !== 6}
                  className="h-10 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => { setPendingId(null); setOtpCode(""); setNewEmail(""); }}
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Add new email */}
          {!pendingId && (
            <>
              {adding ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    inputMode="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value.toLowerCase())}
                    placeholder="new@email.com"
                    className="flex-1 h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={sendingOtp || !newEmail.trim()}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {sendingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Send Code
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setNewEmail(""); }}
                    className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add email address
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function SecuritySection({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-center gap-2 pb-1">
          <Shield className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Security</h3>
        </div>
      )}
      <ChangePasswordSection />
      <SessionsSection />
      <EmailSection />
    </div>
  );
}

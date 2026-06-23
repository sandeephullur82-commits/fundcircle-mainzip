import React, { useState } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff, Lock, CheckCircle2, ShieldAlert } from "lucide-react";
import { doc, updateDoc, serverTimestamp, getDocs, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";
import AuthLayout from "./AuthLayout";

// ── Password strength ─────────────────────────────────────────────────────────
interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  bars: string[];
}

function getStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, label: "", color: "", bars: ["bg-white/10", "bg-white/10", "bg-white/10", "bg-white/10"] };
  const hasUpper   = /[A-Z]/.test(pw);
  const hasLower   = /[a-z]/.test(pw);
  const hasNumber  = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const long       = pw.length >= 12;

  const met = [hasUpper, hasLower, hasNumber, hasSpecial, long].filter(Boolean).length;

  if (pw.length < 8) return { score: 1, label: "Too short",  color: "text-red-400",    bars: ["bg-red-500",    "bg-white/10", "bg-white/10", "bg-white/10"] };
  if (met <= 2)      return { score: 1, label: "Weak",       color: "text-amber-400",  bars: ["bg-amber-400",  "bg-white/10", "bg-white/10", "bg-white/10"] };
  if (met === 3)     return { score: 2, label: "Fair",       color: "text-amber-400",  bars: ["bg-amber-400",  "bg-amber-400",  "bg-white/10", "bg-white/10"] };
  if (met === 4)     return { score: 3, label: "Good",       color: "text-blue-400",   bars: ["bg-blue-400",   "bg-blue-400",   "bg-blue-400",   "bg-white/10"] };
  return              { score: 4, label: "Strong",     color: "text-emerald-400", bars: ["bg-emerald-400", "bg-emerald-400", "bg-emerald-400", "bg-emerald-400"] };
}

export default function ChangePasswordPage() {
  const { user, isLoaded }     = useUser();
  const { organization }       = useOrganization();
  const { userMemberships }    = useOrganizationList({ userMemberships: true });
  const navigate               = useNavigate();

  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clerkError, setClerkError]   = useState("");
  const [success, setSuccess]         = useState(false);

  if (!isLoaded) return null;

  const strength = getStrength(password);

  const reqs = [
    { label: "At least 8 characters",  met: password.length >= 8 },
    { label: "One uppercase letter",   met: /[A-Z]/.test(password) },
    { label: "One lowercase letter",   met: /[a-z]/.test(password) },
    { label: "One number",             met: /[0-9]/.test(password) },
  ];

  const allReqsMet     = reqs.every(r => r.met);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  const canSubmit = allReqsMet && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) return;

    setClerkError("");
    setIsSubmitting(true);

    try {
      await user.updatePassword({ newPassword: password });

      // Update Firestore membership/user status
      const orgId =
        organization?.id ||
        userMemberships?.data?.[0]?.organization?.id ||
        null;

      if (orgId) {
        const membershipId = membershipIdFor(orgId, user.id);
        try {
          await updateDoc(doc(db, "organizationMembers", membershipId), {
            status:      "ACTIVE",
            activatedAt: serverTimestamp(),
            updatedAt:   serverTimestamp(),
          });
        } catch (_) {}
        try {
          await updateDoc(doc(db, "memberships", membershipId), {
            status:      "ACTIVE",
            activatedAt: serverTimestamp(),
            updatedAt:   serverTimestamp(),
          });
        } catch (_) {}
      } else {
        try {
          const snap = await getDocs(query(
            collection(db, "organizationMembers"),
            where("clerkUserId", "==", user.id),
            where("status", "==", "PENDING_SETUP"),
          ));
          await Promise.all(snap.docs.map((d) =>
            updateDoc(d.ref, {
              status:      "ACTIVE",
              activatedAt: serverTimestamp(),
              updatedAt:   serverTimestamp(),
            })
          ));
        } catch (_) {}
      }

      try {
        await updateDoc(doc(db, "users", user.id), {
          status:      "ACTIVE",
          activatedAt: serverTimestamp(),
          updatedAt:   serverTimestamp(),
        });
      } catch (_) {}

      setSuccess(true);
      setTimeout(() => navigate("/router", { replace: true }), 2000);
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "";
      const msg  = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "";

      if (["form_password_pwned", "form_password_size_check_failed", "form_password_length_too_short"].includes(code)) {
        setClerkError("This password is too common or has been compromised. Please choose a different one.");
      } else if (code === "too_many_requests") {
        setClerkError("Too many attempts. Please wait a moment and try again.");
      } else if (code === "form_password_not_strong_enough") {
        setClerkError("Password does not meet security requirements. Please choose a stronger one.");
      } else {
        setClerkError(msg || "Failed to update password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <AuthLayout hideBackButton>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 mx-auto ring-4 ring-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-[1.5rem] font-bold text-white leading-tight">Password Set!</h2>
          <p className="mt-2 text-sm text-white/45">
            Your account is now secured. Taking you to your dashboard…
          </p>
          <div className="mt-5 flex justify-center">
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <AuthLayout hideBackButton>
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-600/25 to-blue-600/25">
            <Lock className="h-6 w-6 text-violet-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg mb-3">
            First Sign In
          </div>
          <h2 className="text-[1.5rem] font-bold text-white leading-tight">Create New Password</h2>
          <p className="mt-1.5 text-sm text-white/45">
            You're signed in with a temporary password.<br />Please set a permanent password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Clerk-only error banner */}
          {clerkError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {clerkError}
            </div>
          )}

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (clerkError) setClerkError(""); }}
                placeholder="Min. 8 characters"
                required
                autoFocus
                disabled={isSubmitting}
                className="w-full rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength bar — only shown when user starts typing */}
            {password.length > 0 && (
              <div className="pt-1 space-y-2">
                <div className="flex gap-1.5">
                  {strength.bars.map((bar, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${bar}`} />
                  ))}
                </div>
                {strength.label && (
                  <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
                )}
              </div>
            )}

            {/* Requirements checklist — grey until met, green when met */}
            {password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {reqs.map((r) => (
                  <li
                    key={r.label}
                    className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${
                      r.met ? "text-emerald-400" : "text-white/35"
                    }`}
                  >
                    <span
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold border transition-all duration-200 ${
                        r.met
                          ? "border-emerald-500/50 bg-emerald-500/20"
                          : "border-white/15 bg-white/5"
                      }`}
                    >
                      {r.met ? "✓" : ""}
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (clerkError) setClerkError(""); }}
                placeholder="Re-enter your new password"
                required
                disabled={isSubmitting}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none transition bg-white/[0.06] focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60 ${
                  passwordsMismatch
                    ? "border-red-500/50 focus:border-red-500/60"
                    : passwordsMatch
                      ? "border-emerald-500/50 focus:border-emerald-500/60"
                      : "border-white/[0.10] focus:border-violet-500/60"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordsMismatch && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Passwords do not match
              </p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Passwords match
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Setting password…</>
            ) : (
              "Set Password & Continue"
            )}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

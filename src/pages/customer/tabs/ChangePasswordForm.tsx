import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, RefreshCw, ShieldCheck, Mail,
  CheckCircle2, ExternalLink, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  userEmail: string;
  onSuccess?: () => void;
  onCancel: () => void;
}

type Step = "password_form" | "otp" | "done";

export default function ChangePasswordForm({ userEmail, onSuccess, onCancel }: Props) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("password_form");

  // Password step
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  // OTP step
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyingRef = useRef(false);

  const [error, setError] = useState("");

  useEffect(() => { verifyingRef.current = verifying; }, [verifying]);

  // Countdown timer
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  // ── Step 1: Validate password + send OTP ────────────────────────────────────
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isLoaded || !signIn) return;

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSending(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: userEmail,
      });
      setStep("otp");
      setCountdown(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "";
      const msg  = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? "Failed to send code.";
      if (code === "too_many_requests") setError("Too many attempts. Wait a moment and try again.");
      else setError(msg);
    } finally {
      setSending(false);
    }
  };

  // ── Step 2: Verify OTP + set password ──────────────────────────────────────
  const performVerify = useCallback(async (code: string) => {
    if (!isLoaded || !signIn || verifyingRef.current) return;
    if (code.length !== 6) { setError("Please enter the 6-digit code from your email."); return; }

    setError("");
    setVerifying(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });

      if ((result.status as string) === "complete") {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        setStep("done");
        toast.success("Password updated successfully!");
        setTimeout(() => onSuccess?.(), 1200);
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "";
      const msg  = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? "Invalid or expired code.";
      if (code === "too_many_requests") setError("Too many attempts. Please wait a moment.");
      else if (code === "form_password_pwned" || code === "form_password_size_check_failed")
        setError("Please choose a stronger password (min. 8 characters).");
      else setError(msg);
    } finally {
      setVerifying(false);
    }
  }, [isLoaded, signIn, setActive, newPassword, onSuccess]);

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    const code = otp.join("");
    if (code.length === 6 && !verifyingRef.current && isLoaded && signIn && step === "otp") {
      const t = setTimeout(() => performVerify(code), 120);
      return () => clearTimeout(t);
    }
  }, [otp, isLoaded, signIn, step, performVerify]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length > 0) {
      const filled = [...otp];
      digits.split("").forEach((d, i) => { if (i < 6) filled[i] = d; });
      setOtp(filled);
      inputRefs.current[Math.min(digits.length, 5)]?.focus();
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signIn || countdown > 0 || resending) return;
    setResending(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: userEmail,
      });
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setCountdown(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
      toast.success("A new code has been sent.");
    } catch {
      toast.error("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performVerify(otp.join(""));
  };

  const maskEmail = (email: string) => {
    const [user, domain] = email.split("@");
    if (!user || !domain) return email;
    return `${user[0]}${"•".repeat(Math.max(user.length - 2, 1))}${user.slice(-1)}@${domain}`;
  };

  // ── Shared UI helpers ────────────────────────────────────────────────────────
  const inputClass =
    "w-full h-10 pl-3 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 " +
    "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-colors";

  // ── Render ───────────────────────────────────────────────────────────────────

  // DONE step
  if (step === "done") {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white text-sm">Password updated!</p>
          <p className="text-xs text-slate-500 mt-0.5">Your account is now secured with the new password.</p>
        </div>
      </div>
    );
  }

  // OTP step
  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className="mt-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
          <Mail className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Verification code sent</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              Check your email at <span className="font-mono font-semibold">{maskEmail(userEmail)}</span>
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* OTP boxes */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            6-digit code
          </p>
          <div className="flex items-center justify-between gap-1.5" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                autoComplete="one-time-code"
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center text-lg font-bold text-slate-900 dark:text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 caret-blue-400"
              />
            ))}
          </div>
          <div className="text-center mt-2">
            {countdown > 0 ? (
              <p className="text-xs text-slate-400">Resend in {countdown}s</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setStep("password_form"); setOtp(["","","","","",""]); setError(""); }}
            className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button
            type="submit"
            disabled={verifying || otp.join("").length < 6}
            className="flex-1 h-10 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {verifying ? "Verifying…" : "Verify & Update"}
          </button>
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors py-1"
        >
          Cancel
        </button>
      </form>
    );
  }

  // PASSWORD FORM step
  return (
    <form onSubmit={handleSendCode} className="mt-4 space-y-3">
      {/* Info */}
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Enter your new password. We'll send a verification code to{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-300">{maskEmail(userEmail)}</span>{" "}
        to confirm the change.
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* New password */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">New Password</p>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Min. 8 characters"
            className={inputClass}
          />
          <button type="button" onClick={() => setShowNew(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Confirm password */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Confirm New Password</p>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Re-enter your new password"
            className={inputClass}
          />
          <button type="button" onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {/* Live match indicator */}
        {confirmPassword.length > 0 && (
          <p className={`text-[10px] mt-1 ${newPassword === confirmPassword ? "text-emerald-500" : "text-red-500"}`}>
            {newPassword === confirmPassword ? "✓ Passwords match" : "✗ Passwords don't match"}
          </p>
        )}
      </div>

      {/* Send code button */}
      <button
        type="submit"
        disabled={sending || !newPassword || !confirmPassword}
        className="w-full h-10 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        {sending ? "Sending code…" : "Send Verification Code"}
      </button>

      {/* Forgot password + Cancel */}
      <div className="flex items-center justify-between pt-0.5">
        <button
          type="button"
          onClick={() => navigate("/auth/forgot-password")}
          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Forgot Password?
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

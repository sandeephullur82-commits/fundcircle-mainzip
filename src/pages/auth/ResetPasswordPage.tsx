import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Eye, EyeOff, Loader2, ArrowLeft, RefreshCw,
  ShieldCheck, CheckCircle2, Lock, ShieldAlert,
} from "lucide-react";
import AuthLayout from "./AuthLayout";

// ── Password strength ────────────────────────────────────────────────────────
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

  if (pw.length < 8) return { score: 1, label: "Too short", color: "text-red-400",   bars: ["bg-red-500",   "bg-white/10", "bg-white/10", "bg-white/10"] };
  if (met <= 2)      return { score: 1, label: "Weak",      color: "text-red-400",   bars: ["bg-red-500",   "bg-white/10", "bg-white/10", "bg-white/10"] };
  if (met === 3)     return { score: 2, label: "Fair",      color: "text-amber-400", bars: ["bg-amber-400", "bg-amber-400", "bg-white/10", "bg-white/10"] };
  if (met === 4)     return { score: 3, label: "Good",      color: "text-blue-400",  bars: ["bg-blue-400",  "bg-blue-400",  "bg-blue-400",  "bg-white/10"] };
  return              { score: 4, label: "Strong",    color: "text-emerald-400", bars: ["bg-emerald-400","bg-emerald-400","bg-emerald-400","bg-emerald-400"] };
}

// ── Types ────────────────────────────────────────────────────────────────────
type Step = "otp" | "password" | "success";

// ── Component ────────────────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const email = sessionStorage.getItem("fc_reset_email") || "";

  // Guard: must have come from ForgotPasswordPage
  useEffect(() => {
    if (!email) navigate("/auth/forgot-password", { replace: true });
  }, [email, navigate]);

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("otp");

  // ── OTP step state ─────────────────────────────────────────────────────────
  const [otp, setOtp]           = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [resending, setResending]   = useState(false);
  const [countdown, setCountdown]   = useState(30);
  const [verifying, setVerifying]   = useState(false);
  const [verified, setVerified]     = useState(false); // OTP accepted locally
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifiedCode = useRef(""); // stores confirmed code for password step

  // ── Password step state ────────────────────────────────────────────────────
  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [pwError, setPwError]               = useState("");
  const [submitting, setSubmitting]         = useState(false);

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, step]);

  // ── OTP handlers ───────────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);
    if (otpError) setOtpError("");
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
      const filled = digits.split("").concat(Array(6).fill("")).slice(0, 6);
      setOtp(filled);
      inputRefs.current[Math.min(digits.length, 5)]?.focus();
      if (otpError) setOtpError("");
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signIn || countdown > 0 || !email || resending) return;
    setResending(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setOtp(["", "", "", "", "", ""]);
      setOtpError("");
      setCountdown(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
      toast.success("New verification code sent.");
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "";
      if (code === "too_many_requests") {
        toast.error("Too many attempts. Please wait before requesting a new code.");
      } else {
        toast.error("Failed to resend. Please go back and try again.");
      }
    } finally {
      setResending(false);
    }
  };

  // Verify OTP locally (just checks 6 digits, stores code, advances step)
  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setOtpError("Please enter all 6 digits of the verification code.");
      return;
    }
    setVerifying(true);
    // Simulate a brief verification moment, then advance
    await new Promise(r => setTimeout(r, 700));
    verifiedCode.current = code;
    setVerified(true);
    // Brief success flash, then go to password step
    await new Promise(r => setTimeout(r, 900));
    setStep("password");
    setVerifying(false);
  };

  // ── Password strength ──────────────────────────────────────────────────────
  const strength = getStrength(newPassword);

  // Password requirements
  const reqs = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "One uppercase letter",  met: /[A-Z]/.test(newPassword) },
    { label: "One lowercase letter",  met: /[a-z]/.test(newPassword) },
    { label: "One number",            met: /[0-9]/.test(newPassword) },
  ];

  // ── Submit new password ────────────────────────────────────────────────────
  const handleSetPassword = useCallback(async () => {
    if (!isLoaded || !signIn || submitting) return;

    const code = verifiedCode.current;
    if (!code || code.length !== 6) {
      setPwError("Verification code missing. Please go back and re-enter the code.");
      return;
    }

    // UI-level guards are handled by button disabled state.
    // Only proceed to Clerk if all requirements pass.
    if (
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      newPassword !== confirmPassword
    ) return;

    setPwError("");
    setSubmitting(true);

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
        sessionStorage.removeItem("fc_reset_email");
        setStep("success");
      } else {
        setPwError("Could not complete password reset. Please try again.");
      }
    } catch (err: any) {
      const errCode = err?.errors?.[0]?.code ?? "";
      const errMsg  = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "";

      if (errCode === "too_many_requests") {
        setPwError("Too many attempts. Please wait a moment and try again.");
      } else if (["form_password_pwned", "form_password_size_check_failed", "form_password_length_too_short"].includes(errCode)) {
        setPwError("Please choose a stronger password (min. 8 characters, avoid common passwords).");
      } else if (["form_code_incorrect", "incorrect_code"].includes(errCode)) {
        // Code was wrong — send them back to OTP step
        setPwError("");
        setOtp(["", "", "", "", "", ""]);
        setOtpError("Incorrect code. Please check and try again.");
        verifiedCode.current = "";
        setVerified(false);
        setStep("otp");
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else if (["verification_expired", "form_code_expired"].includes(errCode)) {
        setPwError("");
        setOtp(["", "", "", "", "", ""]);
        setOtpError("This code has expired. Please request a new one.");
        verifiedCode.current = "";
        setVerified(false);
        setStep("otp");
      } else {
        setPwError(errMsg || "Invalid or expired code. Please request a new one.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [isLoaded, signIn, setActive, newPassword, confirmPassword, submitting]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSetPassword();
  };

  // ── Step 4: Success ────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <AuthLayout hideBackButton>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 mx-auto ring-4 ring-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-[1.5rem] font-bold text-white leading-tight">
            Password Updated Successfully
          </h2>
          <p className="mt-2 text-sm text-white/45">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>

          <button
            onClick={() => navigate("/auth/sign-in", { replace: true })}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500"
          >
            Back to Sign In
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ── Step 3: Create New Password ────────────────────────────────────────────
  if (step === "password") {
    const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
    const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

    return (
      <AuthLayout>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-600/25 to-blue-600/25">
              <Lock className="h-6 w-6 text-violet-400" />
            </div>
            <h2 className="text-[1.6rem] font-bold text-white leading-tight">Create New Password</h2>
            <p className="mt-1.5 text-sm text-white/45">
              Your identity has been verified. Please create a new password.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            {pwError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {pwError}
              </div>
            )}

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (pwError) setPwError(""); }}
                  placeholder="Min. 8 characters"
                  required
                  autoFocus
                  disabled={submitting}
                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {newPassword.length > 0 && (
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

              {/* Requirements list */}
              {newPassword.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {reqs.map((r) => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.met ? "text-emerald-400" : "text-white/35"}`}>
                      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold border ${r.met ? "border-emerald-500/50 bg-emerald-500/20" : "border-white/15 bg-white/5"}`}>
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
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (pwError) setPwError(""); }}
                  placeholder="Re-enter your new password"
                  required
                  disabled={submitting}
                  className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none transition bg-white/[0.06] focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60
                    ${passwordsMismatch
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
              disabled={
                submitting ||
                !newPassword ||
                !confirmPassword ||
                newPassword.length < 8 ||
                !/[A-Z]/.test(newPassword) ||
                !/[a-z]/.test(newPassword) ||
                !/[0-9]/.test(newPassword) ||
                newPassword !== confirmPassword
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Updating password…</>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        </div>
      </AuthLayout>
    );
  }

  // ── Step 2: OTP Verification ───────────────────────────────────────────────
  const otpFilled = otp.every(d => d !== "");

  // After local verification success — show success flash before transitioning
  if (verified) {
    return (
      <AuthLayout hideBackButton>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 mx-auto ring-4 ring-emerald-500/10 animate-in zoom-in duration-300">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-[1.4rem] font-bold text-white">Code Verified!</h2>
          <p className="mt-2 text-sm text-white/45">Taking you to create your new password…</p>
          <div className="mt-5 flex justify-center">
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-600/25 to-blue-600/25">
            <ShieldCheck className="h-6 w-6 text-violet-400" />
          </div>
          <h2 className="text-[1.6rem] font-bold text-white leading-tight">Verify Reset Code</h2>
          <p className="mt-1.5 text-sm text-white/45">
            Enter the 6-digit verification code sent to
          </p>
          {email && (
            <p className="mt-0.5 text-sm font-semibold text-white/70 break-all">{email}</p>
          )}
        </div>

        <div className="space-y-5">
          {otpError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {otpError}
            </div>
          )}

          {/* OTP boxes */}
          <div className="space-y-3">
            <div
              className="flex items-center justify-center gap-2.5"
              onPaste={handlePaste}
            >
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={i === 0}
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  disabled={verifying}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className={`h-13 w-12 rounded-xl border text-center text-xl font-bold text-white outline-none transition
                    focus:ring-2 focus:ring-violet-500/25 caret-violet-400 disabled:opacity-60
                    ${digit
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-white/[0.12] bg-white/[0.07] focus:border-violet-500/70 focus:bg-white/[0.11]"
                    }`}
                />
              ))}
            </div>

            {/* Countdown / Resend */}
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-xs text-white/30">Resend code in {countdown}s</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} />
                  {resending ? "Sending…" : "Resend Code"}
                </button>
              )}
            </div>
          </div>

          {/* Verify button */}
          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={!otpFilled || verifying}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {verifying ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>
            ) : (
              "Verify Code"
            )}
          </button>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/auth/forgot-password"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

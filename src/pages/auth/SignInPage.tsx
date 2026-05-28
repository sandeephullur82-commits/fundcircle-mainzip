import React, { useState, useEffect, useRef } from "react";
import { useSignIn, useUser } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import {
  Eye, EyeOff, Loader2, AlertCircle,
  ShieldCheck, KeyRound, RotateCcw, ArrowLeft,
} from "lucide-react";
import AuthLayout from "./AuthLayout";

function clerkErrorMessage(err: any): string {
  const code = err?.errors?.[0]?.code || "";
  const long = err?.errors?.[0]?.longMessage || "";
  const short = err?.errors?.[0]?.message || "";

  if (code === "form_password_incorrect") return "Incorrect password. Please try again.";
  if (code === "form_identifier_not_found") return "No account found with that email address.";
  if (code === "form_param_format_invalid") return "Please enter a valid email address.";
  if (code === "too_many_requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "session_exists") return "You are already signed in.";
  if (code === "user_locked") return "This account has been locked. Please contact support.";
  if (code === "form_code_incorrect") return "Invalid verification code. Please check and try again.";
  if (code === "verification_expired") return "Code expired. Please start the sign-in process again.";
  if (code === "verification_failed") return "Verification failed. Please try again.";

  return long || short || "An unexpected error occurred. Please try again.";
}

type Step = "credentials" | "mfa";
type MfaStrategy = "totp" | "backup_code";

const OTP_LENGTH = 6;

export default function SignInPage() {
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("credentials");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>("totp");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [backupCode, setBackupCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (userLoaded && isSignedIn) {
      navigate("/router", { replace: true });
    }
  }, [userLoaded, isSignedIn, navigate]);

  useEffect(() => {
    if (step === "mfa") {
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    }
  }, [step]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn || !setActive || loading) return;
    setError("");
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim().toLowerCase(),
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      if (result.status === "needs_second_factor") {
        setStep("mfa");
        return;
      }

      if (result.status === "needs_first_factor") {
        setError("Email/password authentication is not enabled. Contact your administrator.");
        return;
      }

      if (result.status === "needs_new_password") {
        setError("Your password has expired. Use the forgot password flow to set a new one.");
        return;
      }

      setError("Sign-in returned an unexpected state. Please try again.");
    } catch (err: any) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn || !setActive || loading) return;
    setError("");
    setLoading(true);

    try {
      const code =
        mfaStrategy === "totp"
          ? otpDigits.join("").trim()
          : backupCode.replace(/\s+/g, "").trim();

      const result = await signIn.attemptSecondFactor({
        strategy: mfaStrategy,
        code,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      setError("Verification did not complete. Please try again.");
    } catch (err: any) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 1);
    const next = [...otpDigits];
    next[index] = cleaned;
    setOtpDigits(next);
    setError("");
    if (cleaned && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = "";
        setOtpDigits(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  };

  const resetToCredentials = () => {
    setStep("credentials");
    setError("");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setBackupCode("");
    setMfaStrategy("totp");
  };

  const otpComplete = otpDigits.every(Boolean);
  const canSubmitMfa = mfaStrategy === "totp" ? otpComplete : backupCode.trim().length >= 8;

  if (step === "mfa") {
    return (
      <AuthLayout>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
          <div className="mb-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 border border-violet-500/20">
              <ShieldCheck className="h-6 w-6 text-violet-400" />
            </div>
            <h2 className="text-[1.6rem] font-bold text-white leading-tight">Two-Factor Verification</h2>
            <p className="mt-1.5 text-sm text-white/45">
              {mfaStrategy === "totp"
                ? "Enter the 6-digit code from your authenticator app."
                : "Enter one of your backup recovery codes."}
            </p>
          </div>

          <form onSubmit={handleMfa} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {mfaStrategy === "totp" ? (
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Verification Code
                </label>
                <div
                  className="flex items-center justify-between gap-2"
                  onPaste={handleOtpPaste}
                >
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpInput(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      autoComplete="one-time-code"
                      className="h-14 w-full rounded-xl border border-white/[0.10] bg-white/[0.06] text-center text-xl font-bold text-white caret-transparent outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20 selection:bg-transparent"
                    />
                  ))}
                </div>
                <p className="text-xs text-white/30 text-center pt-1">
                  Open your authenticator app and enter the 6-digit code.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Backup Recovery Code
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => { setBackupCode(e.target.value); setError(""); }}
                  placeholder="xxxxxxxx-xxxx"
                  autoFocus
                  autoComplete="off"
                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 text-sm font-mono text-white placeholder-white/25 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20 tracking-widest"
                />
                <p className="text-xs text-white/30 pt-1">
                  Each backup code can only be used once.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmitMfa}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Verify
                </>
              )}
            </button>
          </form>

          <div className="mt-5 space-y-3">
            <div className="h-px bg-white/[0.06]" />

            {mfaStrategy === "totp" ? (
              <button
                type="button"
                onClick={() => { setMfaStrategy("backup_code"); setError(""); setOtpDigits(Array(OTP_LENGTH).fill("")); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/50 transition hover:bg-white/[0.07] hover:text-white/80"
              >
                <KeyRound className="h-4 w-4" />
                Use a backup recovery code instead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMfaStrategy("totp"); setError(""); setBackupCode(""); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/50 transition hover:bg-white/[0.07] hover:text-white/80"
              >
                <RotateCcw className="h-4 w-4" />
                Use authenticator app instead
              </button>
            )}

            <button
              type="button"
              onClick={resetToCredentials}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-white/35 transition hover:text-white/60"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="mb-7">
          <h2 className="text-[1.6rem] font-bold text-white leading-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-white/45">Sign in to your FundCircle account</p>
        </div>

        <form onSubmit={handleCredentials} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Password
              </label>
              <Link
                to="/auth/forgot-password"
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Don&apos;t have an account?{" "}
          <Link
            to="/auth/sign-up"
            className="font-semibold text-violet-400 hover:text-violet-300 transition-colors"
          >
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

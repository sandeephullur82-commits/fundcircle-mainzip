import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSignIn, useUser, useClerk } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, ShieldCheck, RefreshCw, AlertCircle, LogIn } from "lucide-react";
import AuthLayout from "./AuthLayout";

const OTP_LENGTH = 6;

function clerkMsg(err: any): { message: string; code: string } {
  const code     = err?.errors?.[0]?.code        ?? "unknown";
  const longMsg  = err?.errors?.[0]?.longMessage ?? "";
  const shortMsg = err?.errors?.[0]?.message     ?? "";
  const jsMsg    = err?.message                  ?? "";
  return { code, message: longMsg || shortMsg || jsMsg || "Verification failed. Please try again." };
}

export default function MfaVerifyPage() {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: userLoaded, isSignedIn, user }    = useUser();
  const clerk    = useClerk();
  const navigate = useNavigate();

  const [otp, setOtp]             = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [preparing, setPreparing] = useState(false);
  const [noFactors, setNoFactors] = useState(false);
  const [strategy, setStrategy]   = useState<"totp" | "phone_code" | "backup_code" | null>(null);
  const [phoneId, setPhoneId]     = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const submitting = useRef(false);
  const IS_DEV     = import.meta.env.DEV ||
    (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── GUARD 1: already signed in → skip MFA entirely ───────────────────────
  useEffect(() => {
    if (!userLoaded) return;
    if (!isSignedIn) return;

    // User has an active Clerk session — log debug info and route immediately
    const emailAddr = user?.primaryEmailAddress?.emailAddress ?? "—";
    const emailVerif = user?.primaryEmailAddress?.verification?.status ?? "—";
    const sessionId  = (clerk as any).session?.id ?? "—";

    console.log("════════════════════════════════════════════════");
    console.log("[FC MFA] ✓ User already signed in — skipping verification");
    console.log("[FC MFA]   user.id                              :", user?.id ?? "—");
    console.log("[FC MFA]   user.primaryEmailAddress             :", emailAddr);
    console.log("[FC MFA]   emailAddresses[0].verification.status:", emailVerif);
    console.log("[FC MFA]   session.id                           :", sessionId);
    console.log("[FC MFA]   → Continuing to /router");
    console.log("════════════════════════════════════════════════");

    navigate("/router", { replace: true });
  }, [userLoaded, isSignedIn]);

  // ── GUARD 2: detect strategy from pending signIn ──────────────────────────
  useEffect(() => {
    if (!signInLoaded || !userLoaded) return;
    if (isSignedIn) return; // handled by guard 1

    // No pending sign-in or wrong status → back to sign-in
    if (!signIn || signIn.status !== "needs_second_factor") {
      console.warn("[FC MFA] No pending needs_second_factor state (signIn.status:",
        signIn?.status ?? "null", ") — redirecting to /auth/sign-in");
      navigate("/auth/sign-in", { replace: true });
      return;
    }

    const factors: any[] = (signIn as any).supportedSecondFactors ?? [];
    const strategies     = factors.map((f: any) => f.strategy);

    console.log("════════════════════════════════════════════════");
    console.log("[FC MFA] needs_second_factor detected");
    console.log("[FC MFA]   signIn.status           :", signIn.status);
    console.log("[FC MFA]   supportedSecondFactors  :", JSON.stringify(strategies));
    console.log("[FC MFA]   supportedFirstFactors   :", JSON.stringify(
      ((signIn as any).supportedFirstFactors ?? []).map((f: any) => f.strategy)
    ));
    console.log("════════════════════════════════════════════════");

    if (factors.length === 0) {
      // MFA required by Clerk instance but user has no second factor enrolled.
      // Cannot proceed — show actionable error instead of dead-end.
      console.error("[FC MFA] ✗ supportedSecondFactors is empty — MFA required but no method enrolled");
      console.error("[FC MFA]   Fix: Clerk Dashboard → Configure → Multi-factor → set to Off");
      console.error("[FC MFA]   OR:  The user must enroll a second factor on their account");
      setNoFactors(true);
      return;
    }

    const totp   = factors.find((f: any) => f.strategy === "totp");
    const phone  = factors.find((f: any) => f.strategy === "phone_code");
    const backup = factors.find((f: any) => f.strategy === "backup_code");

    if (totp) {
      console.log("[FC MFA] Strategy selected: totp");
      setStrategy("totp");
    } else if (phone) {
      console.log("[FC MFA] Strategy selected: phone_code | phoneNumberId:", phone.phoneNumberId);
      setStrategy("phone_code");
      setPhoneId(phone.phoneNumberId ?? null);
      preparePhone(phone.phoneNumberId);
    } else if (backup) {
      console.log("[FC MFA] Strategy selected: backup_code");
      setStrategy("backup_code");
    } else {
      // Factor present but unrecognised strategy
      console.error("[FC MFA] ✗ Unrecognised factor strategies:", JSON.stringify(strategies));
      setNoFactors(true);
    }
  }, [signInLoaded, userLoaded, isSignedIn, signIn?.status]);

  // ── Prepare phone_code ────────────────────────────────────────────────────
  const preparePhone = useCallback(async (id?: string | null) => {
    if (!signIn) return;
    const pid = id ?? phoneId;
    if (!pid) { setError("Phone number not found."); return; }
    setPreparing(true);
    try {
      await (signIn as any).prepareSecondFactor({ strategy: "phone_code", phoneNumberId: pid });
      console.log("[FC MFA] SMS code sent — phoneNumberId:", pid);
      setCountdown(30);
      setError("");
    } catch (err: any) {
      const { message } = clerkMsg(err);
      console.error("[FC MFA] prepareSecondFactor failed:", message);
      setError(message);
    } finally {
      setPreparing(false);
    }
  }, [signIn, phoneId]);

  // ── Attempt second factor ─────────────────────────────────────────────────
  const attemptVerify = useCallback(async (code: string) => {
    if (!signInLoaded || !signIn || !setActive || submitting.current || !strategy) return;
    if (code.replace(/\s/g, "").length < OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit code.`);
      return;
    }

    setError("");
    submitting.current = true;
    setLoading(true);

    console.log("════════════════════════════════════════════════");
    console.log("[FC MFA] ▶ attemptSecondFactor — strategy:", strategy);
    console.log("════════════════════════════════════════════════");

    try {
      const result = await (signIn as any).attemptSecondFactor({ strategy, code: code.trim() });
      const status = result.status as string;

      console.log("[FC MFA] attemptSecondFactor result:");
      console.log("[FC MFA]   status          :", status);
      console.log("[FC MFA]   createdSessionId:", result.createdSessionId ?? "null");

      if (status === "complete") {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          console.log("[FC MFA] ✓ Session activated:", result.createdSessionId);
        } else {
          console.warn("[FC MFA] status=complete, sessionId=null — session may already be active");
        }
        navigate("/router", { replace: true });
        return;
      }

      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      console.warn("[FC MFA] Unexpected status after attemptSecondFactor:", status);
      setError(`Verification returned status: ${status}. Please try again.`);
    } catch (err: any) {
      const { message, code } = clerkMsg(err);
      console.error("[FC MFA] ✗ attemptSecondFactor error — code:", code, "| message:", message);

      if (code === "session_exists" || code === "already_signed_in") {
        navigate("/router", { replace: true });
        return;
      }

      setError(message);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [signInLoaded, signIn, setActive, navigate, strategy]);

  // ── Auto-submit on last digit ─────────────────────────────────────────────
  useEffect(() => {
    const code = otp.join("");
    if (
      code.length === OTP_LENGTH &&
      otp.every(d => d !== "") &&
      !submitting.current &&
      signInLoaded &&
      strategy
    ) {
      const t = setTimeout(() => attemptVerify(code), 300);
      return () => clearTimeout(t);
    }
  }, [otp, signInLoaded, strategy, attemptVerify]);

  // ── OTP handlers ─────────────────────────────────────────────────────────
  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      const u = [...otp]; u[index] = ""; setOtp(u); return;
    }
    if (digits.length > 1) {
      const filled = [...otp];
      [...digits].forEach((d, offset) => { if (index + offset < OTP_LENGTH) filled[index + offset] = d; });
      setOtp(filled);
      setTimeout(() => inputRefs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus(), 0);
      return;
    }
    const u = [...otp]; u[index] = digits; setOtp(u);
    if (index < OTP_LENGTH - 1) setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (otp[index]) { const u = [...otp]; u[index] = ""; setOtp(u); }
      else if (index > 0) inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft"  && index > 0)            { e.preventDefault(); inputRefs.current[index - 1]?.focus(); }
    else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) { e.preventDefault(); inputRefs.current[index + 1]?.focus(); }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    const filled = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] ?? "");
    setOtp(filled);
    setTimeout(() => inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus(), 0);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); attemptVerify(otp.join("")); };

  // ── Loading state (waiting for Clerk) ────────────────────────────────────
  if (!signInLoaded || !userLoaded) {
    return (
      <AuthLayout hideBackButton>
        <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-10 backdrop-blur-2xl flex flex-col items-center gap-4">
          <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
          <p className="text-sm text-white/50">Checking session…</p>
        </div>
      </AuthLayout>
    );
  }

  // ── No-factors dead-end: clear error + back button ────────────────────────
  if (noFactors) {
    return (
      <AuthLayout>
        <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-8 backdrop-blur-2xl shadow-2xl shadow-black/70">
          <div className="mb-6 flex flex-col items-center text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white">MFA required but not configured</h2>
            <p className="text-sm text-white/55 max-w-xs">
              Your Clerk instance requires multi-factor authentication, but this account has no
              second-factor method enrolled. Ask your administrator to disable MFA in the
              Clerk dashboard.
            </p>
            {IS_DEV && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-2.5 text-left w-full">
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  <strong>Dev fix:</strong> Clerk Dashboard → <strong>Configure → Multi-factor</strong> → set to <strong>Off</strong>.
                </p>
              </div>
            )}
          </div>
          <Link
            to="/auth/sign-in"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
          >
            <LogIn className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const strategyLabel = {
    totp:        "Enter the 6-digit code from your authenticator app.",
    phone_code:  "Enter the 6-digit code sent to your phone.",
    backup_code: "Enter one of your backup codes.",
  };
  const strategyTitle = {
    totp:        "Two-factor verification",
    phone_code:  "Phone verification",
    backup_code: "Use a backup code",
  };

  return (
    <AuthLayout hideBackButton>
      <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-8 backdrop-blur-2xl shadow-2xl shadow-black/70 ring-1 ring-inset ring-white/[0.05]">

        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/30 to-blue-600/30 shadow-lg shadow-violet-900/20">
            <ShieldCheck className="h-7 w-7 text-violet-300" />
          </div>
          <h2 className="text-[1.75rem] font-bold text-white leading-tight tracking-tight">
            {strategy ? strategyTitle[strategy] : "Verifying…"}
          </h2>
          <p className="mt-2 text-sm text-white/55 max-w-xs">
            {strategy ? strategyLabel[strategy] : "Please wait while we detect your verification method."}
          </p>
        </div>

        {IS_DEV && strategy && (
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-2.5">
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              <strong>Dev:</strong> Active MFA strategy:{" "}
              <code className="bg-amber-900/40 px-1 rounded">{strategy}</code>.
              To disable MFA: <strong>Clerk Dashboard → Configure → Multi-factor → Off</strong>.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          {strategy && (
            <div className="flex items-center justify-center gap-3" onPaste={handlePaste} role="group" aria-label="Verification code">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={i === 0}
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  disabled={loading || preparing}
                  onChange={e => handleChange(i, e)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className={[
                    "h-14 w-12 rounded-xl border-2 bg-white/[0.07] text-center text-2xl font-bold text-white",
                    "outline-none transition-all duration-150 caret-violet-400 sm:h-16 sm:w-14 sm:text-3xl disabled:opacity-50",
                    digit
                      ? "border-violet-500 bg-white/[0.10] shadow-[0_0_0_3px_rgba(139,92,246,0.18)]"
                      : "border-white/20 hover:border-white/35",
                    "focus:border-violet-400 focus:bg-white/[0.12] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.25)]",
                  ].join(" ")}
                />
              ))}
            </div>
          )}

          {!strategy && !noFactors && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
            </div>
          )}

          {strategy === "phone_code" && (
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-xs text-white/30">Resend in {countdown}s</p>
              ) : (
                <button
                  type="button"
                  onClick={() => preparePhone()}
                  disabled={preparing}
                  className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${preparing ? "animate-spin" : ""}`} />
                  {preparing ? "Sending…" : "Resend code"}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || preparing || !strategy || otp.some(d => d === "")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading    ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>    :
             preparing  ? <><Loader2 className="h-4 w-4 animate-spin" />Sending code…</> :
                          "Verify & continue"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/45">
          Having trouble?{" "}
          <Link to="/auth/sign-in" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";
import AuthLayout from "./AuthLayout";

const OTP_LENGTH = 6;

function clerkMsg(err: any): { message: string; code: string } {
  const code    = err?.errors?.[0]?.code       ?? "unknown";
  const longMsg = err?.errors?.[0]?.longMessage ?? "";
  const shortMsg = err?.errors?.[0]?.message   ?? "";
  const jsMsg   = err?.message                 ?? "";
  return { code, message: longMsg || shortMsg || jsMsg || "Verification failed. Please try again." };
}

export default function MfaVerifyPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [otp, setOtp]           = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [preparing, setPreparing] = useState(false);
  const [strategy, setStrategy] = useState<"totp" | "phone_code" | "backup_code" | null>(null);
  const [phoneId, setPhoneId]   = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const submitting = useRef(false);

  // ── Countdown for SMS resend ──────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Guard + strategy detection ────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;

    if (!signIn || signIn.status !== "needs_second_factor") {
      console.warn("[FC MFA] No pending second factor — redirecting to sign-in");
      navigate("/auth/sign-in", { replace: true });
      return;
    }

    const factors = (signIn as any).supportedSecondFactors ?? [];
    console.log("[FC MFA] supportedSecondFactors:", JSON.stringify(factors.map((f: any) => f.strategy)));

    // Pick best available strategy: TOTP > phone_code > backup_code
    const totp  = factors.find((f: any) => f.strategy === "totp");
    const phone = factors.find((f: any) => f.strategy === "phone_code");
    const backup = factors.find((f: any) => f.strategy === "backup_code");

    if (totp) {
      console.log("[FC MFA] Using strategy: totp");
      setStrategy("totp");
    } else if (phone) {
      console.log("[FC MFA] Using strategy: phone_code | phoneNumberId:", phone.phoneNumberId);
      setStrategy("phone_code");
      setPhoneId(phone.phoneNumberId ?? null);
      // Automatically send the SMS code
      preparePhone(phone.phoneNumberId);
    } else if (backup) {
      console.log("[FC MFA] Using strategy: backup_code");
      setStrategy("backup_code");
    } else {
      console.error("[FC MFA] No supported second factor strategy found:", factors);
      setError("No supported verification method found. Please contact your administrator.");
    }
  }, [isLoaded, signIn?.status]);

  // ── Prepare phone_code ────────────────────────────────────────────────────
  const preparePhone = useCallback(async (id?: string | null) => {
    if (!signIn) return;
    const pid = id ?? phoneId;
    if (!pid) { setError("Phone number not found."); return; }
    setPreparing(true);
    try {
      await (signIn as any).prepareSecondFactor({ strategy: "phone_code", phoneNumberId: pid });
      console.log("[FC MFA] SMS code sent to phoneNumberId:", pid);
      setCountdown(30);
      setError("");
    } catch (err: any) {
      const { message } = clerkMsg(err);
      console.error("[FC MFA] prepareSecondFactor failed:", message, err);
      setError(message);
    } finally {
      setPreparing(false);
    }
  }, [signIn, phoneId]);

  // ── Attempt second factor ─────────────────────────────────────────────────
  const attemptVerify = useCallback(async (code: string) => {
    if (!isLoaded || !signIn || !setActive || submitting.current || !strategy) return;
    if (code.replace(/\s/g, "").length < OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit code.`);
      return;
    }

    setError("");
    submitting.current = true;
    setLoading(true);

    console.log("════════════════════════════════════════════════");
    console.log("[FC MFA] ▶ attemptSecondFactor");
    console.log("[FC MFA]   strategy:", strategy);
    console.log("[FC MFA]   code length:", code.length);
    console.log("════════════════════════════════════════════════");

    try {
      const result = await (signIn as any).attemptSecondFactor({
        strategy,
        code: code.trim(),
      });

      const status = result.status as string;
      console.log("[FC MFA] attemptSecondFactor result — status:", status, "| sessionId:", result.createdSessionId ?? "null");

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

      // Recovery: session issued despite non-complete status
      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      console.warn("[FC MFA] Unexpected status after attemptSecondFactor:", status);
      setError("Verification returned an unexpected state. Please try again.");
    } catch (err: any) {
      const { message, code } = clerkMsg(err);
      console.error("[FC MFA] ✗ attemptSecondFactor error — code:", code, "| message:", message, err);

      if (code === "session_exists" || code === "already_signed_in") {
        navigate("/router", { replace: true });
        return;
      }

      setError(message);
      // Clear the OTP boxes and refocus
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [isLoaded, signIn, setActive, navigate, strategy]);

  // ── Auto-submit when all digits entered ───────────────────────────────────
  useEffect(() => {
    const code = otp.join("");
    if (code.length === OTP_LENGTH && otp.every(d => d !== "") && !submitting.current && isLoaded && strategy) {
      const t = setTimeout(() => attemptVerify(code), 300);
      return () => clearTimeout(t);
    }
  }, [otp, isLoaded, strategy, attemptVerify]);

  // ── OTP input handlers ────────────────────────────────────────────────────
  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      const updated = [...otp];
      updated[index] = "";
      setOtp(updated);
      return;
    }
    if (digits.length > 1) {
      // Paste into multiple boxes
      const filled = [...otp];
      [...digits].forEach((d, offset) => {
        if (index + offset < OTP_LENGTH) filled[index + offset] = d;
      });
      setOtp(filled);
      const focusAt = Math.min(index + digits.length, OTP_LENGTH - 1);
      setTimeout(() => inputRefs.current[focusAt]?.focus(), 0);
      return;
    }
    const updated = [...otp];
    updated[index] = digits;
    setOtp(updated);
    if (index < OTP_LENGTH - 1) setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (otp[index]) {
        const updated = [...otp];
        updated[index] = "";
        setOtp(updated);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    const filled = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] ?? "");
    setOtp(filled);
    setTimeout(() => inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus(), 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    attemptVerify(otp.join(""));
  };

  // ── Strategy labels ───────────────────────────────────────────────────────
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

  const IS_DEV = import.meta.env.DEV || (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");

  if (!isLoaded) return null;

  return (
    <AuthLayout hideBackButton>
      <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-8 backdrop-blur-2xl shadow-2xl shadow-black/70 ring-1 ring-inset ring-white/[0.05]">

        {/* Header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/30 to-blue-600/30 shadow-lg shadow-violet-900/20">
            <ShieldCheck className="h-7 w-7 text-violet-300" />
          </div>
          <h2 className="text-[1.75rem] font-bold text-white leading-tight tracking-tight">
            {strategy ? strategyTitle[strategy] : "Verification required"}
          </h2>
          <p className="mt-2 text-sm text-white/55 max-w-xs">
            {strategy ? strategyLabel[strategy] : "Please wait…"}
          </p>
        </div>

        {/* Dev info banner */}
        {IS_DEV && strategy && (
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-2.5">
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              <strong>Dev:</strong> MFA strategy active: <code className="bg-amber-900/40 px-1 rounded">{strategy}</code>.
              To disable MFA, go to your <strong>Clerk Dashboard → Configure → Multi-factor</strong> and set it to <strong>Off</strong>.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          {/* OTP boxes */}
          {strategy && (
            <div
              className="flex items-center justify-center gap-3"
              onPaste={handlePaste}
              role="group"
              aria-label="Verification code input"
            >
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
                    "outline-none transition-all duration-150 caret-violet-400 sm:h-16 sm:w-14 sm:text-3xl",
                    "disabled:opacity-50",
                    digit
                      ? "border-violet-500 bg-white/[0.10] shadow-[0_0_0_3px_rgba(139,92,246,0.18)]"
                      : "border-white/20 hover:border-white/35",
                    "focus:border-violet-400 focus:bg-white/[0.12] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.25)]",
                  ].join(" ")}
                />
              ))}
            </div>
          )}

          {/* SMS resend */}
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

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || preparing || !strategy || otp.some(d => d === "")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>
            ) : preparing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Sending code…</>
            ) : (
              "Verify & continue"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/45">
          Having trouble?{" "}
          <Link
            to="/auth/sign-in"
            className="font-semibold text-violet-400 hover:text-violet-300 transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

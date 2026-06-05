import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSignUp } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, Pencil } from "lucide-react";
import AuthLayout from "./AuthLayout";

function markOtpSent() {
  sessionStorage.setItem("fc_otp_sent_at", new Date().toISOString());
  sessionStorage.removeItem("fc_otp_verified_at");
  const count = parseInt(sessionStorage.getItem("fc_otp_request_count") || "0") + 1;
  sessionStorage.setItem("fc_otp_request_count", String(count));
  console.log("[FC OTP] ✉ OTP resent | request_count:", count);
}

export default function VerifyEmailPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [otp, setOtp]             = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState("");
  const [countdown, setCountdown] = useState(30);

  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const loadingRef = useRef(false);
  const email      = sessionStorage.getItem("fc_signup_email") || "";

  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  // Guard: ensure the user arrived here with an active signUp session and a
  // successfully dispatched OTP. If either condition fails, send them back to
  // sign-up with an explanatory error so they can try again cleanly.
  useEffect(() => {
    if (!isLoaded) return;

    // No Clerk signUp session at all — user navigated here directly.
    if (!signUp?.id) {
      console.warn("[FC Verify] No active signUp session — redirecting to /auth/sign-up");
      navigate("/auth/sign-up", { replace: true });
      return;
    }

    // signUp session exists but OTP was never dispatched (fc_otp_request_count === 0).
    // This happens when the resume-detection useEffect in SignUpPage was supposed to
    // be suppressed but still fired — catch it here as a second line of defence.
    const otpCount = parseInt(sessionStorage.getItem("fc_otp_request_count") || "0");
    if (otpCount === 0 && signUp.status === "missing_requirements") {
      console.warn("[FC Verify] OTP not yet sent (request_count=0) — redirecting to /auth/sign-up with error");
      sessionStorage.setItem("fc_verify_error", "Verification code could not be sent. Please try again.");
      navigate("/auth/sign-up", { replace: true });
      return;
    }

    // Already complete — activate and move on.
    if (signUp.status === "complete" && signUp.createdSessionId && setActive) {
      console.log("[FC Verify] signUp already complete — activating session:", signUp.createdSessionId);
      setActive({ session: signUp.createdSessionId }).then(() => {
        console.log("[FC Verify] ✓ Session activated — redirecting to /auth/callback");
        navigate("/auth/callback", { replace: true });
      });
    }
  }, [isLoaded, signUp?.status, signUp?.id, signUp?.createdSessionId]);

  // Pick up the verify error written by the guard above when the user is sent back.
  useEffect(() => {
    const stored = sessionStorage.getItem("fc_verify_error");
    if (stored) {
      sessionStorage.removeItem("fc_verify_error");
      setError(stored);
    }
  }, []);

  const performVerify = useCallback(async (code: string) => {
    if (!isLoaded || !signUp || loadingRef.current) return;
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setError("");
    setLoading(true);

    const sentAt      = sessionStorage.getItem("fc_otp_sent_at");
    const verifyStart = Date.now();
    console.log("[FC Verify] ▶ Attempting email verification");
    console.log("[FC Verify]   email        :", email || "(not in sessionStorage)");
    console.log("[FC Verify]   signUp.id    :", signUp.id ?? "null");
    console.log("[FC Verify]   signUp.status:", signUp.status);
    console.log("[FC Verify]   otp_sent_at  :", sentAt ?? "not recorded");
    if (sentAt) {
      console.log("[FC Verify]   wait since sent:", `${((Date.now() - new Date(sentAt).getTime()) / 1000).toFixed(1)}s`);
    }

    try {
      console.log("[FC Verify] ▶ signUp.attemptEmailAddressVerification({ code })…");
      const result = await signUp.attemptEmailAddressVerification({ code });
      const status = result.status as string;

      console.log("[FC Verify] ✓ attemptEmailAddressVerification result:");
      console.log("[FC Verify]   status           :", status);
      console.log("[FC Verify]   createdSessionId :", result.createdSessionId ?? "null");
      console.log("[FC Verify]   api_took         :", `${Date.now() - verifyStart}ms`);

      if (status === "complete") {
        const verifiedAt = new Date().toISOString();
        sessionStorage.setItem("fc_otp_verified_at", verifiedAt);
        if (sentAt) {
          const deliveryMs = new Date(verifiedAt).getTime() - new Date(sentAt).getTime();
          console.log("[FC OTP] ✓ Verification complete | delivery_ms:", deliveryMs, `(${(deliveryMs / 1000).toFixed(1)}s)`);
        }

        if (result.createdSessionId) {
          console.log("[FC Verify] ▶ Activating session:", result.createdSessionId);
          await setActive({ session: result.createdSessionId });
          console.log("[FC Verify] ✓ Session activated");
        } else {
          console.warn("[FC Verify] status=complete, sessionId=null — session already active");
        }

        sessionStorage.removeItem("fc_signup_email");
        console.log("[FC Verify] → Redirecting to /auth/callback");
        navigate("/auth/callback", { replace: true });
      } else {
        console.warn("[FC Verify] ✗ Unexpected verification status:", status);
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: any) {
      const errCode = err?.errors?.[0]?.code ?? "unknown";
      const msg     = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? "unknown";
      console.error("[FC Verify] ✗ Verification error");
      console.error("[FC Verify]   code   :", errCode);
      console.error("[FC Verify]   message:", msg);
      console.error("[FC Verify]   errors :", err?.errors ?? "none");

      if (errCode === "too_many_requests")       setError("Too many attempts. Please wait a moment and try again.");
      else if (errCode === "verification_expired") setError("Code expired. Please request a new one.");
      else setError("Invalid or expired code. Please try again.");
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signUp, setActive, navigate, email]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await performVerify(otp.join(""));
  };

  // Auto-submit when all 6 digits are filled.
  useEffect(() => {
    const code = otp.join("");
    if (code.length === 6 && !loadingRef.current && isLoaded && signUp) {
      const t = setTimeout(() => performVerify(code), 120);
      return () => clearTimeout(t);
    }
  }, [otp, isLoaded, signUp, performVerify]);

  const handleChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (!isLoaded || !signUp || countdown > 0 || resending) return;
    setResending(true);
    console.log("[FC Verify] Resending OTP to:", email);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      markOtpSent();
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setCountdown(30);
      inputRefs.current[0]?.focus();
      toast.success("A new code has been sent to your email.");
    } catch (err: any) {
      const msg  = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? String(err);
      const code = err?.errors?.[0]?.code ?? "resend_failed";
      console.error("[FC Verify] Failed to resend OTP | code:", code, "| message:", msg);
      toast.error("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // Clear OTP sessionStorage flags so the guard resets on the next signup attempt,
  // then navigate back to sign-up with a flag that prevents the resume-detection
  // useEffect from bouncing the user straight back here.
  const handleEditEmail = () => {
    sessionStorage.removeItem("fc_otp_request_count");
    sessionStorage.removeItem("fc_otp_sent_at");
    sessionStorage.removeItem("fc_otp_type");
    sessionStorage.removeItem("fc_verify_error");
    navigate("/auth/sign-up", { replace: true, state: { editingEmail: true } });
  };

  const allFilled = otp.join("").length === 6;

  return (
    <AuthLayout hideBackButton>
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-2xl shadow-2xl shadow-black/60">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/30 to-blue-600/30 shadow-lg shadow-violet-900/20">
            <Mail className="h-7 w-7 text-violet-300" />
          </div>
          <h2 className="text-[1.75rem] font-bold text-white leading-tight tracking-tight">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-white/50">We sent a 6-digit code to</p>
          <button
            type="button"
            onClick={handleEditEmail}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 transition hover:bg-white/[0.10] hover:border-violet-500/40 group"
            aria-label="Change email address"
          >
            <span className="text-sm font-semibold text-white">{email || "your email"}</span>
            <Pencil className="h-3.5 w-3.5 text-white/40 group-hover:text-violet-400 transition-colors" />
          </button>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 text-center">
              {error}
            </div>
          )}

          <div
            className="flex items-center justify-center gap-3"
            onPaste={handlePaste}
            role="group"
            aria-label="One-time password input"
          >
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                autoFocus={i === 0}
                autoComplete="one-time-code"
                aria-label={`Digit ${i + 1} of 6`}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={[
                  "h-14 w-12 rounded-xl text-center text-2xl font-bold text-white outline-none transition-all duration-150 caret-violet-400 selection:bg-violet-500/30",
                  "border-2 bg-white/[0.07]",
                  digit
                    ? "border-violet-500 bg-white/[0.10] shadow-[0_0_0_3px_rgba(139,92,246,0.18)]"
                    : "border-white/20 hover:border-white/35",
                  "focus:border-violet-400 focus:bg-white/[0.12] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.25)]",
                  "sm:h-16 sm:w-14 sm:text-3xl",
                ].join(" ")}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !allFilled}
            className={[
              "flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-4 text-base font-semibold text-white shadow-lg transition-all duration-150",
              allFilled && !loading
                ? "bg-gradient-to-r from-violet-600 to-blue-600 shadow-violet-900/40 hover:from-violet-500 hover:to-blue-500 hover:shadow-violet-800/50 hover:scale-[1.01] active:scale-[0.99]"
                : "bg-white/10 cursor-not-allowed opacity-50 shadow-none",
            ].join(" ")}
          >
            {loading ? (<><Loader2 className="h-5 w-5 animate-spin" />Verifying…</>) : "Verify email"}
          </button>

          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-sm text-white/35">
                Resend code in <span className="font-medium text-white/55">{countdown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

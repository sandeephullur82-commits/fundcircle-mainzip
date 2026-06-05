import React, { useState, useEffect, useRef } from "react";
import { useSignUp, useUser } from "@clerk/clerk-react";
import { useNavigate, useLocation, Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import AuthLayout from "./AuthLayout";

function recordOtpSent(type: "signup_verify" | "reset_password") {
  const sentAt = new Date().toISOString();
  sessionStorage.setItem("fc_otp_sent_at", sentAt);
  sessionStorage.setItem("fc_otp_type", type);
  sessionStorage.removeItem("fc_otp_verified_at");
  sessionStorage.removeItem("fc_otp_errors");
  const count = parseInt(sessionStorage.getItem("fc_otp_request_count") || "0") + 1;
  sessionStorage.setItem("fc_otp_request_count", String(count));
  console.log("[FC OTP] ✉ OTP dispatched | type:", type, "| sent_at:", sentAt, "| request_count:", count);
}

export default function SignUpPage() {
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [searchParams] = useSearchParams();

  const invitationTicket = searchParams.get("__clerk_ticket") || "";

  // When the user clicks "Edit Email" on the OTP screen, they arrive here with
  // this flag set. It tells the resume-detection useEffect to stand down and let
  // the user interact with the form instead of bouncing them back to verify-email.
  const isEditingEmail = (location.state as any)?.editingEmail === true;

  // Guard the resume-detection useEffect from firing while handleSubmit is in
  // progress. After signUp.create() resolves, Clerk pushes a reactive state update
  // (status → "missing_requirements") which would normally trigger the useEffect
  // and navigate to /auth/verify-email before prepareEmailAddressVerification()
  // is called. This ref blocks that premature redirect.
  const submittingRef = useRef(false);

  const [fullName, setFullName]               = useState("");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [agreedToTerms, setAgreedToTerms]     = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");

  // Redirect already-signed-in users immediately.
  useEffect(() => {
    if (userLoaded && isSignedIn) {
      console.log("[FC SignUp] Already signed in — redirecting to /router");
      navigate("/router", { replace: true });
    }
  }, [userLoaded, isSignedIn, navigate]);

  // Resume-detection: if an in-progress (non-submitted) signUp session exists,
  // send the user back to the verify screen so they can complete it.
  // Skipped when:
  //   - submittingRef is true (we are in the middle of handleSubmit)
  //   - isEditingEmail is true (user deliberately came back to change their email)
  useEffect(() => {
    if (!isLoaded) return;
    if (submittingRef.current) return;
    if (isEditingEmail) return;

    if (signUp?.status === "complete" && signUp.createdSessionId && setActive) {
      console.log("[FC SignUp] Complete signUp on mount — activating session:", signUp.createdSessionId);
      setActive({ session: signUp.createdSessionId }).then(() => {
        navigate("/auth/callback", { replace: true });
      });
      return;
    }

    if (signUp?.status === "missing_requirements" && signUp.id) {
      if (signUp.unverifiedFields?.includes("email_address")) {
        const otpCount = parseInt(sessionStorage.getItem("fc_otp_request_count") || "0");
        if (otpCount > 0) {
          console.log("[FC SignUp] Resuming incomplete signUp — OTP already sent, returning to verify screen");
          sessionStorage.setItem("fc_signup_email", signUp.emailAddress || "");
          navigate("/auth/verify-email", { replace: true });
        } else {
          console.log("[FC SignUp] Incomplete signUp found but OTP not yet sent — staying on sign-up page");
        }
      }
    }
  }, [isLoaded, signUp?.status, signUp?.id, signUp?.createdSessionId, isEditingEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp || loading) return;
    setError("");

    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 8)          { setError("Password must be at least 8 characters."); return; }
    if (!invitationTicket && !agreedToTerms) {
      setError("Please accept the terms and conditions to continue.");
      return;
    }

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName  = nameParts.slice(1).join(" ") || "";

    submittingRef.current = true;
    setLoading(true);

    try {
      // ── Invitation ticket flow ──────────────────────────────────────────
      if (invitationTicket) {
        console.log("[FC SignUp] ▶ Invitation ticket flow | firstName:", firstName, "| lastName:", lastName);
        console.log("[FC SignUp] ▶ signUp.create({ strategy: 'ticket', password })…");

        const t0 = Date.now();
        const result = await signUp.create({
          strategy: "ticket",
          ticket: invitationTicket,
          password,
          firstName: firstName || undefined,
          lastName:  lastName  || undefined,
        });
        console.log("[FC SignUp] signUp.create() (invitation) done in", `${Date.now() - t0}ms`);
        console.log("[FC SignUp]   status           :", result.status);
        console.log("[FC SignUp]   createdSessionId :", result.createdSessionId ?? "null");
        console.log("[FC SignUp]   emailAddress     :", result.emailAddress ?? "—");
        console.log("[FC SignUp]   unverifiedFields :", result.unverifiedFields ?? []);

        if (result.status === "complete" && result.createdSessionId) {
          console.log("[FC SignUp] ▶ Activating session:", result.createdSessionId);
          await setActive!({ session: result.createdSessionId });
          console.log("[FC SignUp] ✓ Session activated — redirecting to /auth/callback");
          sessionStorage.removeItem("fc_signup_email");
          navigate("/auth/callback", { replace: true });
          return;
        }

        if (result.status === "missing_requirements") {
          if (result.unverifiedFields?.includes("email_address")) {
            console.log("[FC SignUp] ▶ Email verification required — calling prepareEmailAddressVerification…");
            const t1 = Date.now();
            await result.prepareEmailAddressVerification({ strategy: "email_code" });
            console.log("[FC SignUp] ✓ prepareEmailAddressVerification done in", `${Date.now() - t1}ms`);
            recordOtpSent("signup_verify");
            sessionStorage.setItem("fc_signup_email", result.emailAddress || "");
            navigate("/auth/verify-email", { replace: true });
          }
          return;
        }

        console.error("[FC SignUp] ✗ Unexpected invitation sign-up status:", result.status);
        setError("Invitation sign-up returned an unexpected state. Please try again.");
        return;
      }

      // ── Normal sign-up flow ─────────────────────────────────────────────
      const emailKey = email.trim().toLowerCase();
      console.log("[FC SignUp] ▶ Normal sign-up | email:", emailKey, "| firstName:", firstName, "| lastName:", lastName);

      console.log("[FC SignUp] ▶ Step 1: signUp.create({ emailAddress, password })…");
      const t0 = Date.now();
      const created = await signUp.create({ emailAddress: emailKey, password, firstName, lastName });
      console.log("[FC SignUp] ✓ signUp.create() done in", `${Date.now() - t0}ms`);
      console.log("[FC SignUp]   status          :", created.status);
      console.log("[FC SignUp]   unverifiedFields:", created.unverifiedFields ?? []);

      if (created.status === "complete" && created.createdSessionId) {
        console.log("[FC SignUp] ▶ Signup already complete — activating session:", created.createdSessionId);
        await setActive!({ session: created.createdSessionId });
        navigate("/auth/callback", { replace: true });
        return;
      }

      console.log("[FC SignUp] ▶ Step 2: prepareEmailAddressVerification({ strategy: 'email_code' })…");
      const t1 = Date.now();
      await created.prepareEmailAddressVerification({ strategy: "email_code" });
      console.log("[FC SignUp] ✓ prepareEmailAddressVerification done in", `${Date.now() - t1}ms`);
      console.log("[FC SignUp] ✓ OTP email dispatched to:", emailKey);

      recordOtpSent("signup_verify");
      sessionStorage.setItem("fc_signup_email", emailKey);
      navigate("/auth/verify-email", { replace: true });

    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "unknown";
      const msg  = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? "unknown";
      console.error("[FC SignUp] ✗ Error during sign-up flow");
      console.error("[FC SignUp]   code   :", code);
      console.error("[FC SignUp]   message:", msg);
      console.error("[FC SignUp]   errors :", err?.errors ?? "none");

      if (code === "form_identifier_exists")     setError("An account with this email already exists.");
      else if (code === "form_param_format_invalid") setError("Please enter a valid email address.");
      else if (code === "too_many_requests")     setError("Too many attempts. Please wait a moment and try again.");
      else if (code === "form_password_pwned" || code === "form_password_size_check_failed")
        setError("Please choose a stronger password (min. 8 characters).");
      else setError("Could not create account. Please try again.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/[0.13] bg-white/[0.07] px-4 py-3 text-sm text-white placeholder-white/50 outline-none transition focus:border-violet-500/70 focus:bg-white/[0.11] focus:ring-2 focus:ring-violet-500/25";
  const labelClass = "block text-[11px] font-semibold uppercase tracking-wider text-white/95";

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-8 backdrop-blur-2xl shadow-2xl shadow-black/70 ring-1 ring-inset ring-white/[0.05]">
        <div className="mb-7">
          {invitationTicket ? (
            <>
              <h2 className="text-[1.6rem] font-bold text-white leading-tight">Accept your invitation</h2>
              <p className="mt-1.5 text-sm text-white/85">Set a password to join your organization on FundCircle</p>
            </>
          ) : (
            <>
              <h2 className="text-[1.6rem] font-bold text-white leading-tight">Create your account</h2>
              <p className="mt-1.5 text-sm text-white/85">Start managing your savings circle today</p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Raj Kumar"
              required={!invitationTicket}
              autoFocus
              className={inputClass}
            />
          </div>

          {!invitationTicket && (
            <div className="space-y-1.5">
              <label className={labelClass}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={inputClass}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 chars"
                  required
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/75 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Confirm</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat"
                  required
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/75 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {!invitationTicket && (
            <label className="flex cursor-pointer items-start gap-3 pt-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/25 bg-white/10 accent-violet-500"
              />
              <span className="text-sm text-white/75 leading-relaxed">
                I agree to the{" "}
                <Link to="/terms" target="_blank" className="text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
                  Privacy Policy
                </Link>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {invitationTicket ? "Joining organization…" : "Creating account…"}
              </>
            ) : (
              invitationTicket ? "Join organization" : "Create account"
            )}
          </button>
        </form>

        {!invitationTicket && (
          <p className="mt-6 text-center text-sm text-white/65">
            Already have an account?{" "}
            <Link to="/auth/sign-in" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}

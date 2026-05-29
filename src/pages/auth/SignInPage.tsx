import React, { useState, useEffect } from "react";
import { useSignIn, useUser, useClerk } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import AuthLayout from "./AuthLayout";

// ─── Clerk error → human readable ───────────────────────────────────────────
function clerkErrorMessage(err: any): string {
  const code = err?.errors?.[0]?.code ?? "";
  const long = err?.errors?.[0]?.longMessage ?? "";
  const short = err?.errors?.[0]?.message ?? "";

  console.error(
    "[FC SignIn] Clerk exception — code:", code,
    "| long:", long,
    "| short:", short,
    "| full errors:", JSON.stringify(err?.errors ?? err, null, 2)
  );

  if (code === "form_password_incorrect")      return "Incorrect password. Please try again.";
  if (code === "form_identifier_not_found")    return "No account found with that email address.";
  if (code === "form_param_format_invalid")    return "Please enter a valid email address.";
  if (code === "too_many_requests")            return "Too many attempts. Please wait a moment and try again.";
  if (code === "session_exists")               return "You are already signed in. Redirecting…";
  if (code === "user_locked")                  return "This account has been locked. Please contact support.";
  if (code === "strategy_for_user_invalid")    return "Password is not set up for this account. Use 'Forgot password' to create one.";
  if (code === "form_identifier_exists")       return "An account with this email already exists.";
  if (code === "verification_expired")         return "Verification code expired. Please request a new one.";
  if (code === "not_allowed_access")           return "Access denied. Your account may be suspended.";
  if (code === "organization_not_found")       return "Your organization could not be found. Contact your administrator.";

  // Unknown code — show raw details so we can debug
  const raw = long || short || code || "Unknown Clerk error";
  return `Sign-in failed: ${raw}`;
}

// ─── Dev diagnostic panel ────────────────────────────────────────────────────
function DiagPanel({ data }: { data: any }) {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-900/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2 font-mono text-amber-300 hover:bg-amber-500/10"
      >
        <span>[DEV] Clerk diagnostic data</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="overflow-x-auto px-3 pb-3 text-amber-200/80 leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function SignInPage() {
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const navigate = useNavigate();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [diagData, setDiagData]     = useState<any>(null);

  // Already signed in → skip to router
  useEffect(() => {
    if (userLoaded && isSignedIn) {
      console.log("[FC SignIn] Already signed in — redirecting to /router");
      navigate("/router", { replace: true });
    }
  }, [userLoaded, isSignedIn, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn || !setActive || loading) return;
    setError("");
    setDiagData(null);
    setLoading(true);

    const identifier = email.trim().toLowerCase();
    console.log("────────────────────────────────────────────");
    console.log("[FC SignIn] ▶ Sign-in attempt");
    console.log("[FC SignIn]   identifier :", identifier);
    console.log("[FC SignIn]   signIn.status (pre-create):", signIn.status ?? "null");
    console.log("[FC SignIn]   isSignedIn  :", isSignedIn);
    console.log("[FC SignIn]   userLoaded  :", userLoaded);

    try {
      // Clear any stale active session so Clerk doesn't return session_exists
      if (isSignedIn) {
        console.log("[FC SignIn]   Signing out stale session before new attempt…");
        await clerk.signOut();
      }

      console.log("[FC SignIn]   Calling signIn.create({ identifier, password })…");
      const result = await signIn.create({ identifier, password });

      const diag = {
        status:                result.status,
        createdSessionId:      result.createdSessionId,
        identifier:            (result as any).identifier,
        supportedFirstFactors: result.supportedFirstFactors?.map((f: any) => f.strategy),
        firstFactorVerification: {
          status:   result.firstFactorVerification?.status,
          strategy: result.firstFactorVerification?.strategy,
          error:    result.firstFactorVerification?.error,
        },
      };

      console.log("[FC SignIn]   signIn.create() result:", JSON.stringify(diag, null, 2));
      setDiagData(diag);

      // ── complete ──────────────────────────────────────────────────────────
      if (result.status === "complete") {
        // createdSessionId CAN be null when the session was already established
        // (e.g. invitation-acceptance flow already activated it). Still safe to
        // navigate — the active session will be picked up by useUser().
        if (result.createdSessionId) {
          console.log("[FC SignIn]   ✓ status=complete with sessionId", result.createdSessionId);
          console.log("[FC SignIn]   Calling setActive({ session:", result.createdSessionId, "})…");
          await setActive({ session: result.createdSessionId });
          console.log("[FC SignIn]   setActive() done");
        } else {
          console.warn("[FC SignIn]   status=complete but createdSessionId is null/undefined");
          console.warn("[FC SignIn]   This usually means the session was already activated by a prior flow");
          console.warn("[FC SignIn]   Navigating to /router without calling setActive()");
        }
        console.log("[FC SignIn]   → Redirecting to /router");
        navigate("/router", { replace: true });
        return;
      }

      // ── needs_second_factor ───────────────────────────────────────────────
      if (result.status === "needs_second_factor") {
        console.warn("[FC SignIn]   MFA required — strategies:", result.supportedSecondFactors?.map((f: any) => f.strategy));
        setError(
          "Your account has multi-factor authentication enabled. " +
          "MFA is not currently supported. Ask your administrator to disable it."
        );
        return;
      }

      // ── needs_first_factor ────────────────────────────────────────────────
      if (result.status === "needs_first_factor") {
        const strategies = result.supportedFirstFactors?.map((f: any) => f.strategy) ?? [];
        console.warn("[FC SignIn]   needs_first_factor — available strategies:", strategies);
        if (!strategies.includes("password")) {
          setError(
            "No password is set on this account. " +
            "Use 'Forgot password' to create one, or sign in with your email link."
          );
        } else {
          setError("Verification step required. Please try again or use 'Forgot password'.");
        }
        return;
      }

      // ── needs_new_password ────────────────────────────────────────────────
      if (result.status === "needs_new_password") {
        console.warn("[FC SignIn]   needs_new_password — prompting password reset");
        setError("Your password has expired and must be changed. Use 'Forgot password' to set a new one.");
        return;
      }

      // ── needs_identifier ──────────────────────────────────────────────────
      if (result.status === "needs_identifier") {
        console.warn("[FC SignIn]   needs_identifier — identifier was not provided");
        setError("Please enter your email address.");
        return;
      }

      // ── catch-all: show the ACTUAL status, never a generic message ────────
      console.error("[FC SignIn]   Unexpected status:", result.status);
      console.error("[FC SignIn]   Full result (JSON):", JSON.stringify(result, null, 2));
      try { await clerk.signOut(); } catch { /* ignore */ }
      setError(
        `Sign-in returned status "${result.status}" — this is unexpected. ` +
        `First-factor verification status: "${result.firstFactorVerification?.status ?? "none"}". ` +
        `Please try again or contact support.`
      );

    } catch (err: any) {
      console.error("[FC SignIn]   Exception in signIn.create():", err);
      console.error("[FC SignIn]   Raw error JSON:", JSON.stringify(err, null, 2));

      if (err?.errors?.[0]?.code === "session_exists") {
        console.log("[FC SignIn]   session_exists error — redirecting to /router");
        navigate("/router", { replace: true });
        return;
      }

      setDiagData({ exception: err?.errors ?? err });
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/[0.14] bg-white/[0.07] p-8 backdrop-blur-2xl shadow-2xl shadow-black/70 ring-1 ring-inset ring-white/[0.05]">
        <div className="mb-7">
          <h2 className="text-[1.6rem] font-bold text-white leading-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-white/85">Sign in to your FundCircle account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/95">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full rounded-xl border border-white/[0.13] bg-white/[0.07] px-4 py-3 text-sm text-white placeholder-white/50 outline-none transition focus:border-violet-500/70 focus:bg-white/[0.11] focus:ring-2 focus:ring-violet-500/25"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/95">
                Password
              </label>
              <Link to="/auth/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/[0.13] bg-white/[0.07] px-4 py-3 pr-11 text-sm text-white placeholder-white/50 outline-none transition focus:border-violet-500/70 focus:bg-white/[0.11] focus:ring-2 focus:ring-violet-500/25"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/75 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>) : "Sign in"}
          </button>
        </form>

        {/* Dev diagnostic panel */}
        {diagData && <DiagPanel data={diagData} />}

        <p className="mt-6 text-center text-sm text-white/65">
          Don&apos;t have an account?{" "}
          <Link to="/auth/sign-up" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

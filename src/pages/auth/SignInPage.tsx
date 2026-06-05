import React, { useState, useEffect } from "react";
import { useSignIn, useUser, useClerk } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, KeyRound } from "lucide-react";
import AuthLayout from "./AuthLayout";

const IS_DEV =
  import.meta.env.DEV ||
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");

// ── Extracts the best human-readable message from a Clerk error ──────────────
// Priority: Clerk longMessage → Clerk message → code-based fallback → generic
function clerkErrorMessage(err: any): { message: string; code: string } {
  const code       = err?.errors?.[0]?.code       ?? "unknown";
  const longMsg    = err?.errors?.[0]?.longMessage ?? "";
  const shortMsg   = err?.errors?.[0]?.message     ?? "";
  const jsMsg      = err?.message                  ?? "";

  // Use Clerk's own long message first — it is always accurate and specific
  const message = longMsg || shortMsg || jsMsg || "Sign-in failed. Please try again.";

  return { message, code };
}

// ── Returns true when the error means "no password strategy set up" ──────────
function isNoPasswordStrategy(code: string) {
  return code === "strategy_for_user_invalid" || code === "not_allowed_access";
}

export default function SignInPage() {
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded, signIn, setActive }       = useSignIn();
  const clerk                                  = useClerk();
  const navigate                               = useNavigate();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

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
    setErrorCode("");
    setNeedsPasswordSetup(false);
    setLoading(true);

    const identifier = email.trim().toLowerCase();

    console.log("════════════════════════════════════════════════");
    console.log("[FC SignIn] ▶ Sign-in attempt");
    console.log("[FC SignIn]   identifier :", identifier);
    console.log("[FC SignIn]   timestamp  :", new Date().toISOString());
    console.log("════════════════════════════════════════════════");

    try {
      if (isSignedIn) {
        console.log("[FC SignIn] Clearing stale Clerk session before new sign-in…");
        await clerk.signOut();
      }

      console.log("[FC SignIn] Calling signIn.create({ identifier, password })…");
      const result = await signIn.create({ identifier, password });
      const status = result.status as string;

      // ── Full result dump for debugging ──────────────────────────────────
      console.log("[FC SignIn] signIn.create() FULL result:");
      console.log("[FC SignIn]   status                 :", status);
      console.log("[FC SignIn]   createdSessionId        :", result.createdSessionId ?? "null");
      console.log("[FC SignIn]   firstFactorVerification :", (result as any).firstFactorVerification?.status ?? "—");
      console.log("[FC SignIn]   supportedFirstFactors   :", JSON.stringify((result as any).supportedFirstFactors?.map((f: any) => f.strategy) ?? []));
      console.log("[FC SignIn]   supportedSecondFactors  :", JSON.stringify((result as any).supportedSecondFactors?.map((f: any) => f.strategy) ?? []));
      console.log("[FC SignIn]   identifier              :", identifier);
      console.log("[FC SignIn]   VITE_CLERK_PUBLISHABLE_KEY prefix:", (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").slice(0, 12));
      // ────────────────────────────────────────────────────────────────────

      if (status === "complete") {
        console.log("[FC SignIn] ▶ Session creation — calling setActive()");
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          console.log("[FC SignIn] ✓ Session activated:", result.createdSessionId);
        } else {
          console.warn("[FC SignIn] status=complete, sessionId=null — session already active");
        }
        console.log("[FC SignIn] → Redirecting to /router");
        navigate("/router", { replace: true });
        return;
      }

      // Recovery: if session exists despite non-complete status
      if (result.createdSessionId) {
        console.log("[FC SignIn] Recovery: activating session despite status:", status);
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      // ── needs_second_factor: forward to MFA verification page
      if (status === "needs_second_factor") {
        const secondFactors = (result as any).supportedSecondFactors ?? [];
        const strategies = secondFactors.map((f: any) => f.strategy);
        console.log("[FC SignIn] needs_second_factor — supportedSecondFactors:", JSON.stringify(strategies));
        console.log("[FC SignIn] → Redirecting to /auth/mfa-verify");
        navigate("/auth/mfa-verify", { replace: true });
        return;
      }

      // ── needs_first_factor: first factor not yet satisfied (e.g. no password strategy)
      if (status === "needs_first_factor") {
        const firstFactors = (result as any).supportedFirstFactors?.map((f: any) => f.strategy) ?? [];
        console.error("[FC SignIn] needs_first_factor — available strategies:", JSON.stringify(firstFactors));
        setError("Password sign-in is not available for this account. Please contact your administrator.");
        setErrorCode(status);
        setLoading(false);
        return;
      }

      // ── Any other non-complete, non-error status Clerk may return in future
      console.warn("[FC SignIn] Unhandled status:", status);
      setError(`Sign-in is incomplete (status: ${status}). Please try again.`);
      setErrorCode(status);

    } catch (err: any) {
      const { message, code } = clerkErrorMessage(err);

      console.error("════════════════════════════════════════════════");
      console.error("[FC SignIn] ✗ signIn.create() error");
      console.error("[FC SignIn]   error.code    :", code);
      console.error("[FC SignIn]   error.message :", message);
      console.error("[FC SignIn]   error.errors  :", JSON.stringify(err?.errors ?? null, null, 2));
      console.error("[FC SignIn]   full error    :", err);
      console.error("════════════════════════════════════════════════");

      if (code === "session_exists") {
        navigate("/router", { replace: true });
        return;
      }

      if (isNoPasswordStrategy(code)) {
        setNeedsPasswordSetup(true);
        setError(message);
        setErrorCode(code);
        setLoading(false);
        return;
      }

      setError(message);
      setErrorCode(code);
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
          {/* ── Error block ─────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>

              {/* Dev-mode error code badge */}
              {IS_DEV && errorCode && errorCode !== "unknown" && (
                <div className="ml-6">
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-900/50 border border-red-700/40 px-2 py-0.5 text-[10px] font-mono text-red-400">
                    Clerk code: {errorCode}
                  </span>
                </div>
              )}

              {/* Inline "Set up password" prompt for no-password accounts */}
              {needsPasswordSetup && (
                <div className="ml-6 flex items-center gap-2 pt-1">
                  <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">
                    This account has no password set.{" "}
                    <Link
                      to="/auth/forgot-password"
                      className="font-semibold text-amber-200 underline underline-offset-2 hover:text-white transition-colors"
                    >
                      Click here to create one.
                    </Link>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Email ──────────────────────────────────────────────────────── */}
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

          {/* ── Password ───────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/95">
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

          {/* ── Submit ─────────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/65">
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

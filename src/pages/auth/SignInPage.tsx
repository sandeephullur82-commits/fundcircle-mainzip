import React, { useState, useEffect } from "react";
import { useSignIn, useClerk, useUser } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
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
  if (code === "form_identifier_exists") return "An account with this email already exists.";

  return long || short || "An unexpected error occurred. Please try again.";
}

export default function SignInPage() {
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (userLoaded && isSignedIn) {
      navigate("/router", { replace: true });
    }
  }, [userLoaded, isSignedIn, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn || !setActive || loading) return;
    setError("");
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim().toLowerCase(),
        password,
      });

      console.log("[FundCircle Sign-In] status:", result.status, "| sessionId:", result.createdSessionId);

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/router", { replace: true });
        return;
      }

      if (result.status === "complete" && !result.createdSessionId) {
        console.error("[FundCircle Sign-In] complete but no sessionId");
        setError("Session could not be established. Please try again.");
        return;
      }

      if (
        result.status === "needs_second_factor" ||
        (result as any).status === "requires_second_factor"
      ) {
        console.warn("[FundCircle Sign-In] MFA detected — signing out partial session");
        try { await clerk.signOut(); } catch { /* ignore */ }
        setError(
          "Your account has multi-factor authentication (MFA) enabled. " +
          "FundCircle does not support MFA. Please ask your administrator to disable " +
          "MFA in the Clerk dashboard under User Authentication → Multi-factor, then try again."
        );
        return;
      }

      if (result.status === "needs_first_factor") {
        setError(
          "Email/password authentication is not fully enabled. Please ask your administrator " +
          "to enable Email + Password in the Clerk dashboard under User Authentication → Email address."
        );
        return;
      }

      if (result.status === "needs_new_password") {
        setError("Your password has expired. Please use the forgot password flow to set a new one.");
        return;
      }

      console.warn("[FundCircle Sign-In] unexpected status:", result.status);
      setError(`Sign-in returned an unexpected state. Please try again or contact support.`);

    } catch (err: any) {
      console.error("[FundCircle Sign-In] error:", err);
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="mb-7">
          <h2 className="text-[1.6rem] font-bold text-white leading-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-white/45">Sign in to your FundCircle account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

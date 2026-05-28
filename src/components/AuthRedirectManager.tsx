import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

const AUTH_ONLY_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/organization/signin",
  "/organization/signup",
  "/agent/login",
  "/customer/signin",
  "/workspace-selection",
];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/complete-profile",
  "/billing",
  "/organization/create",
  "/organization/invitation",
  "/profile",
  "/router",
  "/debug-user",
];

const isAuthOnlyPath = (pathname: string) =>
  AUTH_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const isProtectedPath = (pathname: string) =>
  PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export default function AuthRedirectManager() {
  const { isLoaded, isSignedIn, user } = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Guard: only allow one redirect per unique pathname to prevent any
  // double-navigation from Clerk or React Router internal re-renders.
  const lastRedirectedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    // Only redirect away from auth pages when the user is FULLY signed in with
    // a verified email. Clerk sets isSignedIn=true mid-flow (before OTP is
    // entered), so checking email verification status prevents navigating away
    // from /sign-up while the OTP step is still visible — which would tear down
    // the Clerk component and trigger a second OTP email.
    const emailVerified =
      user?.primaryEmailAddress?.verification?.status === "verified";

    if (isSignedIn && user && emailVerified && isAuthOnlyPath(pathname)) {
      if (lastRedirectedPath.current === pathname) return;
      lastRedirectedPath.current = pathname;
      navigate("/auth/callback", { replace: true });
      return;
    }

    if (!isSignedIn && isProtectedPath(pathname)) {
      if (lastRedirectedPath.current === pathname) return;
      lastRedirectedPath.current = pathname;
      navigate("/sign-in", { replace: true });
    }
  }, [isLoaded, isSignedIn, user, navigate, pathname]);

  // Reset the guard whenever the pathname changes so a genuine navigation
  // to the same protected path later (e.g. back-button) still triggers.
  useEffect(() => {
    lastRedirectedPath.current = null;
  }, [pathname]);

  if (!isLoaded && isProtectedPath(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600 mx-auto mb-4" />
          <p className="text-sm text-slate-500">Checking your session…</p>
        </div>
      </div>
    );
  }

  return null;
}

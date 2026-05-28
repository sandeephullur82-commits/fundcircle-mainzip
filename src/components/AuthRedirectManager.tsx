import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

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

const isProtectedPath = (pathname: string) =>
  PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export default function AuthRedirectManager() {
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isLoaded) return;

    // Only guard protected routes from unauthenticated access.
    // We intentionally do NOT redirect signed-in users away from auth paths
    // here — Clerk's own forceRedirectUrl on <SignIn> and <SignUp> handles
    // that. Adding a second navigate() call races with Clerk's internal
    // routing, can unmount the auth component mid-flow, and causes a second
    // OTP email to be sent.
    if (!isSignedIn && isProtectedPath(pathname)) {
      navigate("/sign-in", { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, pathname]);

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

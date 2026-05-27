import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

// Paths that should redirect signed-in users to their dashboard
const signedInRedirectPaths = [
  "/sign-in",
  "/sign-up",
  "/organization/signin",
  "/organization/signup",
  "/agent/login",
  "/customer/signin",
];

// Paths accessible regardless of auth state
const publicPaths = [
  "/",
  "/workspace-selection",
  "/organization/invitation",
];

const isSignedInRedirectPath = (pathname: string) => {
  return signedInRedirectPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
};

const isPublicPath = (pathname: string) => {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
};

export default function AuthRedirectManager() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  useEffect(() => {
    if (!isLoaded) {
      setChecking(true);
      return;
    }

    // Signed-in users visiting sign-in/sign-up → send to dashboard
    if (isSignedIn && user && isSignedInRedirectPath(path)) {
      navigate("/auth/callback", { replace: true });
      setChecking(false);
      return;
    }

    // Unauthenticated users visiting protected pages → send to sign-in
    if (!isSignedIn || !user) {
      if (!isPublicPath(path) && !isSignedInRedirectPath(path) && path !== "/auth/callback") {
        navigate("/sign-in", { replace: true });
      }
      setChecking(false);
      return;
    }

    setChecking(false);
  }, [isLoaded, isSignedIn, user, navigate, path]);

  if (!isLoaded && !isPublicPath(path)) {
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

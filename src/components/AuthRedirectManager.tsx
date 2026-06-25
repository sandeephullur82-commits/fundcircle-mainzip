import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/complete-profile",
  "/billing",
  "/organization/create",
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
    if (!isSignedIn && isProtectedPath(pathname)) {
      navigate("/auth/sign-in", { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, pathname]);

  return null;
}

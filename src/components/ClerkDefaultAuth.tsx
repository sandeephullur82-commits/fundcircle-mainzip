import { useLocation } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/clerk-react";

interface ClerkDefaultAuthProps {
  initialMode: "signin" | "signup";
  role: "organization" | "agent" | "customer";
}

export default function ClerkDefaultAuth({ initialMode }: ClerkDefaultAuthProps) {
  const location = useLocation();
  const path = location.pathname || (initialMode === "signin" ? "/sign-in" : "/sign-up");

  if (initialMode === "signin") {
    return (
      <SignIn
        routing="path"
        path={path}
        signUpUrl="/sign-up"
        forceRedirectUrl="/auth/callback"
      />
    );
  }

  return (
    <SignUp
      routing="path"
      path={path}
      signInUrl="/sign-in"
      forceRedirectUrl="/auth/callback"
    />
  );
}

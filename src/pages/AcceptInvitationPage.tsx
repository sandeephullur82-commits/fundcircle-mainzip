import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";

export default function AcceptInvitationPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const ticket = searchParams.get("__clerk_ticket") || "";
  const clerkStatus = searchParams.get("__clerk_status") || "";

  useEffect(() => {
    if (!isLoaded) return;

    if (!ticket) {
      console.warn("[FC AcceptInvitation] No ticket in URL — redirecting to sign-in");
      navigate("/auth/sign-in", { replace: true });
      return;
    }

    if (isSignedIn) {
      // Already signed in — the invitation was accepted server-side via direct
      // org membership (existing user path). Just complete the auth flow.
      console.log("[FC AcceptInvitation] User already signed in — proceeding to callback");
      navigate("/auth/callback", { replace: true });
      return;
    }

    // Not signed in yet. Route based on whether this is a new or existing user.
    if (clerkStatus === "sign_in") {
      // Existing Clerk account — sign in normally, org membership already added.
      console.log("[FC AcceptInvitation] status=sign_in — redirecting to sign-in");
      navigate("/auth/sign-in", { replace: true });
      return;
    }

    // New user (sign_up or unknown) — pass ticket to sign-up page.
    console.log("[FC AcceptInvitation] New user ticket — redirecting to sign-up");
    navigate(`/auth/sign-up?__clerk_ticket=${encodeURIComponent(ticket)}`, { replace: true });
  }, [isLoaded, isSignedIn, ticket, clerkStatus, navigate]);

  return (
    <div className="min-h-screen bg-[#09090f] flex flex-col items-center justify-center gap-6 p-4">
      <div className="pointer-events-none absolute -top-48 -left-40 h-[600px] w-[600px] rounded-full bg-violet-700/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[500px] w-[500px] rounded-full bg-blue-600/15 blur-[120px]" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <BrandMark size="md" />
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-8 py-6 backdrop-blur-2xl">
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin shrink-0" />
          <p className="text-sm font-medium text-white/60">Setting up your access…</p>
        </div>
      </div>
    </div>
  );
}

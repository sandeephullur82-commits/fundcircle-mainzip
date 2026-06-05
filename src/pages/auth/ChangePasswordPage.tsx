import { useState } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";
import { Link } from "react-router-dom";
import { doc, updateDoc, serverTimestamp, getDocs, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipIdFor } from "@/lib/services";

export default function ChangePasswordPage() {
  const { user, isLoaded } = useUser();
  const { organization } = useOrganization();
  const { userMemberships } = useOrganizationList({ userMemberships: true });
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !user) return;

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Update password in Clerk
      await user.updatePassword({ newPassword: password });

      // Update status to ACTIVE in all PENDING_SETUP membership docs for this user
      const orgId =
        organization?.id ||
        userMemberships?.data?.[0]?.organization?.id ||
        null;

      if (orgId) {
        const membershipId = membershipIdFor(orgId, user.id);
        try {
          await updateDoc(doc(db, "organizationMembers", membershipId), {
            status: "ACTIVE",
            activatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (_) {}
        try {
          await updateDoc(doc(db, "memberships", membershipId), {
            status: "ACTIVE",
            activatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (_) {}
      } else {
        // Fallback: find all PENDING_SETUP docs by clerkUserId
        try {
          const snap = await getDocs(query(
            collection(db, "organizationMembers"),
            where("clerkUserId", "==", user.id),
            where("status", "==", "PENDING_SETUP"),
          ));
          await Promise.all(snap.docs.map((d) =>
            updateDoc(d.ref, {
              status: "ACTIVE",
              activatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          ));
        } catch (_) {}
      }

      // Update user doc
      try {
        await updateDoc(doc(db, "users", user.id), {
          status: "ACTIVE",
          activatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (_) {}

      toast.success("Password updated! Taking you to your dashboard…");
      navigate("/router", { replace: true });
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? "";
      if (code === "form_password_pwned" || code === "form_password_size_check_failed") {
        toast.error("Please choose a stronger password (min. 8 characters, avoid common passwords).");
      } else if (code === "too_many_requests") {
        toast.error("Too many attempts. Please wait a moment and try again.");
      } else {
        toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to update password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-4 relative overflow-x-hidden">
      <div className="pointer-events-none absolute -top-48 -left-40 h-[650px] w-[650px] rounded-full bg-violet-700/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[550px] w-[550px] rounded-full bg-blue-600/18 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Link to="/" className="flex flex-col items-center gap-2">
            <BrandMark size={48} />
            <div className="text-center">
              <p className="text-lg font-bold text-white tracking-tight">FundCircle</p>
              <p className="text-[11px] text-white/35 font-medium tracking-[0.15em] uppercase">Micro-Savings Platform</p>
            </div>
          </Link>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] px-8 py-8 backdrop-blur-2xl shadow-2xl shadow-black/50 space-y-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg mb-2">
              <KeyRound className="w-3.5 h-3.5" /> First Sign In
            </div>
            <h1 className="text-xl font-bold text-white">Set your new password</h1>
            <p className="text-sm text-white/50">
              You're signed in with a temporary password. Please set a permanent password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  autoFocus
                  className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.06] px-4 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/60 focus:bg-white/[0.08] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wide">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat your password"
                  className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.06] px-4 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/60 focus:bg-white/[0.08] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm && password !== confirm && (
                <p className="text-xs text-red-400">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password || !confirm || password !== confirm || password.length < 8}
              className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Setting password…</>
              ) : (
                "Set Password & Continue"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

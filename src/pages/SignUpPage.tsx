import { FormEvent, useEffect, useState } from "react";
import { SignUp } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";

const ORG_SETUP_STORAGE_KEY = "fundcircle_owner_org";

export default function SignUpPage() {
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [readyForSignup, setReadyForSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(ORG_SETUP_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setOrgName(parsed.name || "");
      setOrgSlug(parsed.slug || "");
    } catch {
      window.sessionStorage.removeItem(ORG_SETUP_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ORG_SETUP_STORAGE_KEY, JSON.stringify({ name: orgName.trim(), slug: orgSlug.trim() }));
  }, [orgName, orgSlug]);

  const handlePrepare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!orgName.trim()) {
      setError("Please enter an organization name to continue.");
      return;
    }
    if (!orgSlug.trim()) {
      setError("Please enter a URL-friendly organization slug.");
      return;
    }
    setReadyForSignup(true);
  };

  return (
    <AuthLayout
      title="Create Your organization"
      subtitle="Only organization owners may register here. After sign-up, you will create your workspace and invite collectors or customers."
      features={["Owner-only registration", "Clerk-built authentication", "Organization workspace creation"]}
      ctaText="Already have an account?"
      ctaLink="/sign-in"
      ctaRoleLabel="Sign In"
    >
      <div className="space-y-6">
        {readyForSignup ? (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        ) : (
          <form onSubmit={handlePrepare} className="space-y-5">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Organization name</label>
              <input
                type="text"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="e.g. Mandya Pigmy Cooperative"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Organization slug</label>
              <input
                type="text"
                value={orgSlug}
                onChange={(event) => setOrgSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="mandya-pigmy-bank"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div className="space-y-2 text-sm text-slate-500">
              <p>This registration page is only for organization owners. Collectors and customers join by email invitation.</p>
            </div>
            {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            <button
              type="submit"
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Continue to account creation
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

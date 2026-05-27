import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "@/lib/languageContext";
import ClerkDefaultAuth from "../components/ClerkDefaultAuth";

const validRoles = ["owner", "pigmy_collector", "customer"] as const;
export type PreferredLoginRole = typeof validRoles[number];

const displayRoleName = (role: PreferredLoginRole) => {
  switch (role) {
    case "owner":
      return "Owner";
    case "pigmy_collector":
      return "Pigmy Collector";
    default:
      return "Customer";
  }
};

const mapPreferredRoleToAuthRole = (role: PreferredLoginRole) => {
  switch (role) {
    case "owner":
      return "organization";
    case "pigmy_collector":
      return "agent";
    default:
      return "customer";
  }
};

export default function AuthPage() {
  const location = useLocation();
  const { language } = useLanguage();
  const [role, setRole] = useState<PreferredLoginRole>("owner");
  const [initialMode, setInitialMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const mode = query.get("mode")?.toLowerCase();
    setInitialMode(mode === "signup" ? "signup" : "signin");

    if (typeof window !== "undefined") {
      const storedRole = window.localStorage.getItem("preferredLoginRole") as string | null;
      if (storedRole && validRoles.includes(storedRole as PreferredLoginRole)) {
        setRole(storedRole as PreferredLoginRole);
      }
    }
  }, [location.search]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center p-4">
      <div className="w-full max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 sm:p-10">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">FundCircle Authentication</p>
              <h1 className="text-3xl font-extrabold text-slate-900 mt-3">{language === "kn" ? "ಒಂದು ಸೈನ್‌ಇನ್‌ ನಿರ್ಮಾಣ" : "One Login for Every Role"}</h1>
              <p className="mt-2 text-sm text-slate-500 max-w-xl">
                {language === "kn"
                  ? "ಒಂದು Clerk ಪ್ರವೇಶದೊಂದಿಗೆ ನಿಮ್ಮ ಒಪ್ಪಿಗೆಯು, ಸಂಘಟನೆ ಸದಸ್ಯತ್ವ, ಮತ್ತು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ಗಳು ನಿರ್ವಹಿಸುತ್ತದೆ."
                  : "Use one Clerk login for owners, collectors, and customers across all workspaces."}
              </p>
            </div>
            <div className="rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Selected workspace</p>
              <p>{displayRoleName(role)}</p>
            </div>
          </div>

          <ClerkDefaultAuth initialMode={initialMode} role={mapPreferredRoleToAuthRole(role)} />
        </div>
      </div>
    </div>
  );
}

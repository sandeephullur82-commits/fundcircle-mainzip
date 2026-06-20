import React from "react";
import {
  Shield, Smartphone, Clock, LogOut, AlertTriangle,
  CheckCircle, Monitor, KeyRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface Props {
  user: any;
}

export default function SecurityTab({ user }: Props) {
  const navigate = useNavigate();

  const lastSignIn = user?.lastSignInAt ? new Date(user.lastSignInAt) : null;
  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-emerald-600" />
        <h2 className="font-bold text-slate-900 dark:text-white">Security Center</h2>
      </div>

      {/* Account Security */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">Account Security</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <SecurityRow
            icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
            label="Email Verified"
            value={emailVerified ? "Verified" : "Not verified"}
            status={emailVerified ? "ok" : "warn"}
          />
          <SecurityRow
            icon={<Shield className="w-4 h-4 text-blue-500" />}
            label="Password"
            value="Password protected"
            status="ok"
          />
          <SecurityRow
            icon={<Clock className="w-4 h-4 text-slate-400" />}
            label="Last Sign-in"
            value={lastSignIn ? format(lastSignIn, "MMM d, yyyy · h:mm a") : "—"}
            status="info"
          />
          <SecurityRow
            icon={<Monitor className="w-4 h-4 text-slate-400" />}
            label="Account Created"
            value={createdAt ? format(createdAt, "MMM d, yyyy") : "—"}
            status="info"
          />
        </CardContent>
      </Card>

      {/* Login Info */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Login Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Account ID</span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                {user?.id?.slice(0, 20)}…
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Email</span>
              <span className="font-semibold text-slate-900 dark:text-white text-xs">
                {user?.primaryEmailAddress?.emailAddress || "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Last Active</span>
              <span className="font-semibold text-slate-900 dark:text-white text-xs">
                {lastSignIn ? format(lastSignIn, "dd MMM yyyy") : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Member Since</span>
              <span className="font-semibold text-slate-900 dark:text-white text-xs">
                {createdAt ? format(createdAt, "dd MMM yyyy") : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Session */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-500" />
            Current Session
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center">
                <Monitor className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {typeof navigator !== "undefined"
                    ? navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop / Browser"
                    : "Browser"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Current active session</p>
              </div>
              <div className="ml-auto">
                <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password & Security */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                <p className="font-semibold text-slate-900 dark:text-white text-sm">Password & Security</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Manage your account password and account security. A reset link will be sent to your registered email.
              </p>
            </div>
            <button
              onClick={() => navigate("/auth/forgot-password")}
              className="shrink-0 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
            >
              Reset Password
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card className="border-red-100 dark:border-red-900/50">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Sign Out
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <SignOutButton>
            <button className="w-full h-11 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Sign Out of This Device
            </button>
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityRow({ icon, label, value, status }: {
  icon: React.ReactNode; label: string; value: string;
  status: "ok" | "warn" | "info";
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          status === "ok" ? "bg-emerald-50 dark:bg-emerald-950/30"
          : status === "warn" ? "bg-amber-50 dark:bg-amber-950/30"
          : "bg-slate-100 dark:bg-slate-800"
        }`}>
          {icon}
        </div>
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${
        status === "ok" ? "text-emerald-600 dark:text-emerald-400"
        : status === "warn" ? "text-amber-600 dark:text-amber-400"
        : "text-slate-500 dark:text-slate-400"
      }`}>
        {value}
      </span>
    </div>
  );
}

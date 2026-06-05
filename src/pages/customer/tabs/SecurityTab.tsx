import React, { useState } from "react";
import {
  Shield, Smartphone, Clock, LogOut, AlertTriangle,
  CheckCircle, Monitor, Eye, EyeOff, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@clerk/clerk-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  user: any;
}

export default function SecurityTab({ user }: Props) {
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [showCurr, setShowCurr] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const lastSignIn = user?.lastSignInAt ? new Date(user.lastSignInAt) : null;
  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error("Passwords don't match.");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters.");
    setChangingPw(true);
    try {
      await user?.updatePassword({ currentPassword, newPassword });
      toast.success("Password updated successfully!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setShowPwForm(false);
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Failed to update password");
    } finally {
      setChangingPw(false);
    }
  };

  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-emerald-600" />
        <h2 className="font-bold text-slate-900 dark:text-white">Security Center</h2>
      </div>

      {/* Security Status */}
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
        <CardContent className="pt-4 space-y-3">
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

      {/* Device Info */}
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

      {/* Change Password */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Change Password</p>
              <p className="text-xs text-slate-500 mt-0.5">Update your login password</p>
            </div>
            <button
              onClick={() => setShowPwForm(!showPwForm)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
            >
              {showPwForm ? "Cancel" : "Change"}
            </button>
          </div>
          {showPwForm && (
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
              <PwInput label="Current Password" value={currentPassword} onChange={setCurrentPassword}
                show={showCurr} onToggle={() => setShowCurr(!showCurr)} />
              <PwInput label="New Password" value={newPassword} onChange={setNewPassword}
                show={showNew} onToggle={() => setShowNew(!showNew)} />
              <PwInput label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword}
                show={showNew} onToggle={() => setShowNew(!showNew)} />
              <button type="submit" disabled={changingPw}
                className="w-full h-10 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                {changingPw ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {changingPw ? "Updating…" : "Update Password"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-100 dark:border-red-900/50">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Sign Out
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
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

function PwInput({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          required minLength={8} placeholder="••••••••"
          className="w-full h-10 pl-3 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400" />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

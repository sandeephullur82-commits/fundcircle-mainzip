import React, { useState, useEffect } from "react";
import {
  User, Edit3, Save, X, Phone, MapPin, Shield, Camera,
  LogOut, Calendar, Users,
  CreditCard, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton, useClerk } from "@clerk/clerk-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import type { Membership } from "@/types";
import ChangePasswordForm from "./ChangePasswordForm";

interface Props {
  user: any;
  membershipId: string | null;
  membershipDoc: Membership | null;
}

function Field({
  label, value, editMode, onChange, placeholder, icon, type = "text",
}: {
  label: string; value: string; editMode: boolean;
  onChange: (v: string) => void; placeholder?: string;
  icon?: React.ReactNode; type?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      {editMode ? (
        <div className="relative">
          {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
          <input
            type={type} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full h-10 ${icon ? "pl-9" : "pl-3"} pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400`}
          />
        </div>
      ) : (
        <p className="text-slate-900 dark:text-white text-sm min-h-[20px]">
          {value || <span className="text-slate-400">—</span>}
        </p>
      )}
    </div>
  );
}


export default function ProfileTab({ user, membershipId, membershipDoc }: Props) {
  const { signOut } = useClerk();
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");

  // Nominee
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("");
  const [nomineePhone, setNomineePhone] = useState("");

  // Password
  const [showPwForm, setShowPwForm] = useState(false);

  // Load from membershipDoc
  const mem = membershipDoc;
  const nominee = mem?.nominee ?? {};

  useEffect(() => {
    if (editMode) {
      setFirstName(mem?.firstName || user?.firstName || "");
      setLastName(mem?.lastName || user?.lastName || "");
      setPhone(mem?.phone || "");
      setAddress(mem?.address || "");
      setCity(mem?.city || "");
      setState(mem?.state || "");
      setPincode(mem?.pincode || "");
      setDateOfBirth(mem?.dateOfBirth || "");
      setGender(mem?.gender || "");
      setAadhaarLast4(mem?.aadhaarLast4 || "");
      setNomineeName(nominee.name || "");
      setNomineeRelation(nominee.relation || "");
      setNomineePhone(nominee.phone || "");
    }
  }, [editMode]);

  const handleSave = async () => {
    if (!membershipId) return toast.error("Not authenticated.");
    setSaving(true);
    try {
      await updateDoc(doc(db, "organizationMembers", membershipId), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        dateOfBirth: dateOfBirth.trim(),
        gender: gender.trim(),
        aadhaarLast4: aadhaarLast4.trim(),
        nominee: {
          name: nomineeName.trim(),
          relation: nomineeRelation.trim(),
          phone: nomineePhone.trim(),
        },
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile updated successfully");
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };


  const displayName = mem?.fullName || `${mem?.firstName || ""} ${mem?.lastName || ""}`.trim() || user?.fullName || "Customer";
  const displayEmail = mem?.email || user?.primaryEmailAddress?.emailAddress || "";

  return (
    <div className="space-y-4">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-200 dark:ring-emerald-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-black">
                  {(displayName[0] || "C").toUpperCase()}
                </div>
              )}
              {editMode && (
                <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-sm">
                  <Camera className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-lg leading-tight truncate">{displayName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{displayEmail}</p>
              {mem?.status && (
                <span className={`mt-1.5 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  mem.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {mem.status}
                </span>
              )}
            </div>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                editMode
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  : "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {editMode ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Edit3 className="w-3.5 h-3.5" /> Edit</>}
            </button>
          </div>

          {editMode && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-4 w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" value={editMode ? firstName : (mem?.firstName || user?.firstName || "")}
              editMode={editMode} onChange={setFirstName} placeholder="First name" />
            <Field label="Last Name" value={editMode ? lastName : (mem?.lastName || user?.lastName || "")}
              editMode={editMode} onChange={setLastName} placeholder="Last name" />
          </div>
          <Field label="Phone Number" value={editMode ? phone : (mem?.phone || "")}
            editMode={editMode} onChange={setPhone} placeholder="+91 98765 43210"
            icon={<Phone className="w-4 h-4 text-slate-400" />} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of Birth" value={editMode ? dateOfBirth : (mem?.dateOfBirth || "")}
              editMode={editMode} onChange={setDateOfBirth} type="date" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gender</p>
              {editMode ? (
                <select value={gender} onChange={(e) => setGender(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30">
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              ) : (
                <p className="text-slate-900 dark:text-white text-sm">{mem?.gender || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <Field label="Street Address" value={editMode ? address : (mem?.address || "")}
            editMode={editMode} onChange={setAddress} placeholder="Door no, Street name"
            icon={<MapPin className="w-4 h-4 text-slate-400" />} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" value={editMode ? city : (mem?.city || "")}
              editMode={editMode} onChange={setCity} placeholder="City" />
            <Field label="State" value={editMode ? state : (mem?.state || "")}
              editMode={editMode} onChange={setState} placeholder="State" />
          </div>
          <Field label="Pincode" value={editMode ? pincode : (mem?.pincode || "")}
            editMode={editMode} onChange={setPincode} placeholder="6-digit pincode" />
        </CardContent>
      </Card>

      {/* Nominee */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            Nominee Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <Field label="Nominee Name" value={editMode ? nomineeName : (nominee.name || "")}
            editMode={editMode} onChange={setNomineeName} placeholder="Full name of nominee" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Relationship" value={editMode ? nomineeRelation : (nominee.relation || "")}
              editMode={editMode} onChange={setNomineeRelation} placeholder="e.g. Spouse" />
            <Field label="Nominee Phone" value={editMode ? nomineePhone : (nominee.phone || "")}
              editMode={editMode} onChange={setNomineePhone} placeholder="+91 ..." />
          </div>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-orange-500" />
            Identity Document
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Aadhaar (Last 4 digits)
          </p>
          {editMode ? (
            <input
              type="text" maxLength={4} value={aadhaarLast4}
              onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="XXXX"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 font-mono tracking-widest"
            />
          ) : (
            <p className="text-slate-900 dark:text-white font-mono text-sm">
              {mem?.aadhaarLast4 ? `XXXX XXXX XXXX ${mem.aadhaarLast4}` : "—"}
            </p>
          )}
          {editMode && (
            <p className="text-[10px] text-slate-400">Only the last 4 digits are stored for security.</p>
          )}
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Change Password</p>
              <p className="text-xs text-slate-500 mt-0.5">Update your account password</p>
            </div>
            {!showPwForm && (
              <button
                onClick={() => setShowPwForm(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
              >
                Change
              </button>
            )}
          </div>
          {showPwForm && (
            <ChangePasswordForm
              userEmail={displayEmail}
              onSuccess={() => setShowPwForm(false)}
              onCancel={() => setShowPwForm(false)}
            />
          )}
        </CardContent>
      </Card>

      {/* Logout */}
      <SignOutButton>
        <button className="w-full h-12 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </SignOutButton>
    </div>
  );
}

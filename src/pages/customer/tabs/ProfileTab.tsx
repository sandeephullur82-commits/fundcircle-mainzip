import React, { useState, useEffect, useRef } from "react";
import {
  User, Edit3, Save, X, Phone, MapPin, Shield, Camera,
  LogOut, RefreshCw, CreditCard, AlertTriangle, Lock, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton, useClerk } from "@clerk/clerk-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { toast } from "sonner";
import type { Membership } from "@/types";
import ChangePasswordForm from "./ChangePasswordForm";

interface Props {
  user: any;
  membershipId: string | null;
  membershipDoc: Membership | null;
  nomineeLocked?: boolean;
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

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 5;

export default function ProfileTab({ user, membershipId, membershipDoc, nomineeLocked = false }: Props) {
  const { signOut } = useClerk();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

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

  const [nomineeName, setNomineeName] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("");
  const [nomineePhone, setNomineePhone] = useState("");
  const [nomineeAddress, setNomineeAddress] = useState("");

  const [showPwForm, setShowPwForm] = useState(false);

  const mem = membershipDoc;

  const resolvedNomineeName = mem?.nomineeName || mem?.nominee?.name || "";
  const resolvedNomineeRelation = mem?.nomineeRelation || mem?.nominee?.relation || "";
  const resolvedNomineePhone = mem?.nomineePhone || mem?.nominee?.phone || "";
  const resolvedNomineeAddress = mem?.nomineeAddress || mem?.nominee?.address || "";

  const nomineeComplete = !!(resolvedNomineeName && resolvedNomineeRelation);

  useEffect(() => {
    const url = (mem as any)?.avatarUrl || user?.imageUrl || "";
    setAvatarUrl(url);
  }, [mem, user]);

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
      setNomineeName(resolvedNomineeName);
      setNomineeRelation(resolvedNomineeRelation);
      setNomineePhone(resolvedNomineePhone);
      setNomineeAddress(resolvedNomineeAddress);
    }
  }, [editMode]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !membershipId) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, and WEBP images are allowed.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `avatars/${membershipId}/${Date.now()}.${ext}`;
      const fileRef = storageRef(storage, path);
      const task = uploadBytesResumable(fileRef, file);

      task.on(
        "state_changed",
        (snap) => {
          setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        },
        (err) => {
          console.error("[Avatar upload] error:", err);
          toast.error("Upload failed. Please try again.");
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await updateDoc(doc(db, "organizationMembers", membershipId), {
            avatarUrl: url,
            updatedAt: serverTimestamp(),
          });
          setAvatarUrl(url);
          setUploading(false);
          setUploadProgress(0);
          toast.success("Profile photo updated!");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      );
    } catch (err: any) {
      console.error("[Avatar upload] exception:", err);
      toast.error("Upload failed. Please try again.");
      setUploading(false);
    }
  };

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
        nomineeName: nomineeName.trim(),
        nomineeRelation: nomineeRelation.trim(),
        nomineePhone: nomineePhone.trim(),
        nomineeAddress: nomineeAddress.trim(),
        nominee: {
          name: nomineeName.trim(),
          relation: nomineeRelation.trim(),
          phone: nomineePhone.trim(),
          address: nomineeAddress.trim(),
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
      {!nomineeComplete && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Nominee details incomplete</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Please fill in your nominee information. This is required for loan and savings account protection.
            </p>
          </div>
          <button
            onClick={() => setEditMode(true)}
            className="text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0 underline underline-offset-2"
          >
            Update now
          </button>
        </div>
      )}

      {/* Profile Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-200 dark:ring-emerald-700"
                  onError={() => setAvatarUrl("")}
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-black">
                  {(displayName[0] || "C").toUpperCase()}
                </div>
              )}
              {/* Upload progress overlay */}
              {uploading && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 flex flex-col items-center justify-center">
                  <p className="text-white text-[10px] font-bold">{uploadProgress}%</p>
                  <div className="w-10 h-1 bg-white/30 rounded-full mt-1">
                    <div
                      className="h-1 bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Camera button — always visible, triggers upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Change profile photo"
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-full flex items-center justify-center shadow-sm transition-colors"
              >
                {uploading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Camera className="w-3 h-3" />
                )}
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-lg leading-tight truncate">{displayName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{displayEmail}</p>
              {mem?.status && (
                <div className="mt-1.5">
                  <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    mem.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-500"
                  }`}>
                    {mem.status}
                  </span>
                </div>
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

          {uploading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Upload className="w-3.5 h-3.5 animate-bounce" />
              Uploading photo… {uploadProgress}%
            </div>
          )}

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
      <Card className={
        nomineeLocked ? "ring-1 ring-blue-300 dark:ring-blue-700" :
        !nomineeComplete ? "ring-1 ring-amber-300 dark:ring-amber-700" : ""
      }>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            Nominee Details
            {nomineeLocked ? (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                <Lock className="w-3 h-3" /> Active &amp; Locked
              </span>
            ) : nomineeComplete ? (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                🟡 Editable
              </span>
            ) : (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                Incomplete
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {nomineeLocked && (
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5">
              <Lock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Nominee locked because an active loan exists. Contact the organization to request changes.
              </p>
            </div>
          )}
          <Field label="Nominee Name" value={editMode ? nomineeName : resolvedNomineeName}
            editMode={editMode && !nomineeLocked} onChange={setNomineeName} placeholder="Full name of nominee" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Relationship</p>
              {editMode && !nomineeLocked ? (
                <select value={nomineeRelation} onChange={(e) => setNomineeRelation(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30">
                  <option value="">Select…</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Other">Other</option>
                </select>
              ) : (
                <p className="text-slate-900 dark:text-white text-sm">{resolvedNomineeRelation || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
            <Field label="Nominee Phone" value={editMode ? nomineePhone : resolvedNomineePhone}
              editMode={editMode && !nomineeLocked} onChange={setNomineePhone} placeholder="+91 ..." />
          </div>
          <Field label="Nominee Address" value={editMode ? nomineeAddress : resolvedNomineeAddress}
            editMode={editMode && !nomineeLocked} onChange={setNomineeAddress} placeholder="Nominee's residential address"
            icon={<MapPin className="w-4 h-4 text-slate-400" />} />
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

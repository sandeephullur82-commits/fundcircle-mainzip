import React, { useState, useEffect, useRef } from "react";
import {
  User, Edit3, Save, X, Phone, MapPin, Shield, CheckCircle2,
  LogOut, RefreshCw, CreditCard, AlertTriangle, Lock, Camera,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton, useUser } from "@clerk/clerk-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import type { Membership } from "@/types";

interface Props {
  user: any;
  membershipId: string | null;
  membershipDoc: Membership | null;
  nomineeLocked?: boolean;
}

// ── Validation helpers ───────────────────────────────────────────────────────
const nameRx   = /^[A-Za-z\s]*$/;
const phone10Rx = /^\d{10}$/;
const pin6Rx    = /^\d{6}$/;
const todayStr  = () => new Date().toISOString().split("T")[0];

// ── Styled input ─────────────────────────────────────────────────────────────
const inputCls = (err?: string) =>
  `w-full h-10 pl-3 pr-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ` +
  (err
    ? "border-red-400 bg-red-50 dark:bg-red-950/20 text-slate-900 dark:text-white focus:ring-red-400/30"
    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-emerald-400/30 focus:border-emerald-400");

const iconInputCls = (err?: string) =>
  `w-full h-10 pl-9 pr-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ` +
  (err
    ? "border-red-400 bg-red-50 dark:bg-red-950/20 text-slate-900 dark:text-white focus:ring-red-400/30"
    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-emerald-400/30 focus:border-emerald-400");

const labelCls = "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider";
const valueCls = "text-slate-900 dark:text-white text-sm min-h-[20px]";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11px] text-red-500 mt-1">{msg}</p>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className={labelCls}>{label}</p>
      <p className={`${valueCls} text-slate-400`}>{value || "—"}</p>
    </div>
  );
}

// Allowed file types for Clerk profile image upload
const AVATAR_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function ProfileTab({ user, membershipId, membershipDoc, nomineeLocked = false }: Props) {
  const { user: clerkUser } = useUser();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editMode, setEditMode]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [savedOk, setSavedOk]           = useState(false);
  const [isDirty, setIsDirty]           = useState(false);
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── Editable fields ─────────────────────────────────────────────────────────
  const [firstName,      setFirstName]      = useState("");
  const [lastName,       setLastName]       = useState("");
  const [phone,          setPhone]          = useState("");
  const [address,        setAddress]        = useState("");
  const [city,           setCity]           = useState("");
  const [stateName,      setStateName]      = useState("");
  const [pincode,        setPincode]        = useState("");
  const [dateOfBirth,    setDateOfBirth]    = useState("");
  const [gender,         setGender]         = useState("");
  const [aadhaarLast4,   setAadhaarLast4]   = useState("");
  const [nomineeName,    setNomineeName]    = useState("");
  const [nomineeRelation,setNomineeRelation]= useState("");
  const [nomineePhone,   setNomineePhone]   = useState("");
  const [nomineeAddress, setNomineeAddress] = useState("");

  const mem = membershipDoc;

  const resolvedNomineeName     = mem?.nomineeName     || mem?.nominee?.name     || "";
  const resolvedNomineeRelation = mem?.nomineeRelation || mem?.nominee?.relation || "";
  const resolvedNomineePhone    = mem?.nomineePhone    || mem?.nominee?.phone    || "";
  const resolvedNomineeAddress  = mem?.nomineeAddress  || mem?.nominee?.address  || "";
  const nomineeComplete         = !!(resolvedNomineeName && resolvedNomineeRelation);

  // Seed fields when edit opens
  useEffect(() => {
    if (!editMode) return;
    setFirstName(mem?.firstName || user?.firstName || "");
    setLastName(mem?.lastName   || user?.lastName  || "");
    setPhone(mem?.phone || "");
    setAddress(mem?.address || "");
    setCity(mem?.city || "");
    setStateName(mem?.state || "");
    setPincode(mem?.pincode || "");
    setDateOfBirth(mem?.dateOfBirth || "");
    setGender(mem?.gender || "");
    setAadhaarLast4(mem?.aadhaarLast4 || "");
    setNomineeName(resolvedNomineeName);
    setNomineeRelation(resolvedNomineeRelation);
    setNomineePhone(resolvedNomineePhone);
    setNomineeAddress(resolvedNomineeAddress);
    setErrors({});
    setIsDirty(false);
    setSavedOk(false);
  }, [editMode]);

  // Mark dirty whenever any editable field changes (only while in editMode)
  useEffect(() => {
    if (editMode) setIsDirty(true);
  }, [firstName, lastName, phone, address, city, stateName, pincode,
      dateOfBirth, gender, aadhaarLast4, nomineeName, nomineeRelation,
      nomineePhone, nomineeAddress]);

  // ── Clerk avatar upload ──────────────────────────────────────────────────
  // Uploads to Clerk CDN via setProfileImage(); user.imageUrl auto-updates
  // everywhere (header, sidebar, profile card) without any manual sync.
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !clerkUser) return;

    if (!AVATAR_ALLOWED.includes(file.type)) {
      toast.error("Only JPG, PNG, or WEBP images are allowed.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      await clerkUser.setProfileImage({ file });
      toast.success("Profile photo updated!");
    } catch (err: any) {
      console.error("[ProfileAvatar] Clerk upload error:", err);
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "Upload failed. Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Setters that enforce input rules ─────────────────────────────────────
  const setNameField = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (v: string) => setter(v.replace(/[^A-Za-z\s]/g, ""));

  const setPhoneField = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (v: string) => setter(v.replace(/\D/g, "").slice(0, 10));

  const setPincodeField = (v: string) => setPincode(v.replace(/\D/g, "").slice(0, 6));

  // ── Validation ────────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {};

    if (!firstName.trim()) {
      e.firstName = "First name is required.";
    } else if (!nameRx.test(firstName)) {
      e.firstName = "Only letters and spaces allowed.";
    }

    if (!lastName.trim()) {
      e.lastName = "Last name is required.";
    } else if (!nameRx.test(lastName)) {
      e.lastName = "Only letters and spaces allowed.";
    }

    if (phone.trim() && !phone10Rx.test(phone.trim())) {
      e.phone = "Enter valid 10 digit mobile number.";
    }

    if (pincode.trim() && !pin6Rx.test(pincode.trim())) {
      e.pincode = "Enter valid 6 digit pincode.";
    }

    if (dateOfBirth && dateOfBirth > todayStr()) {
      e.dateOfBirth = "Date of birth cannot be in the future.";
    }

    if (nomineeName.trim() && !nameRx.test(nomineeName)) {
      e.nomineeName = "Only letters and spaces allowed.";
    }
    if (nomineeName.trim() && !nomineeRelation) {
      e.nomineeRelation = "Please select a relationship.";
    }
    if (nomineePhone.trim() && !phone10Rx.test(nomineePhone.trim())) {
      e.nomineePhone = "Enter valid 10 digit mobile number.";
    }

    return e;
  }

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      toast.error("Please fix the errors before saving.");
      return;
    }
    if (!membershipId) return toast.error("Not authenticated.");

    setSaving(true);
    setErrors({});
    try {
      await updateDoc(doc(db, "organizationMembers", membershipId), {
        firstName:        firstName.trim(),
        lastName:         lastName.trim(),
        fullName:         `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone:            phone.trim(),
        address:          address.trim(),
        city:             city.trim(),
        state:            stateName.trim(),
        pincode:          pincode.trim(),
        dateOfBirth:      dateOfBirth.trim(),
        gender:           gender.trim(),
        aadhaarLast4:     aadhaarLast4.trim(),
        nomineeName:      nomineeName.trim(),
        nomineeRelation:  nomineeRelation.trim(),
        nomineePhone:     nomineePhone.trim(),
        nomineeAddress:   nomineeAddress.trim(),
        nominee: {
          name:     nomineeName.trim(),
          relation: nomineeRelation.trim(),
          phone:    nomineePhone.trim(),
          address:  nomineeAddress.trim(),
        },
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile updated successfully");
      setIsDirty(false);
      setSavedOk(true);
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setErrors({});
    setIsDirty(false);
  };

  // ── Display values ────────────────────────────────────────────────────────
  const displayName  = mem?.fullName || `${mem?.firstName || ""} ${mem?.lastName || ""}`.trim() || user?.fullName || "Customer";
  const displayEmail = mem?.email || user?.primaryEmailAddress?.emailAddress || "";
  const clerkAvatar  = clerkUser?.imageUrl || user?.imageUrl || "";
  const initials     = (displayName[0] || "C").toUpperCase();

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
          <button onClick={() => setEditMode(true)}
            className="text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0 underline underline-offset-2">
            Update now
          </button>
        </div>
      )}

      {/* ── Profile Header Card ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* ── Avatar — Clerk user.imageUrl (single source of truth) ─── */}
            {/* Camera icon opens file picker → clerkUser.setProfileImage()  */}
            {/* After upload, user.imageUrl propagates to ALL avatars         */}
            {/* (header, sidebars, profile card) with no manual sync.        */}
            <div className="relative shrink-0">
              {/* Hidden file input — JPG/PNG/WEBP, ≤5 MB */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />

              {/* Avatar circle */}
              {clerkAvatar ? (
                <img
                  src={clerkAvatar}
                  alt="Profile"
                  loading="lazy"
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-200 dark:ring-emerald-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-black select-none">
                  {initials}
                </div>
              )}

              {/* Uploading spinner overlay */}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                </div>
              )}

              {/* Camera button — always visible (not gated on editMode) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                title="Change profile photo (JPG, PNG, WEBP · max 5 MB)"
                aria-label="Change profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-900 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-lg leading-tight truncate">{displayName || "—"}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{displayEmail || "—"}</p>
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
              onClick={() => editMode ? handleCancel() : setEditMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                editMode
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  : "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {editMode ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Edit3 className="w-3.5 h-3.5" /> Edit</>}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Personal Information ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className={labelCls}>First Name</p>
              {editMode ? (
                <>
                  <input
                    type="text" value={firstName}
                    onChange={e => setNameField(setFirstName)(e.target.value)}
                    placeholder="First name"
                    className={inputCls(errors.firstName)}
                  />
                  <FieldError msg={errors.firstName} />
                </>
              ) : (
                <p className={valueCls}>{mem?.firstName || user?.firstName || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className={labelCls}>Last Name</p>
              {editMode ? (
                <>
                  <input
                    type="text" value={lastName}
                    onChange={e => setNameField(setLastName)(e.target.value)}
                    placeholder="Last name"
                    className={inputCls(errors.lastName)}
                  />
                  <FieldError msg={errors.lastName} />
                </>
              ) : (
                <p className={valueCls}>{mem?.lastName || user?.lastName || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <p className={labelCls}>Phone Number</p>
            {editMode ? (
              <>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhoneField(setPhone)(e.target.value)}
                    placeholder="10 digit mobile number"
                    className={iconInputCls(errors.phone)}
                  />
                </div>
                <FieldError msg={errors.phone} />
              </>
            ) : (
              <p className={valueCls}>{mem?.phone || <span className="text-slate-400">—</span>}</p>
            )}
          </div>

          {/* DOB + Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className={labelCls}>Date of Birth</p>
              {editMode ? (
                <>
                  <input
                    type="date"
                    value={dateOfBirth}
                    max={todayStr()}
                    onChange={e => setDateOfBirth(e.target.value)}
                    className={inputCls(errors.dateOfBirth)}
                  />
                  <FieldError msg={errors.dateOfBirth} />
                </>
              ) : (
                <p className={valueCls}>{mem?.dateOfBirth || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className={labelCls}>Gender</p>
              {editMode ? (
                <>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className={inputCls(errors.gender)}
                  >
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  <FieldError msg={errors.gender} />
                </>
              ) : (
                <p className={valueCls}>{mem?.gender || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
          </div>

          {/* Read-only fields */}
          <ReadOnlyField label="Email" value={displayEmail} />
          {mem?.id && <ReadOnlyField label="Member ID" value={mem.id} />}
        </CardContent>
      </Card>

      {/* ── Address ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Street */}
          <div className="space-y-1">
            <p className={labelCls}>Street Address</p>
            {editMode ? (
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text" value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Door no, Street name"
                  className={iconInputCls()}
                />
              </div>
            ) : (
              <p className={valueCls}>{mem?.address || <span className="text-slate-400">—</span>}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className={labelCls}>City</p>
              {editMode ? (
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="City" className={inputCls()} />
              ) : (
                <p className={valueCls}>{mem?.city || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className={labelCls}>State</p>
              {editMode ? (
                <input type="text" value={stateName} onChange={e => setStateName(e.target.value)}
                  placeholder="State" className={inputCls()} />
              ) : (
                <p className={valueCls}>{mem?.state || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
          </div>

          {/* Pincode */}
          <div className="space-y-1">
            <p className={labelCls}>Pincode</p>
            {editMode ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={e => setPincodeField(e.target.value)}
                  placeholder="6 digit pincode"
                  className={inputCls(errors.pincode)}
                />
                <FieldError msg={errors.pincode} />
              </>
            ) : (
              <p className={valueCls}>{mem?.pincode || <span className="text-slate-400">—</span>}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Nominee ──────────────────────────────────────────────────────── */}
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

          {/* Nominee Name */}
          <div className="space-y-1">
            <p className={labelCls}>Nominee Name</p>
            {editMode && !nomineeLocked ? (
              <>
                <input
                  type="text" value={nomineeName}
                  onChange={e => setNameField(setNomineeName)(e.target.value)}
                  placeholder="Full name of nominee"
                  className={inputCls(errors.nomineeName)}
                />
                <FieldError msg={errors.nomineeName} />
              </>
            ) : (
              <p className={valueCls}>{resolvedNomineeName || <span className="text-slate-400">—</span>}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Relationship */}
            <div className="space-y-1">
              <p className={labelCls}>Relationship</p>
              {editMode && !nomineeLocked ? (
                <>
                  <select
                    value={nomineeRelation}
                    onChange={e => setNomineeRelation(e.target.value)}
                    className={inputCls(errors.nomineeRelation)}
                  >
                    <option value="">Select…</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Son">Son</option>
                    <option value="Daughter">Daughter</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Other">Other</option>
                  </select>
                  <FieldError msg={errors.nomineeRelation} />
                </>
              ) : (
                <p className={valueCls}>{resolvedNomineeRelation || <span className="text-slate-400">—</span>}</p>
              )}
            </div>

            {/* Nominee Phone */}
            <div className="space-y-1">
              <p className={labelCls}>Nominee Phone</p>
              {editMode && !nomineeLocked ? (
                <>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={nomineePhone}
                    onChange={e => setPhoneField(setNomineePhone)(e.target.value)}
                    placeholder="10 digits"
                    className={inputCls(errors.nomineePhone)}
                  />
                  <FieldError msg={errors.nomineePhone} />
                </>
              ) : (
                <p className={valueCls}>{resolvedNomineePhone || <span className="text-slate-400">—</span>}</p>
              )}
            </div>
          </div>

          {/* Nominee Address */}
          <div className="space-y-1">
            <p className={labelCls}>Nominee Address</p>
            {editMode && !nomineeLocked ? (
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text" value={nomineeAddress}
                  onChange={e => setNomineeAddress(e.target.value)}
                  placeholder="Nominee's residential address"
                  className={iconInputCls()}
                />
              </div>
            ) : (
              <p className={valueCls}>{resolvedNomineeAddress || <span className="text-slate-400">—</span>}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Identity Document ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-orange-500" />
            Identity Document
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-2">
          <p className={labelCls}>Aadhaar (Last 4 digits)</p>
          {editMode ? (
            <>
              <input
                type="text" maxLength={4} value={aadhaarLast4}
                inputMode="numeric"
                onChange={e => setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="XXXX"
                className={`${inputCls()} font-mono tracking-widest`}
              />
              <p className="text-[10px] text-slate-400">Only the last 4 digits are stored for security.</p>
            </>
          ) : (
            <p className={`${valueCls} font-mono`}>
              {mem?.aadhaarLast4 ? `XXXX XXXX XXXX ${mem.aadhaarLast4}` : <span className="text-slate-400">—</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Save Changes — bottom of form, shown only in editMode ─────────── */}
      {editMode && (
        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
          {!isDirty && !saving && (
            <p className="text-center text-xs text-slate-400">Edit a field above to enable Save.</p>
          )}
        </div>
      )}

      {/* ── Saved confirmation ────────────────────────────────────────────── */}
      {savedOk && !editMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Changes saved successfully</p>
        </div>
      )}

      {/* ── Sign Out ──────────────────────────────────────────────────────── */}
      <SignOutButton>
        <button className="w-full h-12 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </SignOutButton>
    </div>
  );
}

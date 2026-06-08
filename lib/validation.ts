/**
 * FundCircle — Validation & Sanitization Layer
 *
 * Single source of truth for all input validation and sanitization.
 * Used client-side (forms) and in service functions before Firestore writes.
 * All sanitizers return safe strings; all validators return { valid, error }.
 */

// ── Sanitizers ────────────────────────────────────────────────────────────────

/** Strip XSS-dangerous characters and trim whitespace. */
export function sanitizeText(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/** Safe human name: trim, remove injection chars, cap length. */
export function sanitizeName(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/[<>"'\/\\;{}()\[\]]/g, "")
    .substring(0, 100);
}

/** Normalise email: trim + lowercase + length cap. */
export function sanitizeEmail(input: string): string {
  if (!input) return "";
  return input.trim().toLowerCase().substring(0, 254);
}

/** Keep only digits, +, -, spaces, and parentheses from phone. */
export function sanitizePhone(input: string): string {
  if (!input) return "";
  return input.trim().replace(/[^\d+\-\s()]/g, "").substring(0, 20);
}

/** Strip everything from a numeric input except digits and one dot. */
export function sanitizeAmount(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
}

/** Trim a multi-line text field and cap its length. */
export function sanitizeMultiline(input: string, maxLength = 500): string {
  if (!input) return "";
  return input.trim().substring(0, maxLength);
}

// ── Validators ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate an email address. */
export function validateEmail(email: string): ValidationResult {
  const s = sanitizeEmail(email);
  if (!s) return { valid: false, error: "Email address is required" };
  const emailRe = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
  if (!emailRe.test(s)) return { valid: false, error: "Enter a valid email address" };
  return { valid: true };
}

/**
 * Validate an Indian mobile number.
 * Accepts: 10-digit starting with 6-9, or +91/91 prefix variants.
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone?.trim()) return { valid: false, error: "Phone number is required" };
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return { valid: true };
  if (digits.length === 12 && /^91[6-9]/.test(digits)) return { valid: true };
  if (digits.length === 11 && /^0[6-9]/.test(digits)) return { valid: true }; // 0 + 10 digit
  return { valid: false, error: "Enter a valid 10-digit Indian mobile number" };
}

/** Validate a monetary amount. */
export function validateAmount(
  amount: number | string,
  options?: { min?: number; max?: number; label?: string }
): ValidationResult {
  const num = typeof amount === "string" ? parseFloat(amount.replace(/,/g, "")) : amount;
  const label = options?.label ?? "Amount";
  if (isNaN(num) || !isFinite(num)) return { valid: false, error: `${label} must be a valid number` };
  if (num <= 0) return { valid: false, error: `${label} must be greater than zero` };
  const min = options?.min ?? 1;
  const max = options?.max ?? 10_000_000;
  if (num < min) return { valid: false, error: `${label} must be at least ₹${min.toLocaleString("en-IN")}` };
  if (num > max) return { valid: false, error: `${label} cannot exceed ₹${max.toLocaleString("en-IN")}` };
  return { valid: true };
}

/** Validate a name field (person or org). */
export function validateName(
  name: string,
  options?: { label?: string; minLength?: number; maxLength?: number }
): ValidationResult {
  const label = options?.label ?? "Name";
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { valid: false, error: `${label} is required` };
  const min = options?.minLength ?? 2;
  const max = options?.maxLength ?? 100;
  if (trimmed.length < min) return { valid: false, error: `${label} must be at least ${min} characters` };
  if (trimmed.length > max) return { valid: false, error: `${label} cannot exceed ${max} characters` };
  if (/[<>"'\/\\{}()\[\];]/.test(trimmed))
    return { valid: false, error: `${label} contains invalid characters` };
  return { valid: true };
}

/** Validate an organization name. */
export function validateOrgName(name: string): ValidationResult {
  return validateName(name, { label: "Organization name", minLength: 3, maxLength: 100 });
}

/** Validate a date string or Date object. */
export function validateDate(
  date: string | Date | null | undefined,
  options?: { label?: string; pastOnly?: boolean; futureOnly?: boolean }
): ValidationResult {
  const label = options?.label ?? "Date";
  if (!date) return { valid: false, error: `${label} is required` };
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return { valid: false, error: `${label} is not a valid date` };
  const now = new Date();
  if (options?.pastOnly && d > now) return { valid: false, error: `${label} must be in the past` };
  if (options?.futureOnly && d < now) return { valid: false, error: `${label} must be in the future` };
  return { valid: true };
}

/** Validate a password and report its strength. */
export function validatePassword(
  password: string
): ValidationResult & { strength: "weak" | "medium" | "strong" } {
  if (!password) return { valid: false, error: "Password is required", strength: "weak" };
  if (password.length < 8)
    return { valid: false, error: "Password must be at least 8 characters", strength: "weak" };

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
  const score = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  const strength: "weak" | "medium" | "strong" =
    score >= 4 ? "strong" : score >= 2 ? "medium" : "weak";

  return { valid: true, strength };
}

/** Validate a loan tenure (months). */
export function validateTenure(months: number | string): ValidationResult {
  const n = Number(months);
  if (isNaN(n) || !Number.isInteger(n)) return { valid: false, error: "Tenure must be a whole number of months" };
  if (n < 1) return { valid: false, error: "Tenure must be at least 1 month" };
  if (n > 360) return { valid: false, error: "Tenure cannot exceed 360 months (30 years)" };
  return { valid: true };
}

/** Validate a percentage rate (e.g. interest rate). */
export function validateRate(rate: number | string, options?: { label?: string; max?: number }): ValidationResult {
  const n = Number(rate);
  const label = options?.label ?? "Rate";
  if (isNaN(n)) return { valid: false, error: `${label} must be a number` };
  if (n < 0) return { valid: false, error: `${label} cannot be negative` };
  const max = options?.max ?? 100;
  if (n > max) return { valid: false, error: `${label} cannot exceed ${max}%` };
  return { valid: true };
}

// ── Duplicate Detection ───────────────────────────────────────────────────────

/**
 * Returns true if `value` already exists in `items[key]` (case-insensitive for strings).
 * Pass `excludeId` to skip a record when editing in place.
 */
export function isDuplicate<T extends Record<string, any>>(
  items: T[],
  key: keyof T,
  value: unknown,
  excludeId?: string
): boolean {
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
  return items.some(
    (item) => norm(item[key]) === norm(value) && item.id !== excludeId
  );
}

// ── Composite form validators ─────────────────────────────────────────────────

export interface AgentFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export function validateAgentForm(data: AgentFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  const fn = validateName(data.firstName, { label: "First name" });
  if (!fn.valid) errors.firstName = fn.error!;
  const ln = validateName(data.lastName, { label: "Last name" });
  if (!ln.valid) errors.lastName = ln.error!;
  const em = validateEmail(data.email);
  if (!em.valid) errors.email = em.error!;
  if (data.phone) {
    const ph = validatePhone(data.phone);
    if (!ph.valid) errors.phone = ph.error!;
  }
  return errors;
}

export interface CustomerFormData {
  fullName: string;
  email?: string;
  phone: string;
  address?: string;
}

export function validateCustomerForm(data: CustomerFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  const nm = validateName(data.fullName, { label: "Full name" });
  if (!nm.valid) errors.fullName = nm.error!;
  if (data.email) {
    const em = validateEmail(data.email);
    if (!em.valid) errors.email = em.error!;
  }
  const ph = validatePhone(data.phone);
  if (!ph.valid) errors.phone = ph.error!;
  return errors;
}

export interface LoanFormData {
  principalAmount: number | string;
  interestRate: number | string;
  tenureMonths: number | string;
}

export function validateLoanForm(data: LoanFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  const amt = validateAmount(data.principalAmount, { label: "Principal amount", min: 1000, max: 5_000_000 });
  if (!amt.valid) errors.principalAmount = amt.error!;
  const rate = validateRate(data.interestRate, { label: "Interest rate", max: 50 });
  if (!rate.valid) errors.interestRate = rate.error!;
  const ten = validateTenure(data.tenureMonths);
  if (!ten.valid) errors.tenureMonths = ten.error!;
  return errors;
}

export interface CollectionFormData {
  amount: number | string;
  customerId: string;
}

export function validateCollectionForm(data: CollectionFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  const amt = validateAmount(data.amount, { label: "Collection amount", min: 1, max: 1_000_000 });
  if (!amt.valid) errors.amount = amt.error!;
  if (!data.customerId?.trim()) errors.customerId = "Customer is required";
  return errors;
}

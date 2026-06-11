---
name: Enterprise validation pattern
description: Key gotchas and conventions for the FundCircle validation/sanitization system across client, server, and Firestore rules.
---

## Rules

**FieldError component** (`components/ui/FieldError.tsx`) uses `error` prop — NOT `message`. Always `<FieldError error={someString} />`.

**sanitizeName()** takes exactly 1 argument (no maxLength option). If you need to cap length after, chain `.substring(0, N)`.

**validatePhone10 / validateAmount / validateRate / validateName** all accept an optional options object as their 2nd argument — these are safe to call with 2 args.

**sanitizeSearch()** in `lib/validation.ts` strips HTML, injection chars, SQL keywords, and caps at 100 chars. Apply to every search input onChange AND add `maxLength={100}` to the `<Input>`.

**Server helpers** in `server/index.ts`:
- `srvSanitize(s, maxLen)` — strips HTML/injection, trims, caps length
- `srvValidEmail(email)` — regex check
- `srvValidPhone(phone)` — supports 10/11/12-digit Indian numbers
- `srvValidName(name, min, max)` — length bounds only
- `verifyIsOrgAdmin(callerClerkId, orgId)` — REST fetch to Firestore; returns true if role is OWNER/ORGANIZATION_OWNER/MANAGER; returns true when FIREBASE_API_KEY missing (dev fallback)
- `ALLOWED_CUSTOMER_TYPES` Set and `ALLOWED_NOMINEE_RELS` Set for allowlist checks

**Firestore rules field constraints** (added 2026-06-11):
- `collections` and `savings_transactions`: `amount > 0` required on create
- `loans`: `principalAmount > 0` required on create
- `loanApplications`: `loanAmount >= 1000` required on create
- `savings_plans`, `savings_applications`, `savings_accounts`, `loan_installments`: `organizationId` must be non-empty string on create

**Why:** Defense-in-depth — client validation can be bypassed; server validation is the authoritative gate; Firestore rules are the last line that the DB enforces regardless of how data arrives.

**How to apply:**
- Client: import from `@/lib/validation`, use `useState<Record<string,string>>({})` for fieldErrors, set errors in onChange, show `<FieldError error={fieldErrors.field} />` below inputs, gate submit button on `Object.values(fieldErrors).some(Boolean)`
- Server: validate inputs at top of route handler, return 400 with `{ error, errors }` shape, then sanitize all strings before Firestore writes
- Rules: add field constraints on `allow create` rules, not on read/update (to avoid breaking existing docs)

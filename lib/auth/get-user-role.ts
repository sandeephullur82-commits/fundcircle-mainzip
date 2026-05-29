export type ClerkOrganizationRole =
  | "org:owner"
  | "org:admin"
  | "org:pigmy_collector"
  | "org:customer"
  | string
  | null;

export type AppUserRole =
  | "organization_owner"
  | "pigmy_collector"
  | "customer"
  | null;

/**
 * Converts ANY Clerk org role string (org:admin, org:pigmy_collector, org:customer, …)
 * OR any Firestore role string (OWNER, AGENT, CUSTOMER, …) to our canonical AppUserRole.
 */
export function normalizeClerkRole(value?: string | null): AppUserRole {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase();

  // ── Clerk prefixed roles ─────────────────────────────────────────────────
  // org:admin  (Clerk's default "admin" role maps to our owner)
  if (v === "org:owner" || v === "org:admin") return "organization_owner";

  // org:pigmy_collector — the Pigmy Collector / Agent role
  if (v === "org:pigmy_collector" || v === "org:agent" || v === "org:collector") return "pigmy_collector";

  // org:customer
  if (v === "org:customer") return "customer";

  // ── Firestore raw string roles (stored UPPERCASE or lowercase) ────────────
  if (v === "owner" || v === "organization_owner" || v === "organization" || v === "admin") return "organization_owner";
  if (v === "pigmy_collector" || v === "agent" || v === "collector") return "pigmy_collector";
  if (v === "customer") return "customer";

  console.warn("[FC normalizeClerkRole] Unrecognized role value:", value);
  return null;
}

export function isOwnerRole(role?: string | null): boolean {
  return normalizeClerkRole(role) === "organization_owner";
}

export function isAgentRole(role?: string | null): boolean {
  return normalizeClerkRole(role) === "pigmy_collector";
}

export function isCustomerRole(role?: string | null): boolean {
  return normalizeClerkRole(role) === "customer";
}

/**
 * Returns the canonical dashboard path for a given role.
 *
 * Role → path mapping (single source of truth — update here, nowhere else):
 *   organization_owner → /dashboard/owner
 *   pigmy_collector    → /dashboard/collector
 *   customer           → /dashboard/customer
 *   (unknown)          → /onboarding
 */
export function getDashboardPath(role?: string | null): string {
  const normalized = normalizeClerkRole(role);
  if (normalized === "organization_owner") return "/dashboard/owner";
  if (normalized === "pigmy_collector")    return "/dashboard/collector";
  if (normalized === "customer")           return "/dashboard/customer";
  return "/onboarding";
}

export type ClerkOrganizationRole =
  | "org:admin"
  | "org:member"
  | "org:owner"
  | "org:manager"
  | "org:pigmy_collector"
  | "org:agent"
  | "org:collector"
  | "org:customer"
  | string
  | null;

/**
 * Canonical application roles.
 *
 * Role resolution is ALWAYS derived from the organization membership context
 * (Clerk org membership or Firestore organizationMembers doc).
 * Never from publicMetadata / privateMetadata / any global user field.
 *
 *   organization_owner : Owner + Manager — full org admin access
 *   pigmy_collector    : Agent / Field Collector — agent-scoped access
 *   customer           : Customer — own data only
 */
export type AppUserRole =
  | "organization_owner"
  | "pigmy_collector"
  | "customer"
  | null;

/**
 * Convert ANY Clerk org role string (org:admin, org:manager, org:pigmy_collector, …)
 * OR any Firestore role string (OWNER, AGENT, MANAGER, CUSTOMER, …)
 * to our canonical AppUserRole.
 *
 * Source of truth: organization membership record, never global user metadata.
 */
export function normalizeClerkRole(value?: string | null): AppUserRole {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase();

  // ── Clerk prefixed roles ───────────────────────────────────────────────────
  if (v === "org:owner" || v === "org:admin") return "organization_owner";
  if (v === "org:manager")                    return "organization_owner"; // managers → owner dashboard
  if (
    v === "org:pigmy_collector" ||
    v === "org:agent" ||
    v === "org:collector"
  )                                           return "pigmy_collector";
  if (v === "org:customer") return "customer";
  if (v === "org:member")   return "customer"; // generic member → customer dashboard

  // ── Firestore raw roles (UPPERCASE or lowercase) ──────────────────────────
  if (
    v === "owner" || v === "organization_owner" ||
    v === "organization" || v === "admin"
  )                                           return "organization_owner";
  if (v === "manager" || v === "organization_manager")
                                              return "organization_owner";
  if (
    v === "pigmy_collector" || v === "agent" ||
    v === "collector"       || v === "pigmy_agent"
  )                                           return "pigmy_collector";
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
 * Human-readable display label for a raw Clerk or Firestore role string.
 * Used in the org-selector and any place a role needs to be shown to the user.
 */
export function getRoleLabel(rawRole?: string | null): string {
  if (!rawRole) return "Member";
  const v = rawRole.toString().trim().toLowerCase();
  if (v === "org:admin" || v === "org:owner" || v === "owner" || v === "organization_owner" || v === "admin")
    return "Owner";
  if (v === "org:manager" || v === "manager" || v === "organization_manager")
    return "Manager";
  if (
    v === "org:pigmy_collector" || v === "org:agent" || v === "org:collector" ||
    v === "pigmy_collector"     || v === "agent"      || v === "collector"
  ) return "Agent / Collector";
  if (v === "org:customer" || v === "customer") return "Customer";
  if (v === "org:member"   || v === "member")   return "Member";
  return "Member";
}

/**
 * Maps a canonical AppUserRole to the correct dashboard path.
 * Single source of truth — used by RoleRouter, OrgSelectorPage, and AuthCallback.
 *
 *   organization_owner → /dashboard/owner
 *   pigmy_collector    → /dashboard/agent
 *   customer           → /dashboard/customer
 *   (unknown)          → /onboarding
 */
export function getDashboardPath(role?: string | null): string {
  const normalized = normalizeClerkRole(role);
  if (normalized === "organization_owner") return "/dashboard/owner";
  if (normalized === "pigmy_collector")    return "/dashboard/agent";
  if (normalized === "customer")           return "/dashboard/customer";
  return "/onboarding";
}

export type ClerkOrganizationRole = "org:owner" | "org:pigmy_collector" | "org:customer" | string | null;
export type AppUserRole = "owner" | "organization_owner" | "pigmy_collector" | "agent" | "collector" | "customer" | "organization" | null;

export function normalizeClerkRole(value?: string | null): AppUserRole {
  if (!value) return null;
  const normalized = value.toString().trim().toLowerCase();

  if (normalized === "org:owner" || normalized === "owner") return "organization_owner";
  if (normalized === "org:pigmy_collector" || normalized === "pigmy_collector" || normalized === "agent" || normalized === "collector") return "pigmy_collector";
  if (normalized === "org:customer" || normalized === "customer") return "customer";
  if (normalized === "org:organization" || normalized === "organization") return "organization";
  return normalized as AppUserRole;
}

export function isOwnerRole(role?: string | null): boolean {
  const normalized = normalizeClerkRole(role);
  return normalized === "organization_owner";
}

export function isAgentRole(role?: string | null): boolean {
  const normalized = normalizeClerkRole(role);
  return normalized === "pigmy_collector";
}

export function isCustomerRole(role?: string | null): boolean {
  const normalized = normalizeClerkRole(role);
  return normalized === "customer";
}

export function getDashboardPath(role?: string | null): string {
  const normalized = normalizeClerkRole(role);
  if (normalized === "organization_owner" || normalized === "organization") return "/dashboard/owner";
  if (normalized === "pigmy_collector") return "/dashboard/agent";
  return "/dashboard/customer";
}

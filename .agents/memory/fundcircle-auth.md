---
name: FundCircle auth patterns
description: Membership ID format, role normalization, and Clerk config for FundCircle.
---

## Membership
- Membership doc ID format: `${organizationId}_${clerkUserId}` (from `membershipIdFor()`)
- Stored in Firestore collection `organizationMembers`
- Role stored as uppercase: `OWNER`, `AGENT`, `CUSTOMER`
- Normalized to: `organization_owner`, `pigmy_collector`, `customer`
- Use `normalizeClerkRole()` from `lib/auth/get-user-role.ts`

## ClerkProvider
- Use `fallbackRedirectUrl="/router"` (not deprecated `afterSignInUrl`)
- Role router at `/router` handles navigation based on Firestore membership role
- Auth callback at `/auth/callback`

## AuthRedirectManager
- Landing page `/` and `/workspace-selection` are public (always accessible)
- Sign-in/sign-up paths redirect signed-in users to `/auth/callback`
- Unauthenticated users on protected paths redirect to `/sign-in`

## Dashboard Paths
- Owner: `/dashboard/owner`
- Pigmy Collector (agent): `/dashboard/agent`
- Customer: `/dashboard/customer`

**Why:** Role normalization is critical — Firestore uses uppercase but app logic uses lowercase normalized strings.

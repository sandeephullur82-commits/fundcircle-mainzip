---
name: Security audit fixes
description: Key security and data consistency fixes applied during the comprehensive Firestore architecture audit
---

## API Authentication (C-01)
`server/index.ts`: `/api/create-agent` and `/api/create-customer` now require `authMiddleware`.
`lib/services.ts` `createDirectMember()` now accepts `authToken?: string` and passes it as `Authorization: Bearer` header. Callers in `OrgAgents.tsx` and `AgentCustomers.tsx` use `useAuth().getToken()` to obtain it.

**Why:** These were unauthenticated endpoints — any caller could create Clerk users and Firestore membership docs for any org.

## Firestore Rules (SR-01 through SR-05)
- `organizations` create: `request.resource.data.id == orgId` (was `isSignedIn()` — too broad)
- `organizationMembers` create: `isAdminOnly()` (was `isOwnerOrAgent()` — agents could create members)
- `memberships` create: same as above
- `customers` read: `clerkUserId == uid() || isOwnerOrAgent()` (was `isOrgMember()` — customers could read each other's profiles)
- `receiptCounters`: separated `allow read, update` from `allow create`; removed overlapping `write` rule
- Added missing rules for `supportTickets`, `subscriptions`, `payments`

## Data Consistency Fixes
- Removed dual-write to legacy `memberships` collection from `createDirectMember` and `provisionUser`
- `offlineSync.ts` `syncPayments()`: writes to `collections` (not `transactions`) — correct collection for the UI to read
- `OrgCustomers.tsx` `handleEdit` + `handleDeactivate`: now syncs changes to `customers` mirror doc
- `organizations` mirror write now includes `createdAt`, `createdBy`, `status`, `slug` fields

## Document Fields
- `loan_installments`: added `createdAt`, `updatedAt`, `createdBy` in `approveLoan()`
- `savings_transactions`: added `createdAt`, `createdBy`, `status` in `recordSavingsCollection()`
- `audit_logs`: immutable by design, missing `updatedAt` is acceptable

## Agent Scoping (MT-02)
- `AgentOverview.tsx`: members query scoped with `where("assignedAgentId", "==", agentId)`, collections scoped with `where("agentId", "==", agentId)` — no longer downloads full org dataset
- `AgentEMICollection.tsx`: members filtered to `role == CUSTOMER`, loans filtered to `status == ACTIVE`
- `AgentCustomers.tsx`: kept unscoped (needs org-wide count for plan limit checks)

## Firestore Indexes
`firestore.indexes.json` created with composite indexes for:
- `audit_logs`: organizationId + createdAt DESC
- `loan_installments`: loanId/organizationId/customerId + status (for != PAID queries)
- `organizationMembers`: organizationId + role + assignedAgentId
- `collections`: organizationId + agentId + collectedAt
- `loans`, `notifications`, `upgradeRequests`, `loanApplications`, `savings_applications`: standard org + status indexes

## Performance
- `OrgAuditLogs.tsx`: uses `orderBy("createdAt", "desc")` in Firestore query — no longer sorts entire collection client-side

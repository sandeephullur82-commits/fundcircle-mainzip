---
name: Savings Management System
description: Architecture of the FundCircle savings plan/application/account workflow added in Batch 2.
---

## Collections
- `savings_plans` — org-owned plan configs (DAILY_PIGMY, WEEKLY_PIGMY, MONTHLY_PIGMY, RECURRING_DEPOSIT, FIXED_DEPOSIT); org-scoped via `organizationId`
- `savings_applications` — customer-submitted account-opening requests; status: PENDING → APPROVED (auto-creates `savings_accounts` doc) | REJECTED
- `savings_accounts` — actual accounts; customerId = membershipDocId (`${orgId}_${clerkUserId}`); **must use snake_case** `savings_accounts` NOT `savingsAccounts` (camelCase breaks customer reads)
- `savings_transactions` — already existed; correctly named

## Key Rules
- **CustomerDashboard** reads from `"savings_accounts"` (snake_case) via `useCollectionRealtimeRaw` with `where("customerId","==",membershipId)`
- **SavingsTab** handles 4 states: no account + no app (show plans + apply button), no account + PENDING app (waiting UI), no account + REJECTED app (reason + re-apply), account exists (existing rich UI)
- **OrgSavings** uses `useCollectionRealtime` (auto org-scoped) for all 5 collections
- `approveSavingsApplication()` atomically creates the `savings_accounts` doc AND updates the `savings_applications` doc status in one function call

## OrgDashboard Integration
- Menu item id: `"savings"`, icon: `ArrowUpCircle`, label: "Savings Management"
- Tab inserted between "Collections" and "Loans" in sidebar

## Multi-tenant Fixes (same session)
- `offlineSync.ts`: `orgId` → `organizationId` in both syncCollections + syncPayments
- `AgentHistory.tsx`: agentId filter pushed to Firestore query (was JS post-filter)
- `AgentLoanVerification.tsx`: `myCustomerIds` Set scopes apps to agent's assigned customers only

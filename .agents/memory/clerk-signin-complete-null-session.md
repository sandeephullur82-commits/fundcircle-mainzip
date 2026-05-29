---
name: Clerk signIn complete+null sessionId
description: signIn.create() can return status "complete" with createdSessionId=null for invited users — never gate navigation on createdSessionId being truthy
---

## The Rule

When calling `signIn.create({ identifier, password })`, check `status === "complete"` independently of `createdSessionId`. **Do NOT write:**

```js
if (result.status === "complete" && result.createdSessionId)  // ← WRONG
```

**Write instead:**

```js
if (result.status === "complete") {
  if (result.createdSessionId) {
    await setActive({ session: result.createdSessionId });
  }
  // else: session was already activated by a prior flow
  navigate("/router", { replace: true });
}
```

## Why

When an invited Pigmy Collector:
1. Accepts an invitation (Clerk activates a session via `invitation.accept()` + `setActive()`)
2. Later signs in again on the sign-in page

Clerk returns `signIn.create()` with `status: "complete"` but `createdSessionId: null`, because the session was already established by the invitation acceptance flow. The original check `complete && createdSessionId` evaluated to `false`, causing fall-through to every other status branch and hitting the catch-all "Sign-in returned an unexpected state" error.

## How to Apply

- Always use this pattern in any sign-in handler that calls `signIn.create()`.
- If `createdSessionId` is null with `status: "complete"`, log a warning but still navigate to `/router`.
- `setActive()` only needs to be called when you have a session ID to activate; the existing session will be picked up by `useUser()` automatically.

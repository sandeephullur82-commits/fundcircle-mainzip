---
name: AuthRedirectManager pattern
description: How AuthRedirectManager should be structured to avoid racing with Clerk's own redirects and causing duplicate OTP emails.
---

## Rule
`AuthRedirectManager` must ONLY protect authenticated routes from unauthenticated access. It must NEVER redirect signed-in users away from auth paths (`/sign-in`, `/sign-up`, etc.).

**Why:** Clerk's `<SignIn forceRedirectUrl="...">` and `<SignUp forceRedirectUrl="...">` already handle post-auth redirects internally. Adding a second `navigate()` call from `AuthRedirectManager` races with Clerk's internal routing. If the `navigate()` fires while Clerk is still mid-verification, it unmounts the Clerk component, Clerk loses its state, and on remount it triggers a **second OTP email**.

**How to apply:**
- `PROTECTED_PREFIXES` allowlist controls which paths require authentication.
- All other paths (including all auth paths) are public — no redirect needed.
- Do NOT maintain an `AUTH_ONLY_PATHS` list for redirecting signed-in users. Clerk handles that.
- Do NOT check `emailVerified` to decide when to redirect away from auth pages. Clerk handles that.
- StrictMode must also be OFF (removed from `main.tsx`) — it double-mounts Clerk components which triggers double OTP.

## Final structure
```tsx
// Only this — protect routes, never push users off auth pages
if (!isSignedIn && isProtectedPath(pathname)) {
  navigate("/sign-in", { replace: true });
}
```

---
name: FundCircle rollup and workflow fix
description: How to fix missing Rollup native module and permission errors in this environment.
---

## Problem
Vite dev server fails to start with errors:
1. `Permission denied` on `node_modules/.bin/vite`
2. `Cannot find module @rollup/rollup-linux-x64-gnu` (npm optional deps bug)

## Fix
```bash
npm install --include=optional
chmod +x node_modules/.bin/vite
```

Then restart the workflow. Port must be 5000 for `outputType: "webview"`.

**Why:** Replit sandbox sometimes strips execute bits from node_modules binaries; npm's optional dependency handling can fail to install platform-specific native modules.

**How to apply:** Run these two commands whenever the workflow fails with either error above.

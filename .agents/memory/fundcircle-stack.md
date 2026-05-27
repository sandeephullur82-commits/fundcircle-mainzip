---
name: FundCircle stack and routing
description: Tech stack, path aliases, UI component locations, and workflow config for FundCircle.
---

## Stack
- React 19 + Vite + TypeScript + Tailwind CSS v4 + Shadcn UI (base-ui based)
- Clerk for auth (`@clerk/clerk-react`)
- Firebase Firestore for realtime data (onSnapshot via `subscribeToCollection`)
- Framer Motion for animations
- React Router DOM v7

## Path Aliases
- `@` maps to project root (not `src/`), configured in `vite.config.ts`
- UI components at `components/ui/` (root level, not `src/components/ui/`)
- Source pages at `src/pages/`
- Lib hooks at `lib/firestore-hooks.ts`

## Workflow
- Dev command: `npm run dev -- --port 5000` (must use port 5000 for webview outputType)
- Must `chmod +x node_modules/.bin/vite` and `npm install --include=optional` if Rollup native module is missing

## UI Component Notes
- Sheet uses `@base-ui/react/dialog` — SheetTrigger supports `render` prop
- Tabs from shadcn — can suppress TabsList with `hidden` class for custom nav
- `useCollectionRealtime` always adds `where("organizationId", "==", organization.id)` automatically

**Why:** Path alias at root vs src is a common gotcha; forgetting it breaks all @/ imports.

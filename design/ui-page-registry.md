# UI Page Registry — Auto-Discovery Architecture

## Purpose

The page registry maps every `.tsx` page file to a `{ meta, Component }` entry consumed by routing, navigation, and permission checks. Before auto-discovery, `PageRegistry.ts` contained manual imports and an explicit array of entries. Downstream projects that edited `PageRegistry.ts` experienced merge conflicts during template upgrades.

Auto-discovery replaces manual registration with filesystem-based discovery: any `.tsx` file placed under `src/ui/pages/` (at any depth) is automatically picked up at build time. Downstream projects place their pages in a project-specific subdirectory (e.g., `src/ui/pages/myapp/`), keeping them isolated from template pages — no registry edits, no merge conflicts.

## Architecture Overview

```
src/apps/ui.ts
  │
  ├─ regeneratePageRegistry("src/ui/pages", "src/ui/_pageRegistry.generated.ts")
  │   │
  │   ├─ Bun.Glob("**/*.tsx")  →  finds all page files
  │   └─ write _pageRegistry.generated.ts
  │
  ├─ ClientBundleService.create("src/ui", [...], { preBuild })
  │   │
  │   └─ buildBundle()
  │       ├─ await preBuild()                          ← regenerates registry
  │       └─ Bun.build({ entrypoints: ["./src/ui/index.tsx"], ... })
  │           │
  │           ├─ PageRegistry.ts
  │           │   ├─ import { autoPageModules } from "./_pageRegistry.generated.ts"
  │           │   └─ export pageModules = [...autoPageModules, ...appPageModules]
  │           │
  │           └─ _pageRegistry.generated.ts
  │               ├─ import * as _p0 from "./pages/Dashboard.tsx"
  │               ├─ import * as _p1 from "./pages/Doc.tsx"
  │               └─ export const autoPageModules = [...]
  │
  └─ watchClientFiles()
      └─ on *.tsx change → buildBundle() → preBuild runs first
```

**Flow at startup:**
1. `src/apps/ui.ts` calls `regeneratePageRegistry()` which walks `src/ui/pages/` and writes `_pageRegistry.generated.ts`
2. `ClientBundleService.create()` is called with a `preBuild` callback pointing to the same function
3. Inside `buildBundle()`, `preBuild` runs first (regenerating the registry), then `Bun.build()` bundles the browser entry point
4. `Bun.build()` statically resolves all imports from `_pageRegistry.generated.ts`, pulling every discovered page into the bundle

**Flow in dev mode (watcher):**
1. File watcher detects a `.tsx` change in `src/ui/`
2. `buildBundle()` is called → `preBuild` regenerates the registry → `Bun.build()` bundles

## Page File Contract

Each `.tsx` file under `src/ui/pages/` must export:

```typescript
export const meta: PageMeta = {
    id: "dashboard",
    urn: "page:dashboard",
    path: "/dashboard",
    title: "Dashboard",
    description: "Application dashboard",
    menu: { section: "Main", order: 1, label: "Dashboard" },
    requiredFunctionalPermissions: [],
};

export function Component(): JSX.Element {
    return <PageTemplate>...</PageTemplate>;
}
```

If either `meta` or `Component` is missing, `Bun.build()` fails with a clear error.

Non-page utilities, helpers, and shared components belong outside `src/ui/pages/` — typically in `src/ui/components/` or other subdirectories.

## Build-Time Code Generation Rationale

`Bun.build()` is a static bundler. It only includes files reachable from the entry point via static `import` statements. Dynamic filesystem discovery at runtime (e.g., `Bun.Glob` in the browser) cannot pull page components into the bundle.

The generated `_pageRegistry.generated.ts` bridges this gap: it contains explicit `import` statements for every discovered page file. These are statically analyzed and included by `Bun.build()`.

**Why not `import.meta.glob`?** `Bun.build()` does not support `import.meta.glob`. The code generation approach works with any bundler.

## `preBuild` Hook

The `ClientBundleService` accepts an optional `preBuild` callback in its `create()` options:

```typescript
ClientBundleService.create("src/ui", ["./src/ui/index.tsx"], {
    preBuild: () => regeneratePageRegistry(...),
});
```

`preBuild` runs at the start of every `buildBundle()` call — before the `_IsBuilding` guard. This ensures:
- The registry is always fresh before bundling (startup, dev-mode watcher, manual rebuilds)
- Queued callers (when a build is already in progress) get the result of the current build, not stale data

## Subdirectory Convention

Downstream projects should place their pages in a project-specific subdirectory:

```
src/ui/pages/                    ← template pages (flat files)
  Dashboard.tsx
  Doc.tsx
  ...

src/ui/pages/myapp/              ← downstream project pages
  MyFeature.tsx
  MyDetailPage.tsx
```

The recursive glob (`**/*.tsx`) discovers pages at any depth. Subdirectory structure has no effect on routing — each page's `meta.path` and `meta.id` define identity and routing.

## `app_PageRegistry.ts` — Escape Hatch

For pages that cannot live under `src/ui/pages/` (e.g., conditionally loaded pages, pages defined outside the pages directory), `app_PageRegistry.ts` remains as an explicit registration point:

```typescript
import type { PageModule } from "@/types/PageType.ts";

export const pageModules: readonly PageModule[] = [
    // Explicitly registered pages here
];
```

Entries in `app_PageRegistry.ts` are appended after auto-discovered pages in `PageRegistry.ts`:

```typescript
export const pageModules: readonly PageModule[] = [
    ...autoPageModules,
    ...appPageModules,
];
```

## Limitations

- **Single bundle.** All pages are included in a single client bundle. No code splitting or lazy loading.
- **Non-page `.tsx` files in `pages/`.** Every `.tsx` file is treated as a page. Missing `meta`/`Component` exports cause build errors.
- **`PageTemplate` location.** `PageTemplate.tsx` lives at `src/ui/PageTemplate.tsx` (outside `pages/`) to avoid being treated as a page.
- **Generated file is git-ignored.** A stub exporting `[]` is committed so the project compiles on a fresh clone. The generator overwrites it at startup.

## Migration Guide

If your project built on this template currently has pages registered manually:

### Step 1: Move pages into `src/ui/pages/`

Move each page `.tsx` file from its current location into `src/ui/pages/` — ideally in a project-specific subdirectory:

```
src/ui/pages/myapp/MyPage.tsx
src/ui/pages/myapp/MyDetailPage.tsx
```

### Step 2: Normalize `PageTemplate` imports

Change all `PageTemplate` imports to the absolute alias:

```typescript
// Before:
import { PageTemplate, PageSection } from "./PageTemplate.tsx";
import { PageTemplate, PageSection } from "../pages/PageTemplate.tsx";

// After:
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
```

### Step 3: Clean up manual registrations

Remove page entries from `app_PageRegistry.ts` (or `PageRegistry.ts` if edited directly). The empty array is sufficient:

```typescript
export const pageModules: readonly PageModule[] = [];
```

For pages that genuinely cannot live under `src/ui/pages/`, keep them in `app_PageRegistry.ts` — it still works as a fallback.

### Step 4: Revert `PageRegistry.ts` edits

If you previously edited `PageRegistry.ts` directly, revert those changes. After this update, `PageRegistry.ts` is no longer editable for page registration.

### Step 5: Verify

```bash
bun test
```

Start the server and navigate your pages. The auto-generated registry picks up all `.tsx` files at startup.

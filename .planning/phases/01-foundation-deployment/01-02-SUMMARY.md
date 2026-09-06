---
phase: 01-foundation-deployment
plan: 02
subsystem: ui
tags: [nextjs, next-intl, once-ui, react, typescript, i18n]

# Dependency graph
requires:
  - phase: 01-foundation-deployment (Plan 01)
    provides: Buildable Next.js 16.3.4 App Router scaffold + all Phase 1+ npm dependencies installed
provides:
  - app/[locale]/ route segment wrapping the entire app tree, ready for Phases 2-7 to add (admin)/(resident) route groups underneath without a later move
  - Once UI provider tree (LayoutProvider > ThemeProvider > DataThemeProvider > ToastProvider > IconProvider) wired as a Client Component, importable by every future page
  - next-intl routing config (es default, en secondary) resolving locale + messages per request
affects: [01-04 (Vercel deployment/smoke check), Phase 8 (i18n/polish — real translation content goes into messages/*.json), all future phases (every page renders through this shell)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "app/[locale]/ segment as the top-level route wrapper (next-intl requirement) — future phases build (admin)/(resident) route groups underneath this, never above it"
    - "components/Providers.tsx as a Client Component boundary — Once UI's IconProvider/ThemeProvider/etc. are context providers requiring 'use client'; any object containing function values (e.g. icon component references) passed into this tree must originate at or below this boundary, not from a Server Component prop"
    - "Once UI config objects (resources/once-ui.config.ts) use `as const` to preserve literal string types for strict TypeScript checking against Once UI's prop types — plain .js config files widen literals to `string` and fail strict build checks"

key-files:
  created:
    - i18n/routing.ts
    - i18n/request.ts
    - messages/es.json
    - messages/en.json
    - resources/once-ui.config.ts
    - resources/icons.ts
    - resources/custom.css
    - components/Providers.tsx
    - app/[locale]/layout.tsx
    - app/[locale]/page.tsx
  modified:
    - next.config.ts
    - CLAUDE.md (Next.js 16 dev-server auto-generated agent-rules block)

key-decisions:
  - "Renamed resources/once-ui.config.js to resources/once-ui.config.ts (plan specified .js) and added `as const` to the style/dataStyle exports — plain .js object literals widen string properties to `string`, which fails strict TypeScript checks against Once UI's ThemeProvider/DataThemeProvider prop types (Theme, Schemes, SolidType, etc. are string-literal unions, not `string`)."
  - "Added \"use client\" to components/Providers.tsx — Once UI's IconProvider is a client-side context provider; passing the icon library object (containing react-icons function components) as a prop from a Server Component to a Client Component is not serializable and fails the Next.js build (\"Functions cannot be passed directly to Client Components\")."
  - "Also removed app/page.module.css (orphaned CSS module only imported by the deleted vanilla app/page.tsx) alongside the plan's three named deletions (app/layout.tsx, app/page.tsx, app/globals.css) to avoid leaving dead, unreferenced code."
  - "Committed the Next.js 16 dev-server auto-generated CLAUDE.md agent-rules block (added by next dev via generate-agent-files.js) rather than reverting it — the tool's own inline comment states removing it just recreates the diff on the next `next dev` run."

requirements-completed: [DPLY-01]

# Metrics
duration: ~20min
completed: 2026-09-06
---

# Phase 1 Plan 2: Once UI + next-intl Shell Summary

**Wired next-intl's `[locale]` routing segment together with Once UI's provider tree into a single buildable root layout, replacing the vanilla `create-next-app` scaffold — `npm run build` succeeds and the `ASOBARCELONA` marker renders through real Once UI components at both `/es` and `/en`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-05T20:45:00-05:00 (approx)
- **Completed:** 2026-09-05T20:51:00-05:00
- **Tasks:** 3 completed
- **Files modified:** 12 (10 created, 2 modified, plus CLAUDE.md auto-append)

## Accomplishments
- `app/[locale]/` top-level route segment exists with locale validation (`hasLocale`/`notFound`) and static params generation — future admin/resident route groups can be added underneath without a later file-tree move
- Once UI's full provider stack (`LayoutProvider > ThemeProvider > DataThemeProvider > ToastProvider > IconProvider`) wired with the exact required CSS import order
- `npm run build` succeeds end-to-end (Turbopack compile + TypeScript check + static prerender of `/es` and `/en`), zero errors, zero Sass deprecation warnings
- Confirmed at runtime via `npm run dev` + `curl localhost:3000/es` and `/en` — both return the `ASOBARCELONA` marker rendered inside Once UI's `Column`/`Heading`/`Text` components, not raw HTML

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold next-intl locale routing** - `8c413ab` (feat)
2. **Task 2: Wire Once UI provider tree + app/[locale]/ shell** - `9f8c3cf` (feat)
3. **Task 3: Finalize next.config.ts + verify build** - `85a2e33` (feat), `fab5a65` (feat, fixup for a partial-add mistake), `e806c77` (chore, Next.js 16 auto-generated CLAUDE.md block)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 3 produced three commits — `85a2e33` landed the rename/`as const` fix but a `git add` pathspec failure silently dropped the `next.config.ts`/`Providers.tsx` "use client" changes from that commit; `fab5a65` immediately corrected this by committing the missed changes. `e806c77` commits an unrelated Next.js 16 dev-server side effect (see Deviations)._

## Files Created/Modified
- `i18n/routing.ts` - `defineRouting` with `es` (default) + `en` locales, `localePrefix: 'as-needed'`
- `i18n/request.ts` - `getRequestConfig` resolving validated locale + dynamic message import
- `messages/es.json`, `messages/en.json` - near-empty (`{}`) placeholders, real content is Phase 8 scope
- `resources/once-ui.config.ts` - Once UI `style`/`dataStyle`/`fonts` config (renamed from `.js`, see Decisions)
- `resources/icons.ts` - `iconLibrary` registry (`home: HiOutlineHome` from `react-icons/hi2`)
- `resources/custom.css` - empty token-override placeholder
- `components/Providers.tsx` - Once UI provider nesting, marked `"use client"` (see Decisions)
- `app/[locale]/layout.tsx` - root layout: Once UI CSS imports (load-bearing order), locale validation, `NextIntlClientProvider` + `Providers` nesting
- `app/[locale]/page.tsx` - placeholder shell rendering the `ASOBARCELONA` marker via `Column`/`Heading`/`Text`
- `next.config.ts` - `createNextIntlPlugin` wrapper + Once UI's required `sassOptions`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/page.module.css` - removed (superseded by `[locale]` segment)

## Decisions Made
See `key-decisions` in frontmatter above — summarized: (1) `.js` → `.ts` rename + `as const` for Once UI config to satisfy strict TypeScript checks; (2) `"use client"` on `Providers.tsx` to fix a Server→Client function-serialization build error; (3) removed the orphaned `page.module.css` alongside the plan's three named deletions; (4) committed the Next.js 16 dev-server's auto-generated `CLAUDE.md` addendum rather than fighting it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resources/once-ui.config.js` widened string literals fail strict TypeScript build**
- **Found during:** Task 3 (`npm run build` verification)
- **Issue:** The plan specified a plain `.js` config file per Context7's reference shape. With `allowJs: true` + `strict: true` in `tsconfig.json`, TypeScript infers `style.theme`, `style.brand`, etc. as widened `string` types when imported into `components/Providers.tsx` (a `.tsx` file). Once UI's `ThemeProvider`/`DataThemeProvider` props expect string-literal union types (`Theme`, `Schemes`, `SolidType`, `BorderStyle`, `SurfaceStyle`, `TransitionStyle`, `ScalingSize`, `ChartVariant`), so `npm run build`'s TypeScript check failed with 11 `TS2322` errors.
- **Fix:** Renamed `resources/once-ui.config.js` → `resources/once-ui.config.ts` and added `as const` to the `style` and `dataStyle` object exports, preserving literal types. (`as const` is not valid syntax in a checked `.js` file, which is why the fix required the `.ts` extension rather than annotating in place.)
- **Files modified:** `resources/once-ui.config.ts` (renamed from `.js`)
- **Verification:** `npm run build` TypeScript check passes with zero errors.
- **Committed in:** `85a2e33` (Task 3 commit)

**2. [Rule 1 - Bug] `IconProvider`'s icon library fails Server→Client serialization**
- **Found during:** Task 3 (`npm run build` verification, after fixing deviation #1)
- **Issue:** `npm run build`'s static prerender step failed with `Error: Functions cannot be passed directly to Client Components` for `/en` and `/es`. `components/Providers.tsx` had no `"use client"` directive, making it a Server Component; `IconProvider` (from `@once-ui-system/core`) is a client-side context provider, and the `iconLibrary` object it receives contains `react-icons` function components — passing function values across the Server→Client boundary as props is not serializable in Next.js App Router.
- **Fix:** Added `"use client"` as the first line of `components/Providers.tsx`, moving the entire provider tree (and its icon library construction) into the client boundary.
- **Files modified:** `components/Providers.tsx`
- **Verification:** `npm run build` completes successfully; static HTML for `/es` and `/en` contains the rendered `ASOBARCELONA` marker (confirmed via `grep` on `.next/server/app/*.html` and a live `npm run dev` + `curl` check).
- **Committed in:** `fab5a65` (Task 3 fixup commit, after being accidentally dropped from `85a2e33` by a failed multi-path `git add`)

**3. [Rule 2 - Minor cleanup] Removed orphaned `app/page.module.css`**
- **Found during:** Task 2 (deleting vanilla scaffold root files)
- **Issue:** The plan's `<action>` named three files to delete (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`). `app/page.module.css` was the CSS Module import target of the deleted `app/page.tsx` and had no remaining references anywhere in the repo after the deletion.
- **Fix:** Deleted `app/page.module.css` alongside the three named files to avoid leaving dead, unreferenced code in the tree.
- **Files modified:** `app/page.module.css` (removed)
- **Verification:** `grep -rn "page.module.css"` across the repo (excluding `node_modules`) returns zero matches after removal.
- **Committed in:** `9f8c3cf` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 build-blocking bugs, 1 Rule 2 minor cleanup)
**Impact on plan:** All three were necessary for `npm run build` to succeed or to avoid leaving dead code; none changed the plan's architectural intent (provider nesting order, CSS import order, `[locale]` structure, and next-intl config all match the plan exactly). No scope creep.

## Issues Encountered
- A `git add components/Providers.tsx next.config.ts resources/once-ui.config.js resources/once-ui.config.ts` invocation partially failed (the `.js` pathspec no longer existed on disk after the earlier `rm`), which aborted the entire `git add` and silently left `components/Providers.tsx`/`next.config.ts` unstaged for the `85a2e33` commit. Caught immediately via `git status` after the commit; corrected with a follow-up commit (`fab5a65`) containing the missed changes. No functional impact — both commits are part of the same task and land before the plan's final build verification.
- Running `npm run dev` for the plan's own `<verification>` step (curl-based smoke check) triggered Next.js 16's dev server to auto-append a "This is NOT the Next.js you know" agent-guidance block to `CLAUDE.md` (a documented Next 16 behavior, see `node_modules/next/dist/server/lib/generate-agent-files.js`). Committed rather than reverted, per the tool's own guidance that reverting only recreates the diff on the next `next dev` run.

## User Setup Required

None - no external service configuration required in this plan.

## Next Phase Readiness

- `app/[locale]/` shell is buildable and renders Once UI components inside next-intl's locale context — every future admin/resident screen can be added under this segment without a route-tree move.
- `npm run build` is green with zero errors and zero Sass deprecation warnings.
- No blockers for Plan 04 (Vercel deployment/smoke check) — this plan's shell is what gets deployed.

---
*Phase: 01-foundation-deployment*
*Completed: 2026-09-06*

## Self-Check: PASSED

All created files verified present on disk (i18n/routing.ts, i18n/request.ts, messages/es.json, messages/en.json, resources/once-ui.config.ts, resources/icons.ts, resources/custom.css, components/Providers.tsx, app/[locale]/layout.tsx, app/[locale]/page.tsx, next.config.ts). Old scaffold files confirmed removed (app/layout.tsx, app/page.tsx, app/globals.css, app/page.module.css). All 5 commits (`8c413ab`, `9f8c3cf`, `85a2e33`, `fab5a65`, `e806c77`) verified present in `git log`. `npm run build` re-confirmed green immediately before writing this summary.

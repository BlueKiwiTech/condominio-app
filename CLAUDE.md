<!-- GSD:project-start source:PROJECT.md -->
## Project

A payment-management web app for ASOBARCELONA, a closed community (calle cerrada / condominio / HOA). Admins define recurring and special "cuotas" (dues), register payments per house, and track who's behind. Residents log in with their house + a PIN to check their own balance and payment history — no email required for residents. Built single-tenant for this one community (not a multi-tenant SaaS).

**Core value:** The admin can always answer "who owes what, since when" — accurate morosos (delinquent accounts) and saldo (balance) tracking is the thing that must work, before anything else.

Full context: `.planning/PROJECT.md`. Original handoff spec preserved at `docs/handoff-prompt.md` (schema/folder-structure proposals there were corrected during research — see Architecture section below).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **Next.js 16.3.x** (App Router, TypeScript) — satisfies the "14+" constraint; Next 14 is not actually installable because Once UI requires `next >=15.5`
- **Supabase** (Postgres + Auth) — `@supabase/ssr` (NOT the deprecated `@supabase/auth-helpers-nextjs`) for admin SSR auth
- **Once UI** (`@once-ui-system/core`) — component library. Uses **Sass + CSS variables, NOT Tailwind** (the original handoff doc's Tailwind assumption was wrong — do not add `tailwind.config.ts`). Bundles its own icons (`react-icons`, via `Icon`/`IconProvider` — don't add `lucide-react`) and charts (`recharts` — don't add it separately)
- **next-intl** for i18n (Spanish default via `localePrefix: 'as-needed'`, English secondary) — NOT `next-i18n-router`/`i18next` as the original handoff proposed
- **zod + react-hook-form + @hookform/resolvers** for all form/Server Action input validation
- **date-fns** (already an Once UI transitive dep — don't add a second date library) for cadence math and morosos "days overdue" calculations; always use calendar-day-safe functions (`differenceInCalendarDays`, `parseISO`), never raw UTC string splitting
- **bcryptjs or Postgres `pgcrypto`** for resident PIN hashing — never native `bcrypt` (breaks on Vercel serverless/Edge)
- **jose** for signing the resident's app-level session cookie (see Dual-Auth pattern below)
- Vercel for hosting

**Dual-auth pattern (the trickiest piece of this app):** Admins use standard Supabase Auth (`@supabase/ssr`, `getUser()`/`getClaims()`, RLS keyed off `auth.uid()`). Residents never get a Supabase Auth session — a Route Handler verifies `{house_id, pin}` server-side via the service-role client (PIN hash comparison via `pgcrypto`), then mints its own short-lived signed httpOnly cookie (via `jose`) carrying `{house_id, resident_id, role: 'resident'}`. All resident reads go through a shared `getResidentScopedClient(houseId)` helper using the service-role client, always filtered by `house_id`. RLS stays enabled everywhere as a backstop even though resident-path enforcement lives in server code, not in a Postgres policy. Full rationale + the RLS-native alternative (Pattern B): `.planning/research/STACK.md`.

Full detail, versions, and what-not-to-use table: `.planning/research/STACK.md`.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Two corrections to the original handoff spec's schema, confirmed during research and approved before Phase 1:
1. **Cuotas need a template/instance split.** `cuotas.applicable_houses UUID[]` with no `house_id` can't support "one cuota record per installment per applicable house" — split into a `cuota_templates` (definition) table and a `cuotas` (per-house, per-installment instance, with `house_id`) table.
2. **Payments need to support paying multiple cuotas at once.** A single `payments.cuota_id` FK can't represent "register one payment against several selected cuotas" — use one payment row per paid cuota, grouped under a shared payment reference/transaction.

Prefer Server Actions over a full `app/api/*` REST tree for same-origin admin/resident CRUD — Next.js App Router doesn't need that boilerplate.

**Build order** (dependency-driven, matches `.planning/ROADMAP.md` phase order): scaffold + corrected schema + RLS → admin auth → houses & resident access (resident auth is the highest-risk piece — treat as a spike if the dual-auth pattern above needs revisiting) → cuota engine (recurring + divisible, transactional + idempotent) → payments → reporting/morosos (must be per-currency, never summed across USD/Bs/USDT) → resident portal (needs both resident auth and reporting done) → i18n/polish.

Full detail: `.planning/research/ARCHITECTURE.md` and `.planning/research/PITFALLS.md` (financial-calc bugs, RLS-for-non-Auth-residents, cuota-generation idempotency, PIN brute-force, date/timezone traps — read before touching auth or the cuota/payment/reporting logic).
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` — do not edit manually.
<!-- GSD:profile-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

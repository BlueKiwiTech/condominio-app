# Phase 1: Foundation & Deployment - Research

**Researched:** 2026-09-05
**Domain:** Next.js 16 + Supabase Postgres scaffold, migrations, RLS, Vercel deployment
**Confidence:** HIGH

## Summary

This phase is pure infrastructure: scaffold Next.js 16.3.x + Once UI into an **already-populated git repo**, write version-controlled Supabase migrations for the corrected 7-table schema (per `research/ARCHITECTURE.md`), enable RLS with **zero policies** (which *is* deny-by-default — no policy-writing needed until Phase 2/3 add roles), and wire up a production-only Vercel deployment.

Three things changed or were newly discovered since the upstream research docs (`ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`, written 2026-09-04) were written, all confirmed today against current official sources:

1. **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (function `middleware` → `proxy`), effective v16.0.0. `middleware.ts` still works but is deprecated. Every "middleware" reference in the upstream research (`lib/supabase/middleware.ts` helper, admin-session-refresh logic) should target a root `proxy.ts` file going forward. [VERIFIED: nextjs.org docs, dated 2026-08-25, version 16.3.4]
2. **Supabase is mid-migration to new API keys** — `sb_publishable_...` replaces `anon`, `sb_secret_...` replaces `service_role`, both systems work simultaneously today, and Supabase is deprecating the legacy JWT-format keys by end of 2026. A project created now should be wired for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` naming (legacy `ANON_KEY`/`SERVICE_ROLE_KEY` names still work if that's what the dashboard shows). [CITED: supabase.com/docs/guides/getting-started/api-keys, migration guide]
3. **Scaffolding into this repo is not a clean `create-next-app` run.** The repo already has `.git`, `.gitignore`, `CLAUDE.md`, `docs/`, `.planning/` — `create-next-app` run directly in a non-empty directory has a documented history of failing (EACCES/EPERM scanning `.git/objects` during import-alias templating, or refusing outright). The safe path is scaffolding into a throwaway sibling directory and merging files in, not running `create-next-app .` directly. [VERIFIED: web search cross-referencing multiple vercel/next.js GitHub issues]

Both the Supabase CLI (`supabase`, authenticated, org "AGA Social LLC") and Vercel CLI (`npx vercel`, authenticated as `byagasocial`) are already logged in on this machine — Phase 1 tasks can create the Supabase project and Vercel project **programmatically**, not just via dashboard clicks. This materially changes what's plannable as an automated task vs. a manual step.

**Primary recommendation:** Scaffold into a temp dir → merge into repo root preserving `CLAUDE.md`/`.git`/`.planning` → apply Once UI + Supabase + next-intl wiring → write migrations for the amended 7-table schema with RLS enabled and zero policies → create Supabase project via `supabase projects create` → create Vercel project via `vercel link` + `vercel git connect` → set env vars via `vercel env add` → verify via `vercel --prod` deploy and a fresh-project migration replay.

## Project Constraints (from CLAUDE.md)

- Next.js 16.3.x App Router + TypeScript — Once UI's peer dep floor is `next >=15.5`; do not target Next 14.
- Supabase Postgres + Auth via `@supabase/ssr` — never the deprecated `@supabase/auth-helpers-nextjs`.
- Once UI (`@once-ui-system/core`) uses **Sass + CSS variables, NOT Tailwind** — do not add `tailwind.config.ts`. Do not add `lucide-react` (Once UI wraps `react-icons`) or a separate `recharts` (Once UI bundles it).
- next-intl for i18n, Spanish default via `localePrefix: 'as-needed'`, English secondary — not `next-i18n-router`/`i18next`.
- zod + react-hook-form + `@hookform/resolvers` for all form/Server Action validation.
- date-fns (already an Once UI transitive dep — don't add a second date library) with calendar-day-safe functions.
- bcryptjs or Postgres `pgcrypto` for PIN hashing — never native `bcrypt`.
- jose for the resident session cookie.
- Vercel for hosting.
- Prefer Server Actions over a full `app/api/*` REST tree.
- Dual-auth pattern (Pattern A, default): admins via `@supabase/ssr` + Supabase Auth; residents via a service-role-mediated custom signed cookie, never a Supabase session. RLS stays enabled everywhere as backstop even though it isn't the enforcement mechanism for residents in Pattern A.
- Build order: scaffold+schema+RLS → admin auth → houses & resident access → cuota engine → payments → reporting/morosos → resident portal → i18n/polish.
- GSD workflow enforcement: file-changing work must go through a GSD command (`/gsd-execute-phase`, etc.), not raw ad-hoc edits.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (Admin Model):** Exactly one admin per community for v1 — two roles total: `admin` and `resident`. `communities.admin_id` FK is correct as-is. No multi-admin/board-member support in this phase or roadmap.

**D-02 (Bootstrap/Seed):** No automated seed migration for the community row or the first admin account. The ASOBARCELONA `communities` row and admin linkage are created manually (one-time SQL via dashboard/CLI) after Phase 1 ships. Migrations create schema/tables only — no data inserts.

**D-03 (Nullable admin_id):** `communities.admin_id` can be NULL until Phase 2's admin signup updates it. Column must be nullable (it already is in the unamended handoff schema — no `NOT NULL` was ever specified on it; do not add one).

**D-04 (Local Dev Workflow):** No local Supabase, no Docker. Development happens directly against one hosted Supabase project. Migrations are still version-controlled files, applied via Supabase CLI (`supabase db push` or equivalent) against the hosted project — never a local instance first.

**D-05 (Deployment Environments):** Production only. One Vercel project, one Supabase project, `main` branch deploys to production directly. No preview/staging environment.

### Claude's Discretion

- Exact folder/file layout within the conventions set by `ARCHITECTURE.md`'s recommended structure.
- Whether to scaffold the `next-intl` `[locale]` routing segment now (Phase 1) vs. deferring to Phase 8 — CONTEXT.md is silent on this; see Open Questions below, this research recommends deciding now.
- Whether to enable the `pgcrypto` extension in this phase's migrations (cheap, forward-looking) vs. deferring to Phase 3 when PIN hashing is actually implemented.
- Exact index set on `cuotas`/`payments` beyond what's needed for correctness now (perf is not yet a phase 1 concern at this scale).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DPLY-01 | App is deployed to Vercel with environment variables configured for the Supabase project | See "Vercel Deployment" pattern and Code Examples — CLI is authenticated locally, both project creation and env wiring can be scripted; env var naming should account for Supabase's publishable/secret key migration |
| DPLY-02 | Supabase project has RLS enabled on every table and migrations are version-controlled | See "Amended Schema + Migrations" pattern — RLS enabled with **zero policies** on all 7 tables satisfies deny-by-default; migration file structure and `supabase link`/`db push` workflow documented in Code Examples |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Next.js app shell rendering (Once UI providers, layout) | Frontend Server (SSR) | Browser/Client | Root layout + Providers tree render server-side first; Once UI's `ThemeProvider`/`IconProvider` hydrate client-side for theme toggling |
| Env var wiring (Supabase URL/keys) | Frontend Server (SSR) / API-Backend boundary | — | `NEXT_PUBLIC_*` vars cross into the browser bundle; secret key vars must stay server-only (Vercel project env config, never committed) |
| Schema + migrations | Database/Storage | — | Owned entirely by Postgres via version-controlled SQL files; no app-layer schema logic in this phase |
| RLS policy state (enabled, zero policies) | Database/Storage | — | Enforced by Postgres itself; deny-by-default is a database-level guarantee, not an app-level check |
| Deployment pipeline (build, env injection, domain) | CDN/Static (Vercel edge) | Frontend Server (SSR) | Vercel builds and serves the Next.js app; env vars are injected at build/runtime by the platform, not read from a committed file |
| i18n routing shell (`[locale]` segment decision) | Frontend Server (SSR) | Browser/Client | `next-intl`'s routing config lives in `proxy.ts` + `i18n/routing.ts`, resolved server-side per request before any page renders |

## Standard Stack

### Core

| Library | Verified Version (npm, 2026-09-05) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.4 | App framework, App Router | Matches `STACK.md`; confirmed current via `npm view next version` today — no drift since yesterday's research |
| react / react-dom | ships with Next 16 (React 19) | UI runtime | Don't manually pin React 18 against Next 16 |
| typescript | latest 5.x | Type safety | `create-next-app` default |
| @supabase/ssr | 0.12.6 | Cookie-based SSR Supabase client | Confirmed current; replaces deprecated `@supabase/auth-helpers-nextjs` |
| @supabase/supabase-js | 2.115.0 | Core Supabase client | Peer dep of `@supabase/ssr` |
| @once-ui-system/core | 1.8.4 | Component library (Sass, not Tailwind) | Confirmed current; peer floor `next >=15.5` |
| next-intl | 4.14.2 | i18n for App Router | Confirmed current |
| zod | 4.5.4 | Schema validation | — |
| react-hook-form | 7.87.0 | Form state | — |
| @hookform/resolvers | 5.9.1 | zod ↔ react-hook-form bridge | — |
| date-fns | 4.4.0 | Date math (already an Once UI transitive dep) | Don't add a second date library |
| jose | 6.2.12 | Resident session cookie signing (Phase 3, but install now if convenient) | Edge-runtime compatible |
| bcryptjs | 3.0.3 | PIN hashing fallback if not using `pgcrypto` (Phase 3) | Pure JS, no native bindings |
| sass | 1.104.0 | Once UI's required peer dep | Not optional |
| sharp | 0.35.4 | Once UI's required peer dep for image optimization | Install even if unused directly yet |

All versions above were re-verified live against the npm registry today (2026-09-05), one day after `STACK.md` was written — no version drift. [VERIFIED: npm registry]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase CLI | 2.107.0 (installed locally, `/opt/homebrew/bin/supabase`) | Migrations, project management, type generation | Already installed and authenticated on this machine |
| Vercel CLI | 59.11.7 (invocable via `npx vercel`, not globally installed) | Project creation, env var management, deploys | Already authenticated as `byagasocial` on this machine |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel Git integration (push to `main` auto-deploys) | `vercel --prod` CLI deploys | D-05 says `main` deploys to production directly — Git integration is the standard, lower-friction choice since the repo already has a GitHub remote; CLI deploy is a fallback for one-off verification only |
| New Supabase publishable/secret keys | Legacy anon/service_role keys | Both work today; legacy keys are on a deprecation path (end of 2026) but a project created via `supabase projects create` today may show either depending on dashboard rollout — check what the created project actually issues and name env vars to match, don't assume |
| Scaffold `[locale]` routing now | Defer next-intl to Phase 8 | See Open Questions — deferring risks a full route-tree move later; scaffolding now costs one folder level today |

**Installation (see Code Examples for full scaffold sequence):**
```bash
npm install @supabase/ssr @supabase/supabase-js @once-ui-system/core zod react-hook-form @hookform/resolvers date-fns next-intl jose bcryptjs
npm install sass sharp
npm install -D @types/bcryptjs
```

**Version verification performed:** `npm view <pkg> version` run live for every package above on 2026-09-05 — see Sources.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub repo (BlueKiwiTech/condominio-app, main branch)              │
│   push to main ─────────────────────────────────────────────────┐    │
└───────────────────────────────────────────────────────────────┬─┘    │
                                                                  │     │
                                                                  ▼     │
┌─────────────────────────────────────────────────────────────────────┐
│  VERCEL (production project, Git-connected)                          │
│   1. Build: npm install → next build (Turbopack)                     │
│   2. Inject env vars (NEXT_PUBLIC_SUPABASE_URL, ...PUBLISHABLE_KEY,   │
│      SUPABASE_SECRET_KEY server-only)                                │
│   3. Serve: app/[locale]/layout.tsx → Providers → page shell         │
└──────────────────────────────┬────────────────────────────────────┬─┘
                                │ reads env at request/build time     │
                                ▼                                     │
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE PROJECT (hosted, created via `supabase projects create`)   │
│  ┌────────────┐   ┌──────────────────────────────────────────────┐  │
│  │  Postgres  │   │ Migrations (supabase/migrations/*.sql)         │  │
│  │  7 tables  │◄──┤  applied via `supabase db push --linked`       │  │
│  │  RLS ON,   │   │  (no local DB, no Docker — direct to hosted)   │  │
│  │  0 policies│   └──────────────────────────────────────────────┘  │
│  └────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

A reader can trace: developer pushes migration files + app code to `main` → GitHub webhook triggers Vercel build → Vercel injects env vars → deployed app's Server Components would call Supabase (no queries exist yet in Phase 1, but the client helpers are wired) → separately, `supabase db push` (run manually/via CLI, not via Vercel build) applies the schema to the same project the env vars point at.

### Recommended Project Structure

```
condominio-app/
├── app/
│   └── [locale]/                 # next-intl locale segment — see Open Questions
│       ├── layout.tsx            # RootLayout: <html>, fonts, <Providers>
│       └── page.tsx              # placeholder shell page for "renders without build errors"
├── components/
│   └── Providers.tsx             # LayoutProvider > ThemeProvider > DataThemeProvider > ToastProvider > IconProvider
├── resources/
│   ├── once-ui.config.js         # style, dataStyle, fonts config (Once UI's own convention)
│   ├── custom.css                # token overrides
│   └── icons.ts                  # optional custom iconLibrary (react-icons)
├── lib/
│   └── supabase/
│       ├── client.ts             # createBrowserClient — browser components only
│       ├── server.ts             # createServerClient using cookies() from next/headers — Server Components/Actions
│       └── proxy.ts              # createServerClient for use inside proxy.ts (NOT middleware.ts — see Pitfall below)
├── i18n/
│   ├── routing.ts                # next-intl defineRouting({ locales: ['es','en'], defaultLocale: 'es' })
│   └── request.ts                # next-intl request config
├── messages/
│   ├── es.json                   # placeholder, empty or minimal — full translation is Phase 8
│   └── en.json
├── supabase/
│   ├── config.toml                # from `supabase init`
│   └── migrations/
│       └── <timestamp>_initial_schema.sql
├── proxy.ts                       # Next.js 16 convention (was middleware.ts) — locale + future auth gating
├── next.config.ts                 # sassOptions + next-intl plugin wrapper
├── package.json
└── CLAUDE.md                      # PRESERVE — already exists, do not let scaffolding overwrite it
```

### Pattern 1: Scaffold into a throwaway directory, then merge (do NOT run `create-next-app .` directly)

**What:** `create-next-app` has a documented history of failing (`EACCES`/`EPERM` scanning `.git/objects`) or refusing to run in a non-empty directory. This repo already has `.git`, `.gitignore`, `CLAUDE.md`, `docs/`, `.planning/`.
**When to use:** Any time scaffolding a framework CLI into an existing git repo that already has content.
**Example:**
```bash
# Source: cross-referenced vercel/next.js GitHub issues #46651, #61261 — EACCES/EPERM
# scaffolding into a directory containing an existing .git

cd /tmp  # or the gsd-sdk scratchpad dir
npx create-next-app@latest condominio-scaffold \
  --typescript --app --no-tailwind --turbopack \
  --eslint --src-dir=false --import-alias "@/*" \
  --no-agents-md --use-npm --disable-git

# Merge into the real repo root, EXCLUDING files that already exist there
# and files/dirs create-next-app doesn't need to own (.git, .planning, CLAUDE.md, docs/, .gitignore)
rsync -av --exclude='.git' --exclude='CLAUDE.md' --exclude='.gitignore' \
  /tmp/condominio-scaffold/ /path/to/condominio-app/

# Manually reconcile .gitignore: merge create-next-app's Next.js entries with the
# repo's existing .gitignore (already has /node_modules, /.next/, .env*, .vercel —
# spot-check for any new entries create-next-app would add, e.g. *.tsbuildinfo)
```
**Note on `--agents-md`:** `create-next-app`'s default is now `--agents-md` (generates `AGENTS.md` **and overwrites `CLAUDE.md`**). This repo's `CLAUDE.md` already has real project-specific content — always pass `--no-agents-md` and never let the merge step touch the existing `CLAUDE.md`.

### Pattern 2: Once UI Providers tree

**What:** Once UI requires a specific provider nesting order and two CSS imports plus a project-local override file, wired once in the root layout.
**When to use:** Every page in the app renders through this tree — this is the "deployed shell renders" success criterion.
**Example:**
```typescript
// Source: Context7 /once-ui-system/nextjs-starter, _autodocs/api-reference/{configuration,providers,icons}.md
// components/Providers.tsx
import { style, dataStyle } from "@/resources/once-ui.config";
import {
  LayoutProvider,
  ThemeProvider,
  DataThemeProvider,
  ToastProvider,
  IconProvider,
} from "@once-ui-system/core";
import { iconLibrary } from "@/resources/icons";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider>
      <ThemeProvider
        theme={style.theme}
        brand={style.brand}
        accent={style.accent}
        neutral={style.neutral}
        solid={style.solid}
        solidStyle={style.solidStyle}
        border={style.border}
        surface={style.surface}
        transition={style.transition}
        scaling={style.scaling}
      >
        <DataThemeProvider {...dataStyle}>
          <ToastProvider>
            <IconProvider icons={iconLibrary}>{children}</IconProvider>
          </ToastProvider>
        </DataThemeProvider>
      </ThemeProvider>
    </LayoutProvider>
  );
}
```
```typescript
// app/[locale]/layout.tsx — required CSS import order matters
import '@once-ui-system/core/css/styles.css';
import '@once-ui-system/core/css/tokens.css';
import '@/resources/custom.css';
import classNames from "classnames";
import { fonts } from "@/resources/once-ui.config";
import { Providers } from "@/components/Providers";

export default async function RootLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <html lang={locale} className={classNames(
      fonts.heading.variable, fonts.body.variable,
      fonts.label.variable, fonts.code.variable,
    )}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```
```javascript
// next.config.ts — required Sass config for Once UI
// Source: Context7 /once-ui-system/nextjs-starter, build-configuration.md
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default withNextIntl(nextConfig);
```

### Pattern 3: Supabase SSR client helpers (three files, one per context)

**What:** `@supabase/ssr` needs a browser client, a server client (Server Components/Actions), and a proxy-time client — mixing them (e.g. using the browser client inside a Server Component) silently breaks sessions (Pitfall 6 in `PITFALLS.md`, still valid).
**When to use:** Set this up now even though Phase 1 has no auth yet — Phase 2 (admin auth) and Phase 3 (resident auth) both depend on these files existing correctly.
**Example:**
```typescript
// lib/supabase/server.ts — Server Components / Server Actions
// Source: Context7 /supabase/ssr, common-patterns.md (adapted to request.cookies API,
// the Next.js-idiomatic form; the generic parseCookieHeader form Context7 shows also
// works but request.cookies.getAll()/set() is what Supabase's own Next.js guide uses)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — safe to ignore if proxy.ts refreshes sessions
          }
        },
      },
    },
  );
}
```
```typescript
// lib/supabase/client.ts — Client Components only
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```
```typescript
// proxy.ts (project root) — Next.js 16 convention, NOT middleware.ts
// Source: nextjs.org/docs/app/api-reference/file-conventions/proxy (v16.3.4, 2026-08-25)
//         + Context7 /supabase/ssr common-patterns.md, adapted to proxy naming
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Current Supabase guidance: getClaims() validates the JWT signature locally
  // against the project's published public keys on every call — safe for
  // authorization decisions and doesn't round-trip to the auth server like
  // getUser() does. Confirm the project has asymmetric JWT signing keys enabled
  // (default for new projects) before relying on this for Phase 2's route gating.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Pattern 4: Amended schema + migrations (deny-by-default RLS)

**What:** The 7-table schema from `docs/handoff-prompt.md`, amended per `ARCHITECTURE.md` (cuota template/instance split, per-cuota payment rows with a batch grouping column, an explicit `status` column), with every table's RLS enabled and **zero policies** — which is deny-by-default, not a partial state. No policies should be written in this phase; Phase 2/3 add them once roles exist.
**When to use:** This is the actual DPLY-02 deliverable.
**Example:**
```sql
-- Source: docs/handoff-prompt.md base schema + .planning/research/ARCHITECTURE.md
-- amendments #1 (template/instance split), #2 (multi-cuota payment rows), #3 (status column)
-- + D-01/D-02/D-03 from 01-CONTEXT.md applied.
-- File: supabase/migrations/<timestamp>_initial_schema.sql

-- communities: admin_id intentionally nullable (D-03) — no NOT NULL, no seed insert (D-02)
create table communities (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  address varchar,
  phone varchar,
  admin_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table houses (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id),
  house_number varchar unique not null,
  house_name varchar,
  owner_name varchar,
  owner_phone varchar,
  owner_email varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table house_residents (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references houses(id) on delete cascade,
  resident_name varchar not null,
  resident_phone varchar,
  pin_hash varchar,  -- set in Phase 3; nullable now
  created_at timestamptz not null default now()
);

-- ARCHITECTURE.md amendment #1: template (admin input) vs. instance (payable row) split
create table cuota_templates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id),
  name varchar not null,
  description text,
  cuota_type varchar not null check (cuota_type in ('recurring', 'special')),
  cadence varchar check (cadence in ('weekly', 'monthly', 'annual')),  -- null for special
  amount decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  start_date date not null,
  number_of_installments int not null default 1,
  is_divided boolean not null default false,
  applicable_houses uuid[] not null default '{}',  -- targeting input only; empty = all houses
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ARCHITECTURE.md amendment #1 + #3: payable instance rows, one per house per installment,
-- status only ever written by payment-registration logic ('pending' at creation,
-- 'paid'/'advance' by a transaction) — 'overdue' is NEVER stored, always computed at
-- query time (due_date < today AND status != 'paid'), per ARCHITECTURE.md Anti-Pattern 2.
create table cuotas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references cuota_templates(id),
  house_id uuid not null references houses(id),
  parent_cuota_id uuid references cuotas(id),  -- links instance rows for divided special cuotas
  installment_number int not null default 1,
  name varchar not null,  -- denormalized from template for display resilience
  amount decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  due_date date not null,
  status varchar not null default 'pending' check (status in ('pending', 'paid', 'advance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pitfall 3 (PITFALLS.md): DB-level idempotency guard against duplicate generation
  unique (template_id, house_id, installment_number)
);
create index cuotas_house_status_idx on cuotas (house_id, status);
create index cuotas_due_date_status_idx on cuotas (due_date, status);

-- ARCHITECTURE.md amendment #2: one payments row per paid cuota, grouped by an
-- optional client-generated batch id so the UI can still show "one register-payment action"
create table payments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id),
  cuota_id uuid not null references cuotas(id),
  payment_batch_id uuid,
  amount_paid decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  payment_date date not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index payments_house_idx on payments (house_id);
create index payments_cuota_idx on payments (cuota_id);
create index payments_batch_idx on payments (payment_batch_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action varchar,
  entity_type varchar,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- DPLY-02: RLS enabled, ZERO policies, on every table — this IS deny-by-default.
-- Do not write policies in this migration; Phase 2 (admin) and Phase 3 (resident)
-- add role-scoped policies once auth.uid()-backed sessions exist. service_role /
-- the new secret key always bypasses RLS regardless of policy count.
alter table communities enable row level security;
alter table houses enable row level security;
alter table house_residents enable row level security;
alter table cuota_templates enable row level security;
alter table cuotas enable row level security;
alter table payments enable row level security;
alter table audit_logs enable row level security;
```
**Note on `gen_random_uuid()`:** native to Postgres 13+ (Supabase runs PG15+), no `pgcrypto` extension required for UUID defaults. `pgcrypto`'s `crypt()`/`gen_salt('bf')` (needed for PIN hashing) is a separate, later concern — Phase 3, unless the planner wants to enable the extension now as a cheap forward-looking migration (Claude's discretion, see CONTEXT.md).

### Anti-Patterns to Avoid

- **Writing RLS policies in this phase:** No roles exist yet (no admin auth, no resident auth). A policy written now against a guessed shape will likely need rewriting once Phase 2/3 land — enabling RLS with zero policies is the correct, complete Phase 1 deliverable, not a partial one.
- **Running `create-next-app .` directly in this repo:** will likely error scanning `.git/objects`, or silently overwrite `CLAUDE.md` via `--agents-md`. See Pattern 1.
- **Using `middleware.ts`/`export function middleware`:** deprecated as of Next 16.0.0. Use `proxy.ts`/`export function proxy`.
- **Hardcoding `NEXT_PUBLIC_SUPABASE_ANON_KEY` as the only supported client key name:** check what the actual created Supabase project issues (publishable vs. legacy anon) before finalizing env var names in Vercel.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| SSR cookie-based Supabase session | A custom cookie parser/serializer for Supabase JWTs | `@supabase/ssr`'s `createServerClient`/`createBrowserClient` | Handles refresh, base64url cookie chunking, and edge-runtime compatibility already |
| Locale-aware routing | Custom `[locale]` param parsing + redirect logic | `next-intl`'s `defineRouting` + its proxy/middleware helper | Handles locale negotiation, prefix stripping, and typed message keys |
| Theme tokens / design system CSS | Hand-rolled CSS variables theme | Once UI's `ThemeProvider` + `resources/once-ui.config.js` | Already ships a full token system; hand-rolling duplicates it and fights the library's own cascade |
| Migration ordering/state tracking | A custom "have I run this SQL file" tracker | Supabase CLI's `supabase/migrations/` timestamp convention + `supabase db push` | CLI already tracks applied migrations against the remote project |

**Key insight:** Everything in this phase is "wire up an existing tool correctly," not "write novel logic." The risk here isn't algorithmic bugs, it's version/convention drift (Next 16's proxy rename, Supabase's key rename) — verify current docs before committing to a pattern that "worked" in a six-month-old tutorial.

## Common Pitfalls

### Pitfall 1: `create-next-app` collides with the existing repo

**What goes wrong:** Running the scaffold command directly at the repo root either errors (permission errors scanning `.git/objects` during templating) or, if it succeeds, silently overwrites `CLAUDE.md` via the now-default `--agents-md` flag.
**Why it happens:** `create-next-app` assumes a fresh/empty target and globs all files (including inside `.git`) for import-alias string replacement; `--agents-md` became a default without most tutorials mentioning it.
**How to avoid:** Scaffold into a temp directory (see Pattern 1), pass `--no-agents-md` explicitly, and merge selectively — never overwrite `.git`, `CLAUDE.md`, `.gitignore` (merge, don't replace), `docs/`, `.planning/`.
**Warning signs:** `EACCES`/`EPERM` errors mentioning `.git/objects`; a `CLAUDE.md` diff that erases the project's actual content after scaffolding.

### Pitfall 2: Writing `middleware.ts` when the project targets Next 16

**What goes wrong:** Following slightly-stale tutorials (including this project's own `ARCHITECTURE.md`/`PITFALLS.md`, written against Next 14 conventions) and creating `middleware.ts` with `export function middleware`. It still works today but is deprecated, and future Next.js major versions will remove it.
**Why it happens:** Most Supabase + Next.js tutorials predate the v16.0.0 rename (2026), and even Supabase's own official docs currently describe the concept as "a Proxy" without always showing updated file/function names.
**How to avoid:** Create `proxy.ts` at the project root with `export async function proxy(request)`, not `middleware.ts`. If any generated boilerplate produces `middleware.ts`, run `npx @next/codemod@canary middleware-to-proxy .`
**Warning signs:** A `middleware.ts` file in a fresh Next 16 scaffold; deprecation warnings in the build output.

### Pitfall 3: Assuming Supabase env var names without checking the actual project

**What goes wrong:** Hardcoding `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (or the reverse — assuming the new `PUBLISHABLE_KEY`/`SECRET_KEY` names are already live everywhere) without checking what the specific project created in this phase actually issues.
**Why it happens:** Supabase is mid-migration (both systems coexist through end of 2026); dashboard UI and documentation examples may show either depending on when the project was created and which docs page you land on.
**How to avoid:** After creating the project, check Settings → API Keys in the dashboard (or `supabase projects api-keys list` if the CLI reflects it) for the actual key names/prefixes issued, and name Vercel env vars to match. Document whichever naming is chosen in a `.env.example` and don't mix conventions (`NEXT_PUBLIC_SUPABASE_ANON_KEY` in one file, `..._PUBLISHABLE_KEY` in another).
**Warning signs:** `undefined` Supabase client errors at runtime traceable to an env var name mismatch, not a missing value.

### Pitfall 4: `supabase db push` workflow silently expecting Docker

**What goes wrong:** Some Supabase CLI commands (`db diff` against a shadow DB, `start`, `db reset`) require a running Docker daemon. D-04 forbids local Supabase/Docker for this project.
**Why it happens:** Most Supabase CLI tutorials assume the standard local-dev-first workflow (`supabase start` → migrate locally → `db push` to promote), which does use Docker for the local instance.
**How to avoid:** Use `supabase link --project-ref <ref>` once, then `supabase db push --linked` directly against the hosted project — this path does not invoke Docker. Avoid `db diff`/`db reset`/`start` entirely per D-04. Verified locally: Docker binary is present but not running on this machine, and `db push --linked` has no Docker-dependent flags.
**Warning signs:** A CLI command hanging or erroring with a Docker daemon connection failure.

### Pitfall 5: Retrofitting `next-intl`'s `[locale]` segment after routes already exist

**What goes wrong:** `next-intl`'s documented App Router integration requires a top-level `[locale]` dynamic segment wrapping the entire `app/` tree. If Phases 2-7 build `app/(admin)/...` and `app/(resident)/...` without this segment, adding it in Phase 8 means moving every route file into `app/[locale]/(admin)/...` etc. — a mechanical but wide-blast-radius change touching every phase's output.
**Why it happens:** I18N-01/02 are scoped to Phase 8 in `REQUIREMENTS.md`, so it's tempting to treat locale routing as a Phase 8 concern entirely — but the *routing structure* is a Phase 1 scaffolding decision, not a Phase 8 feature decision.
**How to avoid:** Decide now (see Open Questions) whether to scaffold `app/[locale]/...` in Phase 1 with placeholder/minimal `es.json`/`en.json`, even though real translation work waits for Phase 8. This costs one folder level today; deferring costs a full-tree move later.
**Warning signs:** Phase 8 planning discovers every existing route file needs to move.

## Code Examples

### Full scaffold + dependency install sequence
```bash
# 1. Scaffold into a temp dir (see Pattern 1 for why not `.`)
cd "$SCRATCHPAD_DIR"
npx create-next-app@latest condominio-scaffold \
  --typescript --app --no-tailwind --turbopack --eslint \
  --import-alias "@/*" --no-agents-md --use-npm --disable-git

# 2. Merge into repo root (rsync excludes .git/CLAUDE.md/.gitignore — reconcile manually)
rsync -av --exclude='.git' --exclude='CLAUDE.md' --exclude='.gitignore' \
  "$SCRATCHPAD_DIR/condominio-scaffold/" /path/to/condominio-app/

# 3. Install remaining dependencies at the repo root
cd /path/to/condominio-app
npm install @supabase/ssr @supabase/supabase-js @once-ui-system/core \
  zod react-hook-form @hookform/resolvers date-fns next-intl jose bcryptjs
npm install sass sharp
npm install -D @types/bcryptjs
```

### Supabase project creation (CLI, authenticated locally)
```bash
# Source: `supabase projects create --help` (v2.107.0, run locally 2026-09-05)
# Org confirmed available: "AGA Social LLC" (lbuwpxurguaibeqnzsdk)
supabase projects create condominio-app \
  --org-id lbuwpxurguaibeqnzsdk \
  --region us-east-1 \
  --db-password "<generate a strong password, store in a secrets manager>"

# Link the local repo to the new project (needed before db push)
supabase init            # creates supabase/config.toml if not already present
supabase link --project-ref <ref-from-create-output>

# Apply migrations directly to the hosted project — no Docker, no local DB (D-04)
supabase db push --linked
```

### Vercel project creation + env wiring (CLI, authenticated locally)
```bash
# Source: `vercel link/env/git --help` (CLI 59.11.7, authenticated as byagasocial, run locally 2026-09-05)
npx vercel link --yes                       # creates/links the Vercel project to this repo
npx vercel git connect                      # connects the GitHub remote for main→production auto-deploy (D-05)

npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production   # or ..._ANON_KEY — match what the project actually issued
npx vercel env add SUPABASE_SECRET_KEY production                     # or SUPABASE_SERVICE_ROLE_KEY — server-only, never NEXT_PUBLIC_

npx vercel --prod                            # first deploy to verify the shell renders (DPLY-01 verification)
```

### Migration reproducibility check (DPLY-01 success criterion #3)
```bash
# Since D-04 forbids local Supabase, verify "fresh database reproduces schema exactly"
# by pushing the same migration files to a second, throwaway Supabase project rather
# than a local instance:
supabase projects create condominio-app-verify --org-id lbuwpxurguaibeqnzsdk --region us-east-1 --db-password "<temp>"
supabase link --project-ref <verify-ref>
supabase db push --linked --dry-run    # confirm the exact statements that would run
supabase db push --linked              # apply
# then delete the throwaway project via `supabase projects delete <verify-ref>` or the dashboard
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `middleware.ts` / `export function middleware` | `proxy.ts` / `export function proxy` | Next.js v16.0.0 | Every "middleware" reference in `ARCHITECTURE.md`/`PITFALLS.md`/`STACK.md` (written against Next 14 mental model) should be read as "proxy" for this codebase |
| Supabase `anon`/`service_role` JWT keys | `sb_publishable_...` / `sb_secret_...` keys | Rolling out through 2026, legacy keys deprecated end of 2026 | Env var naming for DPLY-01 should be checked against what the actually-created project issues, not assumed from older tutorials |
| `getUser()` as the only trustworthy server-side auth check | `getClaims()` recommended for protecting pages/data (local JWT signature verification against published public keys, no network round-trip); `getUser()` reserved for "need a fresh user record from the Auth server" | Current Supabase docs (fetched 2026-09-05) | Affects Phase 2/3 proxy.ts auth-gating design, not Phase 1 directly, but the `lib/supabase/proxy.ts` helper scaffolded now should call `getClaims()` rather than `getUser()` per current guidance — confirm asymmetric JWT keys are enabled on the created project |
| Tailwind as `create-next-app` default | Tailwind is still the CLI default — must explicitly pass `--no-tailwind` | Ongoing (not new, but easy to forget) | Omitting `--no-tailwind` produces a dead `tailwind.config.ts` alongside Once UI's Sass system, contradicting `STACK.md`'s explicit "don't use Tailwind" guidance |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: superseded by `@supabase/ssr`, do not use.
- `middleware.ts` as the primary Next.js interception file convention: deprecated, use `proxy.ts`.
- Supabase legacy `anon`/`service_role` key names: still functional today but on a stated deprecation path.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A newly-created Supabase project today will show BOTH legacy (anon/service_role) and new (publishable/secret) keys in its dashboard, with the new ones being the "Connect" default | State of the Art, Pitfall 3 | If the new project only shows legacy keys (rollout not yet complete for this account/region), env var naming should default to `ANON_KEY`/`SERVICE_ROLE_KEY` instead — low risk, just requires checking the actual dashboard output during execution, not a design change |
| A2 | The project's Supabase instance will have asymmetric JWT signing keys enabled by default (required for `getClaims()`'s local-verification claim to hold) | Pattern 3, State of the Art | If not enabled, `getClaims()` may fall back to network verification or behave differently — verify under Auth → JWT Keys after project creation; `getUser()` remains a safe fallback regardless |
| A3 | `rsync`-based merge (Pattern 1) is available in the execution environment for merging the scaffolded temp directory into the repo root | Pattern 1, Code Examples | If `rsync` isn't available, use `cp -r` with manual exclusion handling, or `git` itself (init the scaffold as its own repo and cherry-pick files) — mechanically different but same outcome |

**If this table is empty:** N/A — see entries above; all are low-risk, verify-during-execution items, not decisions that block planning.

## Open Questions (RESOLVED)

1. **Should `next-intl`'s `[locale]` routing segment be scaffolded in Phase 1, even though I18N-01/02 are Phase 8 requirements?**
   - What we know: `next-intl`'s documented App Router pattern requires a top-level `app/[locale]/` segment wrapping all routes (confirmed via Context7 `/amannn/next-intl`). Retrofitting this after Phases 2-7 build `app/(admin)/...`/`app/(resident)/...` means moving every existing route file.
   - What's unclear: CONTEXT.md doesn't address this directly; it's implicitly "Claude's Discretion" territory since it wasn't discussed.
   - Recommendation: Scaffold the `[locale]` segment now with `es`/`en` in `i18n/routing.ts` and near-empty `messages/{es,en}.json`, even though actual translation work is deferred to Phase 8. This is the cheaper-now-than-later structural choice. Flag this explicitly to the planner as a decision to confirm, not silently assume.
   - **RESOLVED:** Scaffolded now — Plan 01-02 creates the `app/[locale]/` segment with `i18n/routing.ts` and near-empty `messages/{es,en}.json` per the recommendation above.

2. **Which Supabase key-naming convention will the actual created project surface — legacy or new?**
   - What we know: Both systems coexist as of today (2026-09-05); Supabase's docs show the new naming as primary in current examples.
   - What's unclear: Behavior can vary by account/region rollout stage; this project's Supabase org hasn't had a project created yet to check.
   - Recommendation: Resolve during execution — create the project first, inspect Settings → API Keys, then lock env var names for the `.env.example` and Vercel config. Don't hardcode into the plan before that's known.
   - **RESOLVED:** Deferred to execution as recommended — Plan 01-04 Task 2 creates the Supabase project and inspects the actual issued key names before locking env var naming; Plan 01-06 wires whichever convention was resolved into Vercel.

3. **Should the `pgcrypto` extension be enabled in this phase's migration, ahead of Phase 3's PIN hashing need?**
   - What we know: It's a single `create extension if not exists pgcrypto;` statement, zero cost now, and Phase 3 will need it for `crypt()`/`gen_salt('bf')`-based PIN hashing (per `STACK.md`'s recommended pattern).
   - What's unclear: CONTEXT.md leaves this to Claude's discretion; not adding it now just means Phase 3 adds one more migration file.
   - Recommendation: Low-stakes either way — lean toward enabling it now since it's schema-adjacent and this phase already owns "the schema," but this is not blocking.
   - **RESOLVED:** Enabled now — Plan 01-03 Task 2 includes `create extension if not exists pgcrypto;` in the initial migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 build/runtime | ✓ | v26.8.1 (Next 16 requires ≥20.9.0) | — |
| npm | Package installs | ✓ | 11.19.0 | — |
| Supabase CLI | Migrations, project creation | ✓ | 2.107.0, authenticated (org: AGA Social LLC / lbuwpxurguaibeqnzsdk) | — |
| Vercel CLI | Deployment, env var wiring | ✓ (via `npx vercel`, not globally installed) | 59.11.7, authenticated as `byagasocial` | Install globally with `npm i -g vercel` if `npx` invocation proves too slow in repeated task runs |
| Docker | NOT required for the D-04-compliant workflow (`db push --linked`) | ✗ (binary present, daemon not running) | — | None needed — `db diff`/`db reset`/`start` (which do need Docker) are explicitly out of scope per D-04 |
| GitHub remote | Vercel Git integration for D-05's main→production flow | ✓ | origin → BlueKiwiTech/condominio-app | — |
| rsync | Scaffold-merge step (Pattern 1) | Assumed ✓ (standard on macOS/Linux) — not explicitly checked this session | — | `cp -r` + manual file-by-file exclusion if unavailable |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Docker (not needed at all for the chosen D-04-compliant workflow); Vercel CLI global install (npx works, just slightly slower per invocation).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None exists yet — greenfield repo, `create-next-app` doesn't install one by default |
| Config file | none — see Wave 0 |
| Quick run command | `npm run build` (compiles + type-checks; closest thing to a "test" this phase has) |
| Full suite command | `npm run build` + a manual/scripted smoke check of the deployed URL (see below) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DPLY-01 | Deployed Vercel URL renders the shell without build errors | build + smoke | `npm run build` locally; `curl -sf https://<deployed-url>/ \| grep -q "<expected marker>"` after deploy | ❌ Wave 0 — no smoke-test script exists yet |
| DPLY-02 | RLS enabled deny-by-default on every table; migrations reproducible | migration replay | `supabase db push --linked --dry-run` against a fresh throwaway project (see Code Examples); manually confirm `select relrowsecurity from pg_class where relname in (...)` returns true for all 7 tables with zero rows in `pg_policies` for those tables | ❌ Wave 0 — no scripted check exists yet |

### Sampling Rate
- **Per task commit:** `npm run build`
- **Per wave merge:** `npm run build` + the migration dry-run against the linked project
- **Phase gate:** Full suite green (build succeeds, deployed URL smoke-checked, RLS/policy-count query confirmed) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] A smoke-test script (even a 5-line `curl` check) for "deployed URL renders without error" — DPLY-01
- [ ] A SQL verification snippet or small script asserting RLS is enabled with zero policies across all 7 tables — DPLY-02
- [ ] No unit-test framework is being introduced in this phase, and that's appropriate — first real business logic (worth `pytest`/`vitest`-equivalent unit tests) arrives in Phase 4 (cuota engine) per `ARCHITECTURE.md`'s build order. Don't add a test framework prematurely here.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (not yet — no auth exists in this phase) | N/A until Phase 2 |
| V3 Session Management | No (not yet) | N/A until Phase 2/3 |
| V4 Access Control | Yes — at the database layer only | RLS enabled deny-by-default on every table (DPLY-02); this is the entire V4 surface of this phase |
| V5 Input Validation | No (no forms/inputs exist yet) | N/A until Phase 2+ |
| V6 Cryptography | No (PIN hashing is Phase 3) | N/A this phase — but see Open Question 3 on `pgcrypto` |
| V14 Configuration | Yes | Secret key (service_role/secret) must never be set with a `NEXT_PUBLIC_` prefix; must live only in Vercel's server-side env config, never committed to `.env` files in the repo (`.gitignore` already excludes `.env*` — verified) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Service-role/secret key leaked into client bundle via wrong env var prefix | Information Disclosure | Never prefix the secret key with `NEXT_PUBLIC_`; grep the built `.next/` output for the secret key value before considering DPLY-01 done, as a one-time sanity check |
| RLS "enabled but with an accidental permissive policy" mistaken for deny-by-default | Elevation of Privilege | This phase adds **zero** policies — verify via `pg_policies` query (see Validation Architecture) rather than assuming "I enabled RLS" is sufficient without checking no stray policy exists |
| Migration drift (manual dashboard schema edits bypassing version control) | Tampering / Repudiation | DPLY-02's success criterion #3 exists specifically to catch this — the fresh-project replay check in Code Examples is the concrete verification |

## Sources

### Primary (HIGH confidence)
- Context7 `/once-ui-system/nextjs-starter` — Providers composition order, CSS import order, `next.config` sassOptions, `once-ui.config.js` shape
- Context7 `/supabase/ssr` — `createServerClient`/`createBrowserClient` patterns, middleware/proxy cookie handling, common patterns for Server Actions/Route Handlers
- Context7 `/supabase/cli` — `migration new`, `db push`, `link`, `init`, `gen types` command references
- Context7 `/amannn/next-intl` — `defineRouting`, App Router `[locale]` segment requirement, proxy/middleware config
- nextjs.org/docs/app/api-reference/file-conventions/proxy (fetched 2026-09-05, doc dated 2026-08-25, version 16.3.4) — confirms `middleware.ts` → `proxy.ts` rename, effective v16.0.0, codemod available
- nextjs.org/docs/app/api-reference/cli/create-next-app (fetched 2026-09-05, version 16.3.4) — confirms Tailwind is still CLI default, `--agents-md` default behavior, `--no-*` negation flags
- npm registry (`npm view <pkg> version`, run locally 2026-09-05) — live version confirmation for next, @supabase/ssr, @supabase/supabase-js, @once-ui-system/core, next-intl, zod, react-hook-form, @hookform/resolvers, date-fns, jose, bcryptjs, sass, sharp
- Local environment probes (run 2026-09-05): `node --version` (v26.8.1), `supabase projects list`/`orgs list` (authenticated, org lbuwpxurguaibeqnzsdk), `npx vercel whoami` (authenticated as byagasocial), `supabase db push --help`, `docker info` (installed, not running)

### Secondary (MEDIUM confidence)
- supabase.com/docs/guides/getting-started/api-keys (fetched 2026-09-05) — publishable/secret key migration, both systems coexisting, deprecation timeline for legacy keys by end of 2026
- supabase.com/docs/guides/auth/server-side/nextjs (fetched 2026-09-05) — current `getClaims()` vs `getUser()` guidance; exact code blocks were not present in the fetched excerpt (framework-specific tabs), so the proxy.ts code example in this document synthesizes the confirmed cookie-handling mechanics from Context7 `/supabase/ssr` with the confirmed `getClaims()` recommendation from this page
- WebSearch (multiple 2026 sources, cross-referenced) — Next.js 16 middleware→proxy rename community coverage, Next.js 16 minimum Node version (20.9.0), Vercel CLI git-connect/env-add workflow

### Tertiary (LOW confidence)
- WebSearch on `create-next-app` non-empty-directory failure modes — based on GitHub issue reports (#46651, #61261) rather than a reproduced failure in this exact repo; treated as a strong warning sign, not a certainty, hence Pattern 1's temp-dir-and-merge approach is recommended regardless of whether the direct approach would fail outright or just misbehave

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version live-verified against npm today, one day after upstream STACK.md, zero drift
- Architecture: HIGH — schema amendments are direct carry-forward from ARCHITECTURE.md's already-reasoned corrections; scaffold/deployment mechanics verified against current official docs and local CLI probes
- Pitfalls: HIGH for the three newly-surfaced items (proxy rename, key rename, non-empty-dir scaffold risk) since each is confirmed via official docs or multiple corroborating sources; MEDIUM for the exact Supabase Next.js server-client code shape since the official page's Next.js-specific code tab wasn't retrievable verbatim (synthesized from Context7 + the page's prose guidance instead)

**Research date:** 2026-09-05
**Valid until:** ~14 days (Next.js 16.x and Supabase's key migration are both actively moving targets right now — re-verify env var/key naming and any Next.js patch-level changes if planning is delayed past two weeks)

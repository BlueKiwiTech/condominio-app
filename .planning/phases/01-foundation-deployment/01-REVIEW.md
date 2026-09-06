---
phase: 01-foundation-deployment
reviewed: 2026-09-06T03:21:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .env.example
  - CLAUDE.md
  - README.md
  - app/[locale]/layout.tsx
  - app/[locale]/page.tsx
  - components/Providers.tsx
  - eslint.config.mjs
  - i18n/request.ts
  - i18n/routing.ts
  - lib/supabase/client.ts
  - lib/supabase/server.ts
  - messages/en.json
  - messages/es.json
  - next.config.ts
  - package.json
  - proxy.ts
  - resources/custom.css
  - resources/icons.ts
  - resources/once-ui.config.ts
  - scripts/check-rls.sql
  - scripts/smoke-check.sh
  - supabase/.gitignore
  - supabase/config.toml
  - supabase/migrations/20260906005943_initial_schema.sql
  - tsconfig.json
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-06T03:21:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the Next.js 16 + Once UI scaffold, next-intl locale routing, the corrected 7-table Supabase migration, the Supabase SSR client helpers, and deployment-prep scripts that make up Phase 1.

No secrets are leaked: `.env.example` only contains placeholder values, `SUPABASE_SERVICE_ROLE_KEY` is declared but not referenced anywhere in application code yet (correctly deferred to the Phase 3 dual-auth work), and both `.env` and `.env*.local` are gitignored at the repo root. The Client/Server Supabase boundary is respected in practice — `lib/supabase/client.ts` only reads `NEXT_PUBLIC_*` vars and `lib/supabase/server.ts`/`proxy.ts` correctly use `getClaims()` (not `getSession()`/`getUser()`), matching CLAUDE.md's stack guidance. `proxy.ts` correctly uses the new Next.js 16 "Proxy" (middleware-successor) convention with a named `proxy` export, matching `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`. RLS is enabled with zero policies on all 7 `condo_*` tables exactly as documented (deny-by-default, intentional for Phase 1) and `scripts/check-rls.sql` verifies this correctly.

Found no Critical issues. Four Warnings worth fixing before Phase 2/3 build on top of this foundation (a soft client/server import boundary that can crash at runtime if crossed, a schema idempotency-guard loophole, a missing currency-consistency invariant, and an extension-schema hygiene nit), plus four Info-level polish items.

## Warnings

### WR-01: `lib/supabase/client.ts` has no `'use client'` boundary, so a Server Component import would compile but crash at runtime

**File:** `lib/supabase/client.ts:1`
**Issue:** The file is commented `// lib/supabase/client.ts — Client Components only` but nothing enforces that. There's no `'use client'` directive on the module and no lint rule (checked `eslint.config.mjs` — only `eslint-config-next`'s `core-web-vitals`/`typescript` presets, no custom import-boundary rule) that would catch an accidental `import { createClient } from '@/lib/supabase/client'` inside a Server Component or Server Action. `createBrowserClient` (from `@supabase/ssr`) touches browser-only storage (`window`/`localStorage`) when actually invoked, so a server-side call wouldn't fail at build/import time — it would throw a `ReferenceError` at request time, which is a confusing failure mode to debug once Phase 2/3 add many more files that import from `lib/supabase/*`.
**Fix:**
```ts
// lib/supabase/client.ts — Client Components only
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```
Note this directive marks the module boundary for bundling purposes but does not hard-block a Server Component from importing the function — it's a documentation+bundler signal, not a compiler error. For a stronger guarantee, consider an `eslint-plugin-boundaries` (or similar) rule restricting `lib/supabase/client.ts` imports to files that themselves start with `'use client'`.

### WR-02: `pgcrypto` extension created without an explicit schema, may land in `public`

**File:** `supabase/migrations/20260906005943_initial_schema.sql:5`
**Issue:** `create extension if not exists pgcrypto;` has no `with schema` clause, so it will be created in whichever schema resolves first on the search path (typically `public` for a fresh Supabase project). Supabase's own guidance is to keep extensions out of `public` to avoid namespace pollution and unintended exposure through the Data API (`supabase/config.toml` exposes schema `public` via `[api] schemas = ["public", "graphql_public"]`). `extra_search_path = ["public", "extensions"]` in `supabase/config.toml` confirms an `extensions` schema is already the intended home for this pattern.
**Fix:** Since this migration has already been designed to "own the schema" for Phase 1, prefer fixing forward in a new migration rather than editing an applied one:
```sql
-- new migration
alter extension pgcrypto set schema extensions;
```
(or, if this hasn't shipped anywhere yet, edit the original migration to `create extension if not exists pgcrypto with schema extensions;`).

### WR-03: Idempotency-guard unique constraint has a NULL loophole because `template_id` is nullable

**File:** `supabase/migrations/20260906005943_initial_schema.sql:64-77`
**Issue:** The comment on `unique (template_id, house_id, installment_number)` states this is the "DB-level idempotency guard against duplicate generation" called out in `PITFALLS.md` Pitfall 3. `template_id` is nullable by design (confirmed intentional in `.planning/research/ARCHITECTURE.md:109`), but Postgres unique constraints treat `NULL` as distinct from every other `NULL` — so any two rows with `template_id IS NULL` and the same `(house_id, installment_number)` will **not** violate the constraint, silently defeating the exact guarantee the comment claims to provide for any installment not tied to a template.
**Fix:** Add a partial unique index to close the gap for the NULL case, without contradicting the documented nullable-FK design:
```sql
create unique index condo_installments_no_template_uidx
  on condo_installments (house_id, installment_number)
  where template_id is null;
```

### WR-04: No schema-level guard that a payment's currency matches its installment's currency

**File:** `supabase/migrations/20260906005943_initial_schema.sql:83-97`
**Issue:** `condo_payments.currency` and `condo_installments.currency` are independent columns with no FK/trigger tying them together. CLAUDE.md flags per-currency correctness (never summing USD/Bs/USDT) as the thing that "must work" for this app; a future bug in the payment-registration Server Action (Phase 5) that inserts a payment with a currency that doesn't match its installment would silently corrupt saldo/morosos reporting with no DB-level backstop.
**Fix:** Add a trigger-based guard (kept in a later migration once `condo_payments` writes begin, or now if preferred):
```sql
create or replace function condo_payments_currency_guard() returns trigger as $$
begin
  if new.currency <> (select currency from condo_installments where id = new.installment_id) then
    raise exception 'payment currency % does not match installment currency for installment %',
      new.currency, new.installment_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger condo_payments_currency_guard_trg
before insert or update on condo_payments
for each row execute function condo_payments_currency_guard();
```

## Info

### IN-01: `updated_at` columns have no trigger to keep them current

**File:** `supabase/migrations/20260906005943_initial_schema.sql:8-77`
**Issue:** `condo_communities`, `condo_houses`, `condo_installment_templates`, and `condo_installments` all have `updated_at timestamptz not null default now()`, but nothing updates this column on `UPDATE` — it will silently stay pinned to the row's insert time forever. Not exploited by anything in Phase 1 (no update flows exist yet), but worth fixing before Phase 2 admin CRUD starts relying on it for "last modified" display.
**Fix:** Add a generic trigger function once, then attach it per table:
```sql
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger condo_houses_set_updated_at
before update on condo_houses
for each row execute function set_updated_at();
-- repeat for condo_communities, condo_installment_templates, condo_installments
```

### IN-02: Inconsistent `ON DELETE` behavior across foreign keys

**File:** `supabase/migrations/20260906005943_initial_schema.sql:18-97`
**Issue:** Only `condo_house_residents.house_id` declares `on delete cascade`; every other FK (`community_id`, `template_id`, `condo_installments.house_id`, `condo_payments.house_id`/`installment_id`) defaults to `NO ACTION` (restrict). This may be the right call for financial records (don't let a house deletion silently cascade-delete payment history), but it's implicit rather than a documented decision, and a future admin-side "delete house" feature will hit an FK violation with no explanation unless this is called out now.
**Fix:** Either add an explanatory comment next to each FK about the intended delete behavior, or make the restrict-by-default choice explicit: `references condo_houses(id) on delete restrict`.

### IN-03: `page.tsx` bypasses next-intl entirely — hardcoded English text regardless of locale

**File:** `app/[locale]/page.tsx:6-9`
**Issue:** The layout wires up `next-intl` (locale routing, `NextIntlClientProvider`, `setRequestLocale`), but `page.tsx` never calls `useTranslations`/`getTranslations` — it hardcodes English copy ("Condominio App — foundation deployed.") that will render identically whether the visitor is on `/` (Spanish default) or `/en`. `messages/es.json` and `messages/en.json` are both currently empty (`{}`), so there's nothing to translate yet — likely fine for a Phase 1 "foundation deployed" placeholder, but flagging so this doesn't get overlooked once real content is expected to respect `routing.defaultLocale`.
**Fix:** When real page copy is added, source it from the message catalogs:
```tsx
import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('Home');
  return (/* ... t('title'), t('subtitle') ... */);
}
```

### IN-04: `community_id` and `template_id` FK columns are nullable in single-tenant tables

**File:** `supabase/migrations/20260906005943_initial_schema.sql:18-56`
**Issue:** `condo_houses.community_id` and `condo_installment_templates.community_id` have no `NOT NULL`. Given this app is explicitly single-tenant with one community row (no seed insert; created by the admin post-deploy per `D-02`/`D-03`), every house/template will always belong to that one community in practice, so nullability here doesn't reflect a real business state — just an omission. Low-severity since `.planning/research/ARCHITECTURE.md` already earmarks `community_id` as forward-looking multi-tenant scaffolding and doesn't specify `NOT NULL`.
**Fix:** Consider `community_id uuid not null references condo_communities(id)` once the "create the one community row" flow is confirmed to always run before house/template creation — a defense against orphaned rows referencing a nonexistent tenant.

---

_Reviewed: 2026-09-06T03:21:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Architecture Research

**Domain:** Condo/HOA payment management, single-tenant, dual-auth (Next.js 14 App Router + Supabase)
**Researched:** 2026-09-04
**Confidence:** MEDIUM-HIGH (component boundaries and build order: HIGH; dual-auth/RLS mechanism: MEDIUM, needs an early spike)

## Verdict on the Proposed Design (docs/handoff-prompt.md)

The proposed folder structure is sound and should be adopted largely as-is. The proposed schema has the right table set but **two real inconsistencies** that will break the features it's meant to support, plus one under-specified mechanism (resident auth + RLS). These are amendments, not a redesign — see "Schema Amendments" below.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                                     │
│  ┌────────────────┐        ┌────────────────────┐                    │
│  │ Admin route grp │        │ Resident route grp  │                   │
│  │ (admin)/*        │        │ (resident)/*        │                  │
│  └────────┬────────┘        └─────────┬───────────┘                  │
│           │  Server Components / Server Actions (fetch on server)     │
├───────────┴──────────────────────────┴────────────────────────────────┤
│  MIDDLEWARE (Edge) — session refresh, route guarding, locale routing  │
├──────────────────────────────────────────────────────────────────────┤
│  SERVER LAYER (Route Handlers + Server Actions, Node runtime)         │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────┐ │
│  │ auth (admin)  │ │ auth (resident)│ │ cuota engine  │ │ payments  │ │
│  │ @supabase/ssr │ │ PIN verify +   │ │ generation    │ │ allocation│ │
│  │ cookie session│ │ signed session │ │ (fan-out)     │ │           │ │
│  └───────┬───────┘ └───────┬────────┘ └───────┬───────┘ └─────┬─────┘ │
├──────────┴─────────────────┴──────────────────┴───────────────┴───────┤
│  SUPABASE                                                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────────────┐│
│  │ Auth        │  │ Postgres    │  │ RLS policies (per-table,        ││
│  │ (admins     │  │ (houses,    │  │ per-role: admin / resident)     ││
│  │ only)       │  │ residents,  │  │                                  ││
│  │             │  │ cuotas,     │  │                                  ││
│  │             │  │ payments)   │  │                                  ││
│  └────────────┘  └────────────┘  └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Admin auth | Email/password login, verification, reset, session cookie | `@supabase/ssr` `createServerClient`, real `auth.users` rows, RLS via `auth.uid()` + a role check |
| Resident auth | House selection + PIN verify, session issuance | Server-only route/Server Action reads `house_residents.pin_hash` via a privileged client, verifies with bcrypt, issues its own signed session (see Pattern 1) |
| Middleware | Refresh admin session, gate `(admin)` and `(resident)` route groups, locale prefix | Next.js `middleware.ts`, edge-compatible Supabase client for the admin cookie only |
| Houses | CRUD for houses (admin-only) | Server Actions + Supabase client scoped to `admin` role |
| Cuota engine | Generate payable cuota rows from an admin-authored template (recurring fan-out across houses/installments; special-cuota split into children) | Server-side function, transactional insert of N rows per submission |
| Payments | Register a payment against one or more pending cuotas, currency-matched | Server Action; writes one payment row per selected cuota (see Pattern 3) |
| Reporting/morosos/saldo | Compute balance and delinquency per house per currency | SQL views or parameterized queries, never client-computed |
| Resident portal | Read-only calendar/saldo/history for the logged-in house | Server Components, scoped by session's `house_id` |
| Admin dashboard | KPIs, morosos table, monthly report | Server Components consuming the reporting layer |
| i18n | es (default) / en switch | `next-i18n-router` or `next-intl`, locale segment in URL |

## Recommended Project Structure

The handoff's folder structure (`app/(auth)`, `app/(admin)`, `app/(resident)`, `app/api/*`, `components/{ui,layout,admin,resident}`, `lib/*`, `hooks/*`) is a good, conventional App Router layout. Keep it, with these adjustments:

```
app/
├── (auth)/login/                 # single page, branches to admin vs resident form
├── (admin)/...                   # as proposed — gate via middleware, not per-page checks
├── (resident)/...                # as proposed — gate via middleware, not per-page checks
└── api/                          # ONLY for things that must be callable outside a
                                   # Server Action context (e.g. resident PIN verify,
                                   # webhooks if any later). Prefer Server Actions for
                                   # everything else — less boilerplate than the
                                   # proposed route-per-resource API layer.
lib/
├── supabase/
│   ├── server.ts                 # createServerClient (Server Components/Actions)
│   ├── admin.ts                  # service-role client — SERVER-ONLY, never imported
│   │                              # into a "use client" file or app/api that returns
│   │                              # raw data to residents
│   └── middleware.ts             # createServerClient for middleware cookie refresh
├── auth/
│   ├── admin-session.ts          # thin wrapper over Supabase Auth session
│   └── resident-session.ts       # sign/verify the custom resident session (jose/iron-session)
├── cuotas/
│   └── generate.ts               # recurring fan-out + special-cuota split, pure functions
│                                  # + a thin DB-writing wrapper, so generation logic is
│                                  # unit-testable without hitting Postgres
├── reports/
│   ├── saldo.ts                  # saldo query per house/currency
│   └── morosos.ts                # delinquency query
└── types.ts                      # generated from `supabase gen types typescript`
```

### Structure Rationale

- **Server Actions over route handlers for CRUD:** the handoff's `app/api/*` mirrors a REST layer that Next.js 14 App Router doesn't need for same-origin form/table interactions. Reserve `app/api/` for the resident PIN-verify endpoint (needs to run before any session exists) and anything a non-Next.js caller might hit later. This cuts real build work versus the handoff's full API tree.
- **`lib/supabase/admin.ts` isolated:** the service-role client bypasses RLS entirely. Giving it its own file makes it trivial to grep for "is this file allowed to touch the service key" during review — a real risk given resident PIN verification requires reading `pin_hash`, which anon/resident-scoped RLS must never expose.
- **`lib/cuotas/generate.ts` as pure logic + wrapper:** the recurring/special generation math (PROJECT.md flags this as "core business logic, not incidental") is the one place a bug silently produces wrong `saldo`/morosos data for months. Keeping the fan-out calculation testable in isolation from Supabase matters more here than almost anywhere else in the app.

## Schema Amendments (evaluating docs/handoff-prompt.md)

The proposed schema (houses, house_residents, cuotas, payments, communities, audit_logs) is the right table set. Two things in it contradict the feature spec it's supposed to support, and should be fixed before Phase 1 migrations are written:

### 1. `cuotas.applicable_houses UUID[]` contradicts the stated generation behavior

PROJECT.md and the handoff's own "Key Features" section both say a recurring cuota "generates one cuota record per installment per applicable house." That means each payable cuota is a **per-house, per-installment instance** — but the proposed `cuotas` table has no `house_id` column at all, only an `applicable_houses` array on what looks like a single definition row. An array column can't hold "N rows, one per house" — it's the wrong shape for the thing morosos/saldo queries need (a `payments`-joinable, per-house cuota instance).

**Fix — split "definition" from "instance":**
- `cuota_templates`: what the admin fills out — `name`, `description`, `cuota_type` (`recurring`/`special`), `cadence`, `amount`, `currency`, `start_date`, `number_of_installments`, `is_divided`, `applicable_houses UUID[]` (empty = all houses at generation time — array is correct *here*, since it's a targeting input, not a payable record).
- `cuotas` (payable instances): `house_id UUID NOT NULL REFERENCES houses(id)`, `template_id UUID REFERENCES cuota_templates(id)`, `installment_number`, `amount`, `currency`, `due_date`, `status`. `parent_cuota_id` still works for special-cuota splits, but now links instance rows, not definitions.

This is the single highest-leverage schema fix — it's what makes "generate one row per installment per applicable house" and later `WHERE cuota.house_id = ...` morosos/saldo queries actually possible.

### 2. `payments.cuota_id` (singular) contradicts "register a payment against one or more pending cuotas"

The feature flow explicitly describes checkbox-selecting multiple pending cuotas and pre-filling the amount as their sum, but the schema allows only one `cuota_id` per payment row.

**Fix (minimal diff):** on submission, insert one `payments` row per selected cuota (same `payment_date`, `notes`, `created_by`; each row's `amount_paid`/`currency` taken from its own cuota). Add an optional `payment_batch_id UUID` (client-generated) so the UI can still show "these 3 rows were one register-payment action." This avoids a join table and keeps saldo/morosos queries simple (`SUM(payments.amount_paid)` per house per currency still works directly). A `payment_allocations` join table is the more general fix if partial/overpayment-as-credit ever needs first-class support — not needed for v1 given "no currency conversion" and cuota-exact payments are the norm.

### 3. `status` column is referenced but not defined

The resident calendar needs pending/paid/overdue/advance-paid, and the handoff's own flow says "POST /api/payments → create payment record **+ update cuota status**" — implying a stored column, not a pure computed view (advance-paid, specifically, isn't derivable from due-date-vs-today alone; it means "paid before due"). Add `status VARCHAR CHECK (status IN ('pending','paid','overdue','advance'))` to the instance-level `cuotas` table, written by the payment-registration Server Action in the same transaction as the payment insert(s). Keep morosos/overdue detection as a query (don't trust a stale `overdue` status that wasn't recomputed since due-date passed) — treat `status` as authoritative only for `paid`/`advance` (payment-driven transitions), and compute `overdue` at query time from `due_date < today AND status != 'paid'`.

### 4. Resident auth + RLS mechanism is unspecified — this needs an early spike

The handoff and PROJECT.md both correctly flag dual auth as the trickiest piece but don't specify *how* a resident (no `auth.users` row) gets a session that Postgres RLS can key off. Three real options, evaluated:

| Approach | How | Verdict |
|---|---|---|
| **A. Custom-signed session, app-layer scoping** | Server-only route verifies PIN with service-role client (bcrypt compare), issues its own signed cookie (`jose`/`iron-session`) with `house_id`. All resident reads go through Server Actions using the service-role client, manually filtered by `house_id` from the verified cookie. RLS stays ON (deny-by-default) as defense-in-depth, but isn't the actual gate for residents. | **Recommended for v1.** Simplest to build and reason about for ~20-50 houses; no `auth.users` churn; resident session never talks to Postgres directly (browser never holds a Supabase key). |
| **B. Supabase anonymous sign-in mapped to house** | `supabase.auth.signInWithAnonymously()`, then server-side link the resulting anon `auth.uid()` to a `house_residents` row after PIN check. RLS policies check `house_residents.auth_user_id = auth.uid()`. | Officially supported by Supabase, RLS becomes the literal gate (satisfies PROJECT.md's "RLS enforces" wording literally). More moving parts: an `auth.users` row per resident session, cleanup/expiry, mapping-table upkeep. Viable fallback if option A's app-layer enforcement is judged insufficient in review. |
| **C. Manually minted Supabase-signed JWT** | Sign a JWT with the project's JWT secret, custom claims (`house_id`), verified via `auth.jwt() ->> 'house_id'` in policies. | Technically works (confirmed: Postgres RLS only needs a Supabase-signed JWT, not a Supabase Auth session) but Supabase is moving toward asymmetric JWT signing keys, making manual HS256 minting a forward-compatibility risk. Not recommended for a new project starting now. |

**This should be a short spike at the start of the auth phase**, not decided mid-build — it determines whether `lib/auth/resident-session.ts` wraps a Supabase Auth call (Option B) or a standalone cookie library (Option A), and both admin RLS policies and resident RLS policies are written against whichever is chosen.

### 5. Missing package for the chosen stack

The handoff's dependency list omits `@supabase/ssr` — the currently-recommended package for cookie-based SSR sessions in Next.js App Router (the older `@supabase/auth-helpers-nextjs` is deprecated). Admin auth (Server Components can't write cookies directly — middleware must refresh tokens) depends on this. Add it alongside `@supabase/supabase-js`.

## Architectural Patterns

### Pattern 1: Two session mechanisms, one middleware gate

**What:** Admin sessions are real Supabase Auth sessions (JWT in cookies, refreshed by middleware via `@supabase/ssr`). Resident sessions are a separate signed cookie your app controls. Middleware checks *which* cookie is present and routes/redirects accordingly — `(admin)/*` requires the Supabase cookie + `role=admin`, `(resident)/*` requires the resident cookie.
**When to use:** Whenever one of your two user classes isn't a real account-holder in the auth provider's system.
**Trade-offs:** Two code paths to maintain and test, but avoids forcing residents through email/password infrastructure they were explicitly scoped out of (PROJECT.md: "no email required").

### Pattern 2: Definition vs. instance for cuotas

**What:** An admin action ("create recurring cuota") produces a *template* row; a background/transactional step *generates* N *instance* rows (one per house × installment) from it. Reads (calendar, saldo, morosos) only ever touch instances.
**When to use:** Any time a single admin input needs to fan out into many independently-payable records with independent status.
**Trade-offs:** One extra table and a generation step, but instances stay simple, indexable, and directly joinable to payments — the alternative (deriving "what's owed" from a template + date math at read time) makes every report query reimplement the fan-out logic.

### Pattern 3: Payment registration as a multi-row transaction

**What:** One "register payment" submission against N selected cuotas writes N `payments` rows (one per cuota) inside a single DB transaction, plus updates each cuota's `status`.
**When to use:** When "one user action" and "one ledger entry" aren't the same thing.
**Trade-offs:** Keeps saldo/morosos math as simple per-row aggregation; loses the ability to represent one payment covering *part* of a cuota (acceptable given the domain has no partial-payment requirement in scope).

## Data Flow

### Key Data Flows

1. **Admin creates recurring cuota:** Admin form → Server Action validates → insert `cuota_templates` row → generation function computes N (house × installment) combinations → transactional insert into `cuotas` (instances, `status='pending'`) → redirect to cuotas list.
2. **Admin registers payment:** Admin selects house → Server Action loads that house's pending `cuotas` → admin checks N of them → Server Action validates currency match per row → transactional insert of N `payments` rows + update matching `cuotas.status` → dashboard/morosos numbers reflect the change on next read (no caching layer needed at this scale).
3. **Resident logs in:** Resident picks house from dropdown (public read of `houses.house_number`/`house_name` only — no PII) → submits PIN → server-only route reads `house_residents.pin_hash` via privileged client, bcrypt-compares → issues resident session cookie with `house_id` → middleware allows `(resident)/*`.
4. **Resident views saldo/calendar:** Server Component reads session cookie → queries `cuotas`/`payments` scoped to `house_id` (via RLS if Option B chosen, via explicit `WHERE house_id = $session.house_id` if Option A) → renders calendar with computed per-cuota status.
5. **Admin views morosos:** Server Component runs the morosos query (`due_date < today AND status != 'paid'`, joined to houses/owners) directly against Postgres — no separate cache/materialized view needed until house count is much larger than this project's scope.

## Suggested Build Order

This is the dependency graph that should drive phase sequencing:

1. **Scaffold** — Next.js app, Once UI, i18n shell, Supabase project, base migrations (`communities`, `houses`, `house_residents`, `cuota_templates`, `cuotas`, `payments`, `audit_logs`), RLS enabled with deny-by-default on every table. No feature logic yet — this just needs to exist before anything else does.
2. **Admin auth** — Supabase Auth (email/password, verification, reset), `@supabase/ssr`, middleware gating `(admin)/*`. Everything admin-facing depends on this existing first.
3. **Houses (admin CRUD)** — depends on #2. Houses are the FK target for residents, cuotas (instances), and payments — nothing else can be built meaningfully without real house rows to point at.
4. **Residents (admin seeds house_residents + PIN)** — depends on #3. Prerequisite for resident auth (#5) — someone has to create the house+PIN before a resident can log in with it.
5. **Resident auth spike + implementation** (Pattern 1 decision) — depends on #3, #4. Can proceed in parallel with #6/#7 once the mechanism is chosen, since it's a separate session system.
6. **Cuota engine (templates + generation)** — depends on #3. This is the highest-risk business logic (PROJECT.md flags it explicitly) — build and test the fan-out/split logic before payments need something to point at.
7. **Payments (registration, multi-cuota)** — depends on #6. Needs real cuota instances to select against.
8. **Saldo + morosos computation** — depends on #6, #7. This is where "the core value" (PROJECT.md: accurate morosos/saldo is what must work first) actually gets validated — needs real cuota + payment data flowing through #6/#7 to test against.
9. **Admin dashboard + reports (KPIs, morosos table, monthly report)** — depends on #8. Pure read-side consumption of the reporting layer.
10. **Resident portal (calendar, saldo, history)** — depends on #5, #8. Intentionally last among features — matches PROJECT.md's stated priority that admin-side accuracy matters more than resident self-service, and there's nothing to show a resident until cuotas/payments/saldo are correct.
11. **i18n completion, audit log writes, polish** — cross-cutting, lowest risk, safe to interleave or defer to the end.

**Hard dependency chain:** scaffold → admin auth → houses → (residents → resident auth) and (cuotas → payments → saldo/morosos → admin reports) can run as two roughly-parallel tracks after houses exist, but resident portal specifically waits on both tracks converging (needs resident auth AND working saldo/morosos).

## Scaling Considerations

This is a single-tenant app for one community (tens of houses, a handful of admins). Scale planning beyond "don't write an O(n²) query" is premature. The only two considerations worth naming explicitly:

| Scale | Adjustment |
|-------|------------|
| Current (single community, <100 houses) | Direct queries for saldo/morosos are fine — no caching, no materialized views, no queues |
| If cuota generation ever produces thousands of instance rows per run (many houses × many installments) | Wrap generation in a single transaction (already recommended above) so a partial fan-out never leaves inconsistent state; index `cuotas(house_id, status)` and `cuotas(due_date, status)` for the morosos/report queries |
| If multi-tenant is ever revisited (explicitly out of scope now) | `community_id` is already threaded through the schema per the handoff — that's the right future-proofing and needs no further action now |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Service-role client reachable from anything the browser can trigger without server-side gating

**What people do:** Import the service-role client in a shared `lib/supabase.ts` that both server and "use client" code paths import from, or expose it through an `app/api` route without checking the caller's session first.
**Why it's wrong:** The service-role key bypasses RLS entirely — it's the one thing standing between "residents see only their house" and "residents see everything," given PIN verification legitimately needs it.
**Instead:** Isolate it in `lib/supabase/admin.ts`, used only inside the PIN-verify route/action, never imported into any component file or any route handler that echoes raw query results back based on unvalidated input.

### Anti-Pattern 2: Computing morosos/saldo status client-side or trusting a stale stored status

**What people do:** Fetch all cuotas + payments to the client and compute "who's overdue" in JavaScript, or trust a `status` column that was set once at generation time and never revisited.
**Why it's wrong:** Overdue-ness is time-relative (`due_date < today`) — a status column written at creation time silently goes stale the moment "today" passes the due date, and PROJECT.md names morosos/saldo accuracy as the core value.
**Instead:** Compute overdue at query time (`due_date < today AND status != 'paid'`); only use the stored `status` column for payment-driven states (`paid`, `advance`) that a transaction actually set.

### Anti-Pattern 3: Treating `applicable_houses`/array-of-houses as the payable record

**What people do:** Query "who owes this cuota" by unpacking an array column at read time on every report/dashboard load.
**Why it's wrong:** Every morosos/saldo/calendar query becomes an array-unpacking join instead of a plain `WHERE house_id = ...` — slower, harder to index, and doesn't match how payments (which reference a single cuota) need to join against it.
**Instead:** Fan out to per-house instance rows at generation time (Schema Amendment #1); keep the array only on the template as a targeting input.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | `@supabase/ssr` server client + middleware cookie refresh | Admin-only in v1; add this package explicitly — it's missing from the handoff's dependency list |
| Supabase Postgres | Server Components/Actions via server client; service-role client isolated to PIN verification | RLS enabled on every table from migration #1, deny-by-default, policies added per role as each feature phase lands |
| Once UI | Component library, wrapped where needed in `components/ui/` | As proposed in handoff — no changes needed |
| i18n (next-i18n-router or next-intl) | Locale segment in URL, `es` default | As proposed; low architectural risk, safe to build incrementally |
| Vercel | Standard Next.js deployment, env vars for Supabase URL/anon key/service key | Service role key must be set as a server-only env var, never `NEXT_PUBLIC_*` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Admin route group ↔ Server layer | Server Actions (form submissions) + Server Components (reads) | No client-side fetch to a REST API needed for same-origin admin CRUD |
| Resident route group ↔ Server layer | Server Actions/Server Components scoped by resident session cookie | Never issue the resident browser a Supabase key of any kind |
| Cuota engine ↔ Payments | Payments reference `cuotas.id` (instance rows) only, never templates | Keeps payment/saldo math simple and matches the amended schema |
| Reporting layer ↔ Everything else | Read-only queries/views over `cuotas` + `payments` + `houses` | No component upstream of reporting should pre-aggregate or cache status — reporting is the single source of truth for "who owes what" |

## Sources

- [Setting up Server-Side Auth for Next.js — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) — confirms `@supabase/ssr` as current recommended package, MEDIUM-HIGH confidence (WebSearch-aggregated, consistent with training-data knowledge of the deprecated `auth-helpers-nextjs`)
- [Anonymous Sign-Ins — Supabase Docs](https://supabase.com/docs/guides/auth/auth-anonymous) — confirms anonymous auth as first-class, used for resident-auth Option B evaluation
- [Custom Claims & RBAC — Supabase Docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — RLS/JWT claims mechanism, used for resident-auth Option C evaluation
- [Using Supabase RLS with a custom auth provider — Grace Wang, Medium](https://medium.com/@gracew/using-supabase-rls-with-a-custom-auth-provider-b31564172d5d) — confirms RLS only requires a Supabase-signed JWT, not a Supabase Auth session (basis for Option C's technical feasibility); MEDIUM confidence, single-source, not official docs
- `docs/handoff-prompt.md` (this repo) — source of the proposed schema/folder structure evaluated above
- `.planning/PROJECT.md` (this repo) — source of feature requirements and stated core value used to validate build order

---
*Architecture research for: condo/HOA payment management (dual-auth, Next.js 14 + Supabase)*
*Researched: 2026-09-04*

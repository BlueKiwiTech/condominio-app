# Stack Research

**Domain:** Condo/HOA payment-management web app, single-tenant, dual-auth (admin + PIN-based resident)
**Researched:** 2026-09-04
**Confidence:** HIGH for framework/library versions and standard patterns; MEDIUM for the dual-auth synthesis (no single official Supabase tutorial covers "PIN login with no email" — the recommendation combines documented primitives)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | **16.3.x** (latest stable, e.g. `16.3.4`) | App framework, App Router, Server Actions | Confirmed current stable/production-recommended as of Sept 2026 (Turbopack stable, PPR stable). Satisfies the "14+" constraint. Critically, **Once UI's `@once-ui-system/core` declares a peer dependency of `next: ">=15.5"`** — Next.js 14.x is not installable alongside it. If the team wants to hard-pin to the "14" line for any reason, the floor is 14.2.35 (latest 14.x patch) but Once UI will refuse to install; there is no version of Next 14 that satisfies Once UI's peer range. Recommend accepting 15.5+/16.x rather than fighting this. |
| React / React DOM | 18.x minimum, but ships with whatever Next 16 pins (React 19) | UI runtime | Once UI requires `react >=18`; Next 16 defaults to React 19. No conflict — just don't manually pin React 18 against Next 16. |
| TypeScript | 5.x (latest) | Type safety across app | Matches Next.js 16 defaults; required by project constraint. |
| Supabase (Postgres + Auth) | Project-level (managed); client libs below | Backend, auth, RLS | Already locked by user. |
| `@supabase/ssr` | `0.12.x` (latest `0.12.6`) | Cookie-based SSR Supabase client for Next.js App Router | **This is the current, correct package.** It replaces the deprecated `@supabase/auth-helpers-nextjs`, which Supabase has explicitly sunset in favor of `@supabase/ssr`. Confirmed via Context7 (`/supabase/ssr`) and current Supabase docs. |
| `@supabase/supabase-js` | `2.115.x` (latest `2.115.0`) | Core Supabase JS client, used under the hood by `@supabase/ssr` and directly for service-role/admin calls | Peer dependency of `@supabase/ssr` (`^2.114.0`) — keep both current together. |
| Once UI Core | `@once-ui-system/core` `1.8.x` (latest `1.8.4`) | Component library / design system | User-locked. Confirmed via npm + Context7 (`/once-ui-system/core`, `/once-ui-system/nextjs-starter`) to be an actively maintained (published ~1 week before this research), MIT-licensed, ~100-component library purpose-built for Next.js App Router. **It is NOT a Tailwind-based library** — see "What NOT to Use" below, this corrects an assumption in the original handoff spec. |
| `next-intl` | `4.14.x` (latest `4.14.2`) | i18n for App Router (Spanish default, English secondary) | Purpose-built for App Router: Server Component translations with no hydration cost, typed message keys, `defineRouting`/middleware-based locale negotiation. Confirmed via Context7 (`/amannn/next-intl`) as the current standard for App Router i18n, with ~1.8M weekly downloads and the steepest adoption growth of any Next.js i18n library per multiple 2026 comparison sources (MEDIUM confidence on adoption stats — WebSearch-sourced, not independently verified against npm trends, but directionally consistent across multiple sources). |
| Vercel | N/A (platform) | Hosting/deploy | User-locked. No special config beyond standard Next.js project + env vars; see runtime notes below. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sass` | `^1.77.6` (peer dep pin) | CSS preprocessing for Once UI's token/theme system | **Required**, not optional — Once UI's peer dependencies list `sass: ^1.77.6` explicitly. Add as a devDependency. |
| `sharp` | `^0.33.4 \|\| ^0.34 \|\| ^0.35` | Image optimization | Required peer dep of Once UI when using Next.js image features. Install even if you think you don't need it — Once UI's `next-starter` docs flag `sharp` as required for image optimization in a Next.js environment. |
| `zod` | `4.x` (latest `4.5.4`) | Schema validation for forms, Server Action inputs, API route payloads | Use at every Server Action / route handler boundary — validate cuota amounts, currency enum (`USD`/`Bs`/`USDT`), PIN format (4 digits), house selection, etc. before touching the DB. |
| `react-hook-form` | `7.x` (latest `7.87.0`) | Form state management | Use for all admin forms (cuota creation, payment registration, house CRUD) — pairs with `@hookform/resolvers` + `zod` for a standard typed-form pattern. |
| `@hookform/resolvers` | `5.x` (latest `5.9.1`) | Bridges `zod` schemas into `react-hook-form` | Use alongside the two above. |
| `date-fns` | `4.x` (latest `4.4.0`) | Date math/formatting, cadence calculations (weekly/monthly/annual installment generation), locale-aware display (es/en) | Already a transitive dependency of Once UI Core (`date-fns: ^4.4.0`) — don't add a second date library (e.g. `dayjs`, `moment`); reuse this one for cuota due-date generation and morosos "days overdue" math. |
| `bcryptjs` **or** Postgres `pgcrypto` | `bcryptjs@3.x` / `pgcrypto` (Postgres extension) | Resident PIN hashing | See dual-auth section below — recommend doing PIN hashing/verification **inside Postgres via `pgcrypto`'s `crypt()`/`gen_salt('bf')`** in a `SECURITY DEFINER` RPC, which sidesteps any Node/Edge runtime binary-compat questions entirely. If hashing client-side in a Node Route Handler instead, use `bcryptjs` (pure JS) over native `bcrypt` — no native bindings to break on Vercel's serverless/Edge runtimes. |
| `jose` | latest | Signing/verifying the resident's app-level session cookie (if using the recommended custom-session dual-auth pattern) | Small, Edge-runtime-compatible JWT library maintained by the panva/OIDC ecosystem; use to mint a short-lived, httpOnly, signed session token distinct from Supabase's own JWTs. |
| `recharts` | (already bundled — `^3.10.1` via Once UI Core) | Charts for admin dashboard KPIs, monthly reports | **Do not add a separate `recharts` dependency** — Once UI Core already depends on and wraps `recharts` in its own chart components. Use Once UI's chart components first; drop to raw `recharts` only for a visualization Once UI doesn't cover. |
| `@tanstack/react-query` | `5.x` (latest `5.102.8`) | Client-side data fetching/caching/optimistic updates | **Optional, not core.** With App Router + Server Components + Server Actions, most reads should happen server-side directly via the Supabase server client — you don't need a client cache for that. Reach for TanStack Query only for interactive, client-driven flows (e.g. live-filtering the morosos table, optimistic payment registration UI) where refetch/cache invalidation genuinely helps. Don't install it by default. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase CLI | Local dev DB, migrations, type generation | Run `supabase gen types typescript` to generate DB types into `lib/types.ts` (or a dedicated `database.types.ts`) — keeps `cuotas`/`payments`/`houses` shapes in sync with the schema instead of hand-maintaining types. |
| ESLint + `eslint-config-next` | Linting | Ships with `create-next-app`; keep default Next.js 16 config. |
| Once UI CLI (`once-ui-init-agent`, `once-ui-validate-ai-code`) | Scaffolding/validation bins shipped by `@once-ui-system/core` | The package ships its own CLI binaries aimed at AI-assisted codegen (manifest + validation scripts) — worth using during scaffolding since this is an AI-agent-built project, but not required. |

## Installation

```bash
# Create the app (Next 16, App Router, TypeScript)
npx create-next-app@latest condominio-app --typescript --app --no-tailwind

# Core
npm install @supabase/ssr @supabase/supabase-js @once-ui-system/core zod react-hook-form @hookform/resolvers date-fns next-intl jose

# Once UI required peer deps
npm install sass sharp

# Resident PIN auth (pick ONE path — see Dual-Auth section)
npm install bcryptjs   # if hashing PINs in Node route handlers
# (no npm install needed if hashing via Postgres pgcrypto instead)

# Dev dependencies
npm install -D typescript @types/node @types/react @types/bcryptjs
```

Note: `--no-tailwind` is intentional — Once UI ships its own Sass/CSS-variable design token system and does not use Tailwind. See "What NOT to Use."

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Never for new code — deprecated by Supabase, superseded by `@supabase/ssr`. Only relevant if maintaining a pre-2024 codebase. |
| `next-intl` | `next-i18n-router` + `i18next`/`react-i18next` (as the original handoff spec proposed) | If you need to plug an existing i18next translation pipeline (e.g. a TMS/Lokalise workflow already built around i18next) into App Router — `next-i18n-router` is a thinner routing-only layer that composes with i18next. For a greenfield App Router project with no existing i18next investment, `next-intl` is simpler and purpose-built (see "What NOT to Use"). |
| Postgres `pgcrypto` for PIN hashing | `bcryptjs` in a Node Route Handler | If the team strongly prefers hashing logic to live in TypeScript (easier to unit test, more familiar) rather than SQL — `bcryptjs` is a fine equivalent, just requires care to only run in a Node (not Edge) runtime. |
| Custom signed-cookie session for residents + service-role-mediated reads | Supabase Anonymous Sign-In + Custom Access Token Hook (`house_id` claim) | If the team wants residents' data access to be enforced at the Postgres/RLS layer itself (defense-in-depth even against a bug in a Route Handler), not just at the application layer. See Dual-Auth section for full tradeoff — this is the single most important decision this file should hand off to roadmap/architecture work. |
| `@tanstack/react-query` used selectively | Server Components + Server Actions only, no query library | If literally every resident/admin view can be server-rendered per-request with no client-side interactivity needs (unlikely once you have filterable tables and optimistic payment forms) — then skip TanStack Query entirely. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `@supabase/auth-helpers-nextjs` | Deprecated by Supabase; no longer receives updates; built for the Pages Router / older App Router cookie APIs that have since changed. Using it on Next.js 16 risks silent cookie/session bugs. | `@supabase/ssr` |
| Tailwind CSS as the primary styling approach (as implied by the original `docs/handoff-prompt.md`, which lists `tailwind.config.ts # Once UI uses Tailwind`) | **This is incorrect for the current Once UI.** Verified via Context7 and npm: `@once-ui-system/core`'s peer dependencies are `sass` (required) — not Tailwind. Once UI's own Next.js starter uses a `Providers` tree (`ThemeProvider`, `DataThemeProvider`, `LayoutProvider`) and a `resources/once-ui.config.js` + `custom.css` for token overrides, not Tailwind utility classes. Scaffolding this project with Tailwind configured will create a dead/unused config file and confuse contributors about which styling system is authoritative. | Once UI's own Sass/CSS-variable theming (`once-ui.config.js`, `custom.css`), per its official Next.js starter structure |
| `next-i18n-router` as the primary i18n solution for new App Router code | It is a thin routing/locale-detection middleware, not a full i18n solution — you'd still need to hand-wire `i18next`/`react-i18next` on top, and you lose `next-intl`'s Server-Component-native translation loading (zero hydration cost) and typed message keys. Multiple 2026 sources note `next-intl` was purpose-built for App Router from the ground up while `next-i18n-router` was built to patch a gap left when Next.js removed built-in i18n routing in the App Router. | `next-intl` |
| Native `bcrypt` (the C++-binding npm package, not `bcryptjs`) in Vercel serverless/Edge functions | Native bindings have a long history of breaking in serverless/Lambda-style deploy environments (wrong platform binary, cold-start rebuild issues) and are outright incompatible with the Edge runtime. | `bcryptjs` (pure JS) or Postgres `pgcrypto` |
| Relying on `getSession()` inside middleware/Server Components as your authorization gate | Supabase's own guidance: `getSession()` reads the JWT from cookies without verifying it against the auth server — a forged/stale cookie can pass. | `getUser()` (network-verified) for the actual authorization decision; `getClaims()` (locally verified via asymmetric JWT keys, no network round-trip) as a fast pre-check in middleware for redirect/UX purposes only |
| `lucide-react` as a second icon system alongside Once UI (as the original handoff spec proposed) | Once UI Core already bundles and wraps `react-icons` (`react-icons: ^5.7.0`) through its own `Icon`/`IconProvider` components. Adding `lucide-react` on top means two icon systems with different sizing/theming conventions living side by side. | Once UI's built-in `Icon` component (backed by `react-icons`); only reach for a `react-icons/lu` (Lucide-via-react-icons) import if a specific icon is missing, staying inside the same `IconProvider` |

## Stack Patterns by Variant

**Dual-Auth: Admin (Supabase Auth) + Resident (house + PIN, no email)**

This is the trickiest architectural piece in the project and deserves explicit treatment. Two viable patterns exist; **Pattern A is the recommendation** for this project's size and team, Pattern B is documented as the alternative.

### Pattern A (Recommended): App-level session for residents, Supabase Auth only for admins

- **Admins:** standard `@supabase/ssr` flow — email/password via `supabase.auth.signInWithPassword()`, session managed via cookies through middleware (`createServerClient` + `getAll`/`setAll` cookie handlers), protected routes gated in middleware using `getClaims()` for the fast redirect check and `getUser()` (or an equivalent server-verified check) before any sensitive read/write in a Server Action/Route Handler. RLS policies for admin-facing tables key off `auth.uid()` / `auth.jwt()` as normal — this is the textbook, fully-documented Supabase pattern (HIGH confidence).
- **Residents:** never receive a Supabase Auth session at all.
  1. Resident submits `{ house_id, pin }` to a Route Handler / Server Action.
  2. That handler runs **server-side only**, using the Supabase **service-role** client, and verifies the PIN — recommended via a Postgres RPC (`SECURITY DEFINER` function) that does `pin_hash = crypt(input_pin, pin_hash)` using `pgcrypto`, so the hash comparison never leaves the database and the service-role key is the only credential involved.
  3. On success, the handler mints its **own** short-lived, httpOnly, signed session cookie (via `jose`) containing `{ house_id, resident_id, role: 'resident' }` — this token has nothing to do with Supabase's JWT secret; it's an app-owned session, comparable to what `next-auth`'s Credentials provider or `iron-session` would produce.
  4. All subsequent resident-facing Server Components/Route Handlers read+verify that cookie, then use the **service-role** Supabase client server-side, manually scoping every query to `WHERE house_id = session.house_id`. The resident's browser never holds a Supabase anon/authenticated credential of its own.
  5. **RLS is still enabled on every table** (satisfies the project's stated constraint) — but for the resident path, RLS's job is to be a hard backstop that denies any direct client-side access attempt (since residents are never issued Supabase credentials, there's no `anon`/`authenticated` token that could reach PostgREST for them anyway). The actual scoping enforcement for residents lives in the trusted server code, not in a Postgres policy.
- **Why recommended over Pattern B:** far fewer moving parts for a small, single-tenant app maintained by a small team — no dependency on chaining Supabase's Anonymous Sign-In feature with a Custom Access Token Hook (a combination that, while built from officially-documented pieces, isn't itself an official recipe — see Pattern B's confidence note). Also avoids Supabase Anonymous Sign-In's operational baggage: a fresh `auth.users` row is created on every resident login unless you carefully persist/reuse sessions, anonymous sign-in is rate-limited (30 req/hour/IP by default) and Supabase explicitly recommends CAPTCHA/Turnstile in front of it to prevent abuse — overhead this app doesn't need for a closed community of known houses.
- **Tradeoff to flag for roadmap/architecture:** this pattern means resident data protection is enforced in application code (Route Handlers/Server Actions), not by Postgres RLS. That's a completely standard, well-understood pattern in production Next.js apps (RLS is one layer of defense, not the only one), but it does mean a bug in a Route Handler's `WHERE house_id = ...` clause is not caught by the database the way a bad RLS policy write would be. Recommend a lightweight convention (e.g. a single shared `getResidentScopedClient(houseId)` helper that always applies the filter, rather than ad hoc queries per route) to mitigate this. Confidence: HIGH on each individual building block (service-role bypass behavior, pgcrypto, httpOnly signed cookies are all standard/documented); MEDIUM on this being "the" recommended composite pattern, since it's a synthesis for this project's specific constraints rather than a single official tutorial.

### Pattern B (Alternative, more RLS-native): Supabase Anonymous Sign-In + Custom Access Token Hook

- Resident submits `{ house_id, pin }` to a Route Handler; server verifies PIN (service role + pgcrypto, same as Pattern A step 2).
- On success, call `supabase.auth.signInAnonymously()` to create a real (if temporary) Supabase Auth session for the resident — this is an officially supported, documented Supabase Auth feature. The resulting user has `is_anonymous: true` in their JWT and operates under the `authenticated` Postgres role.
- Immediately persist the house association by writing `house_id` onto that anonymous user (e.g. a `house_residents.auth_user_id` column pointing at the new `auth.users.id`), using the service-role client.
- Register a **Custom Access Token Hook** (a `SECURITY DEFINER` Postgres function, granted to `supabase_auth_admin` only) that runs on every token mint: it looks up `house_residents` by `event->>'user_id'` and, if found, injects a **dedicated top-level claim** (e.g. `house_id`, not nested under `app_metadata` — per Supabase community guidance, `app_metadata`-nested custom claims via hooks don't sync back to the actual `auth.users.app_metadata` column and have caused confusion) into the returned JWT claims.
- RLS policies on resident-facing tables then check `(auth.jwt() ->> 'house_id')::uuid = houses.id` directly in Postgres — real database-level enforcement, not just application-level.
- Custom Access Token Hooks are confirmed available on Supabase's **free tier** (not a paid-plan-only feature), so this isn't gated by billing.
- **Why not the primary recommendation:** more moving parts (an extra Postgres function with elevated grants, an extra `auth_user_id` linkage column, awareness of anonymous-auth's rate limiting/CAPTCHA recommendations, and cleanup/expiry strategy for orphaned anonymous `auth.users` rows over time). Better suited to a project that expects to scale to more residents/houses or wants RLS to be the sole source of truth for authorization. Confidence: MEDIUM — each primitive (anonymous sign-in, custom access token hooks, custom JWT claims in RLS) is independently documented by Supabase, but their combination for a "no-email PIN login" use case is this research's synthesis, not something Supabase publishes as a named recipe.

**Recommendation for roadmap:** default to Pattern A. Revisit Pattern B only if a later phase specifically needs RLS to be resident-auth-aware at the database level (e.g. exposing a public PostgREST/GraphQL endpoint directly to resident browsers instead of mediating everything through Next.js server code).

**i18n locale prefix strategy:**
- Use `next-intl`'s `localePrefix: 'as-needed'` in `defineRouting()` — Spanish (default locale) gets clean URLs (`/dashboard`, `/cuotas`) with no `/es/` prefix, while English is explicitly prefixed (`/en/dashboard`). This matches the project's "Spanish default, English secondary" framing better than forcing a prefix on every route.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@once-ui-system/core@1.8.4` | `next@>=15.5` (including 16.x), `react@>=18`, `sass@^1.77.6`, `sharp@^0.33.4\|\|^0.34\|\|^0.35` | **Hard floor of Next 15.5** — this is the binding constraint that overrides the "Next.js 14+" phrasing in the original project constraints. Recommend Next 16.3.x as the actual version to install. |
| `@supabase/ssr@0.12.x` | `@supabase/supabase-js@^2.114.0` | Keep both on latest together; `@supabase/ssr` is a thin cookie-adapter layer over `supabase-js`. |
| `next-intl@4.14.x` | `next@^12\|^13\|^14\|^15\|^16`, `react@^16.8\|^17\|^18\|>=19.0.0-rc\|^19` | No conflict with Next 16 / React 19. |
| Once UI's bundled `date-fns@^4.4.0` / `recharts@^3.10.1` | Project-level `date-fns`/`recharts` usage | Don't pin a second, different major version of either in root `package.json` — reuse what Once UI already brings in to avoid duplicate copies in the bundle. |
| Next.js Middleware (Edge runtime) | `@supabase/ssr`'s `createServerClient` in middleware | Fine — middleware only needs the anon/publishable key + cookie handling, no Node-only APIs. **Never** put the service-role client or `pgcrypto`/`bcryptjs` PIN-verification logic in middleware or any Edge-runtime route — those must run in a Node.js runtime Route Handler/Server Action where the service-role key is safe and (if using `bcryptjs`) native-adjacent crypto behaves predictably. |

## Sources

- Context7 `/supabase/ssr` — middleware/server-client cookie patterns, `getClaims()` usage in middleware
- Context7 `/once-ui-system/core`, `/once-ui-system/nextjs-starter` — install/peer deps, Providers pattern, project structure
- Context7 `/amannn/next-intl` — routing config, `localePrefix`, middleware setup
- npm registry (`npm view`) — live version numbers for `next`, `@once-ui-system/core`, `@supabase/ssr`, `@supabase/supabase-js`, `next-intl`, `zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `bcryptjs`, `@tanstack/react-query` — HIGH confidence, directly queried at research time (2026-09-04)
- Supabase Docs: [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) — fetched directly, HIGH confidence on individual mechanics, MEDIUM on their combination as a recipe
- [Custom claims: app_metadata or new key? · supabase discussion #30381](https://github.com/orgs/supabase/discussions/30381) — community guidance against nesting custom claims in `app_metadata` via hooks
- WebSearch (multiple 2026 sources, cross-referenced) — `@supabase/auth-helpers-nextjs` deprecation status, `next-intl` vs `next-i18n-router` positioning, Next.js 16 production-readiness, `getUser()` vs `getClaims()` semantics — MEDIUM confidence, not single-sourced
- [Supabase RLS troubleshooting: service role bypass](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — confirms service-role client always bypasses RLS, foundational to Pattern A

---
*Stack research for: Condo/HOA payment-management app (condominio-app / ASOBARCELONA)*
*Researched: 2026-09-04*

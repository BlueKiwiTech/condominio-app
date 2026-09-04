# Pitfalls Research

**Domain:** Condo/HOA payment-management app — Next.js 14 App Router + Supabase, dual auth (Supabase Auth for admins, custom PIN auth for residents), multi-currency, recurring/divisible dues (cuotas)
**Researched:** 2026-09-04
**Confidence:** MEDIUM-HIGH (RLS/auth and Next.js/Supabase integration patterns verified against current official docs and multiple 2025-2026 sources; financial-logic and cuota-generation pitfalls are HIGH confidence from direct schema/spec analysis; domain-specific HOA-software post-mortems are LOW confidence — this is a narrow niche with little public writing)

## Critical Pitfalls

### Pitfall 1: RLS policies can't see resident "users" because residents never touch `auth.uid()`

**What goes wrong:**
`house_residents` rows are not rows in `auth.users`. Supabase RLS policies are built almost entirely around `auth.uid()` / `auth.jwt()`, which are only populated for a session that Supabase Auth itself issued. If the resident PIN-login flow just checks the PIN server-side and drops a "logged in" flag in a custom cookie/session (not a Supabase session), then when a client-side Supabase call is made with the anon key, `auth.uid()` is NULL and `auth.role()` is `anon`. Any RLS policy written as `USING (house_id = (SELECT house_id FROM house_residents WHERE id = auth.uid()))` will silently return zero rows for every resident — the "looks done" trap — or, worse, someone "fixes" the empty-list bug by loosening the policy to `USING (true)` or by querying with the service role key from a client-exposed API route, which opens every house's financial data to every resident.

**Why it happens:**
Almost all Supabase RLS tutorials assume Supabase Auth is the only identity system. Teams build the resident flow last, discover RLS blocks it, and reach for the fastest fix under deadline pressure (service role in an unscoped API route, or `USING (true)`) rather than redesigning the auth boundary.

**How to avoid:**
Pick ONE deliberate pattern up front, don't discover it mid-build:
- **Option A (recommended for this project's complexity/scale):** Treat RLS as defense-in-depth, not the primary authorization boundary for residents. Resident-facing pages never call Supabase directly from the browser. All resident data access goes through Next.js server-side route handlers that (1) validate the resident's server-side session (httpOnly cookie containing a signed resident session token, verified server-side), (2) read `house_id` from that verified session — never from client input — and (3) query Supabase using the service role key with an explicit `.eq('house_id', session.house_id)` filter in every query. RLS is still enabled on all tables (blocks anon/public access entirely by default), but the resident authorization decision is made in trusted server code, not in a Postgres policy keyed off `auth.uid()`.
- **Option B (more "Supabase-native," more complexity):** Mint a custom Supabase-compatible JWT for residents after PIN verification, signed with the project's JWT secret (or via Supabase's Third-Party Auth / custom JWT signing key support), with custom claims `{ role: 'resident', house_id, resident_id }`. RLS policies then read `(auth.jwt() ->> 'house_id')::uuid = house_id`. This gets real RLS enforcement for residents but requires careful JWT minting, expiry, and refresh handling outside Supabase Auth's built-in flows.
- Never let the anon key + a resident-context Supabase client hit tables directly without one of the two patterns above. Never use the service role key in any code path reachable from the browser.
- Write RLS policies for `admin` role using `auth.uid()` normally (this part is standard Supabase Auth and works out of the box) — only the resident side needs the special-case design.

**Warning signs:**
- Resident dashboard shows empty/zero data for a real resident with real payments (RLS silently blocking).
- Any policy with `USING (true)` on `payments`, `cuotas`, or `house_residents`.
- `SUPABASE_SERVICE_ROLE_KEY` referenced anywhere under `app/(resident)/` or in any client component.
- A resident API route accepts `house_id` from the request body/query string instead of deriving it from a verified server-side session.

**Phase to address:**
Foundational/auth phase, before any resident-facing feature is built. This is architecture, not a detail — decide Option A vs B before writing the first resident query, and write it into the phase's acceptance criteria (e.g., "resident cannot access another house's data even with a hand-crafted request").

---

### Pitfall 2: Naive saldo/morosos SQL silently sums across currencies or double-counts partial payments

**What goes wrong:**
The spec's formula `saldo = SUM(payments.amount_paid) - SUM(cuotas.amount)` is correct only when grouped by currency. A single `SUM()` over a house's payments without a `GROUP BY currency` (or a `WHERE currency = ?` per calculation) will add USD + Bs + USDT amounts together into one meaningless number — e.g., $50 + Bs 1,800,000 = "1,800,050," a catastrophic and hard-to-notice bug because it produces a number, not an error. Similarly, the morosos query `WHERE start_date <= today AND NOT EXISTS (payment for this cuota)` breaks the moment a resident partially pays a cuota (pays $30 of a $50 cuota) — a single "any payment exists" check marks it as paid when it's actually still partially owed, and a "no payment exists" check marks a fully-paid cuota as delinquent if the payment used a different linkage path (e.g., a payment spanning multiple cuotas).

**Why it happens:**
The handoff spec's pseudocode (`SUM(payments) - SUM(cuotas)`, `NOT EXISTS (payment)`) is a simplification that reads as complete but omits the currency grouping and doesn't account for partial payments or the payments-can-cover-multiple-cuotas flow described in feature #3 ("register payment against one or more pending cuotas"). Developers implement the pseudocode literally because it's given as "the business logic," not flagged as needing hardening.

**How to avoid:**
- Every saldo/balance query must `GROUP BY currency` and return a per-currency array/map, never a single scalar. Enforce this at the type level: `Saldo` type should be `{ currency: Currency; amount: number }[]`, never a bare `number`.
- Model cuota status as a derived value from a proper join, not existence-of-any-payment: track `amount_paid_so_far` per cuota (either a materialized column updated transactionally on payment insert, or a live `SUM` join against a payment-to-cuota linkage) and compare to `cuota.amount`. Status = `paid` when `amount_paid_so_far >= amount`, `partial`/`advance` when `0 < amount_paid_so_far < amount`, `pending`/`overdue` when `amount_paid_so_far = 0`.
- Since a single payment can cover multiple cuotas (per feature spec), you need a join table (`payment_cuotas` or similar) rather than the single `cuota_id` FK shown in the handoff schema's `payments` table — the schema as given only supports one cuota per payment. Flag this schema gap early: either add a join table, or constrain the UI so one payment = one cuota and handle "pay for several at once" as multiple payment rows created in one transaction.
- Add a DB constraint or app-level assertion that a payment's `currency` matches every cuota it's applied against — reject mismatches server-side, don't rely on UI-only validation (the UI can be bypassed via direct API calls).
- Write a unit test with fixtures for: same house, mixed currencies, partial payment, payment spanning multiple cuotas, payment made in advance of due date. Assert saldo output shape and morosos inclusion/exclusion for each.

**Warning signs:**
- Any function/query with `SUM(...)` on `amount` or `amount_paid` that has no `currency` filter or `GROUP BY currency` nearby.
- Morosos or saldo calculated with `NOT EXISTS (SELECT 1 FROM payments WHERE cuota_id = ...)` — this can't represent partial payment.
- No test fixture where a house has payments in more than one currency.
- Payments table has only a single `cuota_id` FK with no join table, yet the payment form UI allows selecting multiple cuotas.

**Phase to address:**
Core financial-logic phase (should be an early, dedicated phase per PROJECT.md's stated core value: "admin can always answer who owes what"). This logic should be built and tested in isolation (pure functions over fixture data) before wiring to UI, since it's the thing that must be provably correct.

---

### Pitfall 3: Recurring/divisible cuota generation produces duplicate, missing, or misdated installment records

**What goes wrong:**
Generating N cuota records from one "recurring cuota" form submission (feature #1) or splitting a special cuota into children (feature #2) is a multi-row insert triggered by a single user action. Three concrete failure modes: (a) **double-click/retry duplication** — the admin double-clicks "Save," or a slow network causes a client-side retry, and the API route runs twice, creating 2×N cuota rows with no unique constraint to stop it; (b) **partial failure leaves orphaned children** — the insert of N installments isn't wrapped in a transaction, fails on installment 7 of 12 (e.g., a constraint violation), and now 6 cuotas exist with no way to tell the batch was incomplete, and no parent to clean up against; (c) **staggered date math drifts** — computing each installment's due date by repeatedly adding a cadence interval (`addMonths`, `addWeeks`) in a loop is sensitive to month-length differences (a `monthly` cuota starting Jan 31 silently becomes Feb 28, Mar 28, Mar 31... instead of end-of-month) and to timezone bugs in date arithmetic (see Pitfall 4) that can shift a due date by one day, which then miscategorizes the cuota's overdue status.

**Why it happens:**
The bulk-insert nature of this feature isn't obvious from the form UI (admin sees one "Save" button, not "12 records will be created"), so it doesn't get the same scrutiny as a single-row insert. `parent_cuota_id` self-reference in the schema also invites recursive/looped generation code, which is more failure-prone than a flat loop with pre-computed dates.

**How to avoid:**
- Wrap the entire batch insert (parent + all children, or all recurring installments) in a single DB transaction (Supabase supports this via a Postgres function/RPC, or by using the JS client's transaction-safe RPC call rather than N sequential `.insert()` calls from the client). All-or-nothing: either all installments exist or none do.
- Generate an idempotency key for the "create recurring/split cuota" action (e.g., a client-generated UUID sent with the request, or a hash of `admin_id + form values + timestamp-rounded-to-second`), and check-and-store it server-side before insert so a retried/duplicated request is a no-op on the second call, not a second batch.
- Precompute the full list of due dates before inserting anything, using a pinned reference date and cadence-aware arithmetic (`date-fns`' `addMonths`/`addWeeks`/`addYears`, which correctly clamp month-end overflow) rather than iteratively mutating a running date — compute `installments.map((_, i) => addMonths(startDate, i))`, not a loop that keeps calling `addMonths` on the previous result (both work for `date-fns` specifically since it doesn't mutate, but be explicit about which is intended so a future refactor doesn't introduce a mutating loop).
- Give the DB a safety net: a partial unique index like `UNIQUE (parent_cuota_id, installment_number)` (add an `installment_number` column if not already implicit) so a duplicate-generation bug fails loudly at the DB level instead of silently creating extra rows.
- Test explicitly: generate a 12-installment monthly cuota starting Jan 31 and assert all 12 dates are what a human expects (documented decision: does month-end clamp to last day, or shift to a fixed day-of-month like the 1st?). This is a business decision the spec doesn't make — resolve it explicitly rather than let it fall out of whatever `date-fns` does by default.

**Warning signs:**
- Cuota-creation API route does N separate `supabase.from('cuotas').insert(...)` calls in a loop instead of one batch insert or one transactional RPC.
- No unique constraint exists that would catch a duplicate installment.
- Due-date generation code calls a date-math function on its own previous output inside a loop, rather than computing each date from the fixed start date + offset.
- No documented answer to "what happens to a monthly cuota's due date when the start date is the 29th/30th/31st."

**Phase to address:**
Cuota-management phase, specifically before the "recurring cuota" and "divisible special cuota" creation UIs ship. Should be covered by a dedicated backend function with unit tests, built and verified before the form UI is wired to it.

---

### Pitfall 4: JS `Date` / Postgres `DATE` timezone mismatch shifts due dates and "days overdue" by one

**What goes wrong:**
`cuotas.start_date` and `payments.payment_date` are Postgres `DATE` columns (no time, no timezone) — but the JS layer (Next.js server, `date-fns`, browser) works in `Date` objects, which are always timezone-aware instants. Common failure: `new Date('2026-03-01')` parses as UTC midnight, then formatting it with a locale-aware formatter in a timezone behind UTC (e.g., any Venezuela-adjacent timezone, UTC-4) renders it as Feb 28. Conversely, `new Date().toISOString().split('T')[0]` used to default a payment's date to "today" returns the UTC date, which can already be tomorrow (or still be yesterday) relative to the admin's local wall-clock time, especially for actions taken late evening. "Days overdue" calculated as a raw difference between two `Date` instants (rather than calendar-day difference) is vulnerable to the same off-by-one plus DST-adjacent artifacts.
Since the app's whole reason to track "days overdue" and month/year reports is due-date accuracy, an off-by-one here directly corrupts the morosos list (a cuota due today showing as "1 day overdue," or a cuota due tomorrow not showing as overdue when local time has already crossed midnight).

**Why it happens:**
Postgres `DATE` and JS `Date` are semantically different types (a calendar date with no timezone vs. a specific instant), and virtually every JS date library and the native `Date` object silently coerce a "date-only" string into a timezone-bound instant. This is a well-documented class of bug, not specific to this project, but it bites hardest exactly in this app's core feature (overdue tracking).

**How to avoid:**
- Treat all `DATE` columns as plain strings (`'2026-03-01'`) throughout the stack wherever possible — never round-trip them through `new Date(...)` unless immediately about to do calendar math, and when you do, use `date-fns`'s `parseISO` (which is more predictable than the native constructor) or, better, work entirely in "calendar day" comparisons using `date-fns`'s `differenceInCalendarDays` (not `differenceInDays`, which is instant-based) for "days overdue."
- Decide and document a single reference clock for "today" in server logic (e.g., always derive "today" server-side from the server's own date, formatted as `yyyy-MM-dd` in a fixed timezone appropriate to the community — likely `America/Caracas`, not UTC and not the deploying server's arbitrary timezone) rather than trusting client-supplied "today."
- When defaulting a payment's date to "today" in a form, compute it server-side or via a timezone-explicit helper (`formatInTimeZone(new Date(), 'America/Caracas', 'yyyy-MM-dd')` using `date-fns-tz`), not `new Date().toISOString().split('T')[0]`.
- Add a regression test: a cuota due "today" (server's America/Caracas today) must not appear in morosos; a cuota due yesterday must appear with `days_overdue = 1`.

**Warning signs:**
- Any use of `new Date(dateString)` followed immediately by formatting for display, without an explicit timezone.
- `toISOString().split('T')[0]` used anywhere to compute "today's date" for display or defaults.
- "Days overdue" computed via millisecond subtraction (`(today.getTime() - dueDate.getTime()) / 86400000`) instead of a calendar-day-aware library function.
- No explicit project-wide timezone constant/config.

**Phase to address:**
Should be settled as a small shared utility (`lib/dates.ts`) in the foundational/setup phase, before cuota generation or morosos logic is built, since both depend on correct date handling. Re-verify in the reports/morosos phase with the regression test above.

---

### Pitfall 5: 4-digit resident PIN is brute-forceable without explicit rate limiting — bcrypt hashing alone is not enough

**What goes wrong:**
A 4-digit PIN has only 10,000 possible values. Bcrypt (correctly used, per PROJECT.md's stated requirement) makes offline/stolen-hash cracking slow, but it does nothing to stop an *online* brute-force attack against the live login endpoint — an attacker can simply POST all 10,000 PIN values for a known house selection within seconds to minutes if there's no throttling, because the constraint isn't hash-cracking speed, it's the tiny keyspace. The spec calls out PIN hashing but doesn't call out rate limiting, so it's easy to ship a "secure" (hashed) PIN system that's trivially breakable at the endpoint level.

**Why it happens:**
"Hash the password" is the well-known, oft-repeated security lesson; rate limiting is a separate, less-repeated lesson, and small-keyspace PINs need it far more urgently than normal passwords do (10,000 combinations vs. billions).

**How to avoid:**
- Implement per-house (and/or per-IP) failed-attempt rate limiting on the resident login route: e.g., lock out further attempts for that house selection after 5 consecutive failures, with an increasing backoff (or a fixed lockout window, e.g., 15-30 minutes), independent of source IP (since attackers can rotate IPs but the house selection is the fixed target).
- Log failed attempts (ties into the `audit_logs` table already in the schema) so repeated attack patterns are visible even without a UI to browse them yet.
- Consider requiring a longer PIN (6 digits) or an alphanumeric "simple password" option (the spec already allows "4 digits or simple password" — default to the more secure option, or at minimum communicate the tradeoff instead of defaulting silently to 4 digits).
- Never leak "house exists" vs. "house doesn't exist" vs. "wrong PIN" distinctions in a way that helps an attacker fine-tune guesses (generic "invalid house or PIN" error).
- Keep this off the client entirely — rate limiting must be enforced server-side (a Next.js route handler check against a store like a `login_attempts` table or an edge rate-limiter), never trust a client-side attempt counter.

**Warning signs:**
- Resident login route has no failed-attempt counter or lockout logic.
- Login error messages differentiate "house not found" from "wrong PIN" (attacker information leak).
- No test exercises "11th failed attempt in a row should be blocked."

**Phase to address:**
Auth/foundational phase, alongside the PIN hashing implementation itself — these two are one unit of work, not sequential phases, since hashing without rate limiting is a false sense of security.

---

### Pitfall 6: Mixing Supabase browser client and server client breaks admin sessions unpredictably

**What goes wrong:**
`@supabase/ssr` (the current recommended package for Next.js App Router + Supabase) requires three cooperating pieces: a browser client (client components), a server client built from `cookies()` (Server Components / Route Handlers), and middleware that refreshes the auth token cookie on every request. Using the browser client inside a Server Component always yields an empty/null session (it can't read httpOnly cookies the way the server client does), and skipping or misconfiguring the middleware means tokens silently expire without refreshing — admins get logged out mid-session or see `AuthSessionMissingError` intermittently even with a seemingly valid cookie present, a known open issue with `@supabase/ssr` in recent Next.js versions. A second common mistake is using `supabase.auth.getSession()` to gate protected admin pages/middleware — `getSession()` reads the (possibly stale, unverified) cookie without contacting the Auth server, so it can be trusted for UI state but must NOT be used as the actual access-control check; `getUser()` is the one that revalidates against the Auth server and is safe to use for authorization decisions.

**Why it happens:**
The App Router's split between Server/Client Components is unintuitive for anyone coming from a single-context auth model, and Supabase's own docs/examples have shifted across package versions (`auth-helpers-nextjs` → `@supabase/ssr`), so older tutorials/StackOverflow answers show outdated, incompatible patterns.

**How to avoid:**
- Follow the current official `@supabase/ssr` setup exactly: separate `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (server, using `createServerClient` + `cookies()` from `next/headers`, remembering `cookies()` must be awaited in current Next.js versions), plus middleware that calls `supabase.auth.getUser()` (not `getSession()`) and refreshes cookies on every request.
- Use `getUser()`, never `getSession()`, in middleware and any server-side code that makes an authorization decision (admin-only route gating, RLS-adjacent checks). Reserve `getSession()` for non-security-critical client-side UI state only.
- Don't hand-roll a third auth context for admins alongside the resident PIN session — keep the two systems (Supabase Auth for admin, custom session for resident) cleanly separated in middleware routing logic (e.g., route-group-based: `(admin)` routes check Supabase session via `getUser()`, `(resident)` routes check the custom resident session cookie) so debugging one doesn't require reasoning about the other.

**Warning signs:**
- Any `createBrowserClient` (or the old `createClientComponentClient`) used inside a file without `'use client'`, or inside a Server Component/Route Handler.
- `getSession()` used inside `middleware.ts` or inside any route handler that gates access to data.
- Admins reporting random logouts or flaky "not authenticated" errors despite just having logged in.

**Phase to address:**
Foundational/auth-setup phase, before either admin or resident features are built — this is infrastructure both auth flows sit on top of.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Single `cuota_id` FK on `payments` (as in handoff schema) instead of a `payment_cuotas` join table | Simpler schema, faster to scaffold | Can't represent "one payment covers multiple cuotas" (a stated feature) without workarounds (creating N payment rows per cuota, losing the "this was really one transaction" fact) | Only acceptable if the payment form is constrained to one cuota per payment — otherwise fix before building the payment-registration feature |
| Computing saldo/morosos live via SQL aggregation on every dashboard load, no caching | No cache-invalidation bugs, always fresh | Fine at this scale (one community, dozens of houses) — not a real cost here | Always acceptable at this project's scale; do not add caching preemptively |
| Storing currency as free-text `VARCHAR` with a `CHECK` constraint (as in handoff schema) instead of a Postgres `ENUM` | Simple, matches given spec exactly | Slightly weaker type safety in generated TS types (string vs. literal union enforced by DB); typos possible if constraint is ever dropped | Acceptable — the CHECK constraint plus a TS `type Currency = 'USD' \| 'Bs' \| 'USDT'` union gives equivalent safety without ENUM migration pain |
| Skipping idempotency keys on cuota-batch-generation in the MVP | Faster to ship | Real risk of duplicate cuota batches from double-clicks/retries — directly corrupts the core "who owes what" value prop | Never acceptable — this is cheap to add (one column + one check) and the failure mode is severe and hard to spot after the fact |
| Deferring rate limiting on resident PIN login | Faster to ship auth | Live brute-forceable 4-digit PIN endpoint | Never acceptable for production — acceptable only behind a feature flag / not-yet-deployed state |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Supabase RLS | Testing policies via the SQL Editor or with the service role key, concluding "it works," then finding it fails for real anon/resident traffic — SQL Editor and service role both bypass RLS entirely | Test every policy using the actual anon key through the client SDK (or `SET ROLE authenticated; SET request.jwt.claims = '...'` in a psql session) for each of SELECT/INSERT/UPDATE/DELETE |
| Supabase RLS | Enabling RLS on a table with zero policies and assuming that's "secure" — it actually just makes the table return nothing to anyone, which can look like a data bug rather than a security state | After enabling RLS, immediately add explicit policies for every role/operation the table needs; verify by testing as each role |
| `@supabase/ssr` + Next.js middleware | Forgetting middleware, or misordering middleware matcher config, so the auth cookie never refreshes and sessions randomly expire | Copy Supabase's current official Next.js App Router middleware template exactly; keep the matcher broad enough to cover all routes needing session refresh |
| date-fns + Postgres DATE | Passing a Postgres `DATE` string through `new Date()` then formatting with a locale/timezone-aware formatter, shifting the displayed date by one day | Keep dates as `yyyy-MM-dd` strings until the moment of calendar-math, use `parseISO`/`differenceInCalendarDays`, pin a project timezone for "today" |
| Once UI (component library) | Assuming full API parity with a more mainstream library (shadcn/MUI) and not checking Once UI's actual current docs before building form/table/modal components around assumed props | Check Once UI's docs directly (via Context7 if available, else official docs) for the actual Button/Table/Modal/Select API before writing components against it — this project's design system choice was not verified in this research pass |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| RLS policies with subqueries on unindexed FK columns (e.g., `house_id` lookups inside a policy) | Dashboard/report queries feel sluggish as data grows | Add indexes on every column referenced inside an RLS policy's `USING`/`WITH CHECK` clause (`house_id` on `cuotas`, `payments`; resident lookup columns) | Noticeable once the community has a full year+ of monthly cuota history across all houses — a few thousand rows; still small in absolute terms for this project's scale, but cheap to prevent now |
| Recomputing morosos/report aggregates with N+1 per-house queries in application code instead of one grouped SQL query | Reports page slow, scales linearly with house count | Do aggregation in SQL (`GROUP BY house_id, currency`) in a single query/RPC, not a loop of per-house calls from the API route | Irrelevant at ~tens of houses, but costs nothing to do right the first time and avoids a rewrite |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Service role key used in any code path reachable from a resident-facing route without house-scoping | Any resident (or anyone who reaches that route) can read/write any house's financial data | Confine service-role usage to server-only files; always add explicit `.eq('house_id', verifiedHouseId)` filters even when using service role, as a defense-in-depth habit, not just relying on "it's server-only so it's fine" |
| Resident session/cookie storing `house_id` or `resident_id` in a client-readable, unsigned way (e.g., plain cookie value, localStorage) | Attacker edits the value to impersonate another house | Use a signed/encrypted httpOnly session cookie (e.g., via `iron-session`, or Supabase's own session mechanism if going the custom-JWT route) so the client cannot forge or read the house_id |
| PIN comparison done client-side or PIN sent as a query param/GET request | PIN exposed in logs, browser history, network tools | PIN submitted via POST body over HTTPS only, compared server-side against the bcrypt hash, never echoed back |
| No audit trail actually written for payment registration / cuota deletion despite `audit_logs` table existing in schema | Admin actions (including mistaken/malicious deletions of payment records) untraceable | Write to `audit_logs` synchronously (same transaction or immediately after) on every create/update/delete of `payments` and `cuotas`, even though there's no browsing UI for it yet in v1 |
| CORS/service role env vars accidentally exposed via `NEXT_PUBLIC_` prefix | Full database bypass of RLS from any browser | Grep for `SUPABASE_SERVICE_ROLE_KEY` before every deploy to confirm it's never prefixed `NEXT_PUBLIC_` and never appears in any client bundle |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Showing a single combined "saldo" number when a house has balances in multiple currencies | Residents/admins misread a meaningless summed number as their real balance | Always show saldo broken out per currency, even if one currency shows $0 — never silently omit or combine |
| "Days overdue" computed and displayed without stating the reference date/timezone | Confusion when a payment made "today" locally still shows as 1 day overdue due to timezone drift (Pitfall 4) | Show the due date explicitly alongside "days overdue" so residents can self-verify; use a consistent server-side "today" |
| Morosos list mixing currencies in one sorted table without grouping | Hard to tell if House A (owes $50) is "worse off" than House B (owes Bs 2,000,000) — not directly comparable | Group or filter the morosos view by currency, or show per-currency subtotals, rather than one flat cross-currency list |
| Payment form allowing selection of cuotas across different currencies for a single payment | Admin creates an invalid/ambiguous payment (which currency did they actually pay?) | Constrain cuota selection in the payment form to a single currency at a time — filter the pending-cuotas list by a currency selected first |
| Recurring cuota creation form gives no preview of generated installment dates before saving | Admin only discovers a month-end date-drift issue (Pitfall 3) after N records already exist, requiring manual cleanup | Show a preview list of computed due dates in the form before the admin confirms/saves |

## "Looks Done But Isn't" Checklist

- [ ] **Resident login:** Often missing rate limiting/lockout — verify by scripting 20 rapid failed PIN attempts against a test house and confirming the endpoint blocks/throttles well before attempt 10,000.
- [ ] **RLS on `payments`/`cuotas`/`house_residents`:** Often has SELECT policy but missing/wrong INSERT, UPDATE, DELETE policies (or a policy that only works for admins, silently blocking legitimate resident reads) — verify by testing all four operations as both an admin session and a resident-flow request using the anon key, not the service role or SQL Editor.
- [ ] **Saldo calculation:** Often "works" in manual demo testing with a single currency and single payment per cuota — verify with a fixture house that has payments in 2+ currencies and at least one partial payment.
- [ ] **Recurring cuota generation:** Often tested only with a start date on the 1st of a month — verify with a start date on the 29th/30th/31st for monthly cadence, and verify a double-click/duplicate-submit doesn't create 2x records.
- [ ] **"Days overdue"/morosos:** Often tested only during daytime in the developer's own timezone — verify behavior near local midnight and confirm the server timezone used for "today" matches the community's actual timezone.
- [ ] **Admin session persistence:** Often works during initial dev testing (fresh login every time) — verify a session survives a page refresh and an hour of idle time without unexpected logout (tests the middleware token-refresh setup, Pitfall 6).
- [ ] **Audit logs:** Table exists in schema but often nothing actually writes to it — verify a payment registration and a cuota deletion each produce a row in `audit_logs`.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Resident RLS silently blocking data (Pitfall 1) | LOW | Once the correct auth pattern is chosen, this is a targeted fix to the resident data-fetching layer — doesn't require data migration, just query/policy rework |
| Multi-currency sum bug already shipped and shown to users (Pitfall 2) | MEDIUM | Audit all balance-display code paths, add currency grouping, re-run against historical payment data to confirm corrected saldo matches manual spot-checks before re-announcing numbers to residents (trust repair, not just a code fix) |
| Duplicate cuota records from a generation bug (Pitfall 3) | MEDIUM-HIGH | Requires identifying and safely deleting extras without deleting ones that already have payments attached — write a one-off script that only deletes duplicate cuotas with zero associated payments, flag any with payments for manual admin review |
| Date/timezone off-by-one already affecting live morosos data (Pitfall 4) | LOW-MEDIUM | Fix the utility function, then re-run morosos/days-overdue calculation for all open cuotas — since it's derived data, not stored incorrectly (assuming `start_date` itself was stored correctly), a code fix self-corrects the display |
| PIN brute-forced, resident data exposed (Pitfall 5) | HIGH | Force-reset all resident PINs, add rate limiting immediately, review audit logs for suspicious access patterns, notify affected residents per standard incident-response practice |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| RLS blind spot for resident non-Supabase-Auth users | Foundational auth-architecture phase | A resident-flow integration test that hits Supabase using the anon key (not service role) and confirms correct house-scoped access and correct denial of other houses' data |
| Multi-currency summing / partial-payment status bugs | Core financial-logic phase (saldo/morosos as isolated, tested functions before UI) | Unit tests with multi-currency, partial-payment, and multi-cuota-payment fixtures, all passing before UI wiring begins |
| Recurring/divisible cuota duplicate or misdated generation | Cuota-management phase | Test: generate 12-month recurring cuota from a month-end start date, assert exact dates; test: simulate duplicate/retried request, assert no duplicate rows |
| Date/timezone handling | Foundational setup phase (shared date utility), re-verified in reports/morosos phase | Regression test pinned to a specific timezone confirming "today" boundary behaves correctly for morosos inclusion |
| PIN brute-force exposure | Auth phase, same unit of work as PIN hashing | Scripted rapid-attempt test confirms lockout triggers well before keyspace exhaustion |
| Supabase browser/server client mixing, session flakiness | Foundational auth-setup phase | Manual + automated check: admin session survives refresh and a simulated token-near-expiry window without unexpected logout |

## Sources

- [Supabase Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Custom Claims & Role-based Access Control (RBAC) | Supabase Docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Token Security and Row Level Security | Supabase Docs](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Integrating a custom auth flow with Supabase client while taking advantage of RLS — GitHub Discussion #1849](https://github.com/supabase/supabase/discussions/1849)
- [Connect Supabase with any Auth Provider — Authgear](https://www.authgear.com/post/supabase-any-auth-provider/)
- [Setting up Server-Side Auth for Next.js | Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [@supabase/ssr: AuthSessionMissingError in Next.js 14.2+/15 — GitHub Issue #107](https://github.com/supabase/ssr/issues/107)
- [Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps — makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [10 Common Supabase Security Misconfigurations and How to Fix Them — DEV Community](https://dev.to/victor_yrazusta/10-common-supabase-security-misconfigurations-and-how-to-fix-them-do8)
- [Silent timezone bugs in JS date arithmetic — Anish Gandhi](https://anishgandhi.com/silent-timezone-bugs-javascript-date/)
- [Store UTC Dates in Postgres with JavaScript — Jake Trent](https://jaketrent.com/post/store-utc-dates-postgres-javascript/)
- [Do not return DATE fields as Javascript Date — node-pg-types Issue #50](https://github.com/brianc/node-pg-types/issues/50)
- [Multi-currency ledger issue example — Dolibarr Issue #17462](https://github.com/Dolibarr/dolibarr/issues/17462)
- [Handle Currencies | Fragment Docs](https://fragment.dev/guides/handle-currencies)
- [Insufficient Account Lockout Mechanisms — Sourcery Security Vulnerability Database](https://www.sourcery.ai/vulnerabilities/insufficient-account-lockout)
- [Idempotency Keys: The API Pattern That Saves You From Duplicate Payments — DEV Community](https://dev.to/apikumo/idempotency-keys-the-api-pattern-that-saves-you-from-duplicate-payments-and-phantom-records-51b2)
- Direct analysis of `/Users/gabrielvega/Projects/agasocial/renata/condominio-app/docs/handoff-prompt.md` schema and business-logic pseudocode (project-specific findings: single `cuota_id` FK vs. multi-cuota payment feature conflict, unqualified `SUM()` pseudocode, `NOT EXISTS`-based morosos detection)

---
*Pitfalls research for: condo/HOA payment-management app (condominio-app)*
*Researched: 2026-09-04*

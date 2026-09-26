# Recurring Horizon Generation (Cuotas + Gastos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify recurring cuotas and fixed gastos onto one open-ended, rolling-horizon generation model — both generate immediately at creation through a computed horizon, then a daily cron per domain extends that horizon forward indefinitely, with no admin-entered installment count and no upper bound.

**Architecture:** One shared pure formula (`computeHorizonEnd`) decides how far to generate. Cuotas gets a new per-template generation function (`generateRecurringCuotaInstallments`, per-house fan-out, bulk-upserts one row per house per due date) called once at creation and looped by a new daily cron route. Gastos' existing cron loop is extracted into a reusable function (`topUpFixedExpense`) with the same two call sites, changing only its stop condition from "catch up to today" to "generate through the horizon." Legacy recurring cuota templates (real `number_of_installments`) and every special/variable template are structurally excluded from the new code paths by a `number_of_installments IS NULL` / `kind = 'fixed'` gate — no retrofit, no backfill.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + `@supabase/ssr` admin client + service-role client for crons), Zod, date-fns. No test runner exists in this repo — verification is manual/behavioral (throwaway Node scripts for pure math, `npm run build` + `npx eslint .` for type/lint safety, live dev-server checks for cron routes and UI), matching how every prior phase in this codebase was verified.

**Spec:** `docs/superpowers/specs/2026-09-26-recurring-horizon-generation-design.md`

## Global Constraints

- Horizon formula (identical for both domains, both at creation and by cron): `computeHorizonEnd(today) = max(Dec 31 of today's calendar year, today + 6 months)`.
- In scope: `condo_expense_templates` rows with `kind='fixed'`; `condo_installment_templates` rows with `installment_type='recurring'` **created after this ships**.
- Out of scope, must remain untouched: variable gastos, special cuotas (single or divided), and every recurring cuota template that already exists today (its fixed count and already-generated rows are left exactly as they are — no backfill migration, no reinterpretation).
- One generation function per domain is the single source of truth for its math, called from exactly two places (the create action, once; the daily cron, looped) — never a second, divergent implementation of the same stepping logic.
- Cuota/installment generation must stay transactional (one bulk INSERT per top-up) and idempotent (existing `unique(template_id, house_id, installment_number)` / `unique(template_id, period_date)` constraints + `upsert(..., { ignoreDuplicates: true })`).
- A defensive `MAX_PERIODS_PER_TEMPLATE` cap (400, matching the existing gastos cron's value) guards every new generation loop against a malformed/non-advancing cadence.
- Calendar-day-safe date math only (`date-fns`), never raw UTC string splitting (CLAUDE.md / PLAN.md RPRT-05).
- Never sum amounts across USD/Bs/USDT anywhere this plan touches reporting-adjacent code (not directly relevant here, but standing repo-wide rule).
- Migrations are written in this repo but **pushed live by the user** via the Supabase Dashboard SQL Editor (or their own CLI session) — never assume a migration in `supabase/migrations/` is live against the production project.
- `vercel.json`'s cron array gains a third entry; Vercel allows up to 100 cron jobs per project on every plan including Hobby, with a once-per-day-per-job restriction on Hobby — a daily `"0 6 * * *"` schedule satisfies that.

## Review Focus

- **Year-boundary horizon correctness:** a template created in January must generate through Dec 31 (~11.5 months), one created in October must generate through today+6 months (further out than bare year-end, ~8-9 months) — the whole point of the `max()` formula; a sign error here means an admin sees a stub schedule or an unexpectedly huge one. Covered in Task 2.
- **Idempotency under retry:** calling the generation function (or the cron route) twice in a row for the same template — same day, or a retried request — must not create duplicate installment/expense rows. Covered in Tasks 3, 5, 8.
- **Legacy isolation:** an existing recurring cuota template (real `number_of_installments`, not `NULL`) must be completely invisible to the new cron query and the new generation function — its row count must be unchanged after the cron runs. Covered in Tasks 3, 6, 8.
- **Per-house fan-out:** a new open-ended recurring cuota with N applicable houses must produce exactly N rows per generated due date, all sharing the same `due_date` and `installment_number`. Covered in Tasks 3, 8.
- **Credit sweep must fire on every top-up, not just creation.** A house that already carries a saldo a favor (credit) must have it auto-applied the moment a *cron-generated* installment appears months later, exactly as it already does for creation-time generation (PLAN.md Phase 5's locked decision, `lib/payments/creditSweep.ts`) — the design doc doesn't call this out explicitly, but omitting it would silently regress existing behavior for every open-ended cuota after its first cron top-up. Covered in Task 3 (sweep lives inside the shared generation function, so both callers get it for free) and Task 8.
- **Deactivating an open-ended template must stop future generation without touching history.** Existing (already-generated, possibly-paid) installments/expenses stay untouched and payable; only the cron's future selection of that template stops. Covered in Tasks 4, 6, 7, 8.

---

## File Structure

- **New:** `supabase/migrations/20260926060000_recurring_horizon_generation.sql` — schema change for cuotas (gastos needs none).
- **Modify:** `lib/cuotas/generate.ts` — add `computeHorizonEnd`, `computeNextRecurringDueDate`, `computeRecurringHorizonDueDates` (pure math, no Supabase).
- **Modify:** `lib/gastos/generate.ts` — re-export `computeHorizonEnd` (gastos already imports its cuota-shared pure helpers this way).
- **New:** `lib/cuotas/recurringGeneration.ts` — `generateRecurringCuotaInstallments`, the one per-template top-up function for cuotas (DB writes + credit sweep), called by both the create action and the new cron.
- **New:** `lib/gastos/topUp.ts` — `topUpFixedExpense`, extracted from the existing cron's inline loop, called by both `createExpenseTemplate` and the cron.
- **Modify:** `lib/validation/cuotas.ts` — drop `number_of_installments` from `recurringTemplateSchema` (open-ended now, no admin-entered count).
- **Modify:** `lib/actions/cuotas.ts` — `createInstallmentTemplate` branches recurring (new open-ended path) vs. special (unchanged); new `setInstallmentTemplateActive` action.
- **Modify:** `lib/actions/gastos.ts` — `createExpenseTemplate`'s `kind: 'fixed'` branch now generates immediately via `topUpFixedExpense` instead of generating nothing.
- **Modify:** `app/api/cron/generate-expenses/route.ts` — refactored to call `topUpFixedExpense` with a horizon stop condition instead of its old inline "catch up to today" loop.
- **New:** `app/api/cron/generate-cuotas/route.ts` — daily cron looping `generateRecurringCuotaInstallments` over every active open-ended recurring template.
- **Modify:** `vercel.json` — third cron entry.
- **Modify:** `components/cuotas/types.ts` — `TemplateWithInstallments` gains `active: boolean`; `number_of_installments` becomes `number | null`.
- **Modify:** `components/cuotas/CuotaFormClient.tsx` — recurring branch drops the "Número de cuotas" field, preview switches to horizon-computed dates, adds an explanatory line.
- **Modify:** `components/cuotas/CuotasPageClient.tsx` — active/inactive badge + Activar/Desactivar button per row.
- **Modify:** `app/[locale]/(admin)/cuotas/page.tsx` — select `active` alongside the template's other columns.
- **Modify:** `messages/es.json`, `messages/en.json` — new `cuotas.actions.activate`/`deactivate`, `cuotas.status.active`/`inactive`, `cuotas.form.recurringAutoGeneration` keys.

---

### Task 1: Schema migration — nullable installment count + active flag

**Files:**
- Create: `supabase/migrations/20260926060000_recurring_horizon_generation.sql`

**Interfaces:**
- Produces: `condo_installment_templates.number_of_installments` becomes nullable (`NULL` = open-ended); new `condo_installment_templates.active boolean not null default true`.

- [ ] **Step 1: Write the migration**

```sql
-- Recurring Horizon Generation (cuotas + gastos) design:
-- docs/superpowers/specs/2026-09-26-recurring-horizon-generation-design.md
--
-- Recurring cuotas move from a fixed admin-entered installment count
-- (generated once, in full, at creation) to an open-ended model matching
-- fixed gastos' existing shape: NULL installment count = indefinite,
-- topped up through a rolling horizon by a daily cron
-- (app/api/cron/generate-cuotas/route.ts). Every EXISTING recurring cuota
-- template already has a real number_of_installments value and is left
-- exactly as-is -- the new cuotas cron/generation function is gated on
-- `number_of_installments IS NULL`, so legacy rows (and every special
-- template, which always has a real count too) are structurally invisible
-- to it. No data backfill needed.
alter table condo_installment_templates alter column number_of_installments drop not null;

-- Mirrors condo_expense_templates.active exactly (20260909020000_gastos_schema.sql)
-- -- lets the admin stop an open-ended template's future generation without
-- deleting its history. Needed because deleteInstallmentTemplate (CUOT-06)
-- is a hard delete blocked once any payment exists, so it can't serve as
-- "pause this series." Defaulting every existing row to true is a no-op for
-- legacy/special templates, which the new cron never selects regardless of
-- this flag's value.
alter table condo_installment_templates add column active boolean not null default true;
```

- [ ] **Step 2: Verify the migration is syntactically self-contained**

Run: `grep -c "^alter table" supabase/migrations/20260926060000_recurring_horizon_generation.sql`
Expected: `2`

No existing `condo_installment_templates_number_of_installments_check` or similar constraint exists to conflict with the `drop not null` (confirmed: the original column is `int not null default 1` with no separate check constraint — see `supabase/migrations/20260906005943_initial_schema.sql:50`).

- [ ] **Step 3: Note the live-push action item (do not attempt to push it yourself)**

This migration follows the same "written here, pushed by the user" convention as every other migration in this project (see `CLAUDE.md`'s Infra/access notes) — do not attempt `supabase db push` or a direct `psql` connection against the live project. Surface this file's existence and purpose at the end of the plan's final task instead.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260926060000_recurring_horizon_generation.sql
git commit -m "Add nullable installment count + active flag for open-ended recurring cuotas"
```

---

### Task 2: Shared horizon math (pure, no Supabase)

**Files:**
- Modify: `lib/cuotas/generate.ts` (append after the existing `parseDateOnly` export, ~line 96)
- Modify: `lib/gastos/generate.ts:12` (re-export line)

**Interfaces:**
- Consumes: `Cadence`, `DueDateMode`, `computeDueDates` (all already defined in `lib/cuotas/generate.ts`).
- Produces: `computeHorizonEnd(today: Date): Date`, `computeNextRecurringDueDate(cadence: Cadence, lastDueDate: Date): Date`, `computeRecurringHorizonDueDates(cadence: Cadence, startDate: Date, horizonEnd: Date): Date[]` — consumed by Task 3 (`lib/cuotas/recurringGeneration.ts`), Task 5 (`lib/gastos/topUp.ts`'s cron caller and `lib/actions/gastos.ts`), Task 6 (`app/api/cron/generate-cuotas/route.ts`), and Task 7 (`CuotaFormClient.tsx`'s client-side preview).

- [ ] **Step 1: Add the three functions to `lib/cuotas/generate.ts`**

Insert after line 96 (`export function parseDateOnly...}`) and before the `GeneratedInstallment` type block:

```typescript
// Recurring Horizon Generation design (docs/superpowers/specs/2026-09-26-
// recurring-horizon-generation-design.md): both fixed gastos and open-ended
// recurring cuotas generate through this same computed horizon, re-evaluated
// fresh on every call using that call's "today" -- so the target rolls
// forward every year automatically, with no special-cased "new year" logic
// anywhere, and never collapses to less than 6 months out no matter when a
// template was created or how long it's been running.
const MAX_PERIODS_PER_TEMPLATE = 400;

export function computeHorizonEnd(today: Date): Date {
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const sixMonthsOut = addMonths(today, 6);
  return yearEnd > sixMonthsOut ? yearEnd : sixMonthsOut;
}

// The incremental step from one recurring due date to the next -- mirrors
// lib/gastos/generate.ts's computeNextPeriodDate shape, but (unlike gastos)
// preserves the existing day-1 forcing rule for monthly/quarterly/annual
// (unchanged from computeDueDates' 'recurring' branch above): weekly/
// biweekly step by a plain +7/+14 days with no day forcing (a week has no
// "day of month" concept to normalize).
export function computeNextRecurringDueDate(cadence: Cadence, lastDueDate: Date): Date {
  switch (cadence) {
    case 'weekly':
      return addWeeks(lastDueDate, 1);
    case 'biweekly':
      return addWeeks(lastDueDate, 2);
    case 'quarterly':
      return setDate(addMonths(lastDueDate, 3), 1);
    case 'annual':
      return setDate(addMonths(lastDueDate, 12), 1);
    default:
      return setDate(addMonths(lastDueDate, 1), 1);
  }
}

// Every due date a BRAND NEW open-ended recurring template would generate,
// from its own start_date through horizonEnd -- shared verbatim by the
// create-cuota form's live preview (components/cuotas/CuotaFormClient.tsx)
// and lib/cuotas/recurringGeneration.ts's "no installments exist yet"
// branch, so the preview can never diverge from what actually gets
// inserted. The first date reuses computeDueDates' own n=0 formula (count:
// 1) instead of re-deriving the day-forcing rule here, so it stays
// identical to the existing finite model's first-installment date; every
// date after that steps via computeNextRecurringDueDate.
export function computeRecurringHorizonDueDates(cadence: Cadence, startDate: Date, horizonEnd: Date): Date[] {
  const dates: Date[] = [];
  let next = computeDueDates({ kind: 'recurring', cadence }, startDate, 1)[0];
  while (next <= horizonEnd && dates.length < MAX_PERIODS_PER_TEMPLATE) {
    dates.push(next);
    next = computeNextRecurringDueDate(cadence, next);
  }
  return dates;
}
```

- [ ] **Step 2: Re-export `computeHorizonEnd` from `lib/gastos/generate.ts`**

Change line 12 from:
```typescript
export { splitAmount, toDateOnly, parseDateOnly };
```
to:
```typescript
export { splitAmount, toDateOnly, parseDateOnly, computeHorizonEnd };
```

And change line 7's import to include it:
```typescript
import { splitAmount, toDateOnly, parseDateOnly, computeHorizonEnd } from '@/lib/cuotas/generate';
```

- [ ] **Step 3: Write a throwaway verification script**

Create `/tmp/verify-horizon.ts` (outside the repo, deleted after — this project has no test runner, so pure-math verification is a one-off script run directly with Node's built-in TypeScript support, same as this project's own prior "manually sanity-checked... no test runner exists" verifications, e.g. `lib/payments/walletAllocation.ts`):

```typescript
import {
  computeHorizonEnd,
  computeNextRecurringDueDate,
  computeRecurringHorizonDueDates,
} from '/Users/gabrielvega/Projects/agasocial/renata/condominio-app/lib/cuotas/generate.ts';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}: expected ${e}, got ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`ok ${label}`);
  }
}

// Created in January: year-end (~11.5 months out) beats +6 months -> Dec 31.
assertEqual(
  computeHorizonEnd(new Date(2026, 0, 15)).toDateString(),
  new Date(2026, 11, 31).toDateString(),
  'horizon: January picks year-end',
);

// Created in October: +6 months (~April next year) beats bare year-end -> the floor wins.
assertEqual(
  computeHorizonEnd(new Date(2026, 9, 15)).toDateString(),
  new Date(2027, 3, 15).toDateString(),
  'horizon: October picks +6 months floor',
);

// Monthly cadence forces day-of-month to 1, including the first date, and steps by whole months.
assertEqual(
  computeNextRecurringDueDate('monthly', new Date(2026, 9, 1)).toDateString(),
  new Date(2026, 10, 1).toDateString(),
  'monthly step forces day 1',
);

// Weekly cadence never forces a day.
assertEqual(
  computeNextRecurringDueDate('weekly', new Date(2026, 9, 15)).toDateString(),
  new Date(2026, 9, 22).toDateString(),
  'weekly step is a plain +7 days',
);

// A monthly template started Oct 15 2026, horizon = Dec 31 2026 (Oct is
// closer to year-end than +6mo out per the case above... wait, use a
// January start so the horizon is unambiguously year-end for this check):
const dates = computeRecurringHorizonDueDates('monthly', new Date(2026, 0, 15), computeHorizonEnd(new Date(2026, 0, 15)));
assertEqual(dates.length, 12, 'monthly horizon from Jan 15 generates 12 installments through Dec');
assertEqual(dates[0].toDateString(), new Date(2026, 0, 1).toDateString(), 'first date forced to day 1 of the start month');
assertEqual(dates[dates.length - 1].toDateString(), new Date(2026, 11, 1).toDateString(), 'last date is Dec 1');
```

- [ ] **Step 4: Run it and confirm every line prints `ok`**

Run: `node /tmp/verify-horizon.ts`
Expected: 6 lines, every one prefixed `ok`, exit code 0. If any prints `FAIL`, fix the function (not the test) until every assertion in this script matches the design doc's own worked examples, then re-run.

- [ ] **Step 5: Delete the throwaway script**

Run: `rm /tmp/verify-horizon.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/cuotas/generate.ts lib/gastos/generate.ts
git commit -m "Add shared horizon-generation math for cuotas and gastos"
```

---

### Task 3: Cuotas generation function — `generateRecurringCuotaInstallments`

**Files:**
- Create: `lib/cuotas/recurringGeneration.ts`

**Interfaces:**
- Consumes: `computeNextRecurringDueDate`, `computeRecurringHorizonDueDates`, `toDateOnly`, `parseDateOnly` (Task 2, `lib/cuotas/generate.ts`); `sweepCreditForNewInstallments` (`lib/payments/creditSweep.ts`, existing); `AllocatableInstallment` type (`lib/payments/allocate.ts`, existing).
- Produces: `generateRecurringCuotaInstallments(supabase, template, horizonEnd): Promise<{ error: string | null; generatedCount: number; lastDueDate: string | null }>` and `OpenEndedRecurringTemplate` type — consumed by Task 4 (`lib/actions/cuotas.ts`) and Task 6 (`app/api/cron/generate-cuotas/route.ts`).

- [ ] **Step 1: Write the module**

```typescript
// lib/cuotas/recurringGeneration.ts
//
// The single per-template top-up function for OPEN-ENDED recurring cuotas
// (docs/superpowers/specs/2026-09-26-recurring-horizon-generation-design.md).
// Called from exactly two places: once, synchronously, right after a new
// template row is inserted (lib/actions/cuotas.ts's createInstallmentTemplate
// -- so the admin's list/preview is populated immediately, not tomorrow), and
// looped over every matching template by the daily cron
// (app/api/cron/generate-cuotas/route.ts). Idempotent via the existing
// unique(template_id, house_id, installment_number) constraint (upsert +
// ignoreDuplicates) -- safe to call twice for the same template/horizon.
//
// Legacy finite recurring templates (real number_of_installments) and every
// special template are structurally invisible to this path -- callers only
// ever pass a template whose number_of_installments is NULL (enforced by
// both call sites' own queries), never reinterpreted here.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNextRecurringDueDate,
  computeRecurringHorizonDueDates,
  toDateOnly,
  parseDateOnly,
  type Cadence,
  type Currency,
} from './generate';
import { sweepCreditForNewInstallments } from '@/lib/payments/creditSweep';
import type { AllocatableInstallment } from '@/lib/payments/allocate';

// Both callers (the admin's cookie-based client from lib/supabase/server.ts,
// and the cron's service-role client from lib/supabase/service.ts) are
// instances of the same underlying supabase-js class -- this project has no
// generated Database type, so every shared helper in lib/ types its client
// param loosely; this one is typed directly against the base class (rather
// than `Awaited<ReturnType<typeof createClient>>`, the pattern used by
// single-caller helpers like creditSweep.ts) since it must accept either.
type AnySupabaseClient = SupabaseClient<any, any, any>;

const MAX_PERIODS_PER_TEMPLATE = 400;

export type OpenEndedRecurringTemplate = {
  id: string;
  name: string;
  cadence: Cadence;
  amount: number;
  currency: Currency;
  start_date: string;
  applicable_houses: string[];
  created_by: string | null;
};

export async function generateRecurringCuotaInstallments(
  supabase: AnySupabaseClient,
  template: OpenEndedRecurringTemplate,
  horizonEnd: Date,
): Promise<{ error: string | null; generatedCount: number; lastDueDate: string | null }> {
  const { data: lastInstallment, error: lastError } = await supabase
    .from('condo_installments')
    .select('installment_number, due_date')
    .eq('template_id', template.id)
    .order('installment_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: lastError.message, generatedCount: 0, lastDueDate: null };

  let startingInstallmentNumber: number;
  let dueDates: Date[];

  if (lastInstallment) {
    // Resuming an already-generated series (the cron's normal case): step
    // forward from the last generated due date, never re-deriving the
    // first-installment date rule.
    startingInstallmentNumber = (lastInstallment.installment_number as number) + 1;
    dueDates = [];
    let next = computeNextRecurringDueDate(template.cadence, parseDateOnly(lastInstallment.due_date as string));
    while (next <= horizonEnd && dueDates.length < MAX_PERIODS_PER_TEMPLATE) {
      dueDates.push(next);
      next = computeNextRecurringDueDate(template.cadence, next);
    }
  } else {
    // Brand-new template (the create action's case): identical to the
    // client-side preview's computation (lib/cuotas/generate.ts's
    // computeRecurringHorizonDueDates), so the admin's preview can never
    // diverge from what actually gets inserted here.
    startingInstallmentNumber = 1;
    dueDates = computeRecurringHorizonDueDates(template.cadence, parseDateOnly(template.start_date), horizonEnd);
  }

  if (dueDates.length === 0) return { error: null, generatedCount: 0, lastDueDate: null };

  // One bulk upsert covering every house x every new due date -- a single
  // atomic INSERT statement (CUOT-05's "transactional generation"), same
  // pattern as the finite model's existing buildInstallmentRows insert.
  const rows = template.applicable_houses.flatMap((houseId) =>
    dueDates.map((date, idx) => ({
      template_id: template.id,
      house_id: houseId,
      installment_number: startingInstallmentNumber + idx,
      name: template.name,
      amount: template.amount,
      currency: template.currency,
      due_date: toDateOnly(date),
    })),
  );

  const { data: insertedRows, error: insertError } = await supabase
    .from('condo_installments')
    .upsert(rows, { onConflict: 'template_id,house_id,installment_number', ignoreDuplicates: true })
    .select('id, house_id, installment_number, due_date, amount');
  if (insertError) return { error: insertError.message, generatedCount: 0, lastDueDate: null };

  // PLAN.md Phase 5 decision ("saldo a favor is auto-applied to the next
  // cuota that becomes due") applies identically whether this top-up ran at
  // creation time or months later from the cron -- both are literally "a
  // cuota that didn't exist a moment ago" for the house in question. Grouped
  // per house, same shape as createInstallmentTemplate's existing sweep
  // loop for the finite model.
  const byHouse = new Map<string, AllocatableInstallment[]>();
  for (const row of insertedRows ?? []) {
    const list = byHouse.get(row.house_id as string) ?? [];
    list.push({
      id: row.id as string,
      amount: row.amount as number,
      amount_paid: 0,
      due_date: row.due_date as string,
      installment_number: row.installment_number as number,
    });
    byHouse.set(row.house_id as string, list);
  }
  for (const [houseId, newInstallments] of byHouse) {
    await sweepCreditForNewInstallments(supabase, {
      houseId,
      currency: template.currency,
      createdBy: template.created_by,
      newInstallments,
      paymentDate: toDateOnly(new Date()),
      notes: 'Aplicado automáticamente desde saldo a favor.',
    });
  }

  return { error: null, generatedCount: dueDates.length, lastDueDate: toDateOnly(dueDates[dueDates.length - 1]) };
}
```

- [ ] **Step 2: Confirm it compiles standalone**

Run: `npx tsc --noEmit lib/cuotas/recurringGeneration.ts --esModuleInterop --skipLibCheck --moduleResolution bundler --module esnext --target es2022 2>&1 | grep -v "Cannot find module '@/"`
Expected: no output (the `@/` alias errors are filtered out since they only resolve via the full Next.js build in Task 8 — this step only catches real syntax/type mistakes in the new file itself).

- [ ] **Step 3: Commit**

```bash
git add lib/cuotas/recurringGeneration.ts
git commit -m "Add generateRecurringCuotaInstallments for open-ended recurring cuotas"
```

---

### Task 4: Wire cuotas' create action + validation schema + active toggle

**Files:**
- Modify: `lib/validation/cuotas.ts:31-43` (`recurringTemplateSchema`)
- Modify: `lib/actions/cuotas.ts` (imports, `createInstallmentTemplate`, new `setInstallmentTemplateActive`)

**Interfaces:**
- Consumes: `generateRecurringCuotaInstallments`, `OpenEndedRecurringTemplate` (Task 3); `computeHorizonEnd` (Task 2).
- Produces: `setInstallmentTemplateActive(templateId: string, active: boolean, locale: string): Promise<ActionResult>` — consumed by Task 7 (`CuotasPageClient.tsx`). `CreateTemplateInput`'s `recurring` variant no longer has `number_of_installments` — consumed by Task 7 (`CuotaFormClient.tsx`).

- [ ] **Step 1: Remove `number_of_installments` from the recurring schema**

In `lib/validation/cuotas.ts`, replace lines 31-43:
```typescript
export function recurringTemplateSchema(t: Translator) {
  return z.object({
    installment_type: z.literal('recurring'),
    ...sharedFields(t),
    cadence: cadenceSchema,
    number_of_installments: z.coerce
      .number()
      .int()
      .min(1, t('minInstallments'))
      .max(360, t('maxInstallments')),
  });
}
export type RecurringTemplateInput = z.infer<ReturnType<typeof recurringTemplateSchema>>;
```
with:
```typescript
export function recurringTemplateSchema(t: Translator) {
  return z.object({
    installment_type: z.literal('recurring'),
    ...sharedFields(t),
    cadence: cadenceSchema,
  });
}
export type RecurringTemplateInput = z.infer<ReturnType<typeof recurringTemplateSchema>>;
```

`specialTemplateSchema` (lines 45-69) and every `minInstallments`/`maxInstallments`-referencing `.refine()` in `createTemplateSchema` (lines 71-98) are untouched — they only ever gate on `data.installment_type === 'special'`.

- [ ] **Step 2: Branch `createInstallmentTemplate` in `lib/actions/cuotas.ts`**

Add the new imports at the top (after the existing `lib/cuotas/generate` import on line 19):
```typescript
import { generateRecurringCuotaInstallments, type OpenEndedRecurringTemplate } from '@/lib/cuotas/recurringGeneration';
```

`computeHorizonEnd` also needs importing — add it to the existing `lib/cuotas/generate` import list on lines 12-19:
```typescript
import {
  buildInstallmentRows,
  computeDueDates,
  computeHorizonEnd,
  parseDateOnly,
  splitAmount,
  toDateOnly,
  type DueDateMode,
} from '@/lib/cuotas/generate';
```

Replace the body of `createInstallmentTemplate` from line 79 (`const isDivided = ...`) through the end of the function (line 183, `return { success: true };`) with:
```typescript
  if (data.installment_type === 'recurring') {
    const { data: template, error: templateError } = await supabase
      .from('condo_installment_templates')
      .insert({
        community_id: communityId,
        name: data.name,
        description: normalizeOptional(data.description),
        installment_type: 'recurring',
        cadence: data.cadence,
        amount: data.amount,
        currency: data.currency,
        start_date: data.start_date,
        number_of_installments: null,
        is_divided: false,
        applicable_houses: houseIds,
        created_by: userId,
      })
      .select('id')
      .single();

    if (templateError || !template) return { error: templateError?.message ?? tq('errors.createFailed') };

    const openEndedTemplate: OpenEndedRecurringTemplate = {
      id: template.id as string,
      name: data.name,
      cadence: data.cadence,
      amount: data.amount,
      currency: data.currency,
      start_date: data.start_date,
      applicable_houses: houseIds,
      created_by: userId,
    };

    const horizonEnd = computeHorizonEnd(new Date());
    const { error: generationError } = await generateRecurringCuotaInstallments(supabase, openEndedTemplate, horizonEnd);
    if (generationError) {
      // Same rollback rationale as the special-cuota path below: the
      // multi-row insert is its own atomic statement, but it isn't wrapped
      // in a single DB transaction with the template-row insert above
      // (Server Actions call PostgREST over HTTP, not a shared connection).
      await supabase.from('condo_installment_templates').delete().eq('id', template.id);
      return { error: generationError };
    }

    revalidatePath('/cuotas');
    revalidatePath('/pagos');
    return { success: true };
  }

  // installment_type === 'special' (single or divided) -- unchanged finite
  // model, generated in full at creation, no cron involved.
  const isDivided = data.is_divided;
  const count = isDivided ? data.number_of_installments : 1;
  const startDate = parseDateOnly(data.start_date);
  const mode = dueDateModeFor(data);
  // Admin-entered per-installment due dates (validated by createTemplateSchema
  // to have exactly `count` entries when divided) take precedence; fall back
  // to the cadence-derived baseline if the divided branch somehow didn't send
  // any (shouldn't happen given the schema's refine, but this keeps the
  // action safe on its own) -- same tolerance as `amounts` below.
  const customDueDates = data.due_dates;
  const dueDates =
    isDivided && customDueDates && customDueDates.length === count
      ? customDueDates.map(parseDateOnly)
      : computeDueDates(mode, startDate, count);
  // Admin-entered per-installment amounts (validated by createTemplateSchema
  // to sum to data.amount) take precedence; fall back to an even split if
  // the divided branch somehow didn't send any (shouldn't happen given the
  // schema's refine, but this keeps the action safe on its own).
  const customAmounts = data.amounts;
  const amounts = isDivided
    ? (customAmounts && customAmounts.length === count ? customAmounts : splitAmount(data.amount, count))
    : Array(count).fill(data.amount);

  const { data: template, error: templateError } = await supabase
    .from('condo_installment_templates')
    .insert({
      community_id: communityId,
      name: data.name,
      description: normalizeOptional(data.description),
      installment_type: 'special',
      cadence: null,
      amount: data.amount,
      currency: data.currency,
      start_date: data.start_date,
      number_of_installments: count,
      is_divided: isDivided,
      applicable_houses: houseIds,
      created_by: userId,
    })
    .select('id')
    .single();

  if (templateError || !template) return { error: templateError?.message ?? tq('errors.createFailed') };

  const rows = buildInstallmentRows({
    name: data.name,
    currency: data.currency,
    houseIds,
    dueDates,
    amounts,
  }).map((row) => ({ ...row, template_id: template.id }));

  // A single multi-row INSERT is one atomic SQL statement (CUOT-05:
  // transactional generation). upsert + ignoreDuplicates -> ON CONFLICT
  // (template_id, house_id, installment_number) DO NOTHING, backed by the
  // unique constraint from the initial schema migration -- idempotent
  // against a retried/double-submitted generation call (CUOT-05).
  //
  // Note: this is NOT wrapped with the template insert above in a single DB
  // transaction (Server Actions call PostgREST over HTTP, not a shared
  // connection/BEGIN block) -- if this second statement fails, the template
  // row is explicitly rolled back below instead, which covers the realistic
  // failure mode (the multi-row insert itself is atomic on its own).
  const { data: insertedRows, error: installmentsError } = await supabase
    .from('condo_installments')
    .upsert(rows, { onConflict: 'template_id,house_id,installment_number', ignoreDuplicates: true })
    .select('id, house_id, installment_number, due_date, amount');

  if (installmentsError) {
    await supabase.from('condo_installment_templates').delete().eq('id', template.id);
    return { error: installmentsError.message };
  }

  // PLAN.md Phase 5 decision: a house's saldo a favor (credit) is
  // "auto-applied to the next cuota that becomes due" — a freshly generated
  // installment IS exactly that case. Best-effort per house: a credit-sweep
  // failure here doesn't roll back the cuota that was just created (the
  // installments themselves are already valid pending rows either way).
  const byHouse = new Map<string, AllocatableInstallment[]>();
  for (const row of insertedRows ?? []) {
    const list = byHouse.get(row.house_id as string) ?? [];
    list.push({
      id: row.id as string,
      amount: row.amount as number,
      amount_paid: 0,
      due_date: row.due_date as string,
      installment_number: row.installment_number as number,
    });
    byHouse.set(row.house_id as string, list);
  }
  for (const [houseId, newInstallments] of byHouse) {
    await sweepCreditForNewInstallments(supabase, {
      houseId,
      currency: data.currency,
      createdBy: userId,
      newInstallments,
      paymentDate: toDateOnly(new Date()),
      notes: 'Aplicado automáticamente desde saldo a favor.',
    });
  }

  revalidatePath('/cuotas');
  revalidatePath('/pagos');
  return { success: true };
}
```

(The special-path body above is the original code, unchanged in substance — only `isDivided`/`count` no longer read `data.installment_type === 'recurring' ? ... : ...`, since this whole block now only ever runs for `installment_type === 'special'`.)

- [ ] **Step 3: Add `setInstallmentTemplateActive`**

Append after `deleteInstallmentTemplate` (end of file, after line 335):
```typescript

export async function setInstallmentTemplateActive(
  templateId: string,
  active: boolean,
  locale: string,
): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_installment_templates').update({ active }).eq('id', templateId);
  if (error) return { error: error.message };

  revalidatePath('/cuotas');
  return { success: true };
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: build succeeds. If TypeScript flags a mismatch between `AnySupabaseClient` (Task 3) and the admin client type passed in from `createInstallmentTemplate`, or between `sweepCreditForNewInstallments`'s own `SupabaseClient` alias and either client, resolve it in `lib/cuotas/recurringGeneration.ts` or `lib/payments/creditSweep.ts` (broaden the param type there, not by adding an `as any` cast in `lib/actions/cuotas.ts`) and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/cuotas.ts lib/actions/cuotas.ts
git commit -m "Make recurring cuotas open-ended: generate through a rolling horizon, drop admin-entered count"
```

---

### Task 5: Gastos — extract `topUpFixedExpense`, generate immediately at creation

**Files:**
- Create: `lib/gastos/topUp.ts`
- Modify: `app/api/cron/generate-expenses/route.ts` (full rewrite)
- Modify: `lib/actions/gastos.ts:79-86` (`createExpenseTemplate`'s `kind === 'fixed'` branch)

**Interfaces:**
- Consumes: `computeNextPeriodDate`, `toDateOnly` (existing, `lib/gastos/generate.ts`).
- Produces: `topUpFixedExpense(supabase, template, horizonEnd): Promise<{ error: string | null; generatedCount: number; lastPeriodDate: string | null }>`, `FixedExpenseTemplateForTopUp` type — consumed by the cron route below and by `createExpenseTemplate`.

- [ ] **Step 1: Write `lib/gastos/topUp.ts`**

```typescript
// lib/gastos/topUp.ts
//
// Extracted from app/api/cron/generate-expenses/route.ts's original inline
// loop (Recurring Horizon Generation design,
// docs/superpowers/specs/2026-09-26-recurring-horizon-generation-design.md)
// so the exact same top-up logic runs both at creation time (immediately,
// from lib/actions/gastos.ts's createExpenseTemplate) and daily from the
// cron -- one source of truth for "how a fixed gasto's periods are
// computed," same rationale the original cron's own code comment already
// established. Only the stop condition changed: `nextPeriodDate <= today`
// (catch up to now) became `nextPeriodDate <= horizonEnd` (generate ahead).
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeNextPeriodDate, toDateOnly, type Cadence, type Currency } from './generate';

type AnySupabaseClient = SupabaseClient<any, any, any>;

const MAX_PERIODS_PER_TEMPLATE = 400;

export type FixedExpenseTemplateForTopUp = {
  id: string;
  category_id: string;
  provider: string | null;
  currency: Currency;
  cadence: Cadence;
  default_amount: number;
  start_date: string;
};

export async function topUpFixedExpense(
  supabase: AnySupabaseClient,
  template: FixedExpenseTemplateForTopUp,
  horizonEnd: Date,
): Promise<{ error: string | null; generatedCount: number; lastPeriodDate: string | null }> {
  const { data: lastExpense, error: lastError } = await supabase
    .from('condo_expenses')
    .select('period_date')
    .eq('template_id', template.id)
    .order('period_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: lastError.message, generatedCount: 0, lastPeriodDate: null };

  let nextPeriodDate = lastExpense
    ? computeNextPeriodDate(template.cadence, new Date(`${lastExpense.period_date}T00:00:00`))
    : new Date(`${template.start_date}T00:00:00`);

  let generatedCount = 0;
  let lastGeneratedPeriod: string | null = null;

  while (nextPeriodDate <= horizonEnd && generatedCount < MAX_PERIODS_PER_TEMPLATE) {
    const periodDate = toDateOnly(nextPeriodDate);
    const { error: insertError } = await supabase.from('condo_expenses').upsert(
      {
        template_id: template.id,
        category_id: template.category_id,
        provider: template.provider,
        currency: template.currency,
        amount: template.default_amount,
        period_date: periodDate,
        status: 'pending',
      },
      { onConflict: 'template_id,period_date', ignoreDuplicates: true },
    );
    if (insertError) return { error: insertError.message, generatedCount, lastPeriodDate: lastGeneratedPeriod };

    generatedCount += 1;
    lastGeneratedPeriod = periodDate;
    nextPeriodDate = computeNextPeriodDate(template.cadence, nextPeriodDate);
  }

  return { error: null, generatedCount, lastPeriodDate: lastGeneratedPeriod };
}
```

- [ ] **Step 2: Rewrite `app/api/cron/generate-expenses/route.ts`**

Replace the entire file with:
```typescript
import { createServiceClient } from '@/lib/supabase/service';
import { computeHorizonEnd } from '@/lib/gastos/generate';
import { topUpFixedExpense, type FixedExpenseTemplateForTopUp } from '@/lib/gastos/topUp';

// Vercel Cron hits this once a day (vercel.json: "0 6 * * *"). Not
// `runtime = 'edge'` -- default Node.js (Fluid Compute) is correct here,
// same reasoning as app/api/cron/exchange-rate/route.ts.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const service = createServiceClient();
  const { data: templates, error: templatesError } = await service
    .from('condo_expense_templates')
    .select('id, category_id, provider, currency, cadence, default_amount, start_date')
    .eq('kind', 'fixed')
    .eq('active', true)
    .is('deleted_at', null);

  if (templatesError) {
    console.error('[cron/generate-expenses] failed to load templates:', templatesError.message);
    return Response.json({ success: false, error: templatesError.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const horizonEnd = computeHorizonEnd(new Date());

  for (const template of (templates ?? []) as FixedExpenseTemplateForTopUp[]) {
    // Each template is independent -- one bad row shouldn't block generating
    // the others (same isolation as the exchange-rate cron's per-rate try/catch).
    try {
      const { error, generatedCount, lastPeriodDate } = await topUpFixedExpense(service, template, horizonEnd);
      if (error) {
        results[template.id] = `error: ${error}`;
      } else if (generatedCount === 0) {
        results[template.id] = 'skipped: horizon already covered';
      } else {
        results[template.id] =
          generatedCount === 1
            ? `ok: ${lastPeriodDate}`
            : `ok: generated ${generatedCount} periods through ${lastPeriodDate}`;
      }
    } catch (err) {
      results[template.id] = `error: ${(err as Error).message}`;
    }
  }

  const hadFailure = Object.values(results).some((v) => v.startsWith('error'));
  if (hadFailure) console.error('[cron/generate-expenses] partial failure:', results);

  return Response.json({ success: !hadFailure, results });
}
```

- [ ] **Step 3: Make `createExpenseTemplate`'s fixed branch generate immediately**

In `lib/actions/gastos.ts`, add the import (near line 15's existing `lib/gastos/generate` import):
```typescript
import { computeVariablePeriodDates, parseDateOnly, toDateOnly, computeHorizonEnd } from '@/lib/gastos/generate';
import { topUpFixedExpense } from '@/lib/gastos/topUp';
```

Replace lines 79-86:
```typescript
  // Fixed templates generate no rows here -- the daily cron
  // (app/api/cron/generate-expenses/route.ts) creates the first (and every
  // subsequent) pending instance once start_date has arrived, so there's a
  // single source of truth for "how a fixed gasto's periods are computed."
  if (data.kind === 'fixed') {
    revalidatePath('/gastos');
    return { success: true };
  }
```
with:
```typescript
  // Fixed templates now generate immediately through the rolling horizon
  // (Recurring Horizon Generation design) -- the admin sees a populated
  // schedule right away instead of waiting for tomorrow's cron. The same
  // topUpFixedExpense function the cron calls is the single source of truth
  // for "how a fixed gasto's periods are computed," so this is never a
  // second, divergent implementation of that math.
  if (data.kind === 'fixed') {
    const horizonEnd = computeHorizonEnd(new Date());
    const { error: topUpError } = await topUpFixedExpense(
      supabase,
      {
        id: template.id as string,
        category_id: data.category_id,
        provider: normalizeOptional(data.provider),
        currency: data.currency,
        cadence: data.cadence,
        default_amount: data.default_amount,
        start_date: data.start_date,
      },
      horizonEnd,
    );
    if (topUpError) {
      await supabase.from('condo_expense_templates').delete().eq('id', template.id);
      return { error: topUpError };
    }
    revalidatePath('/gastos');
    return { success: true };
  }
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/gastos/topUp.ts app/api/cron/generate-expenses/route.ts lib/actions/gastos.ts
git commit -m "Generate fixed gastos through a horizon at creation, extract shared top-up function"
```

---

### Task 6: New cuotas cron route + `vercel.json`

**Files:**
- Create: `app/api/cron/generate-cuotas/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `computeHorizonEnd` (Task 2), `generateRecurringCuotaInstallments`, `OpenEndedRecurringTemplate` (Task 3).

- [ ] **Step 1: Write the cron route**

```typescript
// app/api/cron/generate-cuotas/route.ts
import { createServiceClient } from '@/lib/supabase/service';
import { computeHorizonEnd } from '@/lib/cuotas/generate';
import { generateRecurringCuotaInstallments, type OpenEndedRecurringTemplate } from '@/lib/cuotas/recurringGeneration';

// Vercel Cron hits this once a day (vercel.json: "0 6 * * *"), same schedule
// as app/api/cron/generate-expenses/route.ts -- default Node.js runtime
// (Fluid Compute), same reasoning as every other cron in this project.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const service = createServiceClient();
  // installment_type='recurring' AND number_of_installments IS NULL AND
  // active=true -- structurally excludes every legacy finite recurring
  // template and every special template (both always have a real
  // number_of_installments), so there is no flag to accidentally mis-set
  // and no risk of "catching up" a legacy series past its intended count.
  const { data: templates, error: templatesError } = await service
    .from('condo_installment_templates')
    .select('id, name, cadence, amount, currency, start_date, applicable_houses, created_by')
    .eq('installment_type', 'recurring')
    .is('number_of_installments', null)
    .eq('active', true);

  if (templatesError) {
    console.error('[cron/generate-cuotas] failed to load templates:', templatesError.message);
    return Response.json({ success: false, error: templatesError.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const horizonEnd = computeHorizonEnd(new Date());

  for (const template of (templates ?? []) as OpenEndedRecurringTemplate[]) {
    // Each template is independent -- one bad row shouldn't block generating
    // the others (same isolation as generate-expenses' per-template try/catch).
    try {
      const { error, generatedCount, lastDueDate } = await generateRecurringCuotaInstallments(
        service,
        template,
        horizonEnd,
      );
      if (error) {
        results[template.id] = `error: ${error}`;
      } else if (generatedCount === 0) {
        results[template.id] = 'skipped: horizon already covered';
      } else {
        results[template.id] = `ok: generated ${generatedCount} installment(s) through ${lastDueDate}`;
      }
    } catch (err) {
      results[template.id] = `error: ${(err as Error).message}`;
    }
  }

  const hadFailure = Object.values(results).some((v) => v.startsWith('error'));
  if (hadFailure) console.error('[cron/generate-cuotas] partial failure:', results);

  return Response.json({ success: !hadFailure, results });
}
```

- [ ] **Step 2: Add the third cron entry to `vercel.json`**

Replace the file's contents:
```json
{
  "crons": [
    {
      "path": "/api/cron/exchange-rate",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/generate-expenses",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/generate-cuotas",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: build succeeds, and the build output lists `app/api/cron/generate-cuotas` as a new route.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/generate-cuotas/route.ts vercel.json
git commit -m "Add daily cron for open-ended recurring cuota generation"
```

---

### Task 7: Admin UI — drop the count field, active toggle, i18n

**Files:**
- Modify: `components/cuotas/types.ts:20-31` (`TemplateWithInstallments`)
- Modify: `components/cuotas/CuotaFormClient.tsx` (multiple sections)
- Modify: `components/cuotas/CuotasPageClient.tsx`
- Modify: `app/[locale]/(admin)/cuotas/page.tsx:11-16`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `computeHorizonEnd`, `computeRecurringHorizonDueDates` (Task 2); `setInstallmentTemplateActive` (Task 4).

- [ ] **Step 1: Update `TemplateWithInstallments`**

In `components/cuotas/types.ts`, replace:
```typescript
export type TemplateWithInstallments = {
  id: string;
  name: string;
  description: string | null;
  installment_type: InstallmentType;
  cadence: Cadence | null;
  amount: number;
  currency: Currency;
  start_date: string;
  number_of_installments: number;
  is_divided: boolean;
  applicable_houses: string[];
  created_at: string;
  condo_installments: InstallmentRow[];
};
```
with:
```typescript
export type TemplateWithInstallments = {
  id: string;
  name: string;
  description: string | null;
  installment_type: InstallmentType;
  cadence: Cadence | null;
  amount: number;
  currency: Currency;
  start_date: string;
  number_of_installments: number | null;
  is_divided: boolean;
  applicable_houses: string[];
  active: boolean;
  created_at: string;
  condo_installments: InstallmentRow[];
};
```

- [ ] **Step 2: Select `active` in the cuotas list page**

In `app/[locale]/(admin)/cuotas/page.tsx`, change line 14 from:
```typescript
        'id, name, description, installment_type, cadence, amount, currency, start_date, number_of_installments, is_divided, applicable_houses, created_at, condo_installments(id, status, due_date, amount, house_id)',
```
to:
```typescript
        'id, name, description, installment_type, cadence, amount, currency, start_date, number_of_installments, is_divided, applicable_houses, active, created_at, condo_installments(id, status, due_date, amount, house_id)',
```

- [ ] **Step 3: `CuotaFormClient.tsx` — recurring branch drops the count field**

Change line 62 from:
```typescript
  const showInstallmentCount = installmentType === 'recurring' || isDivided;
```
to:
```typescript
  const showInstallmentCount = isDivided;
```

Replace the `baseline` `useMemo` (lines 77-88):
```typescript
  const baseline = useMemo(() => {
    if (!values.amount || values.amount <= 0 || !values.start_date) return null;
    const mode: DueDateMode =
      installmentType === 'recurring'
        ? { kind: 'recurring', cadence: values.cadence }
        : isDivided
          ? { kind: 'special-divided', cadence: values.cadence }
          : { kind: 'special-single' };
    const count = installmentType === 'recurring' ? values.number_of_installments : isDivided ? values.number_of_installments : 1;
    if (!count || count < 1) return null;
    return buildPreview({ mode, startDate: values.start_date, count, amount: values.amount, isDivided });
  }, [installmentType, isDivided, values.amount, values.start_date, values.cadence, values.number_of_installments]);
```
with:
```typescript
  const baseline = useMemo(() => {
    if (!values.amount || values.amount <= 0 || !values.start_date) return null;
    if (installmentType === 'recurring') {
      // Open-ended: the preview shows exactly what will be generated right
      // now (through the rolling horizon), never an admin-entered count —
      // computed via the SAME function the server calls
      // (lib/cuotas/recurringGeneration.ts's "no installments exist yet"
      // branch), so this can never diverge from the real insert.
      const horizonEnd = computeHorizonEnd(new Date());
      const dueDates = computeRecurringHorizonDueDates(values.cadence, values.start_date, horizonEnd);
      if (dueDates.length === 0) return null;
      const amounts = Array(dueDates.length).fill(values.amount);
      return { dueDates, amounts, totalPerHouse: amounts.reduce((sum, a) => sum + a, 0), count: dueDates.length };
    }
    const mode: DueDateMode = isDivided
      ? { kind: 'special-divided', cadence: values.cadence }
      : { kind: 'special-single' };
    const count = isDivided ? values.number_of_installments : 1;
    if (!count || count < 1) return null;
    return buildPreview({ mode, startDate: values.start_date, count, amount: values.amount, isDivided });
  }, [installmentType, isDivided, values.amount, values.start_date, values.cadence, values.number_of_installments]);
```

Add the two new imports to the existing `lib/cuotas/generate` import on line 20:
```typescript
import { buildPreview, computeHorizonEnd, computeRecurringHorizonDueDates, toDateOnly, type DueDateMode } from '@/lib/cuotas/generate';
```

Update `onSubmit`'s payload construction (lines 125-141) — the recurring branch drops `number_of_installments`:
```typescript
    const payload: CreateTemplateInput =
      data.installment_type === 'recurring'
        ? {
            installment_type: 'recurring',
            ...shared,
            cadence: data.cadence,
          }
        : {
            installment_type: 'special',
            ...shared,
            is_divided: data.is_divided,
            number_of_installments: data.is_divided ? data.number_of_installments : 1,
            cadence: data.is_divided ? data.cadence : undefined,
            amounts: data.is_divided ? amounts : undefined,
            due_dates: data.is_divided ? dates.map(toDateOnly) : undefined,
          };
```

Add the explanatory line under the cadence field for the recurring branch. The cadence `Controller` block (lines 247-269) is currently:
```tsx
        {(installmentType === 'recurring' || (isDivided && values.number_of_installments > 1)) && (
          <Controller
            control={control}
            name="cadence"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="cadence">{t('form.cadence')}</Label>
                <Select value={field.value} onValueChange={field.onChange} items={cadenceOptions}>
                  <SelectTrigger id="cadence" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cadenceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        )}
```
Add the explanatory line right after this block (still inside the form, before the `start_date` `Controller`):
```tsx
        {installmentType === 'recurring' && (
          <p className="text-xs text-muted-foreground">{t('form.recurringAutoGeneration')}</p>
        )}
```

- [ ] **Step 4: `CuotasPageClient.tsx` — active badge + toggle**

Add the import (alongside the existing `deleteInstallmentTemplate` import on line 14):
```typescript
import { deleteInstallmentTemplate, setInstallmentTemplateActive } from '@/lib/actions/cuotas';
```

Add an `ACTIVE_CLASSES` map (mirrors `components/gastos/GastosPlantillasPageClient.tsx`'s own) after the imports:
```typescript
const ACTIVE_CLASSES: Record<'active' | 'inactive', string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
};
```

Add a toggle handler alongside `handleDelete` (after line 59):
```typescript
  const [isToggling, startToggleTransition] = useTransition();

  const handleToggleActive = (template: TemplateWithInstallments) => {
    setError(null);
    startToggleTransition(async () => {
      const result = await setInstallmentTemplateActive(template.id, !template.active, locale);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };
```

Add a Badge in the status `TableCell` (after the existing four status `Badge`/`StatusBadge` elements, inside the same `<div className="flex flex-wrap gap-1.5">`, right before its closing `</div>` on line 131):
```tsx
                        <Badge variant="outline" className={ACTIVE_CLASSES[template.active ? 'active' : 'inactive']}>
                          {template.active ? t('status.active') : t('status.inactive')}
                        </Badge>
```

Add the toggle Button in the actions `TableCell`, between the existing Editar and Eliminar buttons (lines 135-146):
```tsx
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(template)}>
                          {t('actions.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleActive(template)}
                        >
                          {template.active ? t('actions.deactivate') : t('actions.activate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(template)}
                        >
                          {t('actions.delete')}
                        </Button>
                      </div>
```

- [ ] **Step 5: Add i18n keys**

In `messages/es.json`, under `cuotas.actions`, add:
```json
    "activate": "Activar",
    "deactivate": "Desactivar"
```
Under `cuotas.status`, add:
```json
    "active": "Activo",
    "inactive": "Inactivo"
```
Under `cuotas.form`, add (near `cadence`):
```json
    "recurringAutoGeneration": "Se generan automáticamente las cuotas de al menos los próximos 6 meses (o hasta fin de año, lo que sea más lejano) — no necesitas indicar cuántas."
```

In `messages/en.json`, under `cuotas.actions`, add:
```json
    "activate": "Activate",
    "deactivate": "Deactivate"
```
Under `cuotas.status`, add:
```json
    "active": "Active",
    "inactive": "Inactive"
```
Under `cuotas.form`, add (near `cadence`):
```json
    "recurringAutoGeneration": "Installments are generated automatically at least 6 months ahead (or through year-end, whichever is further) — you don't need to enter a count."
```

- [ ] **Step 6: Verify key parity**

Run: `node -e "const es=require('./messages/es.json'), en=require('./messages/en.json'); const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?flat(v,p+k+'.'):[p+k]); const esKeys=new Set(flat(es)), enKeys=new Set(flat(en)); const missing=[...esKeys].filter(k=>!enKeys.has(k)).concat([...enKeys].filter(k=>!esKeys.has(k))); console.log(missing.length===0?'ok: key parity':'MISSING: '+missing.join(', '))"`
Expected: `ok: key parity`

- [ ] **Step 7: Type-check and lint**

Run: `npm run build && npx eslint components/cuotas app/\[locale\]/\(admin\)/cuotas`
Expected: build succeeds, no new eslint warnings/errors.

- [ ] **Step 8: Commit**

```bash
git add components/cuotas/types.ts components/cuotas/CuotaFormClient.tsx components/cuotas/CuotasPageClient.tsx "app/[locale]/(admin)/cuotas/page.tsx" messages/es.json messages/en.json
git commit -m "Drop admin-entered installment count from the recurring cuota form, add active toggle"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background/separate terminal)

- [ ] **Step 2: Push the migration to a throwaway/dev context if available, or confirm it's queued**

If a dev Supabase project is reachable, apply `supabase/migrations/20260926060000_recurring_horizon_generation.sql` there and confirm `\d condo_installment_templates` shows `number_of_installments` nullable and a new `active` column defaulting `true`. If only the production project exists (per this project's established constraint that only the user can push migrations there), skip live DB verification and rely on Steps 3-7's build/lint/UI checks plus a careful re-read of the SQL — flag clearly in the final report that live DB behavior (cron queries, the new `active` column, credit sweep on cron-generated rows) is unverified until the user pushes this migration.

- [ ] **Step 3: Create a new recurring cuota via the browser**

Log in as admin (see this project's dev-admin-login memory), go to `/cuotas/new`, select "Recurrente," confirm:
- No "Número de cuotas" field appears.
- The explanatory line about automatic generation appears under the cadence field.
- The right-panel preview shows a list of due dates extending at least 6 months out (or through year-end, whichever prints more rows) — not a single row, not 360 rows.
- Submitting creates the template and immediately shows installments in the resulting `/cuotas` list (not zero, not waiting for a cron).

- [ ] **Step 4: Confirm the active toggle**

On `/cuotas`, confirm the new template shows an "Activo" badge and a "Desactivar" button; click it, confirm the badge flips to "Inactivo" and the button now reads "Activar," with no page error.

- [ ] **Step 5: Confirm legacy templates are unaffected, and record a baseline**

Find (or create, via direct DB insert if none exist) an existing-shape recurring template with a real `number_of_installments`. Confirm its row in `/cuotas` still shows the same installment counts as before this change, and that it also shows an "Activo" badge (harmless no-op per the design). Note its exact installment count (via the DB or the list page) — this is the baseline Step 6 re-checks after running the cron.

- [ ] **Step 6: Deactivate the new template, then exercise both cron routes locally**

Using the UI (Step 4) or `setInstallmentTemplateActive`, set the template created in Step 3 back to inactive. Then run (with `CRON_SECRET` matching `.env`'s value):
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/generate-cuotas | head -c 500
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/generate-expenses | head -c 500
```
Expected: neither response includes a `results` entry for the now-inactive template created in Step 3 (the cron's `.eq('active', true)` filter excludes it — confirming deactivation actually stops future generation), and neither response includes an entry for the legacy template from Step 5 (the cron's `.is('number_of_installments', null)` filter structurally excludes it). Re-query the legacy template's installment count and confirm it exactly matches Step 5's baseline — unchanged by the cron run. No response contains an `"error:"` entry. Run each `curl` command a second time immediately after: results must be identical (idempotency), never additional rows.

- [ ] **Step 7: Re-activate the template and confirm generation resumes**

Set the Step 3 template back to active, run `/api/cron/generate-cuotas` once more, and confirm its result is `"skipped: horizon already covered"` again (still nothing new to generate, since the horizon hasn't moved) — demonstrating the active flag is the only thing that changed its cron eligibility, not its data.

- [ ] **Step 8: Confirm per-house fan-out and credit-sweep-on-cron-generation directly against the DB**

Query the newly created template's installments, grouped by `installment_number`, and confirm every group has exactly one row per applicable house, all sharing the same `due_date`. Then, for a house with an existing `condo_house_credits` balance in the cuota's currency, manually advance that house's last installment's `due_date` backwards (via direct SQL, on a throwaway/dev project only — never on production data) so the next cron run has a new period to generate, run `/api/cron/generate-cuotas` again, and confirm a `condo_payments` row was written settling that new installment from the credit (mirroring the existing creation-time sweep behavior).

- [ ] **Step 9: Final build + lint pass**

Run: `npm run build && npx eslint .`
Expected: build succeeds, zero new eslint warnings/errors beyond any pre-existing ones already documented in PLAN.md.

- [ ] **Step 10: Report the migration action item**

In the final summary to the user, explicitly flag: `supabase/migrations/20260926060000_recurring_horizon_generation.sql` must be pushed to the live Supabase project (Dashboard SQL Editor or the user's own CLI session) before this code is deployed — the new cron route and the create action's recurring branch both depend on the `active` column and the nullable `number_of_installments` existing live.

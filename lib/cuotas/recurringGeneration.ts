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
type AnySupabaseClient = SupabaseClient;

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
): Promise<{ error: string | null; generatedCount: number; lastDueDate: string | null; sweepErrors: string[] }> {
  const { data: lastInstallment, error: lastError } = await supabase
    .from('condo_installments')
    .select('installment_number, due_date')
    .eq('template_id', template.id)
    .order('installment_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: lastError.message, generatedCount: 0, lastDueDate: null, sweepErrors: [] };

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

  if (dueDates.length === 0) return { error: null, generatedCount: 0, lastDueDate: null, sweepErrors: [] };

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
  if (insertError) return { error: insertError.message, generatedCount: 0, lastDueDate: null, sweepErrors: [] };

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
  const sweepErrors: string[] = [];
  for (const [houseId, newInstallments] of byHouse) {
    const { error: sweepError } = await sweepCreditForNewInstallments(supabase, {
      houseId,
      currency: template.currency,
      createdBy: template.created_by,
      newInstallments,
      paymentDate: toDateOnly(new Date()),
      notes: 'Aplicado automáticamente desde saldo a favor.',
    });
    if (sweepError) sweepErrors.push(sweepError);
  }

  return {
    error: null,
    generatedCount: dueDates.length,
    lastDueDate: toDateOnly(dueDates[dueDates.length - 1]),
    sweepErrors,
  };
}

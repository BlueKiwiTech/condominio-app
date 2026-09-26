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

type AnySupabaseClient = SupabaseClient;

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

  const periodDates: string[] = [];
  while (nextPeriodDate <= horizonEnd && periodDates.length < MAX_PERIODS_PER_TEMPLATE) {
    periodDates.push(toDateOnly(nextPeriodDate));
    nextPeriodDate = computeNextPeriodDate(template.cadence, nextPeriodDate);
  }

  if (periodDates.length === 0) return { error: null, generatedCount: 0, lastPeriodDate: null };

  // One bulk upsert covering every computed period -- a single atomic INSERT
  // statement, same pattern as the recurring cuota model's
  // generateRecurringCuotaInstallments (lib/cuotas/recurringGeneration.ts).
  const rows = periodDates.map((periodDate) => ({
    template_id: template.id,
    category_id: template.category_id,
    provider: template.provider,
    currency: template.currency,
    amount: template.default_amount,
    period_date: periodDate,
    status: 'pending',
  }));

  const { error: insertError } = await supabase
    .from('condo_expenses')
    .upsert(rows, { onConflict: 'template_id,period_date', ignoreDuplicates: true });
  if (insertError) return { error: insertError.message, generatedCount: 0, lastPeriodDate: null };

  return { error: null, generatedCount: periodDates.length, lastPeriodDate: periodDates[periodDates.length - 1] };
}

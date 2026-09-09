import { createServiceClient } from '@/lib/supabase/service';
import { computeNextPeriodDate, toDateOnly, type Cadence } from '@/lib/gastos/generate';

// Vercel Cron hits this once a day (vercel.json: "0 6 * * *"). Not
// `runtime = 'edge'` -- default Node.js (Fluid Compute) is correct here,
// same reasoning as app/api/cron/exchange-rate/route.ts.
export const dynamic = 'force-dynamic';

type ActiveTemplate = {
  id: string;
  category_id: string;
  provider: string | null;
  currency: 'USD' | 'Bs' | 'USDT';
  cadence: Cadence;
  default_amount: number;
  start_date: string;
};

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
    .eq('active', true);

  if (templatesError) {
    console.error('[cron/generate-expenses] failed to load templates:', templatesError.message);
    return Response.json({ success: false, error: templatesError.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const today = new Date();
  // Defensive cap on the catch-up loop below -- guards against an infinite
  // loop if a malformed cadence ever made computeNextPeriodDate stop advancing.
  const MAX_PERIODS_PER_TEMPLATE = 400;

  for (const template of (templates ?? []) as ActiveTemplate[]) {
    // Each template is independent -- one bad row shouldn't block generating
    // the others (same isolation as the exchange-rate cron's per-rate try/catch).
    try {
      const { data: lastExpense } = await service
        .from('condo_expenses')
        .select('period_date')
        .eq('template_id', template.id)
        .order('period_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextPeriodDate = lastExpense
        ? computeNextPeriodDate(template.cadence, new Date(`${lastExpense.period_date}T00:00:00`))
        : new Date(`${template.start_date}T00:00:00`);

      // Catch up on every period still due as of today, not just the next
      // one -- a back-dated start_date (or a template created after several
      // periods had already elapsed) would otherwise take one cron run per
      // period to catch up. ON CONFLICT (template_id, period_date) DO
      // NOTHING via ignoreDuplicates is the idempotency guard that makes
      // repeated upserts for the same period (a cron retry, overlapping
      // invocations, or re-processing here) always safe.
      let generatedCount = 0;
      let lastGeneratedPeriod = '';
      let loopError: string | null = null;

      while (nextPeriodDate <= today && generatedCount < MAX_PERIODS_PER_TEMPLATE) {
        const periodDate = toDateOnly(nextPeriodDate);
        const { error: insertError } = await service.from('condo_expenses').upsert(
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

        if (insertError) {
          loopError = insertError.message;
          break;
        }

        generatedCount += 1;
        lastGeneratedPeriod = periodDate;
        nextPeriodDate = computeNextPeriodDate(template.cadence, nextPeriodDate);
      }

      if (loopError) {
        results[template.id] = `error: ${loopError}`;
      } else if (generatedCount === 0) {
        results[template.id] = 'skipped: next period not due yet';
      } else {
        results[template.id] =
          generatedCount === 1
            ? `ok: ${lastGeneratedPeriod}`
            : `ok: generated ${generatedCount} periods through ${lastGeneratedPeriod}`;
      }
    } catch (err) {
      results[template.id] = `error: ${(err as Error).message}`;
    }
  }

  const hadFailure = Object.values(results).some((v) => v.startsWith('error'));
  if (hadFailure) console.error('[cron/generate-expenses] partial failure:', results);

  return Response.json({ success: !hadFailure, results });
}

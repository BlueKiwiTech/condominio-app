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

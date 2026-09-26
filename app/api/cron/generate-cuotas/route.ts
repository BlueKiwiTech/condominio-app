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
      const { error, generatedCount, lastDueDate, sweepErrors } = await generateRecurringCuotaInstallments(
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
      if (sweepErrors.length > 0) {
        console.error(
          `[cron/generate-cuotas] credit sweep failed for template ${template.id}: ${sweepErrors.join('; ')}`,
        );
        results[template.id] = `${results[template.id]} (WARNING: credit sweep failed for ${sweepErrors.length} house(s))`;
      }
    } catch (err) {
      results[template.id] = `error: ${(err as Error).message}`;
    }
  }

  const hadFailure = Object.values(results).some((v) => v.startsWith('error'));
  if (hadFailure) console.error('[cron/generate-cuotas] partial failure:', results);

  return Response.json({ success: !hadFailure, results });
}

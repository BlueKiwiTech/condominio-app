import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAdminGracePeriodDays } from '@/lib/auth/adminGracePeriod';
import { CuotasPageClient } from '@/components/cuotas/CuotasPageClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InstallmentRow, TemplateWithInstallments } from '@/components/cuotas/types';

export default async function CuotasPage() {
  const t = await getTranslations('cuotas');
  const supabase = await createClient();
  const [{ data: templates, error: templatesError }, gracePeriodDays] = await Promise.all([
    supabase
      .from('condo_installment_templates')
      .select(
        'id, name, description, installment_type, cadence, amount, currency, start_date, number_of_installments, is_divided, applicable_houses, active, created_at, condo_installments(id, status, due_date, amount, house_id, deleted_at)',
      )
      .order('created_at', { ascending: false }),
    resolveAdminGracePeriodDays(supabase),
  ]);

  // A deactivated template's still-pending installments are soft-deleted
  // (lib/actions/cuotas.ts's setInstallmentTemplateActive) rather than
  // excluded at the DB level here, so they still count toward the recurring
  // generator's resume point -- filtered out client-side instead of relying
  // on PostgREST's embedded-resource filter syntax for this nested select.
  type RawTemplateRow = Omit<TemplateWithInstallments, 'condo_installments'> & {
    condo_installments: (InstallmentRow & { deleted_at: string | null })[];
  };
  const rawTemplates = (templates as RawTemplateRow[] | null) ?? [];
  const visibleTemplates: TemplateWithInstallments[] = rawTemplates.map((template) => ({
    ...template,
    condo_installments: template.condo_installments.filter((installment) => !installment.deleted_at),
  }));

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      {/* A DB error here (e.g. a migration pending on this environment) used
          to be silently swallowed into an empty/zero-count list -- loud and
          in Spanish so it reads as "something's actually broken", not as
          "there's nothing to show". */}
      {templatesError && (
        <Alert variant="destructive">
          <AlertDescription>Error al cargar las cuotas: {templatesError.message}</AlertDescription>
        </Alert>
      )}
      <CuotasPageClient initialTemplates={visibleTemplates} gracePeriodDays={gracePeriodDays} />
    </div>
  );
}

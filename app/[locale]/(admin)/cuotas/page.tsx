import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { CuotasPageClient } from '@/components/cuotas/CuotasPageClient';
import type { TemplateWithInstallments } from '@/components/cuotas/types';

export default async function CuotasPage() {
  const t = await getTranslations('cuotas');
  const supabase = await createClient();
  const [{ data: templates }, { data: community }] = await Promise.all([
    supabase
      .from('condo_installment_templates')
      .select(
        'id, name, description, installment_type, cadence, amount, currency, start_date, number_of_installments, is_divided, applicable_houses, created_at, condo_installments(id, status, due_date, amount, house_id)',
      )
      .order('created_at', { ascending: false }),
    supabase.from('condo_communities').select('grace_period_days').limit(1).maybeSingle(),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <CuotasPageClient
        initialTemplates={(templates as TemplateWithInstallments[] | null) ?? []}
        gracePeriodDays={community?.grace_period_days ?? 0}
      />
    </div>
  );
}

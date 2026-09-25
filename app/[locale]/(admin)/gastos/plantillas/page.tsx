import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GastosPlantillasPageClient } from '@/components/gastos/GastosPlantillasPageClient';
import type { FixedTemplateRow } from '@/components/gastos/types';

export default async function GastosPlantillasPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();

  const { data: fixedTemplates } = await supabase
    .from('condo_expense_templates')
    .select('id, name, active, cadence')
    .eq('kind', 'fixed')
    .is('deleted_at', null)
    .order('name');

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('templates.heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('templates.subtitle')}</p>
      </div>
      <GastosPlantillasPageClient fixedTemplates={(fixedTemplates as FixedTemplateRow[] | null) ?? []} />
    </div>
  );
}

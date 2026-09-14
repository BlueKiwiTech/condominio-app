import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { GastosPlantillasPageClient } from '@/components/gastos/GastosPlantillasPageClient';
import type { FixedTemplateRow } from '@/components/gastos/types';

export default async function GastosPlantillasPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();

  const { data: fixedTemplates } = await supabase
    .from('condo_expense_templates')
    .select('id, name, active')
    .eq('kind', 'fixed')
    .is('deleted_at', null)
    .order('name');

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('templates.heading')}</Heading>
      <GastosPlantillasPageClient fixedTemplates={(fixedTemplates as FixedTemplateRow[] | null) ?? []} />
    </Column>
  );
}

import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { GastoFormClient } from '@/components/gastos/GastoFormClient';
import type { CategoryOption } from '@/components/gastos/types';

export default async function NewGastoPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();
  const { data: categories } = await supabase.from('condo_expense_categories').select('id, name').order('name');

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('new.heading')}</Heading>
      <GastoFormClient categories={(categories as CategoryOption[] | null) ?? []} />
    </Column>
  );
}

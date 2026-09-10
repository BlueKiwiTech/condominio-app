import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { GastosPagadosPageClient } from '@/components/gastos/GastosPagadosPageClient';
import type { CategoryOption, ExpenseRow } from '@/components/gastos/types';

export default async function GastosPagadosPage() {
  const t = await getTranslations('gastosPagados');
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase
      .from('condo_expenses')
      .select(
        'id, template_id, category_id, provider, currency, amount, installment_number, period_date, status, paid_date, notes, condo_expense_templates(name, kind), condo_expense_categories(name)',
      )
      .eq('status', 'paid')
      .is('deleted_at', null)
      .order('paid_date', { ascending: false }),
    supabase.from('condo_expense_categories').select('id, name').order('name'),
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <GastosPagadosPageClient
        expenses={(expenses as unknown as ExpenseRow[] | null) ?? []}
        categories={(categories as CategoryOption[] | null) ?? []}
      />
    </Column>
  );
}

import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { GastosPageClient } from '@/components/gastos/GastosPageClient';
import type { CategoryOption, ExpenseRow, FixedTemplateRow } from '@/components/gastos/types';

export default async function GastosPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }, { data: fixedTemplates }] = await Promise.all([
    supabase
      .from('condo_expenses')
      .select(
        'id, template_id, category_id, provider, currency, amount, installment_number, period_date, status, paid_date, notes, condo_expense_templates(name, kind), condo_expense_categories(name)',
      )
      .is('deleted_at', null)
      .order('period_date', { ascending: false }),
    supabase.from('condo_expense_categories').select('id, name').order('name'),
    supabase
      .from('condo_expense_templates')
      .select('id, name, active')
      .eq('kind', 'fixed')
      .is('deleted_at', null)
      .order('name'),
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <GastosPageClient
        initialExpenses={(expenses as unknown as ExpenseRow[] | null) ?? []}
        categories={(categories as CategoryOption[] | null) ?? []}
        fixedTemplates={(fixedTemplates as FixedTemplateRow[] | null) ?? []}
      />
    </Column>
  );
}

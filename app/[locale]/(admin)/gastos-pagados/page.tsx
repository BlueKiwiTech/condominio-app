import { getTranslations } from 'next-intl/server';
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
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <GastosPagadosPageClient
        expenses={(expenses as unknown as ExpenseRow[] | null) ?? []}
        categories={(categories as CategoryOption[] | null) ?? []}
      />
    </div>
  );
}

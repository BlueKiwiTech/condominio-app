import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GastosPageClient } from '@/components/gastos/GastosPageClient';
import type { CategoryOption, ExpenseRow } from '@/components/gastos/types';

export default async function GastosPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase
      .from('condo_expenses')
      .select(
        'id, template_id, category_id, provider, currency, amount, installment_number, period_date, status, paid_date, notes, condo_expense_templates(name, kind), condo_expense_categories(name)',
      )
      .is('deleted_at', null)
      .order('period_date', { ascending: true }),
    supabase.from('condo_expense_categories').select('id, name').order('name'),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <GastosPageClient
        initialExpenses={(expenses as unknown as ExpenseRow[] | null) ?? []}
        categories={(categories as CategoryOption[] | null) ?? []}
      />
    </div>
  );
}

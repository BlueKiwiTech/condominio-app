import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GastoFormClient } from '@/components/gastos/GastoFormClient';
import type { CategoryOption } from '@/components/gastos/types';

export default async function NewGastoPage() {
  const t = await getTranslations('gastos');
  const supabase = await createClient();
  const { data: categories } = await supabase.from('condo_expense_categories').select('id, name').order('name');

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('new.heading')}</h1>
      <GastoFormClient categories={(categories as CategoryOption[] | null) ?? []} />
    </div>
  );
}

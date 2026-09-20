import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { CuotaFormClient } from '@/components/cuotas/CuotaFormClient';
import type { HouseOption } from '@/components/cuotas/types';

export default async function NewCuotaPage() {
  const t = await getTranslations('cuotas');
  const supabase = await createClient();
  const { data: houses } = await supabase
    .from('condo_houses')
    .select('id, house_number, house_name')
    .order('house_number');

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('new.heading')}</h1>
      <CuotaFormClient houses={(houses as HouseOption[] | null) ?? []} />
    </div>
  );
}

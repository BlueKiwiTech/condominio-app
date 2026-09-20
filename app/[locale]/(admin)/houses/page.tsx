import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { HousesPageClient } from '@/components/houses/HousesPageClient';
import type { HouseWithResidents } from '@/components/houses/types';

export default async function HousesPage() {
  const t = await getTranslations('houses');
  const supabase = await createClient();
  const { data: houses } = await supabase
    .from('condo_houses')
    .select(
      'id, house_number, house_name, owner_name, owner_phone, owner_email, condo_house_residents(id, resident_name, resident_phone)',
    )
    .order('house_number');

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <HousesPageClient initialHouses={(houses as HouseWithResidents[] | null) ?? []} />
    </div>
  );
}

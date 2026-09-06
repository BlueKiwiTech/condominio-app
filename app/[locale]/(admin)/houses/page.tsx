import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
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
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <HousesPageClient initialHouses={(houses as HouseWithResidents[] | null) ?? []} />
    </Column>
  );
}

import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
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
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('new.heading')}</Heading>
      <CuotaFormClient houses={(houses as HouseOption[] | null) ?? []} />
    </Column>
  );
}

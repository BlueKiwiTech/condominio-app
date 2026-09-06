import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createServiceClient } from '@/lib/supabase/service';
import { ResidentLoginForm } from '@/components/residentAuth/ResidentLoginForm';

// Unauthenticated screen (V1) — the house picker needs house_number/house_name
// (+ owner_name, "for confirmation" per the mockup) for every house, which is
// not sensitive data on its own but IS beyond what RLS grants an anonymous
// caller (deny-by-default). Fetched here via the service-role client,
// server-side only — never exposed as an API route.
export default async function ResidentLoginPage() {
  const t = await getTranslations('residentAuth');
  const service = createServiceClient();
  const { data: houses } = await service
    .from('condo_houses')
    .select('house_number, house_name, owner_name')
    .order('house_number');

  return (
    <Column gap="24" fillWidth style={{ maxWidth: 400 }}>
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <ResidentLoginForm houses={houses ?? []} />
    </Column>
  );
}

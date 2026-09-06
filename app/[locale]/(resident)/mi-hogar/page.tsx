import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Column, Text, Button } from '@once-ui-system/core';
import { getResidentSession } from '@/lib/auth/residentSession';
import { residentLogout } from '@/lib/actions/residentAuth';

// Minimal placeholder — only needs to exist so proxy.ts's resident route-gating
// has a real (resident)/* path to redirect from/to, and so AUTH-05/06/07 have
// an end-to-end flow to land on. Phase 7 (Resident Portal, V2) builds the
// real "Mi hogar" content (saldo, upcoming installments, etc).
export default async function MiHogarPage() {
  const session = await getResidentSession();
  // Defense in depth — proxy.ts already gates this route via the same
  // verifyResidentToken check, but never trust that alone in the page itself.
  if (!session) redirect('/resident-login');

  const t = await getTranslations('residentHome');

  return (
    <Column fillWidth center paddingY="64" gap="16">
      <Text variant="body-default-m" onBackground="neutral-weak">
        {t('placeholder')}
      </Text>
      <form action={residentLogout}>
        <Button type="submit" variant="secondary">
          {t('logout')}
        </Button>
      </form>
    </Column>
  );
}

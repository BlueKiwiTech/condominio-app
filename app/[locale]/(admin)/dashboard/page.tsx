import { getTranslations } from 'next-intl/server';
import { Column, Text, Button } from '@once-ui-system/core';
import { logout } from '@/lib/actions/auth';

// Minimal placeholder — only needs to exist so proxy.ts's route-gating has a
// real (admin)/* path to redirect from/to. Phase 3+ builds real content.
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  return (
    <Column fillWidth center paddingY="64" gap="16">
      <Text variant="body-default-m" onBackground="neutral-weak">
        {t('placeholder')}
      </Text>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          {t('logout')}
        </Button>
      </form>
    </Column>
  );
}

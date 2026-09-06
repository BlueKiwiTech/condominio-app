import { getTranslations } from 'next-intl/server';
import { Column, Row, Text, Button, SmartLink } from '@once-ui-system/core';
import { logout } from '@/lib/actions/auth';

// Minimal placeholder — only needs to exist so proxy.ts's route-gating has a
// real (admin)/* path to redirect from/to. Phase 6 builds the real dashboard
// (A2, KPIs/chart/tables). The "Casas y vecinos" link is the one real nav
// entry point Phase 3 adds so the houses screen it ships is reachable.
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  return (
    <Column fillWidth center paddingY="64" gap="16">
      <Text variant="body-default-m" onBackground="neutral-weak">
        {t('placeholder')}
      </Text>
      <Row gap="16">
        <SmartLink href="/houses">{t('housesLink')}</SmartLink>
      </Row>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          {t('logout')}
        </Button>
      </form>
    </Column>
  );
}

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Column, Row, Button } from '@once-ui-system/core';
import { getResidentSession } from '@/lib/auth/residentSession';
import { residentLogout } from '@/lib/actions/residentAuth';
import { ResidentTabBar } from '@/components/resident/ResidentTabBar';

// Shared shell for every /mi-hogar, /mis-cuotas, /mis-pagos screen (Phase 7).
// proxy.ts already gates all three via RESIDENT_PROTECTED_PATHS + the signed
// jose cookie (Pattern A) -- this redirect is defense in depth, same
// rationale the old mi-hogar placeholder used, just centralized here once
// instead of repeated per page.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const t = await getTranslations('residentNav');

  return (
    <Column fillWidth style={{ minHeight: '100vh' }}>
      <Row fillWidth horizontal="end" paddingX="16" paddingY="8" border="neutral-alpha-weak">
        <form action={residentLogout}>
          <Button type="submit" variant="tertiary" size="s">
            {t('logout')}
          </Button>
        </form>
      </Row>
      <Column fillWidth flex={1} style={{ overflowY: 'auto' }}>
        {children}
      </Column>
      <ResidentTabBar />
    </Column>
  );
}

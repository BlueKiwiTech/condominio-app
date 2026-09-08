import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Column, Row, Button } from '@once-ui-system/core';
import { getResidentSession } from '@/lib/auth/residentSession';
import { residentLogout } from '@/lib/actions/residentAuth';
import { ResidentTabBar } from '@/components/resident/ResidentTabBar';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

// Shared shell for every /mi-hogar, /mis-cuotas, /mis-pagos screen (Phase 7).
// proxy.ts already gates all three via RESIDENT_PROTECTED_PATHS + the signed
// jose cookie (Pattern A) -- this redirect is defense in depth, same
// rationale the old mi-hogar placeholder used, just centralized here once
// instead of repeated per page.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const t = await getTranslations('residentNav');

  // Mobile-first shell (390px per the Design Reference) — on wider viewports
  // the whole app (header + content + tab bar) sits centered as one narrow
  // column with a side border instead of stretching edge-to-edge, so it
  // reads as an intentional app panel rather than a mobile layout stranded
  // in a sea of whitespace. maxWidth matches the individual pages' own
  // root Column (MiHogarClient/MisCuotasClient/MisPagosClient all already
  // use maxWidth={32}) so header/content/tab-bar line up exactly.
  return (
    <Column fillWidth horizontal="center" background="neutral-weak" style={{ minHeight: '100vh' }}>
      <Column
        fillWidth
        maxWidth={32}
        background="page"
        border="neutral-alpha-weak"
        style={{ minHeight: '100vh' }}
      >
        <Row fillWidth horizontal="between" vertical="center" paddingX="16" paddingY="8" border="neutral-alpha-weak">
          <LocaleSwitcher />
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
    </Column>
  );
}

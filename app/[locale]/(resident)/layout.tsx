import { redirect } from 'next/navigation';
import { Column, Row } from '@once-ui-system/core';
import { getResidentSession } from '@/lib/auth/residentSession';
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

  // Mobile-first shell (390px per the Design Reference) — on wider viewports
  // the whole app (header + content + tab bar) sits centered as one narrow
  // column with a side border instead of stretching edge-to-edge, so it
  // reads as an intentional app panel rather than a mobile layout stranded
  // in a sea of whitespace. maxWidth matches the individual pages' own
  // root Column (MiHogarClient/MisCuotasClient/MisPagosClient all already
  // use maxWidth={32}) so header/content/tab-bar line up exactly.
  //
  // Below 1024px this is a real phone-ish viewport -- the panel stays pinned
  // to the full device height so the tab bar sits glued to the very bottom
  // the way every mobile app's nav bar does, regardless of how much content
  // is on screen. At 1024px+ that same "always 100vh" rule was the actual
  // bug reported: a short page (e.g. one paid cuota) left a huge dead gap
  // between the content and a tab bar pinned to the bottom of a full desktop
  // monitor. .resident-app-panel (resources/custom.css) caps the panel's
  // height there instead (bounded to roughly one phone screen's worth),
  // keeping the same pinned-header/scrollable-middle/pinned-tab-bar
  // mechanics but bounding how much empty space a sparse page can ever show.
  return (
    <Column fillWidth horizontal="center" vertical="center" background="neutral-weak" style={{ minHeight: '100vh' }}>
      <Column
        className="resident-app-panel"
        fillWidth
        maxWidth={32}
        background="page"
        border="neutral-alpha-weak"
      >
        <Row fillWidth horizontal="start" vertical="center" paddingX="16" paddingY="8" border="neutral-alpha-weak">
          <LocaleSwitcher />
        </Row>
        <Column fillWidth flex={1} style={{ overflowY: 'auto' }}>
          {children}
        </Column>
        <ResidentTabBar />
      </Column>
    </Column>
  );
}

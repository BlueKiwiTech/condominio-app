import { redirect } from 'next/navigation';
import { Row, Column } from '@once-ui-system/core';
import { getResidentSession } from '@/lib/auth/residentSession';
import { createServiceClient } from '@/lib/supabase/service';
import { ResidentSidebar } from '@/components/resident/ResidentSidebar';

// Shared shell for every /mi-hogar, /mis-cuotas, /mis-pagos screen (Phase 7).
// proxy.ts already gates all three via RESIDENT_PROTECTED_PATHS + the signed
// jose cookie (Pattern A) -- this redirect is defense in depth, same
// rationale the old mi-hogar placeholder used, just centralized here once
// instead of repeated per page.
//
// User request: unify with the admin shell (app/[locale]/(admin)/layout.tsx)
// instead of the old mobile-app-style bottom-tab-bar shell -- fixed left
// sidebar on desktop, hamburger + Dialog on mobile, same as AdminSidebar.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  // Pattern A: no Supabase Auth session for residents, so this is the same
  // service-role client + house_id-scoped read every other resident query
  // uses (lib/resident/queries.ts) -- just the two columns needed for the
  // sidebar's account footer label.
  const service = createServiceClient();
  const { data: house } = await service
    .from('condo_houses')
    .select('house_number, house_name')
    .eq('id', session.house_id)
    .maybeSingle();
  const houseLabel = house ? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number) : null;

  return (
    <Row fillWidth style={{ minHeight: '100vh' }} s={{ direction: 'column' }}>
      <ResidentSidebar houseLabel={houseLabel} />
      <Column fillWidth flex={1} style={{ overflowY: 'auto' }}>
        {children}
      </Column>
    </Row>
  );
}

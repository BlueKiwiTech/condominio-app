import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData, getCommunityBalanceData } from '@/lib/resident/queries';
import { MiComunidadClient } from '@/components/resident/MiComunidadClient';

// V3 · Mi comunidad (replaces Mi hogar as the resident landing page). Per
// board feedback (2026-09-18): this screen drops the per-house upcoming/
// report-payment content and focuses only on the community-wide balance +
// a filterable expense breakdown -- see MiComunidadClient for the layout.
export default async function MiComunidadPage() {
  const session = await getResidentSession();
  // proxy.ts + the (resident) layout already gate this route -- defense in
  // depth, never trust a cookie's mere presence without this check too.
  if (!session) redirect('/resident-login');

  const [data, communityBalance] = await Promise.all([
    getResidentPortalData(session.house_id),
    getCommunityBalanceData(),
  ]);
  if (!data.house) redirect('/resident-login');

  return <MiComunidadClient data={data} communityBalance={communityBalance} />;
}

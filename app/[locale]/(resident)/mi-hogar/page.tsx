import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData } from '@/lib/resident/queries';
import { MiHogarClient } from '@/components/resident/MiHogarClient';

// V2 · Mi hogar (RSDT-02 saldo, plus greeting/house-info/upcoming). Replaces
// the Phase 3 placeholder now that Phase 6's per-currency reporting helpers
// (lib/reporting/morosos.ts, lib/reporting/dashboard.ts) exist to reuse,
// re-scoped from "every house" to just the signed-in resident's one house.
export default async function MiHogarPage() {
  const session = await getResidentSession();
  // proxy.ts + the (resident) layout already gate this route -- defense in
  // depth, never trust a cookie's mere presence without this check too.
  if (!session) redirect('/resident-login');

  const data = await getResidentPortalData(session.house_id);
  if (!data.house) redirect('/resident-login');

  return <MiHogarClient data={data} />;
}

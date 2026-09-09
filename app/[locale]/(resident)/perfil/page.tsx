import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData } from '@/lib/resident/queries';
import { PerfilClient } from '@/components/resident/PerfilClient';

export default async function PerfilPage() {
  const session = await getResidentSession();
  // proxy.ts + the (resident) layout already gate this route -- defense in
  // depth, never trust a cookie's mere presence without this check too.
  if (!session) redirect('/resident-login');

  const data = await getResidentPortalData(session.house_id);
  if (!data.house) redirect('/resident-login');

  return <PerfilClient data={data} />;
}

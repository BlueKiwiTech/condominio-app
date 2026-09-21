import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData } from '@/lib/resident/queries';
import { MisCuotasClient } from '@/components/resident/MisCuotasClient';

// V3 · Mis cuotas (RSDT-01) + V3b's overdue-state banner. Pendientes/Histórico
// tabs, month-grid for recurring cuotas, a separate list for special cuotas.
export default async function MisCuotasPage() {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const data = await getResidentPortalData(session.house_id);
  if (!data.house) redirect('/resident-login');

  return <MisCuotasClient data={data} />;
}

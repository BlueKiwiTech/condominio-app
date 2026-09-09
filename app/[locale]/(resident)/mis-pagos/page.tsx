import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData } from '@/lib/resident/queries';
import { MisPagosClient } from '@/components/resident/MisPagosClient';

// V4 · Mis pagos (RSDT-03) — payment history filtered by period, per-period
// totals kept per currency (never summed across USD/Bs/USDT).
export default async function MisPagosPage() {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const data = await getResidentPortalData(session.house_id);
  if (!data.house) redirect('/resident-login');

  const pendingInstallments = data.installments.filter((i) => i.status !== 'paid');

  return (
    <MisPagosClient
      payments={data.payments}
      installments={data.installments}
      pendingInstallments={pendingInstallments}
      reports={data.paymentReports}
    />
  );
}

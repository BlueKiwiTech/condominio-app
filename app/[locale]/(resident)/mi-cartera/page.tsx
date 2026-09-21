import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPortalData } from '@/lib/resident/queries';
import { MisPagosClient } from '@/components/resident/MisPagosClient';

// V4 · Mi Cartera (RSDT-03) — the resident's reported-payments ledger
// ("abonos": pending/confirmed/rejected), plus wallet balance summaries.
// Does NOT show which cuotas got paid off -- that's /mis-pagos.
export default async function MisPagosPage() {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const data = await getResidentPortalData(session.house_id);
  if (!data.house) redirect('/resident-login');

  const pendingInstallments = data.installments.filter((i) => i.status !== 'paid');

  return (
    <MisPagosClient
      installments={data.installments}
      pendingInstallments={pendingInstallments}
      reports={data.paymentReports}
      credits={data.credits}
      exchangeRates={data.exchangeRates}
      graceDays={data.community?.grace_period_days ?? 0}
    />
  );
}

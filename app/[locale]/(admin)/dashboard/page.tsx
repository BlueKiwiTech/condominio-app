import { createClient } from '@/lib/supabase/server';
import { getLatestExchangeRates } from '@/lib/actions/exchangeRate';
import { DashboardPageClient } from '@/components/dashboard/DashboardPageClient';
import type { DashboardCredit, DashboardHouse, DashboardInstallment } from '@/components/dashboard/types';
import type { PaymentRow } from '@/components/payments/types';

// A2 · Dashboard (RPRT-01..05) — replaces the Phase 2/3 placeholder. Every
// KPI/chart/table here is derived from the same shared, pure lib/reporting/*
// helpers the monthly report screen (/reporte) also uses — computed live at
// request time, never a stored/cached "morosos" flag (CLAUDE.md anti-pattern
// rule), and always kept per-currency (RPRT-03).
export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: installments }, { data: houses }, { data: credits }, { data: payments }, { data: community }, exchangeRates] =
    await Promise.all([
      supabase.from('condo_installments').select('house_id, due_date, status, amount, amount_paid, currency'),
      supabase.from('condo_houses').select('id, house_number, house_name, owner_name').order('house_number'),
      supabase.from('condo_house_credits').select('house_id, currency, balance'),
      supabase
        .from('condo_payments')
        .select(
          'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
        )
        .order('created_at', { ascending: false }),
      supabase.from('condo_communities').select('grace_period_days').limit(1).maybeSingle(),
      getLatestExchangeRates(),
    ]);

  return (
    <DashboardPageClient
      installments={(installments as DashboardInstallment[] | null) ?? []}
      houses={(houses as DashboardHouse[] | null) ?? []}
      credits={(credits as DashboardCredit[] | null) ?? []}
      payments={(payments as unknown as PaymentRow[] | null) ?? []}
      gracePeriodDays={community?.grace_period_days ?? 0}
      exchangeRates={exchangeRates}
    />
  );
}

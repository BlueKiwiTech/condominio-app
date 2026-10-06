import { createClient } from '@/lib/supabase/server';
import { getLatestExchangeRates } from '@/lib/actions/exchangeRate';
import { resolveAdminGracePeriodDays } from '@/lib/auth/adminGracePeriod';
import { DashboardPageClient } from '@/components/dashboard/DashboardPageClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DashboardExpense, DashboardHouse, DashboardInstallment } from '@/components/dashboard/types';
import type { PaymentRow } from '@/components/payments/types';

// A2 · Dashboard (RPRT-01..05) — replaces the Phase 2/3 placeholder. Every
// KPI/chart/table here is derived from the same shared, pure lib/reporting/*
// helpers the monthly report screen (/reporte) also uses — computed live at
// request time, never a stored/cached "morosos" flag (CLAUDE.md anti-pattern
// rule), and always kept per-currency (RPRT-03).
export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: installments, error: installmentsError },
    { data: houses, error: housesError },
    { data: expenses, error: expensesError },
    { data: payments },
    gracePeriodDays,
    exchangeRates,
  ] = await Promise.all([
    supabase
      .from('condo_installments')
      .select('house_id, due_date, status, amount, amount_paid, currency')
      .is('deleted_at', null),
    supabase.from('condo_houses').select('id, house_number, house_name, owner_name').order('house_number'),
    supabase.from('condo_expenses').select('currency, amount, period_date, status, paid_date').is('deleted_at', null),
    supabase
      .from('condo_payments')
      .select(
        'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
      )
      .order('created_at', { ascending: false }),
    resolveAdminGracePeriodDays(supabase),
    getLatestExchangeRates(),
  ]);

  const queryError = installmentsError ?? housesError ?? expensesError;

  return (
    <>
      {/* A DB error here (e.g. a migration pending on this environment) used
          to be silently swallowed into empty totals -- loud instead. */}
      {queryError && (
        <div className="p-4 md:p-8">
          <Alert variant="destructive">
            <AlertDescription>Error al cargar el dashboard. Intenta recargar la página; si persiste, contacta al administrador.</AlertDescription>
          </Alert>
        </div>
      )}
      <DashboardPageClient
        installments={(installments as DashboardInstallment[] | null) ?? []}
        houses={(houses as DashboardHouse[] | null) ?? []}
        expenses={(expenses as DashboardExpense[] | null) ?? []}
        payments={(payments as unknown as PaymentRow[] | null) ?? []}
        gracePeriodDays={gracePeriodDays}
        exchangeRates={exchangeRates}
      />
    </>
  );
}

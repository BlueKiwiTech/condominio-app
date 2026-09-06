import { createClient } from '@/lib/supabase/server';
import { MonthlyReportClient } from '@/components/reports/MonthlyReportClient';
import type { ReportInstallment, HouseInfo, CreditForReport } from '@/lib/reporting/monthlyReport';

// A6 · Reporte mensual (RPRT-04) — month picker, currency/status filters,
// per-house expected/paid/pending/favor, per-currency footer totals. Fetches
// every installment/house/credit once; all month/currency/status filtering
// happens client-side via the pure lib/reporting/monthlyReport.ts helpers
// (small single-community dataset, same trade-off already accepted by the
// dashboard's identical fetch-everything-once approach).
export default async function ReportePage() {
  const supabase = await createClient();

  const [{ data: installments }, { data: houses }, { data: credits }] = await Promise.all([
    supabase.from('condo_installments').select('house_id, amount, amount_paid, currency, due_date, status'),
    supabase.from('condo_houses').select('id, house_number, house_name').order('house_number'),
    supabase.from('condo_house_credits').select('house_id, currency, balance'),
  ]);

  return (
    <MonthlyReportClient
      installments={(installments as ReportInstallment[] | null) ?? []}
      houses={(houses as HouseInfo[] | null) ?? []}
      credits={(credits as CreditForReport[] | null) ?? []}
    />
  );
}

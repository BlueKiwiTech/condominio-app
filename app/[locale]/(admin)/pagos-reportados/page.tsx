import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { PaymentReportsPageClient } from '@/components/paymentReports/PaymentReportsPageClient';
import type { PaymentReportRow, InstallmentLookup, SpecialInstallment } from '@/components/paymentReports/types';

// Admin review queue for resident-submitted payment reports (see
// lib/actions/residentPayments.ts / the condo_payment_reports migration).
// RLS's condo_payment_reports_admin_all policy already scopes this to the
// signed-in admin, same as every other admin list page -- no service-role
// client needed here.
export default async function PaymentReportsPage() {
  const t = await getTranslations('paymentReports');
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('condo_payment_reports')
    .select(
      'id, house_id, amount, currency, payment_date, reference, notes, installment_ids, status, screenshot_path, created_at, resulting_payment_batch_id, resulting_receipt_number, rejection_reason, condo_houses(house_number, house_name)',
    )
    .order('created_at', { ascending: false });

  const rows = (reports as unknown as PaymentReportRow[] | null) ?? [];

  // installment_ids is a plain uuid[] column, not a real foreign key
  // PostgREST can embed -- fetch the referenced cuotas' names separately
  // and hand the client component a flat id -> {name, due_date} lookup.
  const allInstallmentIds = Array.from(new Set(rows.flatMap((r) => r.installment_ids ?? [])));
  const { data: installments } =
    allInstallmentIds.length > 0
      ? await supabase.from('condo_installments').select('id, name, due_date').in('id', allInstallmentIds)
      : { data: [] as { id: string; name: string; due_date: string }[] };

  const installmentLookup: InstallmentLookup = Object.fromEntries(
    (installments ?? []).map((i) => [i.id, { name: i.name, due_date: i.due_date }]),
  );

  // Pending special cuotas of the houses with a report waiting to be confirmed: the admin
  // can pick them in the confirm dialog (confirmPaymentReport re-validates the selection).
  const waitingHouseIds = Array.from(new Set(rows.filter((r) => r.status === 'pending').map((r) => r.house_id)));
  const { data: specials } =
    waitingHouseIds.length > 0
      ? await supabase
          .from('condo_installments')
          .select('id, house_id, name, due_date, amount, amount_paid, currency, condo_installment_templates!inner(installment_type)')
          .in('house_id', waitingHouseIds)
          .in('status', ['pending', 'partial'])
          .eq('condo_installment_templates.installment_type', 'special')
          .is('deleted_at', null)
          .order('due_date')
      : { data: [] };
  const specialInstallments: SpecialInstallment[] = ((specials as unknown as Array<SpecialInstallment & Record<string, unknown>> | null) ?? []).map(
    (s) => ({
      id: s.id,
      house_id: s.house_id,
      name: s.name,
      due_date: s.due_date,
      amount: Number(s.amount),
      amount_paid: Number(s.amount_paid),
      currency: s.currency,
    }),
  );

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <PaymentReportsPageClient reports={rows} installmentLookup={installmentLookup} specialInstallments={specialInstallments} />
    </div>
  );
}

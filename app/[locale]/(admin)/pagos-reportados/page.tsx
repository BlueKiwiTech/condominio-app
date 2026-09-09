import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { PaymentReportsPageClient } from '@/components/paymentReports/PaymentReportsPageClient';
import type { PaymentReportRow, InstallmentLookup } from '@/components/paymentReports/types';

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
      'id, house_id, amount, currency, payment_date, reference, notes, installment_ids, status, screenshot_path, created_at, resulting_payment_batch_id, resulting_receipt_number, condo_houses(house_number, house_name)',
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

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <PaymentReportsPageClient reports={rows} installmentLookup={installmentLookup} />
    </Column>
  );
}

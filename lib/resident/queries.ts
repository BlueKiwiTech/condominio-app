// Phase 7 (Resident Portal) data layer. Per PLAN.md's locked Pattern A:
// residents never get a Supabase Auth session, so every resident read goes
// through the SERVICE-ROLE client (bypasses RLS entirely), manually scoped
// by house_id in application code — never the anon/cookie-based client used
// by admin Server Components. RLS stays enabled on every table as a backstop
// for the admin path only (Phase 3 decision).
import { createServiceClient } from '@/lib/supabase/service';
import type { InstallmentStatus } from '@/lib/cuotas/status';
import type { InstallmentType } from '@/components/cuotas/types';
import type { PaymentRow } from '@/components/payments/types';

export type Currency = 'USD' | 'Bs' | 'USDT';

export type ResidentHouse = {
  id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
};

export type ResidentPerson = {
  id: string;
  resident_name: string;
  resident_phone: string | null;
};

export type ResidentInstallment = {
  id: string;
  house_id: string;
  template_id: string | null;
  installment_number: number;
  name: string;
  amount: number;
  amount_paid: number;
  currency: Currency;
  due_date: string;
  status: InstallmentStatus;
  // Nested via template_id — used to split the "cuota especial" list section
  // from the recurring-cuota month grid on /mis-cuotas (V3). Null only if a
  // template was ever hard-deleted out from under an installment, which
  // CUOT-06's payment-guard prevents in practice.
  condo_installment_templates: { installment_type: InstallmentType } | null;
};

export type ResidentCredit = { currency: Currency; balance: number };

export type ResidentCommunity = { name: string; phone: string | null; grace_period_days: number };

export type ResidentReportStatus = 'pending' | 'confirmed' | 'rejected';

// condo_payment_reports for this house, every status -- shown on /mis-pagos
// so a resident always sees their self-reported payment (pending, confirmed,
// or rejected) rather than it silently vanishing once an admin reviews it.
export type ResidentPaymentReport = {
  id: string;
  amount: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  installment_ids: string[];
  status: ResidentReportStatus;
  // Set once an admin's confirm auto-registers the real payment (see
  // lib/actions/paymentReports.ts's confirmPaymentReport) -- null while
  // pending/rejected, and for a confirmed report with no tagged cuotas.
  resulting_payment_batch_id: string | null;
};

export type ResidentPortalData = {
  house: ResidentHouse | null;
  residents: ResidentPerson[];
  installments: ResidentInstallment[];
  payments: PaymentRow[];
  paymentReports: ResidentPaymentReport[];
  credits: ResidentCredit[];
  community: ResidentCommunity | null;
};

/**
 * Single fetch used by all three resident portal pages (V2/V3/V4) — a small
 * single-house dataset, so a modest overfetch (e.g. /mis-pagos also pulling
 * house/residents) is a fine tradeoff for one shared, consistent helper over
 * three narrower ones.
 */
export async function getResidentPortalData(houseId: string): Promise<ResidentPortalData> {
  const supabase = createServiceClient();

  const [
    { data: house },
    { data: residents },
    { data: installments },
    { data: payments },
    { data: reports },
    { data: credits },
    { data: community },
  ] = await Promise.all([
      supabase
        .from('condo_houses')
        .select('id, house_number, house_name, owner_name, owner_phone, owner_email')
        .eq('id', houseId)
        .maybeSingle(),
      supabase
        .from('condo_house_residents')
        .select('id, resident_name, resident_phone')
        .eq('house_id', houseId)
        .order('created_at'),
      supabase
        .from('condo_installments')
        .select(
          'id, house_id, template_id, installment_number, name, amount, amount_paid, currency, due_date, status, condo_installment_templates(installment_type)',
        )
        .eq('house_id', houseId)
        .order('due_date'),
      supabase
        .from('condo_payments')
        .select(
          'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
        )
        .eq('house_id', houseId)
        .order('payment_date', { ascending: false }),
      supabase
        .from('condo_payment_reports')
        .select('id, amount, currency, payment_date, reference, installment_ids, status, resulting_payment_batch_id')
        .eq('house_id', houseId)
        .order('payment_date', { ascending: false }),
      supabase.from('condo_house_credits').select('currency, balance').eq('house_id', houseId),
      supabase.from('condo_communities').select('name, phone, grace_period_days').limit(1).maybeSingle(),
    ]);

  return {
    house: (house as ResidentHouse | null) ?? null,
    residents: (residents as ResidentPerson[] | null) ?? [],
    installments: (installments as unknown as ResidentInstallment[] | null) ?? [],
    payments: (payments as unknown as PaymentRow[] | null) ?? [],
    paymentReports: (reports as ResidentPaymentReport[] | null) ?? [],
    credits: (credits as ResidentCredit[] | null) ?? [],
    community: (community as ResidentCommunity | null) ?? null,
  };
}

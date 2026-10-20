import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getLatestExchangeRates } from '@/lib/actions/exchangeRate';
import { resolveAdminGracePeriodDays } from '@/lib/auth/adminGracePeriod';
import { PaymentFormClient } from '@/components/payments/PaymentFormClient';
import type { HouseOption, PendingInstallment, HouseCredit } from '@/components/payments/types';

export default async function NuevoPagoPage() {
  const t = await getTranslations('payments.new');
  const supabase = await createClient();

  const [{ data: houses }, { data: installments }, { data: credits }, gracePeriodDays, exchangeRates] = await Promise.all([
    supabase.from('condo_houses').select('id, house_number, house_name, owner_name').order('house_number'),
    supabase
      .from('condo_installments')
      .select('id, house_id, name, amount, amount_paid, currency, due_date, status, installment_number, condo_installment_templates(installment_type)')
      .in('status', ['pending', 'partial'])
      .is('deleted_at', null)
      // Every pending/partial cuota, past AND future — a payment here
      // auto-allocates across all of them (2026-09-24 decision, no admin
      // checklist), but which ones actually get paid is now capped to
      // vencidas + up to 30 days ahead, regardless of currency, in
      // lib/payments/allocate.ts's filterEligibleForConversionWindow
      // (2026-09-29 business rule from Josi, extended from Bs-only to all
      // currencies 2026-10-01). This used to be hard-filtered to
      // due_date <= today (2026-09-27 fix, to stop a Bs payment from
      // silently prepaying every future horizon-generated month at that
      // day's rate) — that protection now lives in the allocator itself
      // instead of being a blanket ban here.
      .order('due_date'),
    supabase.from('condo_house_credits').select('house_id, currency, balance').gt('balance', 0),
    resolveAdminGracePeriodDays(supabase),
    getLatestExchangeRates(),
  ]);

  // The template type only tells the form which cuotas can be picked (special
  // ones); registerPayment re-validates the selection on the server.
  const pendingInstallments: PendingInstallment[] = (
    (installments as unknown as Array<
      Omit<PendingInstallment, 'is_special'> & {
        condo_installment_templates: { installment_type: string } | { installment_type: string }[] | null;
      }
    > | null) ?? []
  ).map(({ condo_installment_templates, ...rest }) => {
    const template = Array.isArray(condo_installment_templates) ? condo_installment_templates[0] : condo_installment_templates;
    return { ...rest, is_special: template?.installment_type === 'special' };
  });

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <PaymentFormClient
        houses={(houses as HouseOption[] | null) ?? []}
        pendingInstallments={pendingInstallments}
        houseCredits={(credits as HouseCredit[] | null) ?? []}
        gracePeriodDays={gracePeriodDays}
        exchangeRates={exchangeRates}
      />
    </div>
  );
}

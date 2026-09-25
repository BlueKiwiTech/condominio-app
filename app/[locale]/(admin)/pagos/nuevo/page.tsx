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
      .select('id, house_id, name, amount, amount_paid, currency, due_date, status, installment_number')
      .in('status', ['pending', 'partial'])
      .order('due_date'),
    supabase.from('condo_house_credits').select('house_id, currency, balance').gt('balance', 0),
    resolveAdminGracePeriodDays(supabase),
    getLatestExchangeRates(),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <PaymentFormClient
        houses={(houses as HouseOption[] | null) ?? []}
        pendingInstallments={(installments as PendingInstallment[] | null) ?? []}
        houseCredits={(credits as HouseCredit[] | null) ?? []}
        gracePeriodDays={gracePeriodDays}
        exchangeRates={exchangeRates}
      />
    </div>
  );
}

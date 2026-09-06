import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { PaymentFormClient } from '@/components/payments/PaymentFormClient';
import type { HouseOption, PendingInstallment, HouseCredit } from '@/components/payments/types';

export default async function NuevoPagoPage() {
  const t = await getTranslations('payments.new');
  const supabase = await createClient();

  const [{ data: houses }, { data: installments }, { data: credits }] = await Promise.all([
    supabase.from('condo_houses').select('id, house_number, house_name, owner_name').order('house_number'),
    supabase
      .from('condo_installments')
      .select('id, house_id, name, amount, amount_paid, currency, due_date, status, installment_number')
      .in('status', ['pending', 'partial'])
      .order('due_date'),
    supabase.from('condo_house_credits').select('house_id, currency, balance').gt('balance', 0),
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <PaymentFormClient
        houses={(houses as HouseOption[] | null) ?? []}
        pendingInstallments={(installments as PendingInstallment[] | null) ?? []}
        houseCredits={(credits as HouseCredit[] | null) ?? []}
      />
    </Column>
  );
}

import { getTranslations } from 'next-intl/server';
import { Column, Heading } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { PaymentsPageClient } from '@/components/payments/PaymentsPageClient';
import type { PaymentRow, HouseOption } from '@/components/payments/types';

export default async function PagosPage() {
  const t = await getTranslations('payments');
  const supabase = await createClient();

  const [{ data: payments }, { data: houses }] = await Promise.all([
    supabase
      .from('condo_payments')
      .select(
        'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
      )
      .order('created_at', { ascending: false }),
    supabase.from('condo_houses').select('id, house_number, house_name, owner_name').order('house_number'),
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>
      <PaymentsPageClient
        initialPayments={(payments as unknown as PaymentRow[] | null) ?? []}
        houses={(houses as HouseOption[] | null) ?? []}
      />
    </Column>
  );
}

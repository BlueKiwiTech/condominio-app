import { getTranslations } from 'next-intl/server';
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
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>
      <PaymentsPageClient
        initialPayments={(payments as unknown as PaymentRow[] | null) ?? []}
        houses={(houses as HouseOption[] | null) ?? []}
      />
    </div>
  );
}

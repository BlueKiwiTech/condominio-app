import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import type { PaymentRow } from '@/components/payments/types';
import { groupPaymentsByBatch } from '@/components/payments/types';
import { currencyLabel, formatMoney } from '@/lib/currency';

export default async function PaymentDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const t = await getTranslations('payments.detail');
  const supabase = await createClient();

  const [{ data: payments }, { data: userData }] = await Promise.all([
    supabase
      .from('condo_payments')
      .select(
        'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
      )
      .eq('payment_batch_id', batchId),
    supabase.auth.getUser(),
  ]);

  const rows = (payments as unknown as PaymentRow[] | null) ?? [];
  if (rows.length === 0) notFound();

  const [batch] = groupPaymentsByBatch(rows);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <Link
        href="/pagos"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('back')}
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">
                {batch.receiptNumber ? `#${String(batch.receiptNumber).padStart(4, '0')}` : t('noReceipt')}
              </h2>
              <p className="text-sm text-muted-foreground">{batch.paymentDate}</p>
            </div>
            <p className="text-lg font-semibold">
              {formatMoney(batch.totalAmount)} {currencyLabel(batch.currency)}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('house')}</p>
            <p className="text-sm">{batch.houseLabel}</p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cuotasCovered')}</p>
            <div className="flex flex-col gap-2">
              {batch.rows.map((row) => (
                <div key={row.id} className="flex w-full items-center justify-between">
                  <span className="text-sm">{row.condo_installments?.name ?? '—'}</span>
                  <span className="text-sm tabular-nums">
                    {formatMoney(row.amount_paid)} {currencyLabel(row.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('currency')}</p>
              <p className="text-sm">{currencyLabel(batch.currency)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('reference')}</p>
              <p className="text-sm">{batch.reference ?? '—'}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('registeredBy')}</p>
              <p className="text-sm">{userData?.user?.email ?? '—'}</p>
            </div>
          </div>

          {batch.rows.some((r) => r.notes) && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('notes')}</p>
              {batch.rows
                .filter((r) => r.notes)
                .map((r) => (
                  <p key={r.id} className="text-sm text-muted-foreground">
                    &ldquo;{r.notes}&rdquo;
                  </p>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { parseISO } from 'date-fns';
import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PaymentRow } from '@/components/payments/types';
import { groupPaymentsByBatch } from '@/components/payments/types';
import { currencyLabel, formatMoney } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';

export default async function PaymentDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const [t, locale] = await Promise.all([getTranslations('payments.detail'), getLocale()]);
  const supabase = await createClient();

  const [{ data: payments }, { data: userData }] = await Promise.all([
    supabase
      .from('condo_payments')
      .select(
        'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, funding_breakdown, condo_houses(house_number, house_name), condo_installments(name, due_date)',
      )
      .eq('payment_batch_id', batchId),
    supabase.auth.getUser(),
  ]);

  const rows = (payments as unknown as PaymentRow[] | null) ?? [];
  if (rows.length === 0) notFound();

  const [batch] = groupPaymentsByBatch(rows);

  // Only show the per-cuota-currency breakdown separately when it actually
  // diverges from what was received (a cross-currency allocation happened)
  // -- for the common same-currency case they're identical, and showing the
  // same number twice with no explanation is exactly the confusion this
  // fixes (2026-09-29, user feedback on receipt #0022: "the payment was
  // $100, not 320 Bs and $99.62 -- it's confusing").
  const receivedEntries = Object.entries(batch.receivedByCurrency);
  const totalsEntries = Object.entries(batch.totalsByCurrency);
  const breakdownDiffersFromReceived =
    totalsEntries.length !== receivedEntries.length ||
    totalsEntries.some(([currency, amount]) => batch.receivedByCurrency[currency as keyof typeof batch.receivedByCurrency] !== amount);

  // A wallet top-up isn't a cuota being paid down -- it's money parked in
  // the house's credit balance for later use, so it's set apart in its own
  // footer row instead of blending into the cuota list above (user request,
  // 2026-09-29).
  const cuotaRows = batch.rows.filter((r) => r.installment_id !== null);
  const walletRows = batch.rows.filter((r) => r.installment_id === null);

  const renderRow = (row: PaymentRow) => {
    // Only present for a cross-currency allocation (this row's cuota
    // currency differs from what was actually drawn from the received
    // payment/wallet) -- see FundingSourceEntry.
    const funding = row.funding_breakdown?.[0] ?? null;
    // The rate is always expressed as "units of the non-USD currency per 1
    // USD" (see lib/exchangeRate.ts) -- that non-USD side is whichever of
    // the cuota's own currency or the drawn currency isn't USD (either can
    // be the odd one out depending on which side of the conversion is USD).
    const rateCurrency = row.currency !== 'USD' ? row.currency : funding?.currency;
    const isWalletTopUp = row.installment_id === null;
    return (
      <TableRow key={row.id} className={isWalletTopUp ? 'bg-accent/40 hover:bg-accent/40' : undefined}>
        <TableCell className={isWalletTopUp ? 'whitespace-normal font-semibold' : 'whitespace-normal'}>
          {isWalletTopUp ? t('walletTopUp') : (row.condo_installments?.name ?? '—')}
        </TableCell>
        <TableCell>{formatShortDate(parseISO(row.payment_date), locale)}</TableCell>
        <TableCell>
          {funding?.exchangeRate && rateCurrency ? `${formatMoney(funding.exchangeRate)} ${currencyLabel(rateCurrency)}/$` : '—'}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {funding ? `${formatMoney(funding.amountDrawn)} ${currencyLabel(funding.currency)}` : '—'}
        </TableCell>
        <TableCell className={isWalletTopUp ? 'text-right font-semibold tabular-nums' : 'text-right tabular-nums'}>
          {formatMoney(row.amount_paid)} {currencyLabel(row.currency)}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
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
              <p className="text-sm text-muted-foreground">{formatShortDate(parseISO(batch.paymentDate), locale)}</p>
              <p className="text-sm">{batch.houseLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-col items-end gap-0.5">
                {receivedEntries.map(([currency, amount]) => (
                  <p key={currency} className="text-xl font-bold">
                    {formatMoney(amount ?? 0)} {currencyLabel(currency)}
                  </p>
                ))}
              </div>
              {breakdownDiffersFromReceived && (
                <div className="flex flex-col items-end gap-0.5 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('appliedByCurrency')}</p>
                  {totalsEntries.map(([currency, amount]) => (
                    <p key={currency} className="text-sm text-muted-foreground">
                      {formatMoney(amount ?? 0)} {currencyLabel(currency)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
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

      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cuotasCovered')}</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columnConcept')}</TableHead>
                <TableHead>{t('columnDate')}</TableHead>
                <TableHead>{t('columnRate')}</TableHead>
                <TableHead className="text-right">{t('columnConverted')}</TableHead>
                <TableHead className="text-right">{t('columnAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuotaRows.map((row) => renderRow(row))}
            </TableBody>
            {walletRows.length > 0 && <TableFooter>{walletRows.map((row) => renderRow(row))}</TableFooter>}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

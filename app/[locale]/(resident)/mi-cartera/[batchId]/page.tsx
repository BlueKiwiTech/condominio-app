import { notFound, redirect } from 'next/navigation';
import { parseISO } from 'date-fns';
import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { getResidentPaymentBatch } from '@/lib/resident/queries';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { groupPaymentsByBatch } from '@/components/payments/types';
import type { PaymentRow } from '@/components/payments/types';
import { currencyLabel, formatMoney } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';

// RSDT-03's abono detail view -- same layout as the admin's /pagos/[batchId],
// scoped to the resident's own house via getResidentPaymentBatch (never the
// admin's supabase.auth.getUser()-based query, since residents carry no
// Supabase Auth session -- see PLAN.md's Pattern A). No "registrado por" row:
// that's internal admin bookkeeping, not something a resident needs.
export default async function MiCarteraDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  const [t, locale] = await Promise.all([getTranslations('payments.detail'), getLocale()]);

  const rows = await getResidentPaymentBatch(session.house_id, batchId);
  if (rows.length === 0) notFound();

  const [batch] = groupPaymentsByBatch(rows);

  // Only show the per-cuota-currency breakdown separately when it actually
  // diverges from what was received (a cross-currency allocation happened).
  const receivedEntries = Object.entries(batch.receivedByCurrency);
  const totalsEntries = Object.entries(batch.totalsByCurrency);
  const breakdownDiffersFromReceived =
    totalsEntries.length !== receivedEntries.length ||
    totalsEntries.some(([currency, amount]) => batch.receivedByCurrency[currency as keyof typeof batch.receivedByCurrency] !== amount);

  const cuotaRows = batch.rows.filter((r) => r.installment_id !== null);
  const walletRows = batch.rows.filter((r) => r.installment_id === null);

  const renderRow = (row: PaymentRow) => {
    const funding = row.funding_breakdown?.[0] ?? null;
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
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/mi-cartera"
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

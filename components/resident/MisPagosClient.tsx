'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { groupPaymentsByBatch, type PaymentBatch, type PaymentRow } from '@/components/payments/types';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { ReportPaymentDialog } from './ReportPaymentDialog';
import { ListRow } from './ListRow';
import { CurrencyAmountList } from './CurrencyAmountList';
import type { ResidentInstallment, ResidentPaymentReport, ResidentReportStatus } from '@/lib/resident/queries';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

function reportTagVariant(status: ResidentReportStatus): 'warning' | 'success' | 'destructive' {
  if (status === 'confirmed') return 'success';
  if (status === 'rejected') return 'destructive';
  return 'warning';
}

// Year filter pill row — a plain neutral/primary toggle, not a status
// signal, so it stays outside the success/warning/destructive trio.
function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

type ListItem =
  | { kind: 'payment'; date: string; batch: PaymentBatch }
  | { kind: 'report'; date: string; report: ResidentPaymentReport };

export function MisPagosClient({
  payments,
  installments,
  pendingInstallments,
  reports,
  exchangeRates,
}: {
  payments: PaymentRow[];
  installments: ResidentInstallment[];
  pendingInstallments: ResidentInstallment[];
  reports: ResidentPaymentReport[];
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
}) {
  const t = useTranslations('residentPayments');
  const tHome = useTranslations('residentHome');
  const locale = useLocale();
  // Sidebar's "Reportar pago" item (PO request 2026-09-18) deep-links here
  // with ?report=1 to auto-open the dialog -- read once via a lazy
  // initializer (not an effect-driven setState, which cascading-render
  // lint rules flag) and stripped from the URL right after so a refresh or
  // back-nav doesn't reopen it.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reportOpen, setReportOpen] = useState(() => searchParams.get('report') === '1');
  useEffect(() => {
    if (searchParams.get('report') === '1') router.replace(pathname);
  }, [searchParams, pathname, router]);

  const batches = useMemo(() => groupPaymentsByBatch(payments), [payments]);

  const installmentNameById = useMemo(() => new Map(installments.map((i) => [i.id, i.name])), [installments]);

  const items = useMemo<ListItem[]>(() => {
    const paymentItems: ListItem[] = batches.map((batch) => ({ kind: 'payment', date: batch.paymentDate, batch }));
    // A confirmed report with a resulting_payment_batch_id has already been
    // auto-registered as a real payment (lib/actions/paymentReports.ts's
    // confirmPaymentReport) -- that batch is already in `batches` above, so
    // showing the report card too would look like a duplicate payment.
    const reportItems: ListItem[] = reports
      .filter((report) => !(report.status === 'confirmed' && report.resulting_payment_batch_id))
      .map((report) => ({ kind: 'report', date: report.payment_date, report }));
    return [...paymentItems, ...reportItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, reports]);

  const years = useMemo(
    () => Array.from(new Set(items.map((item) => item.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [items],
  );

  const [yearFilter, setYearFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (yearFilter === 'all' ? items : items.filter((item) => item.date.slice(0, 4) === yearFilter)),
    [items, yearFilter],
  );

  // Self-reported payments are never actual condo_payments rows (see
  // lib/actions/residentPayments.ts) -- excluded from the totals so the
  // per-currency sum only ever reflects real, registered payments.
  const totalsByCurrency = useMemo(() => {
    const totals: CurrencyAmountMap = {};
    for (const item of filtered) {
      if (item.kind !== 'payment') continue;
      totals[item.batch.currency] = (totals[item.batch.currency] ?? 0) + item.batch.totalAmount;
    }
    return totals;
  }, [filtered]);

  // An untagged report confirmed with no cuotas picked doesn't pay anything
  // off directly -- it becomes wallet credit (board request 2026-09-18:
  // "adding money to the wallet" vs. "applying that money to a specific
  // debt" are two different events). Labeled as such instead of looking
  // like a numbered receipt for a specific cuota, which is what a bare
  // #0024-style title would otherwise imply.
  const reportRow = (report: ResidentPaymentReport) => {
    const isCreditTopUp =
      report.status === 'confirmed' && report.installment_ids.length === 0 && report.resulting_receipt_number !== null;
    const date = formatShortDate(new Date(report.payment_date), locale);
    return (
      <ListRow
        key={report.id}
        title={
          isCreditTopUp
            ? t('creditAdded')
            : report.installment_ids.length > 0
              ? report.installment_ids.map((id) => installmentNameById.get(id) ?? '—').join(', ')
              : t('reportFallback')
        }
        subtitle={isCreditTopUp ? `${date} · #${String(report.resulting_receipt_number).padStart(4, '0')}` : date}
        amount={formatAmount(report.amount, report.currency)}
        tag={{ label: t(`reportStatus.${report.status}`), variant: reportTagVariant(report.status) }}
      />
    );
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">{t('heading')}</h1>
        <Button type="button" size="lg" onClick={() => setReportOpen(true)}>
          <Plus className="size-4" />
          {tHome('reportPayment')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip label={t('filterAll')} selected={yearFilter === 'all'} onClick={() => setYearFilter('all')} />
        {years.map((y) => (
          <FilterChip key={y} label={y} selected={yearFilter === y} onClick={() => setYearFilter(y)} />
        ))}
      </div>

      {Object.keys(totalsByCurrency).length > 0 && (
        <Card className="bg-muted/50 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('totalFor', { period: yearFilter === 'all' ? t('filterAll') : yearFilter })}
            </span>
            <CurrencyAmountList amounts={totalsByCurrency} emptyLabel={t('empty')} />
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {filtered.map((item) =>
            item.kind === 'payment' ? (
              <ListRow
                key={item.batch.batchId}
                title={[
                  item.batch.receiptNumber ? `#${String(item.batch.receiptNumber).padStart(4, '0')}` : t('receipt'),
                  item.batch.installmentNames.join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                subtitle={formatShortDate(new Date(item.batch.paymentDate), locale)}
                amount={formatAmount(item.batch.totalAmount, item.batch.currency)}
                tag={{ label: t('reportStatus.confirmed'), variant: 'success' }}
              />
            ) : (
              reportRow(item.report)
            ),
          )}
        </div>
      )}

      {reportOpen && (
        <ReportPaymentDialog
          pendingInstallments={pendingInstallments}
          exchangeRates={exchangeRates}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

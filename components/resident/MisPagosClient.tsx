'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { AlertTriangle, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from 'cn';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { creditsByCurrency, type CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { ReportPaymentDialog } from './ReportPaymentDialog';
import { ListRow } from './ListRow';
import { CurrencyAmountList } from './CurrencyAmountList';
import type { ResidentInstallment, ResidentPaymentReport, ResidentReportStatus, ResidentCredit } from '@/lib/resident/queries';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

function reportTagVariant(status: ResidentReportStatus): 'warning' | 'success' | 'destructive' {
  if (status === 'confirmed') return 'success';
  if (status === 'rejected') return 'destructive';
  return 'warning';
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// "Todo el año" toggle pill — a plain neutral/primary toggle, not a status
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

export function MisPagosClient({
  installments,
  pendingInstallments,
  reports,
  credits,
  exchangeRates,
  graceDays = 0,
}: {
  installments: ResidentInstallment[];
  pendingInstallments: ResidentInstallment[];
  reports: ResidentPaymentReport[];
  credits: ResidentCredit[];
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
  graceDays?: number;
}) {
  const t = useTranslations('residentPayments');
  const tHome = useTranslations('residentHome');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);
  // Sidebar's "Reportar pago" item (PO request 2026-09-18) deep-links here
  // with ?report=1 to auto-open the dialog. A lazy useState initializer only
  // ran once on mount, so clicking the sidebar link while already on this
  // page (a Next.js searchParams update with no remount) silently failed to
  // open it -- fixed 2026-09-19 with React's documented "adjusting state
  // when a prop changes" pattern (setState during render, guarded against
  // re-firing via lastHandledReportParam) instead of an effect-driven
  // setState, which react-hooks/set-state-in-effect flags. The effect below
  // only touches the URL (a real external system), never local state.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportParam = searchParams.get('report');
  const [lastHandledReportParam, setLastHandledReportParam] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  if (reportParam === '1' && lastHandledReportParam !== reportParam) {
    setLastHandledReportParam(reportParam);
    setReportOpen(true);
  } else if (reportParam === null && lastHandledReportParam !== null) {
    // Resets the tracker once the URL is cleared back to /mi-cartera, so the
    // next ?report=1 click (the param only ever toggles between these two
    // values) is recognized as new instead of matching the last-handled '1'.
    setLastHandledReportParam(null);
  }
  useEffect(() => {
    if (reportParam === '1') router.replace(pathname);
  }, [reportParam, pathname, router]);

  const installmentNameById = useMemo(() => new Map(installments.map((i) => [i.id, i.name])), [installments]);

  // "Mi Cartera" (2026-09-19/21 redesign): the wallet balance
  // (condo_house_credits, confirmed) and reports still awaiting admin
  // review are shown as two separate at-a-glance totals, rather than
  // folded into one combined "pagos" figure.
  const available = useMemo(() => creditsByCurrency(credits), [credits]);
  const pendingBalance = useMemo(() => {
    const totals: CurrencyAmountMap = {};
    for (const report of reports) {
      if (report.status !== 'pending') continue;
      totals[report.currency] = (totals[report.currency] ?? 0) + report.amount;
    }
    return totals;
  }, [reports]);

  // reports arrives ordered by created_at DESC (lib/resident/queries.ts) --
  // the first entry is the most recently SUBMITTED report, which is what
  // "last report" means for the rejected-banner check (not necessarily the
  // most recent payment_date, which the resident controls when reporting).
  const lastReport = reports[0] ?? null;

  // Month/year filter (same pattern as MiComunidadClient's Gastos filter,
  // 2026-09-21 board request): a specific month + year, or "todo el año" as
  // a separate mutually-exclusive toggle rather than a 13th month option.
  const availableYears = useMemo(() => {
    const yrs = new Set<number>([getYear(today)]);
    for (const r of reports) yrs.add(getYear(parseISO(r.payment_date)));
    return Array.from(yrs).sort((a, b) => a - b);
  }, [reports, today]);

  const [yearValue, setYearValue] = useState(String(getYear(today)));
  const [monthValue, setMonthValue] = useState(String(getMonth(today) + 1));
  const [wholeYear, setWholeYear] = useState(false);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        label: capitalize(format(new Date(2000, i, 1), 'LLLL', { locale: dateLocale })),
        value: String(i + 1),
      })),
    [dateLocale],
  );

  const yearOptions = useMemo(() => availableYears.map((y) => ({ label: String(y), value: String(y) })), [availableYears]);

  const filteredReports = useMemo(() => {
    const year = Number(yearValue);
    return reports.filter((r) => {
      const d = parseISO(r.payment_date);
      if (getYear(d) !== year) return false;
      if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
      return true;
    });
  }, [reports, yearValue, monthValue, wholeYear]);

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

      {lastReport?.status === 'rejected' && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{t('lastReportRejected')}</AlertDescription>
        </Alert>
      )}

      <div className="flex w-full flex-wrap gap-4">
        <Card className="min-w-[10rem] flex-1 border-success/20 bg-success/15 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-success uppercase">{t('available')}</span>
            <CurrencyAmountList amounts={available} emptyLabel={t('noBalance')} />
          </div>
        </Card>
        <Card className="min-w-[10rem] flex-1 border-warning/20 bg-warning/30 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-warning uppercase">{t('pendingBalance')}</span>
            <CurrencyAmountList amounts={pendingBalance} emptyLabel={t('noBalance')} />
          </div>
        </Card>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">{t('abonosHeading')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={monthValue}
              onValueChange={(v) => {
                if (!v) return;
                setMonthValue(v);
                setWholeYear(false);
              }}
              disabled={wholeYear}
              items={monthOptions}
            >
              <SelectTrigger aria-label={t('monthFilterLabel')} className="h-9 min-w-[9rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearValue} onValueChange={(v) => v && setYearValue(v)} items={yearOptions}>
              <SelectTrigger aria-label={t('yearFilterLabel')} className="h-9 min-w-[6rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterChip label={t('allYear')} selected={wholeYear} onClick={() => setWholeYear((w) => !w)} />
          </div>
        </div>
        {filteredReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('abonosEmpty')}</p>
        ) : (
          <div className="flex w-full flex-col gap-2">{filteredReports.map((report) => reportRow(report))}</div>
        )}
      </div>

      {reportOpen && (
        <ReportPaymentDialog
          pendingInstallments={pendingInstallments}
          exchangeRates={exchangeRates}
          graceDays={graceDays}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

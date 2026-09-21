'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, subMonths } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis } from 'recharts';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { computeMorosos, countDelinquentHouses } from '@/lib/reporting/morosos';
import {
  collectedInMonth,
  monthlyIncomeSeries,
  outstandingByCurrency,
  pendingExpensesInMonth,
  percentChange,
} from '@/lib/reporting/dashboard';
import { daysToCloseOfMonth } from '@/lib/reporting/dateMath';
import { groupPaymentsByBatch } from '@/components/payments/types';
import { CURRENCIES, type DashboardExpense, type DashboardHouse, type DashboardInstallment, type PaymentRow } from './types';
import { currencyLabel, formatAmount, formatMoney } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { ExchangeRateCard } from './ExchangeRateCard';
import { StatCard } from './StatCard';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

// Fixed per-currency identity across the three income charts below, mapped
// onto the app's --chart-1..3 CSS vars (app/globals.css) so each stays
// theme/dark-mode consistent. Kept as three SEPARATE charts rather than one
// combined multi-series chart: a typical cuota is single/double-digit in
// USD but 100x+ that in Bs at current exchange rates, so sharing one axis
// would flatten the USD/USDT lines (dual axes are the wrong move regardless).
const CHART_VAR_BY_CURRENCY: Record<string, string> = { Bs: 'var(--chart-2)', USD: 'var(--chart-1)', USDT: 'var(--chart-3)' };

function CurrencyAmountList({
  amounts,
  emptyLabel,
}: {
  amounts: Partial<Record<string, number>>;
  emptyLabel: string;
}) {
  const entries = Object.entries(amounts).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([currency, amount]) => (
        <span key={currency} className="text-2xl font-bold">
          {formatAmount(amount ?? 0, currency)}
        </span>
      ))}
    </div>
  );
}

export function DashboardPageClient({
  installments,
  houses,
  expenses,
  payments,
  gracePeriodDays,
  exchangeRates,
}: {
  installments: DashboardInstallment[];
  houses: DashboardHouse[];
  expenses: DashboardExpense[];
  payments: PaymentRow[];
  gracePeriodDays: number;
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;

  const today = useMemo(() => new Date(), []);
  const monthLabel = useMemo(() => format(today, 'MMMM yyyy', { locale: dateLocale }), [today, dateLocale]);
  const daysLeft = useMemo(() => daysToCloseOfMonth(today), [today]);

  const collectedThisMonth = useMemo(() => collectedInMonth(payments, today), [payments, today]);
  const collectedLastMonth = useMemo(() => collectedInMonth(payments, subMonths(today, 1)), [payments, today]);
  const outstanding = useMemo(() => outstandingByCurrency(installments), [installments]);
  const pendingExpenses = useMemo(() => pendingExpensesInMonth(expenses, today), [expenses, today]);

  const morosos = useMemo(
    () => computeMorosos(installments, houses, gracePeriodDays, today),
    [installments, houses, gracePeriodDays, today],
  );
  const morososHouseCount = useMemo(() => countDelinquentHouses(morosos), [morosos]);

  const series = useMemo(() => monthlyIncomeSeries(payments, 6, today), [payments, today]);

  const recentBatches = useMemo(() => groupPaymentsByBatch(payments).slice(0, 8), [payments]);

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{t('heading')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle', { days: daysLeft, month: monthLabel })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pagos/nuevo" className={buttonVariants({ variant: 'default' })}>
            {t('actions.registerPayment')}
          </Link>
          <Link href="/cuotas/new" className={buttonVariants({ variant: 'outline' })}>
            {t('actions.newCuota')}
          </Link>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard stripeColor="success">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('kpis.collected.title', { month: monthLabel })}</span>
            <CurrencyAmountList amounts={collectedThisMonth} emptyLabel={t('kpis.collected.empty')} />
            {CURRENCIES.filter((c) => collectedThisMonth[c] !== undefined).map((c) => {
              const change = percentChange(collectedThisMonth[c] ?? 0, collectedLastMonth[c] ?? 0);
              return (
                <span
                  key={c}
                  className={`text-xs ${change !== null && change >= 0 ? 'text-success' : 'text-destructive'}`}
                >
                  {change === null
                    ? t('kpis.collected.noPrior', { currency: currencyLabel(c) })
                    : t('kpis.collected.change', { percent: `${change >= 0 ? '+' : ''}${change.toFixed(1)}`, currency: currencyLabel(c) })}
                </span>
              );
            })}
          </div>
        </StatCard>

        <StatCard stripeColor="destructive">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('kpis.morosos.title')}</span>
            <span className="text-2xl font-bold">{t('kpis.morosos.count', { count: morososHouseCount })}</span>
            <span className="text-xs text-muted-foreground">{t('kpis.morosos.of', { total: houses.length })}</span>
          </div>
        </StatCard>

        <StatCard stripeColor="primary">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('kpis.outstanding.title')}</span>
            <CurrencyAmountList amounts={outstanding} emptyLabel={t('kpis.outstanding.empty')} />
          </div>
        </StatCard>

        <StatCard stripeColor="warning">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('kpis.pendingExpenses.title', { month: monthLabel })}</span>
            <CurrencyAmountList amounts={pendingExpenses} emptyLabel={t('kpis.pendingExpenses.empty')} />
          </div>
        </StatCard>

        <ExchangeRateCard rates={exchangeRates} />
      </div>

      <div className="flex w-full flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('chart.heading')}</h2>
        <div className="flex w-full flex-wrap gap-4">
          {CURRENCIES.map((currency) => {
            const hasData = series.some((point) => (point[currency] ?? 0) > 0);
            const chartConfig: ChartConfig = {
              [currency]: { label: currencyLabel(currency), color: CHART_VAR_BY_CURRENCY[currency] },
            };
            return (
              <div key={currency} className="min-w-[16rem] flex-1 rounded-[var(--radius)] border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-3">
                  <span className="text-sm font-semibold">{currencyLabel(currency)}</span>
                  {hasData ? (
                    <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
                      <RechartsLineChart data={series.map((p) => ({ label: p.label, [currency]: p[currency] ?? 0 }))}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} />
                        <Line
                          dataKey={currency}
                          type="monotone"
                          stroke={`var(--color-${currency})`}
                          strokeWidth={2}
                          dot={false}
                        />
                      </RechartsLineChart>
                    </ChartContainer>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('chart.empty', { currency: currencyLabel(currency) })}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('debtTable.heading')}</h2>
        <div className="rounded-[var(--radius)] border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('debtTable.house')}</TableHead>
                <TableHead>{t('debtTable.owner')}</TableHead>
                <TableHead className="text-right">{t('debtTable.owed')}</TableHead>
                <TableHead>{t('debtTable.since')}</TableHead>
                <TableHead className="text-right">{t('debtTable.daysOverdue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {morosos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-11 text-center text-sm text-muted-foreground">
                    {t('debtTable.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                morosos.map((m) => (
                  <TableRow key={`${m.house_id}-${m.currency}`}>
                    <TableCell className="h-11">{m.house_name ? `${m.house_number} · ${m.house_name}` : m.house_number}</TableCell>
                    <TableCell className="h-11">{m.owner_name ?? '—'}</TableCell>
                    <TableCell className="h-11 text-right">{formatAmount(m.owed, m.currency)}</TableCell>
                    <TableCell className="h-11">{formatShortDate(new Date(m.owedSince), locale)}</TableCell>
                    <TableCell className="h-11 text-right">
                      <Badge variant="destructive">{m.daysOverdue}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('recentPayments.heading')}</h2>
          <Link href="/pagos" className="text-sm font-medium text-primary hover:underline">
            {t('recentPayments.viewAll')}
          </Link>
        </div>
        {recentBatches.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t('recentPayments.empty')}</span>
        ) : (
          <div className="flex max-h-96 w-full flex-col gap-2 overflow-y-auto">
            {recentBatches.map((batch) => (
              <Link
                key={batch.batchId}
                href={`/pagos/${batch.batchId}`}
                className="flex w-full items-center justify-between gap-4 rounded-[var(--radius)] border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{batch.houseLabel}</span>
                  <span className="text-xs text-muted-foreground">{formatShortDate(new Date(batch.paymentDate), locale)}</span>
                </div>
                <span className="text-sm font-semibold">{formatAmount(batch.totalAmount, batch.currency)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

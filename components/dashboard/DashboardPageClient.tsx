'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
  Column,
  Row,
  Grid,
  Card,
  Heading,
  Text,
  Button,
  Tag,
  Table,
  LineChart,
  SmartLink,
  DataThemeProvider,
  type TableHeader,
} from '@once-ui-system/core';
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
import { subMonths } from 'date-fns';
import { currencyLabel } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { ExchangeRateCard } from './ExchangeRateCard';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

// Fixed per-currency identity across the three income charts below (Once
// UI's --data-* chart-color tokens, not raw hex, so they stay theme/dark-
// mode consistent) -- user request: Bs blue, USD green, USDT (Binance)
// mustard/dark yellow. Kept as three SEPARATE charts rather than one
// combined multi-series chart: a typical cuota is single/double-digit in
// USD but 100x+ that in Bs at current exchange rates, so sharing one axis
// would flatten the USD/USDT lines (or need a dual axis, which Once UI's
// LineChart doesn't support and is the wrong move regardless).
const CHART_COLOR_BY_CURRENCY: Record<string, string> = { Bs: 'blue', USD: 'green', USDT: 'yellow' };

function CurrencyAmountList({
  amounts,
  emptyLabel,
}: {
  amounts: Partial<Record<string, number>>;
  emptyLabel: string;
}) {
  const entries = Object.entries(amounts).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return (
      <Text variant="body-default-s" onBackground="neutral-weak">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <Column gap="4">
      {entries.map(([currency, amount]) => (
        <Text key={currency} variant="heading-strong-m" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatAmount(amount ?? 0, currency)}
        </Text>
      ))}
    </Column>
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

  const debtHeaders: TableHeader[] = [
    { key: 'house', content: t('debtTable.house') },
    { key: 'owner', content: t('debtTable.owner') },
    { key: 'owed', content: t('debtTable.owed') },
    { key: 'since', content: t('debtTable.since') },
    { key: 'daysOverdue', content: t('debtTable.daysOverdue') },
  ];

  const debtRows = morosos.map((m) => [
    m.house_name ? `${m.house_number} · ${m.house_name}` : m.house_number,
    m.owner_name ?? '—',
    formatAmount(m.owed, m.currency),
    formatShortDate(new Date(m.owedSince), locale),
    <Tag key={`${m.house_id}-${m.currency}`} variant="danger" label={String(m.daysOverdue)} />,
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Row fillWidth horizontal="between" vertical="center" wrap gap="16">
        <Column gap="4">
          <Heading variant="display-strong-s">{t('heading')}</Heading>
          <Text variant="body-default-m" onBackground="neutral-weak">
            {t('subtitle', { days: daysLeft, month: monthLabel })}
          </Text>
        </Column>
        <Row gap="8" wrap>
          <SmartLink href="/pagos/nuevo">
            <Button variant="primary" type="button">
              {t('actions.registerPayment')}
            </Button>
          </SmartLink>
          <SmartLink href="/cuotas/new">
            <Button variant="secondary" type="button">
              {t('actions.newCuota')}
            </Button>
          </SmartLink>
        </Row>
      </Row>

      <Grid columns="5" m={{ columns: 3 }} s={{ columns: 1 }} gap="16" fillWidth>
        <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('kpis.collected.title', { month: monthLabel })}
            </Text>
            <CurrencyAmountList amounts={collectedThisMonth} emptyLabel={t('kpis.collected.empty')} />
            {CURRENCIES.filter((c) => collectedThisMonth[c] !== undefined).map((c) => {
              const change = percentChange(collectedThisMonth[c] ?? 0, collectedLastMonth[c] ?? 0);
              return (
                <Text key={c} variant="body-default-xs" onBackground={change !== null && change >= 0 ? 'success-weak' : 'danger-weak'}>
                  {change === null
                    ? t('kpis.collected.noPrior', { currency: currencyLabel(c) })
                    : t('kpis.collected.change', { percent: `${change >= 0 ? '+' : ''}${change.toFixed(1)}`, currency: currencyLabel(c) })}
                </Text>
              );
            })}
          </Column>
        </Card>

        <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('kpis.morosos.title')}
            </Text>
            <Text variant="heading-strong-m">{t('kpis.morosos.count', { count: morososHouseCount })}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {t('kpis.morosos.of', { total: houses.length })}
            </Text>
          </Column>
        </Card>

        <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('kpis.outstanding.title')}
            </Text>
            <CurrencyAmountList amounts={outstanding} emptyLabel={t('kpis.outstanding.empty')} />
          </Column>
        </Card>

        <Card padding="24" radius="l" background="warning-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('kpis.pendingExpenses.title', { month: monthLabel })}
            </Text>
            <CurrencyAmountList amounts={pendingExpenses} emptyLabel={t('kpis.pendingExpenses.empty')} />
          </Column>
        </Card>

        <ExchangeRateCard rates={exchangeRates} />
      </Grid>

      <Column gap="16" fillWidth>
        <Heading variant="heading-strong-s">{t('chart.heading')}</Heading>
        {/* Half the app-wide default chart height (24rem) -- LineChart itself
            has no height prop; its drawing area is driven entirely by the
            DataThemeProvider context (components/Providers.tsx sets the
            24rem default for the whole app), so a local nested provider is
            the only way to shrink just these three charts. */}
        <DataThemeProvider height={12}>
          <Row gap="16" wrap fillWidth>
            {CURRENCIES.map((currency) => {
              const hasData = series.some((point) => (point[currency] ?? 0) > 0);
              return (
                <Card key={currency} padding="24" radius="l" background="neutral-alpha-weak" flex={1} minWidth={16}>
                  <Column gap="12">
                    <Text variant="label-strong-s">{currencyLabel(currency)}</Text>
                    {hasData ? (
                      <LineChart
                        series={{ key: currency, color: CHART_COLOR_BY_CURRENCY[currency] }}
                        data={series.map((p) => ({ label: p.label, [currency]: p[currency] ?? 0 }))}
                        axis="x"
                        legend={{ display: false }}
                      />
                    ) : (
                      <Text variant="body-default-s" onBackground="neutral-weak">
                        {t('chart.empty', { currency: currencyLabel(currency) })}
                      </Text>
                    )}
                  </Column>
                </Card>
              );
            })}
          </Row>
        </DataThemeProvider>
      </Column>

      <Column gap="16" fillWidth>
        <Heading variant="heading-strong-s">{t('debtTable.heading')}</Heading>
        <Table data={{ headers: debtHeaders, rows: debtRows }} emptyState={t('debtTable.empty')} />
      </Column>

      <Column gap="16" fillWidth>
        <Row horizontal="between" vertical="center">
          <Heading variant="heading-strong-s">{t('recentPayments.heading')}</Heading>
          <SmartLink href="/pagos">
            <Text variant="label-default-s">{t('recentPayments.viewAll')}</Text>
          </SmartLink>
        </Row>
        {recentBatches.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('recentPayments.empty')}
          </Text>
        ) : (
          <Column gap="8" fillWidth maxHeight={24} overflowY="auto">
            {recentBatches.map((batch) => (
              <SmartLink key={batch.batchId} href={`/pagos/${batch.batchId}`}>
                <Row
                  fillWidth
                  horizontal="between"
                  vertical="center"
                  padding="12"
                  radius="m"
                  border="neutral-alpha-weak"
                >
                  <Column gap="2">
                    <Text variant="label-strong-s">{batch.houseLabel}</Text>
                    <Text variant="body-default-xs" onBackground="neutral-weak">
                      {formatShortDate(new Date(batch.paymentDate), locale)}
                    </Text>
                  </Column>
                  <Text variant="label-strong-s">{formatAmount(batch.totalAmount, batch.currency)}</Text>
                </Row>
              </SmartLink>
            ))}
          </Column>
        )}
      </Column>
    </Column>
  );
}

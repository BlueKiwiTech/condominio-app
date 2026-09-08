'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, subMonths } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Column, Row, Card, Heading, Text, Chip, Select, Table, Tag, type TableHeader } from '@once-ui-system/core';
import {
  buildMonthlyReport,
  reportTotalsByCurrency,
  type MonthlyReportStatus,
  type ReportInstallment,
  type HouseInfo,
  type CreditForReport,
  type Currency,
} from '@/lib/reporting/monthlyReport';
import { currencyLabel } from '@/lib/currency';

const CURRENCIES: Currency[] = ['USD', 'Bs', 'USDT'];
const STATUSES: MonthlyReportStatus[] = ['pending', 'partial', 'paid', 'overdue'];

function statusVariant(status: MonthlyReportStatus): 'info' | 'warning' | 'success' | 'danger' {
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'partial') return 'warning';
  return 'info';
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

export function MonthlyReportClient({
  installments,
  houses,
  credits,
}: {
  installments: ReportInstallment[];
  houses: HouseInfo[];
  credits: CreditForReport[];
}) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(today, i);
        return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: dateLocale }), date: d };
      }),
    [today, dateLocale],
  );

  const [monthValue, setMonthValue] = useState(monthOptions[0].value);
  const [currencyFilter, setCurrencyFilter] = useState<Currency | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<MonthlyReportStatus | 'all'>('all');

  const monthDate = useMemo(
    () => monthOptions.find((m) => m.value === monthValue)?.date ?? today,
    [monthOptions, monthValue, today],
  );

  const monthRows = useMemo(
    () => buildMonthlyReport(installments, houses, credits, monthDate, today),
    [installments, houses, credits, monthDate, today],
  );

  const filteredRows = useMemo(
    () =>
      monthRows.filter(
        (row) => (currencyFilter === 'all' || row.currency === currencyFilter) && (statusFilter === 'all' || row.status === statusFilter),
      ),
    [monthRows, currencyFilter, statusFilter],
  );

  const totals = useMemo(() => reportTotalsByCurrency(filteredRows), [filteredRows]);

  const headers: TableHeader[] = [
    { key: 'house', content: t('table.house') },
    { key: 'currency', content: t('table.currency') },
    { key: 'expected', content: t('table.expected') },
    { key: 'paid', content: t('table.paid') },
    { key: 'pending', content: t('table.pending') },
    { key: 'favor', content: t('table.favor') },
    { key: 'status', content: t('table.status') },
  ];

  const rows = filteredRows.map((row) => [
    row.house_name ? `${row.house_number} · ${row.house_name}` : row.house_number,
    currencyLabel(row.currency),
    row.expected.toFixed(2),
    row.paid.toFixed(2),
    row.pending.toFixed(2),
    row.favor > 0 ? row.favor.toFixed(2) : '—',
    <Tag key={`${row.house_id}-${row.currency}`} variant={statusVariant(row.status)} label={t(`status.${row.status}`)} />,
  ]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>

      <Row gap="16" wrap vertical="end">
        <Select
          id="month"
          label={t('monthLabel')}
          options={monthOptions.map((m) => ({ label: m.label, value: m.value }))}
          value={monthValue}
          onSelect={(v) => setMonthValue(v as string)}
        />
        <Column gap="8">
          <Text variant="label-default-s" onBackground="neutral-weak">
            {t('currencyLabel')}
          </Text>
          <Row gap="8" wrap>
            <Chip label={t('all')} selected={currencyFilter === 'all'} onClick={() => setCurrencyFilter('all')} />
            {CURRENCIES.map((c) => (
              <Chip key={c} label={currencyLabel(c)} selected={currencyFilter === c} onClick={() => setCurrencyFilter(c)} />
            ))}
          </Row>
        </Column>
        <Column gap="8">
          <Text variant="label-default-s" onBackground="neutral-weak">
            {t('statusLabel')}
          </Text>
          <Row gap="8" wrap>
            <Chip label={t('all')} selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {STATUSES.map((s) => (
              <Chip key={s} label={t(`status.${s}`)} selected={statusFilter === s} onClick={() => setStatusFilter(s)} />
            ))}
          </Row>
        </Column>
      </Row>

      {totals.length > 0 && (
        <Row gap="16" wrap fillWidth>
          {totals.map((total) => (
            <Card key={total.currency} padding="16" radius="l" background="neutral-alpha-weak" flex={1} minWidth={12}>
              <Column gap="4">
                <Text variant="label-strong-s">{t('totalsFor', { currency: currencyLabel(total.currency) })}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('table.expected')}: {formatAmount(total.expected, total.currency)}
                </Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('table.paid')}: {formatAmount(total.paid, total.currency)}
                </Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('table.pending')}: {formatAmount(total.pending, total.currency)}
                </Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('table.favor')}: {formatAmount(total.favor, total.currency)}
                </Text>
              </Column>
            </Card>
          ))}
        </Row>
      )}

      <Table data={{ headers, rows }} emptyState={t('empty')} />
    </Column>
  );
}

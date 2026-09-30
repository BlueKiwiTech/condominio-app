'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, subMonths } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis } from 'recharts';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { useSortableTable, SortableTableHead } from '@/components/ui/sortable-table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { exchangeRateRowsForMonth, exchangeRateSeriesForMonth } from '@/lib/reporting/exchangeRate';
import type { ExchangeRateRow, ExchangeRateSource } from '@/lib/exchangeRate';
import { formatShortDateTime } from '@/lib/dateFormat';

type SortColumn = 'date' | 'type' | 'rate' | 'source';

const SOURCE_CLASSES: Record<ExchangeRateSource, string> = {
  cron: 'bg-muted text-muted-foreground',
  admin: 'bg-primary/10 text-primary',
};

// "Tasa de Cambio" report (RPRT — 2026-09-29 addition): last item of the
// Reportes nav group. Combined single-axis chart (BCV + Binance, both
// Bs-per-USD) followed by the raw-rows table for the same month — see
// lib/reporting/exchangeRate.ts for why this stays one axis, unlike the
// dashboard's per-currency income charts.
export function ExchangeRateReportClient({ rates }: { rates: ExchangeRateRow[] }) {
  const t = useTranslations('reports.exchangeRate');
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
  const monthDate = useMemo(
    () => monthOptions.find((m) => m.value === monthValue)?.date ?? today,
    [monthOptions, monthValue, today],
  );

  const series = useMemo(() => exchangeRateSeriesForMonth(rates, monthDate), [rates, monthDate]);
  const rows = useMemo(() => exchangeRateRowsForMonth(rates, monthDate), [rates, monthDate]);
  const hasChartData = series.length > 0;

  const chartConfig: ChartConfig = {
    bcv: { label: t('type.bcv'), color: 'var(--chart-1)' },
    binance: { label: t('type.binance'), color: 'var(--chart-2)' },
  };

  const { sorted: sortedRows, sort, handleSort } = useSortableTable<ExchangeRateRow, SortColumn>(
    rows,
    (row, column) => {
      switch (column) {
        case 'date':
          return row.updated_at;
        case 'type':
          return row.rate_type;
        case 'rate':
          return row.rate;
        case 'source':
          return row.source;
      }
    },
    { column: 'date', direction: 'desc' },
    locale,
  );

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t('heading')}</h1>

      <div className="flex flex-wrap items-end gap-6 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[200px] flex-col gap-2">
          <Label htmlFor="month">{t('monthLabel')}</Label>
          <Select value={monthValue} onValueChange={(v) => v && setMonthValue(v)} items={monthOptions}>
            <SelectTrigger id="month" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="w-full rounded-[var(--radius)] border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">{t('chart.heading')}</span>
          {hasChartData ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <RechartsLineChart data={series}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => Number(value).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    />
                  }
                />
                <Line dataKey="bcv" type="monotone" stroke="var(--color-bcv)" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="binance" type="monotone" stroke="var(--color-binance)" strokeWidth={2} dot={false} connectNulls />
              </RechartsLineChart>
            </ChartContainer>
          ) : (
            <span className="text-sm text-muted-foreground">{t('chart.empty')}</span>
          )}
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-[var(--radius)] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="date" label={t('table.date')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="type" label={t('table.type')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="rate" label={t('table.rate')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="source" label={t('table.source')} sort={sort} onSort={handleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row, i) => (
                <TableRow key={`${row.rate_type}-${row.updated_at}-${i}`} className="h-11">
                  <TableCell>{formatShortDateTime(new Date(row.updated_at), locale)}</TableCell>
                  <TableCell>{t(`type.${row.rate_type}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.rate.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={SOURCE_CLASSES[row.source]}>
                      {t(`source.${row.source}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

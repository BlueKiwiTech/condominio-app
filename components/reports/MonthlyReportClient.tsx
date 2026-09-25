'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, subMonths } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  buildMonthlyReport,
  reportTotalsByCurrency,
  type MonthlyReportStatus,
  type ReportInstallment,
  type HouseInfo,
  type CreditForReport,
  type Currency,
} from '@/lib/reporting/monthlyReport';
import { currencyLabel, formatAmount, formatMoney } from '@/lib/currency';

const CURRENCIES: Currency[] = ['USD', 'Bs', 'USDT'];
const STATUSES: MonthlyReportStatus[] = ['pending', 'partial', 'paid', 'overdue'];

const STATUS_CLASSES: Record<MonthlyReportStatus, string> = {
  paid: 'bg-success/10 text-success',
  overdue: 'bg-destructive/10 text-destructive',
  partial: 'bg-warning/10 text-warning',
  pending: 'bg-muted text-muted-foreground',
};

export function MonthlyReportClient({
  installments,
  houses,
  credits,
  gracePeriodDays = 0,
}: {
  installments: ReportInstallment[];
  houses: HouseInfo[];
  credits: CreditForReport[];
  gracePeriodDays?: number;
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
    () => buildMonthlyReport(installments, houses, credits, monthDate, gracePeriodDays, today),
    [installments, houses, credits, monthDate, gracePeriodDays, today],
  );

  const filteredRows = useMemo(
    () =>
      monthRows.filter(
        (row) => (currencyFilter === 'all' || row.currency === currencyFilter) && (statusFilter === 'all' || row.status === statusFilter),
      ),
    [monthRows, currencyFilter, statusFilter],
  );

  const totals = useMemo(() => reportTotalsByCurrency(filteredRows), [filteredRows]);

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
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('currencyLabel')}</span>
          <ToggleGroup
            variant="outline"
            value={[currencyFilter]}
            onValueChange={(vals) => vals[0] && setCurrencyFilter(vals[0] as Currency | 'all')}
            className="flex-wrap"
          >
            <ToggleGroupItem value="all">{t('all')}</ToggleGroupItem>
            {CURRENCIES.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {currencyLabel(c)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('statusLabel')}</span>
          <ToggleGroup
            variant="outline"
            value={[statusFilter]}
            onValueChange={(vals) => vals[0] && setStatusFilter(vals[0] as MonthlyReportStatus | 'all')}
            className="flex-wrap"
          >
            <ToggleGroupItem value="all">{t('all')}</ToggleGroupItem>
            {STATUSES.map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {t(`status.${s}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {totals.length > 0 && (
        <div className="flex w-full flex-col gap-5">
          {totals.map((total) => (
            <div key={total.currency} className="flex w-full flex-col gap-3">
              <span className="text-sm font-semibold">{t('totalsFor', { currency: currencyLabel(total.currency) })}</span>
              <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1">
                <StatCard stripeColor="primary">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('table.expected')}</span>
                    <span className="text-xl font-semibold">{formatAmount(total.expected, total.currency)}</span>
                  </div>
                </StatCard>
                <StatCard stripeColor="success">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('table.paid')}</span>
                    <span className="text-xl font-semibold">{formatAmount(total.paid, total.currency)}</span>
                  </div>
                </StatCard>
                <StatCard stripeColor="warning">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('table.pending')}</span>
                    <span className="text-xl font-semibold">{formatAmount(total.pending, total.currency)}</span>
                  </div>
                </StatCard>
                <StatCard stripeColor="success">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('table.favor')}</span>
                    <span className="text-xl font-semibold">{formatAmount(total.favor, total.currency)}</span>
                  </div>
                </StatCard>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="w-full overflow-hidden rounded-[var(--radius)] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.house')}</TableHead>
              <TableHead>{t('table.currency')}</TableHead>
              <TableHead className="text-right">{t('table.expected')}</TableHead>
              <TableHead className="text-right">{t('table.paid')}</TableHead>
              <TableHead className="text-right">{t('table.pending')}</TableHead>
              <TableHead className="text-right">{t('table.favor')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={`${row.house_id}-${row.currency}`} className="h-11">
                  <TableCell className="whitespace-normal">{row.house_name ? `${row.house_number} · ${row.house_name}` : row.house_number}</TableCell>
                  <TableCell>{currencyLabel(row.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.expected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.favor > 0 ? formatMoney(row.favor) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASSES[row.status]}>
                      {t(`status.${row.status}`)}
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

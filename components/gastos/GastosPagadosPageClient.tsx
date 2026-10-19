'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useSortableTable, SortableTableHead } from '@/components/ui/sortable-table';
import { currencyLabel, formatAmount, formatMoney } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow } from './types';

type SortColumn = 'name' | 'category' | 'provider' | 'amount' | 'paid' | 'rate' | 'reference' | 'paid_date';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// "Todo el año" toggle pill -- same pattern used everywhere else a
// month/year filter shows up (e.g. GastosPageClient, the resident portal).
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

export function GastosPagadosPageClient({
  expenses,
  categories,
}: {
  expenses: ExpenseRow[];
  categories: CategoryOption[];
}) {
  const t = useTranslations('gastosPagados');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState('');

  // Month + year filter (same pattern as everywhere else, e.g.
  // GastosPageClient / the resident portal): a specific month + year, or
  // "todo el año" as a separate mutually-exclusive toggle.
  const availableYears = useMemo(() => {
    const years = new Set<number>([getYear(today)]);
    for (const e of expenses) {
      if (e.paid_date) years.add(getYear(parseISO(e.paid_date)));
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [expenses, today]);

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

  const categoryOptions = [
    { value: 'all', label: t('filters.allCategories') },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const filtered = useMemo(() => {
    const year = Number(yearValue);
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category_id !== categoryFilter) return false;
      if (providerFilter && !(e.provider ?? '').toLowerCase().includes(providerFilter.toLowerCase())) return false;
      if (!e.paid_date) return false;
      const d = parseISO(e.paid_date);
      if (getYear(d) !== year) return false;
      if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
      return true;
    });
  }, [expenses, categoryFilter, providerFilter, yearValue, monthValue, wholeYear]);

  const { sorted: sortedExpenses, sort, handleSort } = useSortableTable<ExpenseRow, SortColumn>(
    filtered,
    (e, column) => {
      switch (column) {
        case 'name':
          return e.condo_expense_templates?.name ?? '';
        case 'category':
          return e.condo_expense_categories?.name ?? '';
        case 'provider':
          return e.provider ?? '';
        case 'amount':
          return e.amount;
        // Expenses without a recorded rate (USD/USDT, or paid before the rate
        // was stored) sort as 0 -- grouped together at one end.
        case 'paid':
          return e.paid_amount ?? 0;
        case 'rate':
          return e.exchange_rate ?? 0;
        case 'reference':
          return e.reference_amount ?? 0;
        case 'paid_date':
          return e.paid_date ?? '';
      }
    },
    { column: 'paid_date', direction: 'desc' },
    locale,
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-wrap items-end gap-4 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[180px] flex-col gap-2">
          <Label htmlFor="categoryFilter">{t('filters.category')}</Label>
          <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)} items={categoryOptions}>
            <SelectTrigger id="categoryFilter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <Label htmlFor="providerFilter">{t('filters.provider')}</Label>
          <Input
            id="providerFilter"
            placeholder={t('filters.providerPlaceholder')}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          />
        </div>
        <div className="flex min-w-[140px] flex-col gap-2">
          <Label htmlFor="monthFilter">{t('filters.month')}</Label>
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
            <SelectTrigger id="monthFilter" className="w-full">
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
        </div>
        <div className="flex min-w-[110px] flex-col gap-2">
          <Label htmlFor="yearFilter">{t('filters.year')}</Label>
          <Select value={yearValue} onValueChange={(v) => v && setYearValue(v)} items={yearOptions}>
            <SelectTrigger id="yearFilter" className="w-full">
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
        </div>
        <FilterChip label={t('filters.allYear')} selected={wholeYear} onClick={() => setWholeYear((w) => !w)} />
      </div>

      <div className="w-full overflow-hidden rounded-[var(--radius)] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name" label={t('table.name')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="category" label={t('table.category')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="provider" label={t('table.provider')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="amount" label={t('table.amount')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="paid" label={t('table.paid')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="rate" label={t('table.rate')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="reference" label={t('table.reference')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="paid_date" label={t('table.paidDate')} sort={sort} onSort={handleSort} />
              <TableHead>{t('table.notes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              sortedExpenses.map((e) => (
                <TableRow key={e.id} className="h-11">
                  <TableCell className="whitespace-normal font-medium">{e.condo_expense_templates?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{e.condo_expense_categories?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{e.provider ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(e.amount, e.currency)}</TableCell>
                  {/* What was actually paid (only when the payment currency differed from the expense's), the rate and the equivalent live in their own columns and never feed any total: the amount above stays in the expense's own currency. */}
                  <TableCell className="text-right tabular-nums">
                    {e.paid_amount !== null && e.paid_currency ? `${formatMoney(e.paid_amount)} ${currencyLabel(e.paid_currency)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.exchange_rate !== null && e.exchange_rate_type
                      ? `${e.exchange_rate.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} · ${t(`rateTypes.${e.exchange_rate_type}`)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.reference_amount !== null && e.reference_currency
                      ? `${formatMoney(e.reference_amount)} ${e.reference_currency}`
                      : '—'}
                  </TableCell>
                  <TableCell>{e.paid_date ? formatShortDate(new Date(`${e.paid_date}T00:00:00`), locale) : '—'}</TableCell>
                  <TableCell className="whitespace-normal">{e.notes ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

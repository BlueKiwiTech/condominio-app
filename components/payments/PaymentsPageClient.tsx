'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Link } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn } from 'cn';
import { groupPaymentsByBatch, type PaymentRow, type HouseOption } from './types';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// "Todo el año" toggle pill — same pattern as MiComunidadClient/MisPagosClient's
// month/year filter: a plain neutral/primary toggle, not a status signal.
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

export function PaymentsPageClient({
  initialPayments,
  houses,
}: {
  initialPayments: PaymentRow[];
  houses: HouseOption[];
}) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);
  const [houseFilter, setHouseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const houseOptions = [
    { label: t('filterAllHouses'), value: 'all' },
    ...houses.map((h) => ({
      label: h.house_name ? `${h.house_number} · ${h.house_name}` : h.house_number,
      value: h.id,
    })),
  ];

  const filtered = useMemo(
    () => (houseFilter === 'all' ? initialPayments : initialPayments.filter((p) => p.house_id === houseFilter)),
    [initialPayments, houseFilter],
  );

  const batches = useMemo(() => groupPaymentsByBatch(filtered), [filtered]);

  // Month/year filter (same pattern as MiComunidadClient's Gastos filter and
  // MisPagosClient's Mi Cartera filter): a specific month + year, or "todo
  // el año" as a separate mutually-exclusive toggle rather than a 13th month
  // option. Years derive from the FULL unfiltered payment set (not the
  // house-filtered `filtered`/`batches`), so the year dropdown's options
  // don't shrink/change as the admin switches the house filter.
  const availableYears = useMemo(() => {
    const years = new Set<number>([getYear(today)]);
    for (const p of initialPayments) years.add(getYear(parseISO(p.payment_date)));
    return Array.from(years).sort((a, b) => a - b);
  }, [initialPayments, today]);

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

  const scopedBatches = useMemo(() => {
    const year = Number(yearValue);
    return batches.filter((batch) => {
      const d = parseISO(batch.paymentDate);
      if (getYear(d) !== year) return false;
      if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
      return true;
    });
  }, [batches, yearValue, monthValue, wholeYear]);

  const visibleBatches = useMemo(() => {
    if (!search) return scopedBatches;
    const q = search.toLowerCase();
    return scopedBatches.filter((batch) =>
      [batch.houseLabel, batch.reference ?? '', ...batch.installmentNames].some((v) => v.toLowerCase().includes(q)),
    );
  }, [scopedBatches, search]);

  return (
    <div className="flex w-full flex-col gap-4">
      {/* <div className="flex w-full justify-end">
        <Button render={<Link href="/pagos/nuevo" />} nativeButton={false}>{t('registerPayment')}</Button>
      </div> */}

      <div className="flex w-full flex-wrap items-end gap-4 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[220px] flex-col gap-2">
          <Label htmlFor="house-filter">{t('filterHouse')}</Label>
          <Select value={houseFilter} onValueChange={(v) => v && setHouseFilter(v)} items={houseOptions}>
            <SelectTrigger id="house-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {houseOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="month-filter">{t('monthFilterLabel')}</Label>
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
            <SelectTrigger id="month-filter" className="h-9 min-w-[9rem]">
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="year-filter">{t('yearFilterLabel')}</Label>
          <Select value={yearValue} onValueChange={(v) => v && setYearValue(v)} items={yearOptions}>
            <SelectTrigger id="year-filter" className="h-9 min-w-[6rem]">
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
        <FilterChip label={t('allYear')} selected={wholeYear} onClick={() => setWholeYear((w) => !w)} />
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <Label htmlFor="payments-search">{t('searchPlaceholder')}</Label>
          <Input
            id="payments-search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-[var(--radius)] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.date')}</TableHead>
              <TableHead>{t('table.receipt')}</TableHead>
              <TableHead>{t('table.house')}</TableHead>
              <TableHead>{t('table.cuotas')}</TableHead>
              <TableHead className="text-right">{t('table.amount')}</TableHead>
              <TableHead>{t('table.reference')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleBatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              visibleBatches.map((batch) => (
                <TableRow key={batch.batchId} className="h-11">
                  <TableCell>{formatShortDate(batch.paymentDate, locale)}</TableCell>
                  <TableCell>{batch.receiptNumber ? `#${String(batch.receiptNumber).padStart(4, '0')}` : '—'}</TableCell>
                  <TableCell className="whitespace-normal">{batch.houseLabel}</TableCell>
                  <TableCell>
                    {batch.installmentNames.length} {batch.installmentNames.length === 1 ? t('cuotaSingular') : t('cuotaPlural')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(batch.totalAmount, batch.currency)}</TableCell>
                  <TableCell>{batch.reference ?? '—'}</TableCell>
                  <TableCell>
                    <Link href={`/pagos/${batch.batchId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                      {t('viewDetail')}
                    </Link>
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

'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { groupPaymentsByBatch, type PaymentRow, type HouseOption } from './types';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';

export function PaymentsPageClient({
  initialPayments,
  houses,
}: {
  initialPayments: PaymentRow[];
  houses: HouseOption[];
}) {
  const t = useTranslations('payments');
  const locale = useLocale();
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

  const visibleBatches = useMemo(() => {
    if (!search) return batches;
    const q = search.toLowerCase();
    return batches.filter((batch) =>
      [batch.houseLabel, batch.reference ?? '', ...batch.installmentNames].some((v) => v.toLowerCase().includes(q)),
    );
  }, [batches, search]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full flex-wrap items-end gap-4">
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
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <Label htmlFor="payments-search">{t('searchPlaceholder')}</Label>
          <Input
            id="payments-search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button render={<Link href="/pagos/nuevo" />} nativeButton={false}>{t('registerPayment')}</Button>
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

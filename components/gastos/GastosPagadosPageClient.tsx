'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow } from './types';

export function GastosPagadosPageClient({
  expenses,
  categories,
}: {
  expenses: ExpenseRow[];
  categories: CategoryOption[];
}) {
  const t = useTranslations('gastosPagados');
  const locale = useLocale();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category_id !== categoryFilter) return false;
      if (providerFilter && !(e.provider ?? '').toLowerCase().includes(providerFilter.toLowerCase())) return false;
      if (monthFilter && !(e.paid_date ?? '').startsWith(monthFilter)) return false;
      return true;
    });
  }, [expenses, categoryFilter, providerFilter, monthFilter]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-wrap items-end gap-4 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[180px] flex-col gap-2">
          <Label htmlFor="categoryFilter">{t('filters.category')}</Label>
          <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
            <SelectTrigger id="categoryFilter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allCategories')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
        <div className="flex min-w-[160px] flex-col gap-2">
          <Label htmlFor="monthFilter">{t('filters.month')}</Label>
          <Input id="monthFilter" type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-[var(--radius)] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.name')}</TableHead>
              <TableHead>{t('table.category')}</TableHead>
              <TableHead>{t('table.provider')}</TableHead>
              <TableHead className="text-right">{t('table.amount')}</TableHead>
              <TableHead>{t('table.paidDate')}</TableHead>
              <TableHead>{t('table.notes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id} className="h-11">
                  <TableCell className="whitespace-normal font-medium">{e.condo_expense_templates?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{e.condo_expense_categories?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{e.provider ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(e.amount, e.currency)}</TableCell>
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

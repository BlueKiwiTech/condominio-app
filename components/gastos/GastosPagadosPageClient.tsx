'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Row, Select, Input, Table, type TableHeader } from '@once-ui-system/core';
import { currencyLabel } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow } from './types';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
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

  const headers: TableHeader[] = [
    { key: 'name', content: t('table.name') },
    { key: 'category', content: t('table.category') },
    { key: 'provider', content: t('table.provider') },
    { key: 'amount', content: t('table.amount') },
    { key: 'paidDate', content: t('table.paidDate') },
    { key: 'notes', content: t('table.notes') },
  ];

  const rows = filtered.map((e) => [
    e.condo_expense_templates?.name ?? '—',
    e.condo_expense_categories?.name ?? '—',
    e.provider ?? '—',
    <span key={`${e.id}-amount`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(e.amount, e.currency)}</span>,
    e.paid_date ? formatShortDate(new Date(`${e.paid_date}T00:00:00`), locale) : '—',
    e.notes ?? '—',
  ]);

  return (
    <Column fillWidth gap="24">
      <Row gap="12" wrap>
        <Select
          id="categoryFilter"
          label={t('filters.category')}
          options={[
            { label: t('filters.allCategories'), value: 'all' },
            ...categories.map((c) => ({ label: c.name, value: c.id })),
          ]}
          value={categoryFilter}
          onSelect={(value) => setCategoryFilter(Array.isArray(value) ? value[0] : value)}
        />
        <Input
          id="providerFilter"
          label={t('filters.provider')}
          placeholder={t('filters.providerPlaceholder')}
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
        />
        <Input
          id="monthFilter"
          type="month"
          label={t('filters.month')}
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        />
      </Row>

      <Table data={{ headers, rows }} emptyState={t('empty')} />
    </Column>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import {
  Column,
  Row,
  Select,
  Input,
  Table,
  Tag,
  Button,
  Dialog,
  DateInput,
  Feedback,
  SmartLink,
  type TableHeader,
} from '@once-ui-system/core';
import { markExpensePaidSchema, type MarkExpensePaidInput } from '@/lib/validation/gastos';
import { markExpensePaid, deleteExpense, deleteExpenseTemplate } from '@/lib/actions/gastos';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow, ExpenseStatus } from './types';

export function GastosPageClient({
  initialExpenses,
  categories,
}: {
  initialExpenses: ExpenseRow[];
  categories: CategoryOption[];
}) {
  const t = useTranslations('gastos');
  const tv = useTranslations('validation.gastos');
  const locale = useLocale();
  const router = useRouter();
  const [isMarkingPaid, startMarkPaidTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const [markPaidTarget, setMarkPaidTarget] = useState<ExpenseRow | null>(null);
  const [amount, setAmount] = useState(0);
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return initialExpenses.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && e.category_id !== categoryFilter) return false;
      if (providerFilter && !(e.provider ?? '').toLowerCase().includes(providerFilter.toLowerCase())) return false;
      if (monthFilter && !e.period_date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [initialExpenses, statusFilter, categoryFilter, providerFilter, monthFilter]);

  // How many total installments a variable gasto has, keyed by template_id --
  // a single-installment variable gasto shows "Borrar" like a fixed gasto
  // instead of the (redundant) "Borrar todas las cuotas".
  const installmentCountByTemplate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of initialExpenses) {
      counts.set(e.template_id, (counts.get(e.template_id) ?? 0) + 1);
    }
    return counts;
  }, [initialExpenses]);

  const openMarkPaid = (expense: ExpenseRow) => {
    setServerError(null);
    setMarkPaidTarget(expense);
    setAmount(expense.amount);
    setPaidDate(new Date());
    setNotes('');
  };

  const confirmMarkPaid = () => {
    if (!markPaidTarget) return;
    const payload: MarkExpensePaidInput = {
      amount,
      paid_date: format(paidDate, 'yyyy-MM-dd'),
      notes: notes || undefined,
    };
    const parsed = markExpensePaidSchema(tv).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t('errors.invalid'));
      return;
    }
    startMarkPaidTransition(async () => {
      const result = await markExpensePaid(markPaidTarget.id, parsed.data, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      setMarkPaidTarget(null);
    });
  };

  const handleDeleteExpense = (expense: ExpenseRow) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmDelete'))) return;
    setServerError(null);
    startDeleteTransition(async () => {
      const result = await deleteExpense(expense.id, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmDeleteAll'))) return;
    setServerError(null);
    startDeleteTransition(async () => {
      const result = await deleteExpenseTemplate(templateId, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const headers: TableHeader[] = [
    { key: 'name', content: t('table.name') },
    { key: 'category', content: t('table.category') },
    { key: 'provider', content: t('table.provider') },
    { key: 'amount', content: t('table.amount') },
    { key: 'period', content: t('table.period') },
    { key: 'status', content: t('table.status') },
    { key: 'actions', content: '' },
  ];

  const rows = filtered.map((e) => [
    e.condo_expense_templates?.name ?? '—',
    e.condo_expense_categories?.name ?? '—',
    e.provider ?? '—',
    formatAmount(e.amount, e.currency),
    formatShortDate(new Date(`${e.period_date}T00:00:00`), locale),
    <Tag key={`${e.id}-status`} variant={e.status === 'paid' ? 'success' : 'warning'} label={t(`status.${e.status}`)} />,
    e.status === 'pending' ? (
      <Row key={`${e.id}-action`} gap="8">
        <Button size="s" variant="secondary" onClick={() => openMarkPaid(e)}>
          {t('actions.markPaid')}
        </Button>
        {e.condo_expense_templates?.kind === 'variable' && (installmentCountByTemplate.get(e.template_id) ?? 1) > 1 ? (
          <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteTemplate(e.template_id)}>
            {t('actions.deleteAll')}
          </Button>
        ) : (
          <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteExpense(e)}>
            {t('actions.delete')}
          </Button>
        )}
      </Row>
    ) : (
      '—'
    ),
  ]);

  return (
    <Column fillWidth gap="24">
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Row horizontal="end" fillWidth>
        <SmartLink href="/gastos/new">
          <Button variant="primary" type="button">
            {t('newExpense')}
          </Button>
        </SmartLink>
      </Row>
      <Row
        gap="16"
        wrap
        vertical="end"
        fillWidth
        background="surface"
        border="neutral-alpha-weak"
        radius="s"
        padding="16"
      >
        <Select
          id="statusFilter"
          label={t('filters.status')}
          fillWidth={false}
          minWidth={12}
          options={[
            { label: t('filters.allStatuses'), value: 'all' },
            { label: t('status.pending'), value: 'pending' },
            { label: t('status.paid'), value: 'paid' },
          ]}
          value={statusFilter}
          onSelect={(value) => setStatusFilter((Array.isArray(value) ? value[0] : value) as 'all' | ExpenseStatus)}
        />
        <Select
          id="categoryFilter"
          label={t('filters.category')}
          fillWidth={false}
          minWidth={12}
          options={[
            { label: t('filters.allCategories'), value: 'all' },
            ...categories.map((c) => ({ label: c.name, value: c.id })),
          ]}
          value={categoryFilter}
          onSelect={(value) => setCategoryFilter(Array.isArray(value) ? value[0] : value)}
        />
        <Column minWidth={16}>
          <Input
            id="providerFilter"
            label={t('filters.provider')}
            placeholder={t('filters.providerPlaceholder')}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          />
        </Column>
        <Column minWidth={12}>
          <Input
            id="monthFilter"
            type="month"
            label={t('filters.month')}
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </Column>
      </Row>

      <Table data={{ headers, rows }} emptyState={t('empty')} />

      <Dialog isOpen={!!markPaidTarget} onClose={() => setMarkPaidTarget(null)} title={t('markPaidDialog.heading')}>
        <Column gap="16" fillWidth>
          {serverError && <Feedback variant="danger" description={serverError} />}
          <Input
            id="markPaidAmount"
            type="number"
            label={t('markPaidDialog.amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.valueAsNumber)}
          />
          <DateInput
            id="markPaidDate"
            label={t('markPaidDialog.paidDate')}
            value={paidDate}
            onChange={(date) => date && setPaidDate(date)}
          />
          <Input
            id="markPaidNotes"
            label={t('markPaidDialog.notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button variant="primary" loading={isMarkingPaid} onClick={confirmMarkPaid}>
            {t('markPaidDialog.confirm')}
          </Button>
        </Column>
      </Dialog>
    </Column>
  );
}

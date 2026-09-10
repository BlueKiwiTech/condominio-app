'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import {
  Column,
  Row,
  Heading,
  Text,
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
import { markExpensePaid, setExpenseTemplateActive, deleteExpense, deleteExpenseTemplate } from '@/lib/actions/gastos';
import { currencyLabel } from '@/lib/currency';
import type { CategoryOption, ExpenseRow, ExpenseStatus, FixedTemplateRow } from './types';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

export function GastosPageClient({
  initialExpenses,
  categories,
  fixedTemplates,
}: {
  initialExpenses: ExpenseRow[];
  categories: CategoryOption[];
  fixedTemplates: FixedTemplateRow[];
}) {
  const t = useTranslations('gastos');
  const tv = useTranslations('validation.gastos');
  const locale = useLocale();
  const router = useRouter();
  const [isTogglingActive, startToggleTransition] = useTransition();
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

  const toggleActive = (templateId: string, active: boolean) => {
    setServerError(null);
    startToggleTransition(async () => {
      const result = await setExpenseTemplateActive(templateId, active, locale);
      if ('error' in result) {
        setServerError(result.error);
      }
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
    format(new Date(`${e.period_date}T00:00:00`), 'dd/MM/yyyy'),
    <Tag key={`${e.id}-status`} variant={e.status === 'paid' ? 'success' : 'warning'} label={t(`status.${e.status}`)} />,
    e.status === 'pending' ? (
      <Row key={`${e.id}-action`} gap="8">
        <Button size="s" variant="secondary" onClick={() => openMarkPaid(e)}>
          {t('actions.markPaid')}
        </Button>
        <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteExpense(e)}>
          {t('actions.delete')}
        </Button>
        {e.condo_expense_templates?.kind === 'variable' && (
          <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteTemplate(e.template_id)}>
            {t('actions.deleteAll')}
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
      <Column gap="12" fillWidth>
        <Heading variant="heading-strong-s">{t('templates.heading')}</Heading>
        {fixedTemplates.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('templates.empty')}
          </Text>
        ) : (
          <Column gap="8" fillWidth>
            {fixedTemplates.map((tpl) => (
              <Row
                key={tpl.id}
                fillWidth
                horizontal="between"
                vertical="center"
                padding="12"
                radius="m"
                border="neutral-alpha-weak"
              >
                <Text variant="label-default-s">{tpl.name}</Text>
                <Row gap="8">
                  <Button
                    size="s"
                    variant="secondary"
                    loading={isTogglingActive}
                    onClick={() => toggleActive(tpl.id, !tpl.active)}
                  >
                    {tpl.active ? t('actions.deactivate') : t('actions.activate')}
                  </Button>
                  <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteTemplate(tpl.id)}>
                    {t('actions.delete')}
                  </Button>
                </Row>
              </Row>
            ))}
          </Column>
        )}
      </Column>

      <Row gap="12" wrap>
        <Select
          id="statusFilter"
          label={t('filters.status')}
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

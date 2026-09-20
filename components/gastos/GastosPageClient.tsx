'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { markExpensePaidSchema, type MarkExpensePaidInput } from '@/lib/validation/gastos';
import { markExpensePaid, deleteExpense, deleteExpenseTemplate } from '@/lib/actions/gastos';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow, ExpenseStatus } from './types';

const STATUS_CLASSES: Record<ExpenseStatus, string> = {
  pending: 'bg-warning/10 text-warning',
  paid: 'bg-success/10 text-success',
};

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

  return (
    <div className="flex w-full flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="flex w-full justify-end">
        <Button render={<Link href="/gastos/new" />} nativeButton={false}>{t('newExpense')}</Button>
      </div>

      <div className="flex w-full flex-wrap items-end gap-4 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[180px] flex-col gap-2">
          <Label htmlFor="statusFilter">{t('filters.status')}</Label>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as 'all' | ExpenseStatus)}>
            <SelectTrigger id="statusFilter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
              <SelectItem value="pending">{t('status.pending')}</SelectItem>
              <SelectItem value="paid">{t('status.paid')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
              <TableHead>{t('table.period')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                  <TableCell>{formatShortDate(new Date(`${e.period_date}T00:00:00`), locale)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASSES[e.status]}>
                      {t(`status.${e.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {e.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openMarkPaid(e)}>
                          {t('actions.markPaid')}
                        </Button>
                        {e.condo_expense_templates?.kind === 'variable' &&
                        (installmentCountByTemplate.get(e.template_id) ?? 1) > 1 ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={() => handleDeleteTemplate(e.template_id)}
                          >
                            {t('actions.deleteAll')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => handleDeleteExpense(e)}>
                            {t('actions.delete')}
                          </Button>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!markPaidTarget} onOpenChange={(open) => !open && setMarkPaidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('markPaidDialog.heading')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="markPaidAmount">{t('markPaidDialog.amount')}</Label>
              <Input
                id="markPaidAmount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.valueAsNumber)}
              />
            </div>
            <DateInput
              id="markPaidDate"
              label={t('markPaidDialog.paidDate')}
              value={paidDate}
              onChange={(date) => date && setPaidDate(date)}
            />
            <div className="grid gap-2">
              <Label htmlFor="markPaidNotes">{t('markPaidDialog.notes')}</Label>
              <Input id="markPaidNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={isMarkingPaid} onClick={confirmMarkPaid}>
              {t('markPaidDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

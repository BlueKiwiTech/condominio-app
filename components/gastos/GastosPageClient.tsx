'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { cn } from 'cn';
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

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// "Todo el año" toggle pill -- same pattern as the resident portal's
// month/year filters (e.g. components/resident/MisPagosClient.tsx).
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
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);
  const router = useRouter();
  const [isMarkingPaid, startMarkPaidTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState('');

  // Month + year filter (same pattern as the resident portal's, e.g.
  // MisPagosClient): a specific month + year, or "todo el año" as a
  // separate mutually-exclusive toggle rather than a 13th month option.
  const availableYears = useMemo(() => {
    const years = new Set<number>([getYear(today)]);
    for (const e of initialExpenses) years.add(getYear(parseISO(e.period_date)));
    return Array.from(years).sort((a, b) => a - b);
  }, [initialExpenses, today]);

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

  const [markPaidTarget, setMarkPaidTarget] = useState<ExpenseRow | null>(null);
  const [amount, setAmount] = useState(0);
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const statusOptions: { value: 'all' | ExpenseStatus; label: string }[] = [
    { value: 'all', label: t('filters.allStatuses') },
    { value: 'pending', label: t('status.pending') },
    { value: 'paid', label: t('status.paid') },
  ];
  const categoryOptions = [
    { value: 'all', label: t('filters.allCategories') },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const filtered = useMemo(() => {
    const year = Number(yearValue);
    return initialExpenses.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && e.category_id !== categoryFilter) return false;
      if (providerFilter && !(e.provider ?? '').toLowerCase().includes(providerFilter.toLowerCase())) return false;
      const d = parseISO(e.period_date);
      if (getYear(d) !== year) return false;
      if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
      return true;
    });
  }, [initialExpenses, statusFilter, categoryFilter, providerFilter, yearValue, monthValue, wholeYear]);

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
      <div className="flex w-full flex-wrap items-end gap-4 rounded-[var(--radius)] border bg-card p-4 shadow-sm">
        <div className="flex min-w-[180px] flex-col gap-2">
          <Label htmlFor="statusFilter">{t('filters.status')}</Label>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as 'all' | ExpenseStatus)} items={statusOptions}>
            <SelectTrigger id="statusFilter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

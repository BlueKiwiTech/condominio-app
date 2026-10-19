'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { useSortableTable, SortableTableHead } from '@/components/ui/sortable-table';
import { markExpensePaidSchema, type MarkExpensePaidInput } from '@/lib/validation/gastos';
import { markExpensePaid, deleteExpense, deleteExpenseTemplate } from '@/lib/actions/gastos';
import { currencyLabel, formatAmount, formatMoney } from '@/lib/currency';
import { checkBalance } from '@/lib/reporting/communityBalance';
import type { CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { getExchangeRatesAsOf } from '@/lib/actions/exchangeRate';
import { isRateFresh, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import {
  EXPENSE_PAYMENT_CURRENCIES,
  EXPENSE_PAYMENT_RATE_TYPES,
  convertExpenseAmount,
  referenceAmount,
  referenceCurrencyFor,
  type ExpensePaymentCurrency,
  type ExpensePaymentRateType,
} from '@/lib/gastos/paymentRate';
import { formatShortDate } from '@/lib/dateFormat';
import type { CategoryOption, ExpenseRow, ExpenseStatus } from './types';

const STATUS_CLASSES: Record<ExpenseStatus, string> = {
  pending: 'bg-warning/10 text-warning',
  on_hold: 'bg-primary/10 text-primary',
  paid: 'bg-success/10 text-success',
};

type SortColumn = 'name' | 'category' | 'provider' | 'amount' | 'period' | 'status';

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
  communityBalance,
}: {
  initialExpenses: ExpenseRow[];
  categories: CategoryOption[];
  /** Received minus paid expenses per currency (null: could not be computed -> no pre-check). */
  communityBalance: CurrencyAmountMap | null;
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
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  // Payment currency (change gastos-pago-multimoneda): always shown, defaults to
  // the expense's own. A rate picker appears whenever either currency is Bs.
  // bcv/eur are only previewed here from the rates as of the chosen "Fecha de
  // pago" -- markExpensePaid re-reads them server-side, so the stored rate never
  // depends on this screen. A custom rate is the only rate sent from here.
  const [paymentCurrency, setPaymentCurrency] = useState<ExpensePaymentCurrency | 'USDT'>('USD');
  const [rateType, setRateType] = useState<ExpensePaymentRateType>('bcv');
  const [customRate, setCustomRate] = useState('');
  // The amount input is prefilled from the rate; what the admin types replaces
  // the prefill until currency, rate or date change again (see handlers below).
  const [amountText, setAmountText] = useState<string | null>(null);
  const [loadedRates, setLoadedRates] = useState<{ date: string; rates: Record<ExchangeRateType, ExchangeRateRow | null> } | null>(null);

  const paidDateStr = format(paidDate, 'yyyy-MM-dd');
  const expenseCurrency = markPaidTarget?.currency ?? 'USD';
  const crossCurrency = !!markPaidTarget && paymentCurrency !== expenseCurrency;
  // A rate is needed when either side is Bs (USD <-> Bs, or Bs -> Bs to record
  // the equivalent); USD -> USD and USDT never use one.
  const needsRate = !!markPaidTarget && expenseCurrency !== 'USDT' && (expenseCurrency === 'Bs' || paymentCurrency === 'Bs');
  useEffect(() => {
    if (!needsRate) return;
    let cancelled = false;
    getExchangeRatesAsOf(paidDateStr).then((rates) => {
      if (!cancelled) setLoadedRates({ date: paidDateStr, rates });
    });
    return () => {
      cancelled = true;
    };
  }, [needsRate, paidDateStr]);

  // Rates loaded for a different date than the one now selected count as
  // "still loading" instead of showing another day's values.
  const dateRates = loadedRates?.date === paidDateStr ? loadedRates.rates : null;

  // Usable value of each stored rate at the payment date (same 24h rule the
  // server applies); null = missing or stale, shown disabled in the combo.
  const usableRate = (type: Exclude<ExpensePaymentRateType, 'custom'>): number | null => {
    const row = dateRates?.[type];
    return row && isRateFresh(row.updated_at, parseISO(paidDateStr)) ? row.rate : null;
  };
  const customRateNumber = Number(customRate.replace(',', '.'));
  const selectedRate: number | null = !needsRate
    ? null
    : rateType === 'custom'
      ? Number.isFinite(customRateNumber) && customRateNumber > 0
        ? customRateNumber
        : null
      : usableRate(rateType);

  // What the amount input shows until the admin edits it: the expense's amount
  // as is (same currency) or converted with the chosen rate (different one).
  const prefilledAmount: number | null = !markPaidTarget
    ? null
    : !crossCurrency
      ? markPaidTarget.amount
      : selectedRate === null || paymentCurrency === 'USDT' || expenseCurrency === 'USDT'
        ? null
        : convertExpenseAmount(markPaidTarget.amount, expenseCurrency, paymentCurrency, selectedRate);
  const amountValue: number | null = amountText !== null ? (amountText.trim() === '' ? null : Number(amountText.replace(',', '.'))) : prefilledAmount;
  const amountInputValue = amountText ?? (prefilledAmount !== null ? String(prefilledAmount) : '');
  // Bs paid in Bs: nothing to convert, but the equivalent (USD, or EUR for the euro rate) is kept.
  const equivalent = needsRate && !crossCurrency && selectedRate !== null && amountValue !== null ? referenceAmount(amountValue, selectedRate) : null;

  // Can the community cover what this payment takes out of the till, in the
  // currency it is paid in? (what leaves = the amount typed: the paid amount when
  // the currency differs, the final amount otherwise -- same as the server.)
  const fundsCheck =
    communityBalance !== null && markPaidTarget && amountValue !== null && Number.isFinite(amountValue) && amountValue > 0
      ? checkBalance(communityBalance, { currency: paymentCurrency, amount: amountValue })
      : null;

  const statusOptions: { value: 'all' | ExpenseStatus; label: string }[] = [
    { value: 'all', label: t('filters.allStatuses') },
    { value: 'pending', label: t('status.pending') },
    { value: 'on_hold', label: t('status.on_hold') },
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
        case 'period':
          return e.period_date;
        case 'status':
          return e.status;
      }
    },
    { column: 'period', direction: 'desc' },
    locale,
  );

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
    setPaymentCurrency(expense.currency === 'USDT' ? 'USDT' : expense.currency);
    setAmountText(null);
    setPaidDate(new Date());
    setNotes('');
    setRateType('bcv');
    setCustomRate('');
  };

  // Changing currency, rate or date changes what the amount should be, so any
  // manual edit is dropped and the prefill takes over again.
  const changePaymentCurrency = (currency: ExpensePaymentCurrency) => {
    setPaymentCurrency(currency);
    setAmountText(null);
  };
  const changeRateType = (type: ExpensePaymentRateType) => {
    setRateType(type);
    setAmountText(null);
  };
  const changeCustomRate = (value: string) => {
    setCustomRate(value);
    setAmountText(null);
  };
  const changePaidDate = (date: Date) => {
    setPaidDate(date);
    setAmountText(null);
  };

  const confirmMarkPaid = () => {
    if (!markPaidTarget) return;
    if (amountValue === null || !Number.isFinite(amountValue) || amountValue <= 0) {
      setServerError(tv('amountPositive'));
      return;
    }
    const payload: MarkExpensePaidInput = {
      // Different currency: `amount` stays what was owed and the typed value is what was paid.
      amount: crossCurrency ? markPaidTarget.amount : amountValue,
      paid_date: paidDateStr,
      notes: notes || undefined,
      ...(paymentCurrency !== 'USDT' ? { payment_currency: paymentCurrency } : {}),
      ...(crossCurrency ? { paid_amount: amountValue } : {}),
      ...(needsRate
        ? {
            exchange_rate_type: rateType,
            custom_rate: rateType === 'custom' && selectedRate !== null ? selectedRate : undefined,
          }
        : {}),
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
      // No fresh bcv/eur rate for that date yet: the expense is parked and gets paid by itself when it arrives.
      if ('onHold' in result) toast.info(t('markPaidDialog.onHold'));
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

      <div className="w-full overflow-hidden rounded-[var(--radius)] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name" label={t('table.name')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="category" label={t('table.category')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="provider" label={t('table.provider')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="amount" label={t('table.amount')} sort={sort} onSort={handleSort} align="right" />
              <SortableTableHead column="period" label={t('table.period')} sort={sort} onSort={handleSort} />
              <SortableTableHead column="status" label={t('table.status')} sort={sort} onSort={handleSort} />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
            {markPaidTarget && (
              <p className="text-sm text-muted-foreground">
                {t('markPaidDialog.original', { value: formatAmount(markPaidTarget.amount, markPaidTarget.currency) })}
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="markPaidCurrency">{t('markPaidDialog.paymentCurrency')}</Label>
              {markPaidTarget?.currency === 'USDT' ? (
                // USDT expenses are paid in USDT, untouched: shown, but nothing to choose.
                <p id="markPaidCurrency" className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                  {currencyLabel('USDT')}
                </p>
              ) : (
                <Select
                  value={paymentCurrency}
                  onValueChange={(v) => v && changePaymentCurrency(v as ExpensePaymentCurrency)}
                  items={EXPENSE_PAYMENT_CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c) }))}
                >
                  <SelectTrigger id="markPaidCurrency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_PAYMENT_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {currencyLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="markPaidAmount">
                {crossCurrency ? t('markPaidDialog.paidAmount', { currency: currencyLabel(paymentCurrency) }) : t('markPaidDialog.amount')}
              </Label>
              <Input
                id="markPaidAmount"
                type="number"
                step="any"
                value={amountInputValue}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </div>
            {communityBalance !== null && (
              <div className="flex flex-col gap-1 text-sm" data-testid="community-balance-check">
                <span className="text-muted-foreground">
                  {t('markPaidDialog.balanceAvailable', {
                    currency: currencyLabel(paymentCurrency),
                    amount: formatMoney(communityBalance[paymentCurrency] ?? 0),
                  })}
                </span>
                {fundsCheck && !fundsCheck.ok && (
                  <span className="text-destructive" data-testid="community-balance-missing">
                    {t('markPaidDialog.balanceMissing', {
                      currency: currencyLabel(paymentCurrency),
                      missing: formatMoney(fundsCheck.missing),
                    })}
                  </span>
                )}
              </div>
            )}
            <DateInput
              id="markPaidDate"
              label={t('markPaidDialog.paidDate')}
              value={paidDate}
              onChange={(date) => date && changePaidDate(date)}
            />
            {needsRate && (
              <div className="flex flex-col gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="markPaidRate">{t('markPaidDialog.rateLabel')}</Label>
                  <Select
                    value={rateType}
                    onValueChange={(v) => v && changeRateType(v as ExpensePaymentRateType)}
                    items={EXPENSE_PAYMENT_RATE_TYPES.map((type) => ({ value: type, label: t(`markPaidDialog.rateTypes.${type}`) }))}
                  >
                    <SelectTrigger id="markPaidRate" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_PAYMENT_RATE_TYPES.map((type) => {
                        const value = type === 'custom' ? null : usableRate(type);
                        return (
                          <SelectItem key={type} value={type}>
                            {t(`markPaidDialog.rateTypes.${type}`)}
                            {type !== 'custom' &&
                              ` — ${
                                value === null
                                  ? dateRates
                                    ? t('markPaidDialog.rateUnavailable')
                                    : '…'
                                  : t('markPaidDialog.rateValue', {
                                      rate: value.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
                                    })
                              }`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {rateType === 'custom' && (
                  <div className="grid gap-2">
                    <Label htmlFor="markPaidCustomRate">{t('markPaidDialog.customRate')}</Label>
                    <Input
                      id="markPaidCustomRate"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={customRate}
                      onChange={(e) => changeCustomRate(e.target.value)}
                    />
                  </div>
                )}
                {rateType !== 'custom' && dateRates && selectedRate === null && (
                  <p className="text-sm text-muted-foreground" data-testid="mark-paid-hold-notice">
                    {t('markPaidDialog.rateStale')}
                  </p>
                )}
                {equivalent !== null && (
                  <p className="text-sm font-medium" data-testid="mark-paid-equivalent">
                    {t('markPaidDialog.equivalent', {
                      amount: formatMoney(equivalent),
                      currency: referenceCurrencyFor(rateType),
                    })}
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="markPaidNotes">{t('markPaidDialog.notes')}</Label>
              <Input id="markPaidNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={isMarkingPaid || (fundsCheck !== null && !fundsCheck.ok) || (needsRate && (rateType === 'custom' ? selectedRate === null : dateRates === null))} onClick={confirmMarkPaid}>
              {t('markPaidDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

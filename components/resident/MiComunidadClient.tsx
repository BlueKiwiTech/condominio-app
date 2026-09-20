'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from 'cn';
import { creditsByCurrency, outstandingByCurrency, type CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { ResidentPortalData, CommunityBalanceData } from '@/lib/resident/queries';
import { ListRow } from './ListRow';
import { CurrencyAmountList } from './CurrencyAmountList';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// Small pill toggle for the "todo el año" filter — not a payment-status
// signal, so it intentionally stays neutral/primary rather than
// success/warning/destructive (those are reserved for morosos state).
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

// V3 · Mi comunidad (replaces Mi hogar as the resident landing page, per
// board feedback 2026-09-18): "lo más sencilla e intuitiva posible" -- this
// screen drops the per-house credit/debt cards, upcoming-installments list,
// and "reportar pago" button that used to live here (those belong to
// Mis cuotas / Mis pagos going forward, not built as part of this change).
// What's left: two always-current community totals (saldo disponible =
// favor, saldo pendiente = pending, reusing the same buildMonthlyReport/
// reportTotalsByCurrency math CommunityBalanceCard already uses for
// /mi-hogar) plus a month/year-filterable expense total + breakdown list.
export function MiComunidadClient({
  data,
  communityBalance,
}: {
  data: ResidentPortalData;
  communityBalance: CommunityBalanceData;
}) {
  const t = useTranslations('residentHome');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const house = data.house!;
  const today = useMemo(() => new Date(), []);

  // No individual resident identity exists (login is per-house PIN, not
  // per-person) -- owner_name is the closest thing to a personal greeting,
  // falling back to the house label when it's unset.
  const displayName = house.owner_name ?? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number);

  // All-time, not month-scoped: every house's positive credit balance
  // (saldo disponible) and every non-paid installment's remaining balance
  // (saldo pendiente), regardless of due date -- not just the current month.
  const available = useMemo(() => creditsByCurrency(communityBalance.credits), [communityBalance.credits]);
  const pending = useMemo(() => outstandingByCurrency(communityBalance.installments), [communityBalance.installments]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([getYear(today)]);
    for (const e of communityBalance.expenses) years.add(getYear(parseISO(e.period_date)));
    return Array.from(years).sort((a, b) => a - b);
  }, [communityBalance.expenses, today]);

  const [yearValue, setYearValue] = useState(String(getYear(today)));
  const [monthValue, setMonthValue] = useState(String(getMonth(today) + 1));
  // Separate toggle rather than a 13th "all" entry inside the month select
  // (board request 2026-09-18: "todo el año" is a different kind of filter
  // than a specific month, so it gets its own control) -- picking a month
  // turns it back off, since the two are mutually exclusive.
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

  const scopedExpenses = useMemo(() => {
    const year = Number(yearValue);
    return communityBalance.expenses
      .filter((e) => {
        const d = parseISO(e.period_date);
        if (getYear(d) !== year) return false;
        if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
        return true;
      })
      .sort((a, b) => a.period_date.localeCompare(b.period_date));
  }, [communityBalance.expenses, yearValue, monthValue, wholeYear]);

  const expensesTotal = useMemo(() => {
    const out: CurrencyAmountMap = {};
    for (const e of scopedExpenses) out[e.currency] = (out[e.currency] ?? 0) + e.amount;
    return out;
  }, [scopedExpenses]);

  const periodLabel = useMemo(() => {
    if (wholeYear) return t('communityDashboard.expensesOfYear', { year: yearValue });
    const monthLabel = capitalize(format(new Date(2000, Number(monthValue) - 1, 1), 'LLLL', { locale: dateLocale }));
    return t('communityDashboard.expensesOfMonth', { period: `${monthLabel} ${yearValue}` });
  }, [t, wholeYear, monthValue, yearValue, dateLocale]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">{t('greeting', { house: displayName })}</h1>
        <p className="text-sm text-muted-foreground">{t('communityDashboard.subtitle')}</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <h2 className="text-base font-semibold">{t('communityDashboard.heading')}</h2>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-success/20 bg-success/5 p-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('communityDashboard.available')}
              </span>
              <CurrencyAmountList amounts={available} emptyLabel={t('communityDashboard.empty')} />
              <p className="text-xs text-muted-foreground">{t('communityDashboard.availableCaption')}</p>
            </div>
          </Card>
          <Card className="border-warning/20 bg-warning/5 p-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('communityDashboard.pending')}
              </span>
              <CurrencyAmountList amounts={pending} emptyLabel={t('communityDashboard.empty')} />
              <p className="text-xs text-muted-foreground">{t('communityDashboard.pendingCaption')}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">{t('communityDashboard.expensesHeading')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={monthValue}
              onValueChange={(v) => {
                if (!v) return;
                setMonthValue(v);
                setWholeYear(false);
              }}
              disabled={wholeYear}
            >
              <SelectTrigger aria-label={t('communityDashboard.monthFilterLabel')} className="h-9 min-w-[9rem]">
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
            <Select value={yearValue} onValueChange={(v) => v && setYearValue(v)}>
              <SelectTrigger aria-label={t('communityDashboard.yearFilterLabel')} className="h-9 min-w-[6rem]">
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
            <FilterChip label={t('communityDashboard.allYear')} selected={wholeYear} onClick={() => setWholeYear((w) => !w)} />
          </div>
        </div>
        <Card className="border-destructive/20 bg-destructive/5 p-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{periodLabel}</span>
            <CurrencyAmountList amounts={expensesTotal} emptyLabel={t('communityDashboard.empty')} />
            <p className="text-xs text-muted-foreground">{t('communityDashboard.expensesCaption')}</p>
          </div>
        </Card>
      </div>

      <div className="flex w-full flex-col gap-3">
        <h2 className="text-base font-semibold">{t('communityDashboard.breakdownHeading')}</h2>
        {scopedExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('communityDashboard.breakdownEmpty')}</p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {scopedExpenses.map((e) => (
              <ListRow
                key={e.id}
                title={e.name}
                subtitle={formatShortDate(parseISO(e.period_date), locale)}
                amount={formatAmount(e.amount, e.currency)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

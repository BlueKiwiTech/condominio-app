'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from 'cn';
import { displayStatus, type DisplayStatus } from '@/lib/resident/portal';
import type { ResidentPortalData, ResidentInstallment } from '@/lib/resident/queries';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { ListRow } from './ListRow';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// "Todo el año" toggle pill — matches MiComunidadClient's / MisPagosClient's
// (Mi Cartera's) identical filter control, for consistency across the three
// resident screens that browse by period.
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

function statusVariant(status: DisplayStatus): 'success' | 'neutral' | 'warning' | 'destructive' {
  if (status === 'paid') return 'success';
  if (status === 'advance') return 'neutral';
  if (status === 'partial') return 'warning';
  if (status === 'overdue') return 'destructive';
  return 'neutral';
}

function InstallmentCard({
  inst,
  graceDays,
  today,
  statusLabels,
}: {
  inst: ResidentInstallment;
  graceDays: number;
  today: Date;
  statusLabels: Record<DisplayStatus, string>;
}) {
  const locale = useLocale();
  const status = displayStatus(inst, graceDays, today);
  return (
    <ListRow
      title={inst.name}
      subtitle={formatShortDate(parseISO(inst.due_date), locale)}
      amount={formatAmount(inst.amount, inst.currency)}
      tag={{ label: statusLabels[status], variant: statusVariant(status) }}
    />
  );
}

export function MisCuotasClient({ data, graceDays }: { data: ResidentPortalData; graceDays: number }) {
  const t = useTranslations('residentCuotas');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);

  const statusLabels: Record<DisplayStatus, string> = {
    paid: t('status.paid'),
    advance: t('status.advance'),
    partial: t('status.partial'),
    pending: t('status.pending'),
    overdue: t('status.overdue'),
  };

  const pending = useMemo(() => data.installments.filter((i) => i.status !== 'paid'), [data.installments]);

  // Board request (2026-09-21): one single list, browsable by month/year
  // (same filter control as Mi Comunidad's Gastos and Mi Cartera's Abonos,
  // for consistency across all three resident screens) instead of the
  // previous urgency split with an unbrowsable "just the nearest month"
  // restriction. Overdue cuotas are no longer pinned above the filter
  // (2026-09-22 request) -- they show up like anything else, only when
  // their own due month/year is the one selected, matching the sibling
  // screens' filters. The card below still surfaces the running overdue
  // total independent of whatever period is selected here.
  const overdueItems = useMemo(
    () =>
      pending
        .filter((i) => displayStatus(i, graceDays, today) === 'overdue')
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [pending, graceDays, today],
  );

  const availableYears = useMemo(() => {
    const yrs = new Set<number>([getYear(today)]);
    for (const i of data.installments) yrs.add(getYear(parseISO(i.due_date)));
    return Array.from(yrs).sort((a, b) => a - b);
  }, [data.installments, today]);

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

  const listItems = useMemo(() => {
    const year = Number(yearValue);
    return data.installments
      .filter((i) => {
        const d = parseISO(i.due_date);
        if (getYear(d) !== year) return false;
        if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
        return true;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [data.installments, yearValue, monthValue, wholeYear]);

  // "Total vencido" card totals: strictly overdueItems (isOverdue, grace-days
  // aware) -- independent of the month/year filter above, so the running
  // total stays visible no matter which period is being browsed.
  const overdueTotals = useMemo(() => {
    const byCurrency = new Map<string, { currency: string; owed: number; since: string }>();
    for (const inst of overdueItems) {
      const owedAmount = inst.amount - inst.amount_paid;
      if (owedAmount <= 0) continue;
      const existing = byCurrency.get(inst.currency);
      if (existing) {
        existing.owed += owedAmount;
        if (inst.due_date < existing.since) existing.since = inst.due_date;
      } else {
        byCurrency.set(inst.currency, { currency: inst.currency, owed: owedAmount, since: inst.due_date });
      }
    }
    return Array.from(byCurrency.values());
  }, [overdueItems]);

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-xl font-bold md:text-2xl">{t('heading')}</h1>

      {overdueItems.length > 0 ? (
        <Card className="border-destructive/20 bg-destructive/15 p-5">
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center gap-4">
              <Image src="/mascota_bad.png" alt="" width={72} height={72} className="w-[72px] h-[72px] shrink-0" priority />
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-destructive">{t('overdueCard.heading')}</h2>
                {overdueTotals.map((d) => (
                  <div key={d.currency} className="flex flex-col gap-1">
                    <span className="text-xl font-bold">{formatAmount(d.owed, d.currency)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('overdueCard.since', { date: formatShortDate(parseISO(d.since), locale) })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-col gap-2">
              {overdueItems.map((inst) => (
                <InstallmentCard key={inst.id} inst={inst} graceDays={graceDays} today={today} statusLabels={statusLabels} />
              ))}
            </div>
            {data.community?.phone && (
              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                render={<a href={`tel:${data.community.phone}`} />}
                nativeButton={false}
              >
                <Phone className="size-4" />
                {t('overdueCard.contact')}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="border-success/20 bg-success/15 p-5">
          <div className="flex items-center gap-4">
            <Image src="/mascota_good.png" alt="" width={72} height={69} className="w-[72px] h-[69px] shrink-0" priority />
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-success">{t('allCaughtUp.heading')}</h2>
              <p className="text-sm text-muted-foreground">{t('allCaughtUp.subtitle')}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex w-full flex-col gap-3">
        <h2 className="text-base font-semibold">{t('cuotasHeading')}</h2>
        <div className="flex w-full flex-wrap items-center gap-2 rounded-[var(--radius)] border bg-card p-3 shadow-sm">
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
            <SelectTrigger aria-label={t('monthFilterLabel')} className="h-9 min-w-[9rem]">
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
          <Select value={yearValue} onValueChange={(v) => v && setYearValue(v)} items={yearOptions}>
            <SelectTrigger aria-label={t('yearFilterLabel')} className="h-9 min-w-[6rem]">
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
          <FilterChip label={t('allYear')} selected={wholeYear} onClick={() => setWholeYear((w) => !w)} />
        </div>
        {listItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.pending')}</p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {listItems.map((inst) => (
              <InstallmentCard key={inst.id} inst={inst} graceDays={graceDays} today={today} statusLabels={statusLabels} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

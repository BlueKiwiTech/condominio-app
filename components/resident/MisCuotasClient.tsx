'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { endOfMonth, format, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { displayStatus, groupByDueMonth, type DisplayStatus } from '@/lib/resident/portal';
import type { ResidentPortalData, ResidentInstallment } from '@/lib/resident/queries';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { ListRow } from './ListRow';

function statusVariant(status: DisplayStatus): 'success' | 'neutral' | 'warning' | 'destructive' {
  if (status === 'paid') return 'success';
  if (status === 'advance') return 'neutral';
  if (status === 'partial') return 'warning';
  if (status === 'overdue') return 'destructive';
  return 'neutral';
}

function InstallmentCard({ inst, today, statusLabels }: { inst: ResidentInstallment; today: Date; statusLabels: Record<DisplayStatus, string> }) {
  const locale = useLocale();
  const status = displayStatus(inst, today);
  return (
    <ListRow
      title={inst.name}
      subtitle={formatShortDate(parseISO(inst.due_date), locale)}
      amount={formatAmount(inst.amount - inst.amount_paid, inst.currency)}
      tag={{ label: statusLabels[status], variant: statusVariant(status) }}
    />
  );
}

export function MisCuotasClient({ data }: { data: ResidentPortalData }) {
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

  // Board request (2026-09-18): split "Mis cuotas" by urgency instead of by
  // installment type. "Deuda vencida" is every already-overdue cuota
  // (recurring or special, flat list). "Lo que viene" is everything else --
  // but a recurring template can have several months already generated
  // ahead (the cuota engine generates in advance), so only the single
  // nearest upcoming due-month's recurring cuotas show here, not all of
  // them; special cuotas have no such cadence, so all non-overdue ones show.
  const overdueItems = useMemo(
    () => pending.filter((i) => displayStatus(i, today) === 'overdue').sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [pending, today],
  );

  // "Lo que viene" also surfaces cuotas already paid in advance (e.g. a
  // special cuota's later installments settled in one go) as long as their
  // due date hasn't happened yet, so a resident who's fully paid up still
  // sees what's ahead instead of an empty section -- a paid installment
  // whose due date already passed just isn't "upcoming" anymore, so that
  // case is excluded.
  const upcomingPool = useMemo(
    () =>
      data.installments.filter((i) =>
        i.status === 'paid' ? parseISO(i.due_date) > today : displayStatus(i, today) !== 'overdue',
      ),
    [data.installments, today],
  );

  const nextRecurringMonth = useMemo(() => {
    const recurring = upcomingPool.filter(
      (i) => (i.condo_installment_templates?.installment_type ?? 'recurring') === 'recurring',
    );
    const groups = groupByDueMonth(recurring);
    const nextKey = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))[0];
    return nextKey ? { monthKey: nextKey, items: groups.get(nextKey)! } : null;
  }, [upcomingPool]);

  const specialUpcoming = useMemo(
    () => upcomingPool.filter((i) => i.condo_installment_templates?.installment_type === 'special'),
    [upcomingPool],
  );

  // "Deuda acumulada" (board request 2026-09-18): everything unpaid due in
  // the current month or earlier -- NOT the grace-period-gated admin
  // morosos definition (computeMorosos) and NOT the stricter "already past
  // its due day" isOverdue check (displayStatus === 'overdue') -- a cuota
  // due later this month still counts here, since it's still "del mes
  // actual". Future months' cuotas are excluded even if already generated.
  const debtItems = useMemo(
    () =>
      pending
        .filter((i) => parseISO(i.due_date) <= endOfMonth(today))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [pending, today],
  );

  const debtTotals = useMemo(() => {
    const byCurrency = new Map<string, { currency: string; owed: number; since: string }>();
    for (const inst of debtItems) {
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
  }, [debtItems]);

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-xl font-bold md:text-2xl">{t('heading')}</h1>

      {debtItems.length > 0 && (
        <Card className="border-destructive/20 bg-destructive/5 p-5">
          <div className="flex w-full flex-col gap-3">
            <h2 className="text-base font-semibold text-destructive">{t('overdueCard.heading')}</h2>
            {debtTotals.map((d) => (
              <div key={d.currency} className="flex flex-col gap-1">
                <span className="text-xl font-bold">{formatAmount(d.owed, d.currency)}</span>
                <span className="text-xs text-muted-foreground">
                  {t('overdueCard.since', { date: formatShortDate(parseISO(d.since), locale) })}
                </span>
              </div>
            ))}
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
      )}

      {overdueItems.length > 0 && (
        <div className="flex w-full flex-col gap-3">
          <h2 className="text-base font-semibold">{t('overdueHeading')}</h2>
          <div className="flex w-full flex-col gap-2">
            {overdueItems.map((inst) => (
              <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
            ))}
          </div>
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <h2 className="text-base font-semibold">{t('upcomingHeading')}</h2>
        {!nextRecurringMonth && specialUpcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.pending')}</p>
        ) : (
          <div className="flex w-full flex-col gap-6">
            {nextRecurringMonth && (
              <div className="flex w-full flex-col gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {format(parseISO(`${nextRecurringMonth.monthKey}-01`), 'MMMM yyyy', { locale: dateLocale })}
                </span>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {nextRecurringMonth.items.map((inst) => (
                    <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                  ))}
                </div>
              </div>
            )}

            {specialUpcoming.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                {specialUpcoming.map((inst) => (
                  <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

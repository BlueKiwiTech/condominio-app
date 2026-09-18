'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { endOfMonth, format, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Column, Grid, Card, Heading, Text, SmartLink, Button } from '@once-ui-system/core';
import { displayStatus, groupByDueMonth, type DisplayStatus } from '@/lib/resident/portal';
import type { ResidentPortalData, ResidentInstallment } from '@/lib/resident/queries';
import { currencyLabel } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import { ListRow } from './ListRow';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

function statusVariant(status: DisplayStatus): 'success' | 'info' | 'warning' | 'neutral' | 'danger' {
  if (status === 'paid') return 'success';
  if (status === 'advance') return 'info';
  if (status === 'partial') return 'warning';
  if (status === 'overdue') return 'danger';
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

  const notOverduePending = useMemo(
    () => pending.filter((i) => displayStatus(i, today) !== 'overdue'),
    [pending, today],
  );

  const nextRecurringMonth = useMemo(() => {
    const recurring = notOverduePending.filter(
      (i) => (i.condo_installment_templates?.installment_type ?? 'recurring') === 'recurring',
    );
    const groups = groupByDueMonth(recurring);
    const nextKey = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))[0];
    return nextKey ? { monthKey: nextKey, items: groups.get(nextKey)! } : null;
  }, [notOverduePending]);

  const specialUpcoming = useMemo(
    () => notOverduePending.filter((i) => i.condo_installment_templates?.installment_type === 'special'),
    [notOverduePending],
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
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Heading variant="display-strong-s">{t('heading')}</Heading>

      {debtItems.length > 0 && (
        <Card padding="20" radius="s" background="danger-alpha-weak" fillWidth>
          <Column gap="12" fillWidth>
            <Heading variant="heading-strong-s" onBackground="danger-strong">
              {t('overdueCard.heading')}
            </Heading>
            {debtTotals.map((d) => (
              <Column key={d.currency} gap="4">
                <Text variant="heading-strong-m">{formatAmount(d.owed, d.currency)}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('overdueCard.since', { date: formatShortDate(parseISO(d.since), locale) })}
                </Text>
              </Column>
            ))}
            {data.community?.phone && (
              <SmartLink href={`tel:${data.community.phone}`} unstyled fillWidth>
                <Button type="button" variant="danger" fillWidth>
                  {t('overdueCard.contact')}
                </Button>
              </SmartLink>
            )}
          </Column>
        </Card>
      )}

      {overdueItems.length > 0 && (
        <Column gap="12" fillWidth>
          <Heading variant="heading-strong-s">{t('overdueHeading')}</Heading>
          <Column gap="8" fillWidth>
            {overdueItems.map((inst) => (
              <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
            ))}
          </Column>
        </Column>
      )}

      <Column gap="12" fillWidth>
        <Heading variant="heading-strong-s">{t('upcomingHeading')}</Heading>
        {!nextRecurringMonth && specialUpcoming.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('empty.pending')}
          </Text>
        ) : (
          <Column gap="24" fillWidth>
            {nextRecurringMonth && (
              <Column gap="8" fillWidth>
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {format(parseISO(`${nextRecurringMonth.monthKey}-01`), 'MMMM yyyy', { locale: dateLocale })}
                </Text>
                <Grid columns="2" gap="12" fillWidth s={{ columns: 1 }}>
                  {nextRecurringMonth.items.map((inst) => (
                    <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                  ))}
                </Grid>
              </Column>
            )}

            {specialUpcoming.length > 0 && (
              <Column gap="8" fillWidth>
                {specialUpcoming.map((inst) => (
                  <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                ))}
              </Column>
            )}
          </Column>
        )}
      </Column>
    </Column>
  );
}

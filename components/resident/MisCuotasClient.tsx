'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Column, Row, Grid, Card, Heading, Text, Tag, SegmentedControl, SmartLink, Button } from '@once-ui-system/core';
import { computeMorosos } from '@/lib/reporting/morosos';
import { displayStatus, groupByDueMonth, type DisplayStatus } from '@/lib/resident/portal';
import type { ResidentPortalData, ResidentInstallment } from '@/lib/resident/queries';
import { currencyLabel } from '@/lib/currency';

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
  const status = displayStatus(inst, today);
  return (
    <Card padding="16" radius="l" fillWidth border="neutral-alpha-weak">
      <Column gap="8">
        <Text variant="label-strong-s">{inst.name}</Text>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {format(parseISO(inst.due_date), 'dd/MM/yyyy')}
        </Text>
        <Row horizontal="between" vertical="center" fillWidth>
          <Text variant="body-default-s">{formatAmount(inst.amount - inst.amount_paid, inst.currency)}</Text>
          <Tag variant={statusVariant(status)} label={statusLabels[status]} />
        </Row>
      </Column>
    </Card>
  );
}

export function MisCuotasClient({ data }: { data: ResidentPortalData }) {
  const t = useTranslations('residentCuotas');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const today = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const house = data.house!;

  const statusLabels: Record<DisplayStatus, string> = {
    paid: t('status.paid'),
    advance: t('status.advance'),
    partial: t('status.partial'),
    pending: t('status.pending'),
    overdue: t('status.overdue'),
  };

  const pending = useMemo(() => data.installments.filter((i) => i.status !== 'paid'), [data.installments]);
  const history = useMemo(
    () => data.installments.filter((i) => i.status === 'paid').sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [data.installments],
  );

  const recurringPending = useMemo(
    () => pending.filter((i) => (i.condo_installment_templates?.installment_type ?? 'recurring') === 'recurring'),
    [pending],
  );
  const specialPending = useMemo(
    () => pending.filter((i) => i.condo_installment_templates?.installment_type === 'special'),
    [pending],
  );

  const monthGroups = useMemo(() => {
    const groups = groupByDueMonth(recurringPending);
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [recurringPending]);

  const morosos = useMemo(
    () =>
      computeMorosos(
        data.installments,
        [{ id: house.id, house_number: house.house_number, house_name: house.house_name, owner_name: house.owner_name }],
        data.community?.grace_period_days ?? 0,
        today,
      ),
    [data.installments, house, data.community, today],
  );
  const overdueItems = useMemo(() => pending.filter((i) => displayStatus(i, today) === 'overdue'), [pending, today]);

  return (
    <Column fillWidth gap="24" paddingY="24" paddingX="16" maxWidth={32}>
      <Heading variant="display-strong-s">{t('heading')}</Heading>

      <SegmentedControl
        fillWidth
        buttons={[
          { value: 'pending', label: t('tabs.pending') },
          { value: 'history', label: t('tabs.history') },
        ]}
        selected={tab}
        onToggle={(value) => setTab(value as 'pending' | 'history')}
      />

      {tab === 'pending' && morosos.length > 0 && (
        <Card padding="20" radius="l" background="danger-alpha-weak" fillWidth>
          <Column gap="12">
            <Heading variant="heading-strong-s" onBackground="danger-strong">
              {t('overdueCard.heading')}
            </Heading>
            {morosos.map((m) => (
              <Column key={m.currency} gap="4">
                <Text variant="heading-strong-m">{formatAmount(m.owed, m.currency)}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {t('overdueCard.since', { date: format(parseISO(m.owedSince), 'dd/MM/yyyy') })}
                </Text>
              </Column>
            ))}
            <Column gap="4">
              {overdueItems.map((inst) => (
                <Row key={inst.id} horizontal="between" fillWidth>
                  <Text variant="body-default-s">{inst.name}</Text>
                  <Text variant="body-default-s">{formatAmount(inst.amount - inst.amount_paid, inst.currency)}</Text>
                </Row>
              ))}
            </Column>
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

      {tab === 'pending' ? (
        <Column gap="24" fillWidth>
          <Column gap="12" fillWidth>
            <Heading variant="heading-strong-s">{t('recurringHeading')}</Heading>
            {monthGroups.length === 0 ? (
              <Text variant="body-default-s" onBackground="neutral-weak">
                {t('empty.pending')}
              </Text>
            ) : (
              monthGroups.map(([monthKey, items]) => (
                <Column key={monthKey} gap="8" fillWidth>
                  <Text variant="label-default-s" onBackground="neutral-weak">
                    {format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: dateLocale })}
                  </Text>
                  <Grid columns="2" gap="12" fillWidth s={{ columns: 1 }}>
                    {items.map((inst) => (
                      <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                    ))}
                  </Grid>
                </Column>
              ))
            )}
          </Column>

          {specialPending.length > 0 && (
            <Column gap="12" fillWidth>
              <Heading variant="heading-strong-s">{t('specialHeading')}</Heading>
              <Column gap="8" fillWidth>
                {specialPending.map((inst) => (
                  <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />
                ))}
              </Column>
            </Column>
          )}
        </Column>
      ) : (
        <Column gap="8" fillWidth>
          {history.length === 0 ? (
            <Text variant="body-default-s" onBackground="neutral-weak">
              {t('empty.history')}
            </Text>
          ) : (
            history.map((inst) => <InstallmentCard key={inst.id} inst={inst} today={today} statusLabels={statusLabels} />)
          )}
        </Column>
      )}
    </Column>
  );
}

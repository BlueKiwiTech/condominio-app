'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format, parseISO } from 'date-fns';
import { Column, Row, Card, Heading, Text, Tag, SmartLink, Button } from '@once-ui-system/core';
import { computeMorosos } from '@/lib/reporting/morosos';
import { creditsByCurrency } from '@/lib/reporting/dashboard';
import { upcomingInstallments } from '@/lib/resident/portal';
import type { ResidentPortalData } from '@/lib/resident/queries';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function MiHogarClient({ data }: { data: ResidentPortalData }) {
  const t = useTranslations('residentHome');
  const house = data.house!;
  const today = useMemo(() => new Date(), []);

  const houseLabel = house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number;

  const credits = useMemo(
    () => Object.entries(creditsByCurrency(data.credits)).filter(([, v]) => (v ?? 0) > 0),
    [data.credits],
  );

  const morosos = useMemo(
    () => computeMorosos(data.installments, [{ id: house.id, house_number: house.house_number, house_name: house.house_name, owner_name: house.owner_name }], data.community?.grace_period_days ?? 0, today),
    [data.installments, house, data.community, today],
  );

  const upcoming = useMemo(() => upcomingInstallments(data.installments, today, 5), [data.installments, today]);

  const isUpToDate = credits.length === 0 && morosos.length === 0;

  return (
    <Column fillWidth gap="24" paddingY="24" paddingX="16" maxWidth={32}>
      <Column gap="4">
        <Heading variant="display-strong-s">{t('greeting', { house: houseLabel })}</Heading>
        <Text variant="body-default-m" onBackground="neutral-weak">
          {t('subtitle')}
        </Text>
      </Column>

      <Column gap="12" fillWidth>
        {isUpToDate && (
          <Card padding="20" radius="l" background="success-alpha-weak" fillWidth>
            <Text variant="heading-strong-s" onBackground="success-strong">
              {t('upToDate')}
            </Text>
          </Card>
        )}
        {credits.map(([currency, amount]) => (
          <Card key={`credit-${currency}`} padding="20" radius="l" background="success-alpha-weak" fillWidth>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('creditLabel')}
              </Text>
              <Text variant="heading-strong-l">{formatAmount(amount ?? 0, currency)}</Text>
            </Column>
          </Card>
        ))}
        {morosos.map((m) => (
          <Card key={`debt-${m.currency}`} padding="20" radius="l" background="danger-alpha-weak" fillWidth>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('debtLabel', { date: format(parseISO(m.owedSince), 'dd/MM/yyyy') })}
              </Text>
              <Text variant="heading-strong-l">{formatAmount(m.owed, m.currency)}</Text>
            </Column>
          </Card>
        ))}
      </Column>

      <Card padding="20" radius="l" fillWidth border="neutral-alpha-weak">
        <Column gap="16">
          <Heading variant="heading-strong-s">{t('houseInfo.heading')}</Heading>
          <Row gap="24" wrap>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('houseInfo.houseNumber')}
              </Text>
              <Text variant="body-default-m">{houseLabel}</Text>
            </Column>
            {house.owner_name && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('houseInfo.owner')}
                </Text>
                <Text variant="body-default-m">{house.owner_name}</Text>
              </Column>
            )}
            {house.owner_phone && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('houseInfo.phone')}
                </Text>
                <Text variant="body-default-m">{house.owner_phone}</Text>
              </Column>
            )}
            {house.owner_email && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('houseInfo.email')}
                </Text>
                <Text variant="body-default-m">{house.owner_email}</Text>
              </Column>
            )}
          </Row>
          {data.residents.length > 0 && (
            <Column gap="8">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('houseInfo.residents')}
              </Text>
              <Column gap="4">
                {data.residents.map((r) => (
                  <Text key={r.id} variant="body-default-s">
                    {r.resident_name}
                    {r.resident_phone ? ` · ${r.resident_phone}` : ''}
                  </Text>
                ))}
              </Column>
            </Column>
          )}
        </Column>
      </Card>

      <Column gap="12" fillWidth>
        <Heading variant="heading-strong-s">{t('upcoming.heading')}</Heading>
        {upcoming.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('upcoming.empty')}
          </Text>
        ) : (
          <Column gap="8" fillWidth>
            {upcoming.map((inst) => (
              <Row key={inst.id} fillWidth horizontal="between" vertical="center" padding="12" radius="m" border="neutral-alpha-weak">
                <Column gap="2">
                  <Text variant="label-strong-s">{inst.name}</Text>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {format(parseISO(inst.due_date), 'dd/MM/yyyy')}
                  </Text>
                </Column>
                <Tag variant="info" label={formatAmount(inst.amount - inst.amount_paid, inst.currency)} />
              </Row>
            ))}
          </Column>
        )}
      </Column>

      {data.community?.phone && (
        <SmartLink href={`tel:${data.community.phone}`} unstyled fillWidth>
          <Button type="button" variant="secondary" fillWidth>
            {t('reportPayment')}
          </Button>
        </SmartLink>
      )}
    </Column>
  );
}

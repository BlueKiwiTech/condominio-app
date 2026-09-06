'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Column, Row, Card, Heading, Text, Chip } from '@once-ui-system/core';
import { groupPaymentsByBatch, type PaymentRow } from '@/components/payments/types';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function MisPagosClient({ payments }: { payments: PaymentRow[] }) {
  const t = useTranslations('residentPayments');

  const batches = useMemo(() => groupPaymentsByBatch(payments), [payments]);

  const years = useMemo(
    () => Array.from(new Set(batches.map((b) => b.paymentDate.slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [batches],
  );

  const [yearFilter, setYearFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (yearFilter === 'all' ? batches : batches.filter((b) => b.paymentDate.slice(0, 4) === yearFilter)),
    [batches, yearFilter],
  );

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const b of filtered) {
      totals[b.currency] = (totals[b.currency] ?? 0) + b.totalAmount;
    }
    return totals;
  }, [filtered]);

  return (
    <Column fillWidth gap="24" paddingY="24" paddingX="16" maxWidth={32}>
      <Heading variant="display-strong-s">{t('heading')}</Heading>

      <Row gap="8" wrap>
        <Chip label={t('filterAll')} selected={yearFilter === 'all'} onClick={() => setYearFilter('all')} />
        {years.map((y) => (
          <Chip key={y} label={y} selected={yearFilter === y} onClick={() => setYearFilter(y)} />
        ))}
      </Row>

      {Object.keys(totalsByCurrency).length > 0 && (
        <Row gap="16" wrap fillWidth>
          {Object.entries(totalsByCurrency).map(([currency, amount]) => (
            <Card key={currency} padding="16" radius="l" background="neutral-alpha-weak" flex={1} minWidth={12}>
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('totalFor', { period: yearFilter === 'all' ? t('filterAll') : yearFilter })}
                </Text>
                <Text variant="heading-strong-m">{formatAmount(amount, currency)}</Text>
              </Column>
            </Card>
          ))}
        </Row>
      )}

      {filtered.length === 0 ? (
        <Text variant="body-default-s" onBackground="neutral-weak">
          {t('empty')}
        </Text>
      ) : (
        <Column gap="8" fillWidth>
          {filtered.map((batch) => (
            <Card key={batch.batchId} padding="16" radius="l" fillWidth border="neutral-alpha-weak">
              <Column gap="8">
                <Row horizontal="between" vertical="center" fillWidth>
                  <Text variant="label-strong-s">
                    {batch.receiptNumber ? `#${String(batch.receiptNumber).padStart(4, '0')}` : t('receipt')}
                  </Text>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {format(new Date(batch.paymentDate), 'dd/MM/yyyy')}
                  </Text>
                </Row>
                <Text variant="body-default-s" onBackground="neutral-weak">
                  {t('cuotas')}: {batch.installmentNames.join(', ')}
                </Text>
                <Row horizontal="between" fillWidth>
                  <Text variant="body-default-s">{batch.reference ?? '—'}</Text>
                  <Text variant="heading-strong-s">{formatAmount(batch.totalAmount, batch.currency)}</Text>
                </Row>
              </Column>
            </Card>
          ))}
        </Column>
      )}
    </Column>
  );
}

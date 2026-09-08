import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Column, Row, Heading, Text, Card, SmartLink, Icon } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import type { PaymentRow } from '@/components/payments/types';
import { groupPaymentsByBatch } from '@/components/payments/types';
import { currencyLabel } from '@/lib/currency';

export default async function PaymentDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const t = await getTranslations('payments.detail');
  const supabase = await createClient();

  const [{ data: payments }, { data: userData }] = await Promise.all([
    supabase
      .from('condo_payments')
      .select(
        'id, house_id, installment_id, payment_batch_id, amount_paid, currency, payment_date, reference, notes, receipt_number, created_at, condo_houses(house_number, house_name), condo_installments(name, due_date)',
      )
      .eq('payment_batch_id', batchId),
    supabase.auth.getUser(),
  ]);

  const rows = (payments as unknown as PaymentRow[] | null) ?? [];
  if (rows.length === 0) notFound();

  const [batch] = groupPaymentsByBatch(rows);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32" maxWidth={40}>
      <SmartLink href="/pagos">
        <Row gap="8" vertical="center">
          <Icon name="chevronLeft" size="s" />
          <Text variant="body-default-s">{t('back')}</Text>
        </Row>
      </SmartLink>

      <Card padding="24" radius="l" fillWidth>
        <Column gap="20" fillWidth>
          <Row horizontal="between" vertical="start" fillWidth wrap>
            <Column gap="4">
              <Heading variant="heading-strong-l">
                {batch.receiptNumber ? `#${String(batch.receiptNumber).padStart(4, '0')}` : t('noReceipt')}
              </Heading>
              <Text variant="body-default-s" onBackground="neutral-weak">
                {batch.paymentDate}
              </Text>
            </Column>
            <Text variant="heading-strong-l">
              {batch.totalAmount.toFixed(2)} {currencyLabel(batch.currency)}
            </Text>
          </Row>

          <Column gap="4">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('house')}
            </Text>
            <Text variant="body-default-m">{batch.houseLabel}</Text>
          </Column>

          <Column gap="4">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('cuotasCovered')}
            </Text>
            <Column gap="8">
              {batch.rows.map((row) => (
                <Row key={row.id} horizontal="between" fillWidth>
                  <Text variant="body-default-s">{row.condo_installments?.name ?? '—'}</Text>
                  <Text variant="body-default-s">
                    {row.amount_paid.toFixed(2)} {currencyLabel(row.currency)}
                  </Text>
                </Row>
              ))}
            </Column>
          </Column>

          <Row gap="32" wrap>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('currency')}
              </Text>
              <Text variant="body-default-m">{currencyLabel(batch.currency)}</Text>
            </Column>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('reference')}
              </Text>
              <Text variant="body-default-m">{batch.reference ?? '—'}</Text>
            </Column>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('registeredBy')}
              </Text>
              <Text variant="body-default-m">{userData?.user?.email ?? '—'}</Text>
            </Column>
          </Row>

          {batch.rows.some((r) => r.notes) && (
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('notes')}
              </Text>
              {batch.rows
                .filter((r) => r.notes)
                .map((r) => (
                  <Text key={r.id} variant="body-default-s" onBackground="neutral-weak">
                    “{r.notes}”
                  </Text>
                ))}
            </Column>
          )}
        </Column>
      </Card>
    </Column>
  );
}

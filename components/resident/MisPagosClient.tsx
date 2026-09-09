'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Column, Row, Card, Heading, Text, Chip, Tag, Button } from '@once-ui-system/core';
import { groupPaymentsByBatch, type PaymentBatch, type PaymentRow } from '@/components/payments/types';
import { currencyLabel } from '@/lib/currency';
import { ReportPaymentDialog } from './ReportPaymentDialog';
import type { ResidentInstallment, ResidentPaymentReport, ResidentReportStatus } from '@/lib/resident/queries';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

function reportTagVariant(status: ResidentReportStatus): 'warning' | 'success' | 'danger' {
  if (status === 'confirmed') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

type ListItem =
  | { kind: 'payment'; date: string; batch: PaymentBatch }
  | { kind: 'report'; date: string; report: ResidentPaymentReport };

export function MisPagosClient({
  payments,
  installments,
  pendingInstallments,
  reports,
}: {
  payments: PaymentRow[];
  installments: ResidentInstallment[];
  pendingInstallments: ResidentInstallment[];
  reports: ResidentPaymentReport[];
}) {
  const t = useTranslations('residentPayments');
  const tHome = useTranslations('residentHome');
  const [reportOpen, setReportOpen] = useState(false);

  const batches = useMemo(() => groupPaymentsByBatch(payments), [payments]);

  const installmentNameById = useMemo(() => new Map(installments.map((i) => [i.id, i.name])), [installments]);

  const items = useMemo<ListItem[]>(() => {
    const paymentItems: ListItem[] = batches.map((batch) => ({ kind: 'payment', date: batch.paymentDate, batch }));
    // A confirmed report with a resulting_payment_batch_id has already been
    // auto-registered as a real payment (lib/actions/paymentReports.ts's
    // confirmPaymentReport) -- that batch is already in `batches` above, so
    // showing the report card too would look like a duplicate payment.
    const reportItems: ListItem[] = reports
      .filter((report) => !(report.status === 'confirmed' && report.resulting_payment_batch_id))
      .map((report) => ({ kind: 'report', date: report.payment_date, report }));
    return [...paymentItems, ...reportItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, reports]);

  const years = useMemo(
    () => Array.from(new Set(items.map((item) => item.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [items],
  );

  const [yearFilter, setYearFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (yearFilter === 'all' ? items : items.filter((item) => item.date.slice(0, 4) === yearFilter)),
    [items, yearFilter],
  );

  // Self-reported payments are never actual condo_payments rows (see
  // lib/actions/residentPayments.ts) -- excluded from the totals so the
  // per-currency sum only ever reflects real, registered payments.
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of filtered) {
      if (item.kind !== 'payment') continue;
      totals[item.batch.currency] = (totals[item.batch.currency] ?? 0) + item.batch.totalAmount;
    }
    return totals;
  }, [filtered]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Row horizontal="between" vertical="center" fillWidth wrap gap="8">
        <Heading variant="display-strong-s">{t('heading')}</Heading>
        <Button type="button" variant="secondary" size="s" onClick={() => setReportOpen(true)}>
          {tHome('reportPayment')}
        </Button>
      </Row>

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
          {filtered.map((item) =>
            item.kind === 'payment' ? (
              <Card key={item.batch.batchId} padding="16" radius="l" fillWidth border="neutral-alpha-weak">
                <Column gap="8">
                  <Row horizontal="between" vertical="center" fillWidth>
                    <Text variant="label-strong-s">
                      {item.batch.receiptNumber ? `#${String(item.batch.receiptNumber).padStart(4, '0')}` : t('receipt')}
                    </Text>
                    <Text variant="body-default-xs" onBackground="neutral-weak">
                      {format(new Date(item.batch.paymentDate), 'dd/MM/yyyy')}
                    </Text>
                  </Row>
                  <Text variant="body-default-s" onBackground="neutral-weak">
                    {t('cuotas')}: {item.batch.installmentNames.join(', ')}
                  </Text>
                  <Row horizontal="between" fillWidth>
                    <Text variant="body-default-s">{item.batch.reference ?? '—'}</Text>
                    <Text variant="heading-strong-s">{formatAmount(item.batch.totalAmount, item.batch.currency)}</Text>
                  </Row>
                </Column>
              </Card>
            ) : (
              <Card
                key={item.report.id}
                padding="16"
                radius="l"
                fillWidth
                border="neutral-alpha-weak"
                background={`${reportTagVariant(item.report.status)}-alpha-weak`}
              >
                <Column gap="8">
                  <Row horizontal="between" vertical="center" fillWidth>
                    <Tag variant={reportTagVariant(item.report.status)} label={t(`reportStatus.${item.report.status}`)} />
                    <Text variant="body-default-xs" onBackground="neutral-weak">
                      {format(new Date(item.report.payment_date), 'dd/MM/yyyy')}
                    </Text>
                  </Row>
                  {item.report.installment_ids.length > 0 && (
                    <Text variant="body-default-s" onBackground="neutral-weak">
                      {t('cuotas')}:{' '}
                      {item.report.installment_ids.map((id) => installmentNameById.get(id) ?? '—').join(', ')}
                    </Text>
                  )}
                  <Row horizontal="between" fillWidth>
                    <Text variant="body-default-s">{item.report.reference ?? '—'}</Text>
                    <Text variant="heading-strong-s">{formatAmount(item.report.amount, item.report.currency)}</Text>
                  </Row>
                </Column>
              </Card>
            ),
          )}
        </Column>
      )}

      {reportOpen && (
        <ReportPaymentDialog pendingInstallments={pendingInstallments} onClose={() => setReportOpen(false)} />
      )}
    </Column>
  );
}

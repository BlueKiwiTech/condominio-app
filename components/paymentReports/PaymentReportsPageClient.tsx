'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format, parseISO } from 'date-fns';
import { Column, Row, Card, Text, Tag, Button, SegmentedControl, Feedback } from '@once-ui-system/core';
import { updateReportStatus, getReportScreenshotUrl } from '@/lib/actions/paymentReports';
import { currencyLabel } from '@/lib/currency';
import type { PaymentReportRow, InstallmentLookup, ReportStatus } from './types';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

function statusVariant(status: ReportStatus): 'warning' | 'success' | 'danger' {
  if (status === 'confirmed') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

function ReportCard({
  report,
  installmentLookup,
}: {
  report: PaymentReportRow;
  installmentLookup: InstallmentLookup;
}) {
  const t = useTranslations('paymentReports');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const houseLabel = report.condo_houses
    ? report.condo_houses.house_name
      ? `${report.condo_houses.house_number} · ${report.condo_houses.house_name}`
      : report.condo_houses.house_number
    : '—';

  const taggedInstallments = report.installment_ids.map((id) => installmentLookup[id]).filter(Boolean);

  const handleStatusChange = (status: 'confirmed' | 'rejected') => {
    startTransition(async () => {
      const result = await updateReportStatus(report.id, status, locale);
      if ('error' in result) return;
      router.refresh();
    });
  };

  const handleViewScreenshot = async () => {
    if (!report.screenshot_path) return;
    setScreenshotError(null);
    setScreenshotLoading(true);
    const result = await getReportScreenshotUrl(report.screenshot_path, locale);
    setScreenshotLoading(false);
    if ('error' in result) {
      setScreenshotError(result.error);
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card padding="20" radius="l" border="neutral-alpha-weak" fillWidth>
      <Column gap="12" fillWidth>
        <Row horizontal="between" vertical="center" fillWidth wrap>
          <Column gap="2">
            <Text variant="label-strong-s">{houseLabel}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {t('reportedAt', { date: format(parseISO(report.created_at), 'dd/MM/yyyy HH:mm') })}
            </Text>
          </Column>
          <Tag variant={statusVariant(report.status)} label={t(`status.${report.status}`)} />
        </Row>

        <Row horizontal="between" vertical="center" fillWidth wrap>
          <Text variant="heading-strong-m">{formatAmount(report.amount, report.currency)}</Text>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('paidOn', { date: format(parseISO(report.payment_date), 'dd/MM/yyyy') })}
          </Text>
        </Row>

        {report.reference && (
          <Text variant="body-default-s">
            <Text as="span" onBackground="neutral-weak">
              {t('fields.reference')}:
            </Text>{' '}
            {report.reference}
          </Text>
        )}
        {report.notes && (
          <Text variant="body-default-s">
            <Text as="span" onBackground="neutral-weak">
              {t('fields.notes')}:
            </Text>{' '}
            {report.notes}
          </Text>
        )}

        {taggedInstallments.length > 0 && (
          <Column gap="4">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('fields.cuotas')}
            </Text>
            {taggedInstallments.map((inst, idx) => (
              <Text key={idx} variant="body-default-s">
                {inst.name} — {format(parseISO(inst.due_date), 'dd/MM/yyyy')}
              </Text>
            ))}
          </Column>
        )}

        {screenshotError && <Feedback variant="danger" description={screenshotError} />}

        <Row gap="8" wrap>
          {report.screenshot_path && (
            <Button type="button" variant="secondary" size="s" loading={screenshotLoading} onClick={handleViewScreenshot}>
              {t('viewScreenshot')}
            </Button>
          )}
          {report.status === 'pending' && (
            <>
              <Button type="button" variant="primary" size="s" loading={isPending} onClick={() => handleStatusChange('confirmed')}>
                {t('confirm')}
              </Button>
              <Button type="button" variant="danger" size="s" loading={isPending} onClick={() => handleStatusChange('rejected')}>
                {t('reject')}
              </Button>
            </>
          )}
        </Row>
      </Column>
    </Card>
  );
}

export function PaymentReportsPageClient({
  reports,
  installmentLookup,
}: {
  reports: PaymentReportRow[];
  installmentLookup: InstallmentLookup;
}) {
  const t = useTranslations('paymentReports');
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  const visibleReports = useMemo(
    () => (tab === 'pending' ? reports.filter((r) => r.status === 'pending') : reports),
    [reports, tab],
  );

  return (
    <Column gap="16" fillWidth>
      <SegmentedControl
        fillWidth={false}
        buttons={[
          { value: 'pending', label: t('tabs.pending', { count: reports.filter((r) => r.status === 'pending').length }) },
          { value: 'all', label: t('tabs.all') },
        ]}
        selected={tab}
        onToggle={(value) => setTab(value as 'pending' | 'all')}
      />

      {visibleReports.length === 0 ? (
        <Text variant="body-default-s" onBackground="neutral-weak">
          {t('empty')}
        </Text>
      ) : (
        <Column gap="12" fillWidth>
          {visibleReports.map((report) => (
            <ReportCard key={report.id} report={report} installmentLookup={installmentLookup} />
          ))}
        </Column>
      )}
    </Column>
  );
}

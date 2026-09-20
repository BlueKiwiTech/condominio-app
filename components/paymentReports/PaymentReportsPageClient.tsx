'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO } from 'date-fns';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { confirmPaymentReport, rejectPaymentReport, getReportScreenshotUrl } from '@/lib/actions/paymentReports';
import { formatAmount } from '@/lib/currency';
import { formatShortDate, formatDateTime } from '@/lib/dateFormat';
import type { PaymentReportRow, InstallmentLookup, ReportStatus } from './types';

const STATUS_CLASSES: Record<ReportStatus, string> = {
  confirmed: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  pending: 'bg-warning/10 text-warning',
};

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const houseLabel = report.condo_houses
    ? report.condo_houses.house_name
      ? `${report.condo_houses.house_number} · ${report.condo_houses.house_name}`
      : report.condo_houses.house_number
    : '—';

  const taggedInstallments = report.installment_ids.map((id) => installmentLookup[id]).filter(Boolean);

  const handleConfirm = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await confirmPaymentReport(report.id, locale);
      if ('error' in result) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleReject = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await rejectPaymentReport(report.id, locale);
      if ('error' in result) {
        setActionError(result.error);
        return;
      }
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
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{houseLabel}</span>
            <span className="text-xs text-muted-foreground">
              {t('reportedAt', { date: formatDateTime(parseISO(report.created_at), locale) })}
            </span>
          </div>
          <Badge variant="outline" className={STATUS_CLASSES[report.status]}>
            {report.status === 'confirmed' && report.resulting_receipt_number
              ? t('statusWithReceipt', {
                  status: t('status.confirmed'),
                  receipt: `#${String(report.resulting_receipt_number).padStart(4, '0')}`,
                })
              : t(`status.${report.status}`)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-semibold">{formatAmount(report.amount, report.currency)}</span>
          <span className="text-sm text-muted-foreground">{t('paidOn', { date: formatShortDate(parseISO(report.payment_date), locale) })}</span>
        </div>

        {report.reference && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('fields.reference')}:</span> {report.reference}
          </p>
        )}
        {report.notes && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('fields.notes')}:</span> {report.notes}
          </p>
        )}

        {taggedInstallments.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('fields.cuotas')}</span>
            {taggedInstallments.map((inst, idx) => (
              <p key={idx} className="text-sm">
                {inst.name} — {formatShortDate(parseISO(inst.due_date), locale)}
              </p>
            ))}
          </div>
        )}

        {report.status === 'confirmed' && !report.resulting_receipt_number && (
          <Alert className="border-warning/30 bg-warning/10">
            <AlertDescription className="text-warning">{t('noReceiptHint')}</AlertDescription>
          </Alert>
        )}

        {screenshotError && (
          <Alert variant="destructive">
            <AlertDescription>{screenshotError}</AlertDescription>
          </Alert>
        )}
        {actionError && (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {report.screenshot_path && (
            <Button type="button" variant="outline" size="sm" disabled={screenshotLoading} onClick={handleViewScreenshot}>
              <FileText />
              {t('viewScreenshot')}
            </Button>
          )}
          {report.status === 'pending' && (
            <>
              <Button type="button" size="sm" disabled={isPending} onClick={handleConfirm}>
                {t('confirm')}
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={handleReject}>
                {t('reject')}
              </Button>
            </>
          )}
        </div>
      </CardContent>
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
    <div className="flex w-full flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'all')}>
        <TabsList>
          <TabsTrigger value="pending">{t('tabs.pending', { count: reports.filter((r) => r.status === 'pending').length })}</TabsTrigger>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {visibleReports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {visibleReports.map((report) => (
            <ReportCard key={report.id} report={report} installmentLookup={installmentLookup} />
          ))}
        </div>
      )}
    </div>
  );
}

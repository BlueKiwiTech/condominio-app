'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO } from 'date-fns';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmPaymentReport, rejectPaymentReport, getReportScreenshotUrl } from '@/lib/actions/paymentReports';
import { formatAmount } from '@/lib/currency';
import { formatShortDate, formatDateTime } from '@/lib/dateFormat';
import type { PaymentReportRow, InstallmentLookup, ReportStatus, SpecialInstallment } from './types';

const STATUS_CLASSES: Record<ReportStatus, string> = {
  confirmed: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  pending: 'bg-warning/10 text-warning',
  on_hold: 'bg-primary/10 text-primary',
};

function ReportCard({
  report,
  installmentLookup,
  specials,
}: {
  report: PaymentReportRow;
  installmentLookup: InstallmentLookup;
  specials: SpecialInstallment[];
}) {
  const t = useTranslations('paymentReports');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSpecialIds, setSelectedSpecialIds] = useState<string[]>([]);

  const houseLabel = report.condo_houses
    ? report.condo_houses.house_name
      ? `${report.condo_houses.house_number} · ${report.condo_houses.house_name}`
      : report.condo_houses.house_number
    : '—';

  const taggedInstallments = report.installment_ids.map((id) => installmentLookup[id]).filter(Boolean);

  // A house with pending special cuotas gets a dialog first (nothing checked, optional);
  // without them the report is confirmed straight away, as before.
  const startConfirm = () => {
    if (specials.length > 0) {
      setSelectedSpecialIds([]);
      setPickerOpen(true);
      return;
    }
    handleConfirm([]);
  };

  const handleConfirm = (specialIds: string[]) => {
    setActionError(null);
    startTransition(async () => {
      const result = await confirmPaymentReport(report.id, locale, specialIds);
      if ('error' in result) {
        setPickerOpen(false);
        setActionError(result.error);
        return;
      }
      setPickerOpen(false);
      // The BCV rate for this report's date isn't there: it was parked instead of confirmed.
      if ('onHold' in result) toast.info(t('onHoldToast'));
      router.refresh();
    });
  };

  const handleReject = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await rejectPaymentReport(report.id, locale, rejectReason);
      if ('error' in result) {
        setActionError(result.error);
        return;
      }
      setRejecting(false);
      setRejectReason('');
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

        {report.status === 'on_hold' && (
          <p className="text-sm text-muted-foreground" data-testid="report-on-hold-hint">
            {t('onHoldHint')}
          </p>
        )}
        {report.status === 'rejected' && report.rejection_reason && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('rejectionReason')}:</span> {report.rejection_reason}
          </p>
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

        {rejecting && (
          <div className="flex flex-col gap-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectionReasonPlaceholder')}
              disabled={isPending}
              maxLength={500}
            />
            {rejectReason.trim().length < 3 && (
              <p className="text-xs text-muted-foreground">{t('rejectReasonRequired')}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {report.screenshot_path && (
            <Button type="button" variant="outline" size="sm" disabled={screenshotLoading} onClick={handleViewScreenshot}>
              <FileText />
              {t('viewScreenshot')}
            </Button>
          )}
          {(report.status === 'pending' || report.status === 'on_hold') && !rejecting && (
            <>
              {/* A report waiting for its exchange rate can't be confirmed (it releases by itself) but can still be rejected. */}
              {report.status === 'pending' && (
                <Button type="button" size="sm" disabled={isPending} onClick={startConfirm} data-testid="confirm-report">
                  {t('confirm')}
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => setRejecting(true)}>
                {t('reject')}
              </Button>
            </>
          )}
          {(report.status === 'pending' || report.status === 'on_hold') && rejecting && (
            <>
              <Button type="button" variant="destructive" size="sm" disabled={isPending || rejectReason.trim().length < 3} onClick={handleReject}>
                {t('confirmReject')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setRejecting(false);
                  setRejectReason('');
                }}
              >
                {t('cancel')}
              </Button>
            </>
          )}
        </div>

        <Dialog open={pickerOpen} onOpenChange={(open) => !isPending && setPickerOpen(open)}>
          <DialogContent data-testid="confirm-specials-dialog">
            <DialogHeader>
              <DialogTitle>{t('specialPicker.heading')}</DialogTitle>
              <DialogDescription>{t('specialPicker.hint')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {specials.map((inst) => (
                <label key={inst.id} className="flex cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={selectedSpecialIds.includes(inst.id)}
                    onCheckedChange={(checked) =>
                      setSelectedSpecialIds((prev) => (checked === true ? [...prev, inst.id] : prev.filter((x) => x !== inst.id)))
                    }
                    data-testid={`confirm-special-${inst.id}`}
                  />
                  <span className="flex flex-1 flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {inst.name}
                      <span className="text-muted-foreground"> · {formatShortDate(parseISO(inst.due_date), locale)}</span>
                    </span>
                    <span className="tabular-nums">{formatAmount(inst.amount - inst.amount_paid, inst.currency)}</span>
                  </span>
                </label>
              ))}
              {selectedSpecialIds.length > 0 && <p className="text-xs text-muted-foreground">{t('specialPicker.selectedNotice')}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setPickerOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={isPending} onClick={() => handleConfirm(selectedSpecialIds)} data-testid="confirm-with-selection">
                {t('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function PaymentReportsPageClient({
  reports,
  installmentLookup,
  specialInstallments,
}: {
  reports: PaymentReportRow[];
  installmentLookup: InstallmentLookup;
  specialInstallments: SpecialInstallment[];
}) {
  const t = useTranslations('paymentReports');
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  const visibleReports = useMemo(
    () => (tab === 'pending' ? reports.filter((r) => r.status === 'pending' || r.status === 'on_hold') : reports),
    [reports, tab],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'all')}>
        <TabsList>
          <TabsTrigger value="pending">{t('tabs.pending', { count: reports.filter((r) => r.status === 'pending' || r.status === 'on_hold').length })}</TabsTrigger>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {visibleReports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {visibleReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              installmentLookup={installmentLookup}
              specials={specialInstallments.filter((s) => s.house_id === report.house_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

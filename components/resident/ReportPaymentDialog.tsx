'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { addMonths, endOfMonth, parseISO } from 'date-fns';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { reportPayment } from '@/lib/actions/residentPayments';
import { extractResidentPaymentFromScreenshot } from '@/lib/actions/residentPaymentOcr';
import { toDateOnly } from '@/lib/cuotas/generate';
import { CURRENCY_SELECT_OPTIONS, formatAmount, formatMoney } from '@/lib/currency';
import { referenceUsdAmount, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import { isOverdue } from '@/lib/cuotas/status';
import type { ResidentInstallment, Currency } from '@/lib/resident/queries';
import { formatShortDate } from '@/lib/dateFormat';
import { ListRow } from './ListRow';

// V2's "Reportar un pago que hice" (Phase 7 mockup) — user-requested,
// admin-side deliberately untouched. Submits to condo_payment_reports
// (lib/actions/residentPayments.ts's reportPayment), a pending claim for
// later admin review, NOT a confirmed payment. The pending-cuotas list is
// read-only context (board request 2026-09-18: residents can't tag which
// cuota(s) a report is for anymore) -- every report submits with an empty
// installment_ids, so on confirm it always goes through the untagged/wallet
// path (lib/actions/paymentReports.ts's confirmPaymentReport): a receipt
// number + condo_house_credits credit, never auto-marking a specific cuota
// paid.
export function ReportPaymentDialog({
  pendingInstallments,
  exchangeRates,
  graceDays = 0,
  onClose,
}: {
  pendingInstallments: ResidentInstallment[];
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
  graceDays?: number;
  onClose: () => void;
}) {
  const t = useTranslations('residentHome.reportPaymentDialog');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [currency, setCurrency] = useState<Currency>(pendingInstallments[0]?.currency ?? 'USD');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OCR-first flow (user-requested, 2026-09-13): the amount/currency/date/
  // reference/notes fields stay hidden until the resident either attaches a
  // screenshot (auto-OCR'd via extractResidentPaymentFromScreenshot) or
  // explicitly says they don't have one. Purely a convenience -- it only
  // fills the fields below, reportPayment still submits whatever the
  // resident confirms/edits.
  const [isScanning, startScanTransition] = useTransition();
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrPrefilled, setOcrPrefilled] = useState(false);
  const [formRevealed, setFormRevealed] = useState(false);

  // Revoke the previous object URL whenever it changes or the dialog
  // unmounts -- otherwise each new selection leaks the prior blob.
  useEffect(() => {
    return () => {
      if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    };
  }, [screenshotPreviewUrl]);

  const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-selecting the same file after removing it
    setFileError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFileError(t('invalidFileType'));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setFileError(t('fileTooLarge'));
      return;
    }
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshot(file);
    setScreenshotPreviewUrl(URL.createObjectURL(file));

    setOcrError(null);
    setOcrPrefilled(false);
    startScanTransition(async () => {
      const result = await extractResidentPaymentFromScreenshot(file, locale);
      if ('error' in result) {
        setOcrError(result.error);
        setFormRevealed(true);
        return;
      }
      const { data } = result;
      if (data.amount !== null) setAmount(data.amount);
      if (data.currency !== null) setCurrency(data.currency);
      if (data.payment_date !== null) setPaymentDate(parseISO(data.payment_date));
      if (data.reference !== null) setReference(data.reference);
      if (data.notes !== null) setNotes(data.notes);
      setOcrPrefilled(true);
      setFormRevealed(true);
    });
  };

  const handleRemoveScreenshot = () => {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshot(null);
    setScreenshotPreviewUrl(null);
  };

  const balanceDue = (i: ResidentInstallment) => i.amount - i.amount_paid;

  // Board request (2026-09-19): show a total of what's actually overdue
  // (grace-period-aware, same isOverdue used everywhere else) above the
  // pending-cuotas list, per currency (never summed across USD/Bs/USDT).
  const overdueTotals = useMemo(() => {
    const byCurrency = new Map<Currency, number>();
    const today = new Date();
    for (const inst of pendingInstallments) {
      if (!isOverdue(inst.due_date, inst.status, graceDays, today)) continue;
      byCurrency.set(inst.currency, (byCurrency.get(inst.currency) ?? 0) + balanceDue(inst));
    }
    return Array.from(byCurrency.entries());
  }, [pendingInstallments, graceDays]);

  // Board request (2026-09-21, refined again): if there's ANY overdue cuota,
  // show ONLY the overdue ones -- the resident is behind, so the list stays
  // focused on catching up rather than mixing in future dues. Only once
  // there's nothing overdue does it fall back to previewing what's pending
  // in the current or following calendar month (not an unbounded "nearest
  // month that has any data" search -- a divided special cuota can have
  // months' worth of installments already generated far in advance, which
  // would otherwise clutter this list with things the resident can't be
  // reporting a payment for yet).
  const visibleInstallments = useMemo(() => {
    const today = new Date();
    const overdue: ResidentInstallment[] = [];
    const upcoming: ResidentInstallment[] = [];
    for (const inst of pendingInstallments) {
      (isOverdue(inst.due_date, inst.status, graceDays, today) ? overdue : upcoming).push(inst);
    }
    const sortByDueDate = (list: ResidentInstallment[]) => [...list].sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (overdue.length > 0) return sortByDueDate(overdue);
    const windowEnd = endOfMonth(addMonths(today, 1));
    return sortByDueDate(upcoming.filter((inst) => parseISO(inst.due_date) <= windowEnd));
  }, [pendingInstallments, graceDays]);

  // Reference only (PLAN.md's "cada quien saca la cuenta" decision) -- never
  // sent to the server. Null (renders nothing) for USD, or whenever the
  // matching rate is missing/stale.
  const usdReference = useMemo(
    () => (amount === '' ? null : referenceUsdAmount(amount, currency, exchangeRates)),
    [amount, currency, exchangeRates],
  );

  const canSubmit = amount !== '' && amount > 0 && paymentDate;

  const onSubmit = () => {
    setServerError(null);
    if (amount === '') return;
    startTransition(async () => {
      const result = await reportPayment(
        {
          amount,
          currency,
          payment_date: toDateOnly(paymentDate),
          reference: reference || undefined,
          notes: notes || undefined,
          installment_ids: [],
        },
        locale,
        screenshot,
      );
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('heading')}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            {t('successMessage')}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t('intro')}</p>
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            {visibleInstallments.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                {/* <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('whichCuotas')}
                </span> */}
                {overdueTotals.length > 0 && (
                  <div className="flex w-full flex-col gap-0.5 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                    <span className="text-xs font-medium text-destructive">{t('totalOverdue')}</span>
                    {overdueTotals.map(([cur, total]) => (
                      <span key={cur} className="text-sm font-semibold text-destructive">
                        {formatAmount(total, cur)}
                      </span>
                    ))}
                  </div>
                )}
                {/* <div className="flex w-full flex-col gap-2">
                  {visibleInstallments.map((inst) => (
                    <ListRow
                      key={inst.id}
                      title={inst.name}
                      subtitle={formatShortDate(parseISO(inst.due_date), locale)}
                      amount={formatAmount(balanceDue(inst), inst.currency)}
                    />
                  ))}
                </div> */}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {!formRevealed && (
              <div className="flex flex-col gap-3 rounded-lg bg-muted p-6">
                <p className="text-sm">{t('ocrStepHint')}</p>
                {fileError && (
                  <Alert variant="destructive">
                    <AlertDescription>{fileError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" size="lg" disabled={isScanning} onClick={() => fileInputRef.current?.click()}>
                    {isScanning && <Loader2 className="size-4 animate-spin" />}
                    {t('addScreenshot')}
                  </Button>
                  <Button type="button" variant="ghost" disabled={isScanning} onClick={() => setFormRevealed(true)}>
                    {t('manualEntry')}
                  </Button>
                </div>
              </div>
            )}

            {formRevealed && (
              <>
                {ocrError && (
                  <Alert variant="destructive">
                    <AlertDescription>{ocrError}</AlertDescription>
                  </Alert>
                )}
                {ocrPrefilled && !ocrError && (
                  <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
                    <CheckCircle2 className="size-4 shrink-0" />
                    {t('prefilled')}
                  </div>
                )}

                {screenshotPreviewUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a Next-optimizable remote asset */}
                    <img
                      src={screenshotPreviewUrl}
                      alt=""
                      className="size-16 rounded-lg border border-border object-cover"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveScreenshot}>
                      {t('removeScreenshot')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={isScanning} onClick={() => fileInputRef.current?.click()}>
                      {isScanning && <Loader2 className="size-4 animate-spin" />}
                      {t('changeScreenshot')}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button type="button" variant="ghost" size="sm" disabled={isScanning} onClick={() => fileInputRef.current?.click()}>
                      {isScanning && <Loader2 className="size-4 animate-spin" />}
                      {t('addScreenshot')}
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-4">
                  <div className="flex min-w-[8rem] flex-1 flex-col gap-2">
                    <Label htmlFor="amount">{t('fields.amount')}</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.valueAsNumber || 0)}
                    />
                  </div>
                  <div className="flex min-w-[8rem] flex-1 flex-col gap-2">
                    <Label htmlFor="currency">{t('fields.currency')}</Label>
                    <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                      <SelectTrigger id="currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_SELECT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {usdReference !== null && (
                  <p className="text-xs text-muted-foreground">
                    {t('usdReference', { amount: formatMoney(usdReference), source: currency === 'Bs' ? 'BCV' : 'Binance' })}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t('currencyFreeHint')}</p>

                <DateInput
                  id="payment_date"
                  label={t('fields.paymentDate')}
                  value={paymentDate}
                  onChange={(date) => setPaymentDate(date)}
                  maxDate={new Date()}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reference">{t('fields.reference')}</Label>
                  <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes">{t('fields.notes')}</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {success ? (
            <Button size="lg" onClick={onClose} type="button">
              {t('close')}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="lg" onClick={onClose} type="button">
                {t('cancel')}
              </Button>
              <Button size="lg" disabled={!canSubmit || isPending} onClick={onSubmit} type="button">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {t('submit')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

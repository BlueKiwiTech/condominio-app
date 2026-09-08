'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  Column,
  Row,
  Input,
  Textarea,
  DateInput,
  Select,
  Checkbox,
  Button,
  Feedback,
  Text,
} from '@once-ui-system/core';
import { reportPayment } from '@/lib/actions/residentPayments';
import { toDateOnly } from '@/lib/cuotas/generate';
import { CURRENCY_SELECT_OPTIONS, currencyLabel } from '@/lib/currency';
import type { ResidentInstallment, Currency } from '@/lib/resident/queries';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

// V2's "Reportar un pago que hice" (Phase 7 mockup) — user-requested,
// admin-side deliberately untouched. Submits to condo_payment_reports
// (lib/actions/residentPayments.ts's reportPayment), a pending claim for
// later admin review, NOT a confirmed payment -- selecting cuotas here only
// prefills the amount and tags the report for the admin's convenience, it
// never marks anything paid.
export function ReportPaymentDialog({
  pendingInstallments,
  onClose,
}: {
  pendingInstallments: ResidentInstallment[];
  onClose: () => void;
}) {
  const t = useTranslations('residentHome.reportPaymentDialog');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [currency, setCurrency] = useState<Currency>(pendingInstallments[0]?.currency ?? 'USD');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState<number | ''>('');
  const [amountEdited, setAmountEdited] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleRemoveScreenshot = () => {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshot(null);
    setScreenshotPreviewUrl(null);
  };

  // Not filtered by currency -- reporting a payment doesn't require it to
  // match the tagged cuota(s)' own currency (user decision, 2026-09-08): a
  // cuota's amount is denominated in one currency, but residents pay with
  // whatever they have (cash, Bs transfer, USDT). Every pending cuota is
  // selectable regardless of currency; each checkbox still shows its own.
  const balanceDue = (i: ResidentInstallment) => i.amount - i.amount_paid;
  const suggestedAmount = (ids: string[]) =>
    pendingInstallments.filter((i) => ids.includes(i.id)).reduce((sum, i) => sum + balanceDue(i), 0);

  const toggleInstallment = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!amountEdited) setAmount(suggestedAmount(next));
      return next;
    });
  };

  const handleCurrencySelect = (value: string | string[]) => {
    setCurrency((Array.isArray(value) ? value[0] : value) as Currency);
  };

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
          installment_ids: selectedIds,
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
      isOpen
      onClose={onClose}
      title={t('heading')}
      footer={
        success ? (
          <Button variant="primary" onClick={onClose} type="button">
            {t('close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} type="button">
              {t('cancel')}
            </Button>
            <Button variant="primary" loading={isPending} disabled={!canSubmit} onClick={onSubmit} type="button">
              {t('submit')}
            </Button>
          </>
        )
      }
    >
      {success ? (
        <Feedback variant="success" description={t('successMessage')} />
      ) : (
        <Column gap="16" fillWidth>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('intro')}
          </Text>
          {serverError && <Feedback variant="danger" description={serverError} />}

          {pendingInstallments.length > 0 && (
            <Column gap="8" fillWidth>
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('whichCuotas')}
              </Text>
              <Column gap="8" fillWidth>
                {pendingInstallments.map((inst) => (
                  <Checkbox
                    key={inst.id}
                    isChecked={selectedIds.includes(inst.id)}
                    onToggle={() => toggleInstallment(inst.id)}
                    label={`${inst.name} — ${format(parseISO(inst.due_date), 'dd/MM/yyyy')}`}
                    description={formatAmount(balanceDue(inst), inst.currency)}
                  />
                ))}
              </Column>
            </Column>
          )}

          <Row gap="16" wrap>
            <Input
              id="amount"
              type="number"
              label={t('fields.amount')}
              value={amount}
              onChange={(e) => {
                setAmountEdited(true);
                setAmount(e.target.valueAsNumber || 0);
              }}
            />
            <Select
              id="currency"
              label={t('fields.currency')}
              options={CURRENCY_SELECT_OPTIONS}
              value={currency}
              onSelect={handleCurrencySelect}
            />
          </Row>
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {t('currencyFreeHint')}
          </Text>

          <DateInput
            id="payment_date"
            label={t('fields.paymentDate')}
            value={paymentDate}
            onChange={(date) => setPaymentDate(date)}
            maxDate={new Date()}
          />
          <Input
            id="reference"
            label={t('fields.reference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Textarea id="notes" label={t('fields.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <Column gap="8" fillWidth>
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('fields.screenshot')}
            </Text>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {fileError && <Feedback variant="danger" description={fileError} />}
            {screenshotPreviewUrl ? (
              <Row gap="12" vertical="center">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a Next-optimizable remote asset */}
                <img
                  src={screenshotPreviewUrl}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--neutral-border-weak)' }}
                />
                <Button type="button" variant="tertiary" size="s" onClick={handleRemoveScreenshot}>
                  {t('removeScreenshot')}
                </Button>
              </Row>
            ) : (
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                {t('addScreenshot')}
              </Button>
            )}
          </Column>
        </Column>
      )}
    </Dialog>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
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
import type { ResidentInstallment, Currency } from '@/lib/resident/queries';

const CURRENCY_OPTIONS = [
  { label: 'USD', value: 'USD' },
  { label: 'Bs', value: 'Bs' },
  { label: 'USDT', value: 'USDT' },
];

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
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

  const availableCurrencies = useMemo(
    () => Array.from(new Set(pendingInstallments.map((i) => i.currency))),
    [pendingInstallments],
  );
  const [currency, setCurrency] = useState<Currency>(availableCurrencies[0] ?? 'USD');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState<number | ''>('');
  const [amountEdited, setAmountEdited] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const currencyInstallments = useMemo(
    () => pendingInstallments.filter((i) => i.currency === currency),
    [pendingInstallments, currency],
  );

  const balanceDue = (i: ResidentInstallment) => i.amount - i.amount_paid;
  const suggestedAmount = (ids: string[]) =>
    currencyInstallments.filter((i) => ids.includes(i.id)).reduce((sum, i) => sum + balanceDue(i), 0);

  const toggleInstallment = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!amountEdited) setAmount(suggestedAmount(next));
      return next;
    });
  };

  const handleCurrencySelect = (value: string | string[]) => {
    const c = (Array.isArray(value) ? value[0] : value) as Currency;
    setCurrency(c);
    setSelectedIds([]);
    setAmountEdited(false);
    setAmount('');
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
              {availableCurrencies.length > 1 && (
                <Select
                  id="currency"
                  label={t('fields.currency')}
                  options={CURRENCY_OPTIONS.filter((o) => availableCurrencies.includes(o.value as Currency))}
                  value={currency}
                  onSelect={handleCurrencySelect}
                  fillWidth
                />
              )}
              <Column gap="8" fillWidth>
                {currencyInstallments.map((inst) => (
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
            {pendingInstallments.length === 0 ? (
              <Select
                id="currency"
                label={t('fields.currency')}
                options={CURRENCY_OPTIONS}
                value={currency}
                onSelect={handleCurrencySelect}
              />
            ) : (
              <Input id="currency-display" label={t('fields.currency')} value={currency} disabled readOnly />
            )}
          </Row>

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
        </Column>
      )}
    </Dialog>
  );
}

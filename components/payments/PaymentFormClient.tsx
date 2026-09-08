'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Column,
  Row,
  Input,
  Textarea,
  DateInput,
  Select,
  Chip,
  Checkbox,
  Button,
  Feedback,
  Text,
  Heading,
  Table,
  Tag,
  useToast,
  type TableHeader,
} from '@once-ui-system/core';
import { registerPayment } from '@/lib/actions/payments';
import { allocateFunds, sortOldestFirst } from '@/lib/payments/allocate';
import { toDateOnly } from '@/lib/cuotas/generate';
import { currencyLabel } from '@/lib/currency';
import type { HouseOption, PendingInstallment, HouseCredit, Currency } from './types';

export function PaymentFormClient({
  houses,
  pendingInstallments,
  houseCredits,
}: {
  houses: HouseOption[];
  pendingInstallments: PendingInstallment[];
  houseCredits: HouseCredit[];
}) {
  const t = useTranslations('payments.new');
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [houseId, setHouseId] = useState<string>('');
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [amountEdited, setAmountEdited] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const houseOptions = houses.map((h) => ({
    label: h.house_name ? `${h.house_number} · ${h.house_name}${h.owner_name ? ` (${h.owner_name})` : ''}` : h.house_number,
    value: h.id,
  }));

  const balanceDue = (i: PendingInstallment) => i.amount - i.amount_paid;
  const suggestedAmountFor = (ids: string[], installments: PendingInstallment[]) =>
    installments.filter((i) => ids.includes(i.id)).reduce((sum, i) => sum + balanceDue(i), 0);

  const houseInstallments = useMemo(
    () => pendingInstallments.filter((i) => i.house_id === houseId),
    [pendingInstallments, houseId],
  );
  const availableCurrencies = useMemo(
    () => Array.from(new Set(houseInstallments.map((i) => i.currency))),
    [houseInstallments],
  );
  const currencyInstallments = useMemo(
    () => sortOldestFirst(houseInstallments.filter((i) => i.currency === currency)),
    [houseInstallments, currency],
  );
  const selectedInstallments = useMemo(
    () => currencyInstallments.filter((i) => selectedIds.includes(i.id)),
    [currencyInstallments, selectedIds],
  );

  const existingCredit = useMemo(
    () => houseCredits.find((c) => c.house_id === houseId && c.currency === currency)?.balance ?? 0,
    [houseCredits, houseId, currency],
  );

  const preview = useMemo(() => {
    if (selectedInstallments.length === 0) return null;
    const fundsAvailable = (Number.isFinite(amountReceived) ? amountReceived : 0) + existingCredit;
    return allocateFunds(selectedInstallments, fundsAvailable);
  }, [selectedInstallments, amountReceived, existingCredit]);

  // Every selection change below is handled imperatively (event handlers),
  // not via useEffect + setState — the currency/selection/amount reset that
  // follows a house or currency change is a direct consequence of that one
  // user action, not something to "synchronize" reactively.

  // House change: default the currency chip to that house's (first) pending
  // currency, and default every installment in it to checked — the common
  // case is "pay everything currently due"; the admin can uncheck some
  // (PMNT-03: adjustable, supports partial payment).
  const handleHouseSelect = (id: string) => {
    setHouseId(id);
    const nextHouseInstallments = pendingInstallments.filter((i) => i.house_id === id);
    const currencies = Array.from(new Set(nextHouseInstallments.map((i) => i.currency)));
    const nextCurrency = currencies[0] ?? null;
    const nextInstallments = nextCurrency
      ? sortOldestFirst(nextHouseInstallments.filter((i) => i.currency === nextCurrency))
      : [];
    const nextIds = nextInstallments.map((i) => i.id);
    setCurrency(nextCurrency);
    setSelectedIds(nextIds);
    setAmountEdited(false);
    setAmountReceived(suggestedAmountFor(nextIds, nextInstallments));
  };

  const handleCurrencySelect = (c: Currency) => {
    setCurrency(c);
    const nextInstallments = sortOldestFirst(houseInstallments.filter((i) => i.currency === c));
    const nextIds = nextInstallments.map((i) => i.id);
    setSelectedIds(nextIds);
    setAmountEdited(false);
    setAmountReceived(suggestedAmountFor(nextIds, nextInstallments));
  };

  const toggleInstallment = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!amountEdited) setAmountReceived(suggestedAmountFor(next, currencyInstallments));
      return next;
    });
  };

  const canSubmit = houseId && currency && selectedIds.length > 0 && amountReceived > 0;

  const onSubmit = () => {
    setServerError(null);
    if (!houseId || !currency) return;
    startTransition(async () => {
      const result = await registerPayment(
        {
          house_id: houseId,
          installment_ids: selectedIds,
          currency,
          amount_received: amountReceived,
          payment_date: toDateOnly(paymentDate),
          reference: reference || undefined,
          notes: notes || undefined,
        },
        locale,
      );
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      addToast({ variant: 'success', message: t('toastSuccess') });
      router.push(`/pagos/${result.batchId}`);
    });
  };

  const headers: TableHeader[] = [
    { key: 'select', content: '' },
    { key: 'name', content: t('table.cuota') },
    { key: 'due', content: t('table.due') },
    { key: 'balance', content: t('table.balance') },
    { key: 'status', content: t('table.status') },
  ];

  const rows = currencyInstallments.map((inst) => [
    <Checkbox
      key={`check-${inst.id}`}
      isChecked={selectedIds.includes(inst.id)}
      onToggle={() => toggleInstallment(inst.id)}
    />,
    inst.name,
    inst.due_date,
    `${balanceDue(inst).toFixed(2)} ${currencyLabel(inst.currency)}`,
    <Tag key={`status-${inst.id}`} variant={inst.status === 'partial' ? 'warning' : 'info'} label={t(`status.${inst.status}`)} />,
  ]);

  return (
    <Row gap="32" fillWidth wrap>
      <Column gap="16" flex={2} minWidth={24}>
        {serverError && <Feedback variant="danger" description={serverError} />}

        <Select
          id="house"
          label={t('fields.house')}
          options={houseOptions}
          value={houseId}
          onSelect={(value) => handleHouseSelect(Array.isArray(value) ? value[0] : value)}
          fillWidth
          emptyState={t('noHouses')}
        />

        {houseId && availableCurrencies.length === 0 && (
          <Feedback variant="info" description={t('noPendingInstallments')} />
        )}

        {houseId && availableCurrencies.length > 0 && (
          <>
            {availableCurrencies.length > 1 && (
              <Column gap="8">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('fields.currency')}
                </Text>
                <Row gap="8" wrap>
                  {availableCurrencies.map((c) => (
                    <Chip key={c} label={currencyLabel(c)} selected={currency === c} onClick={() => handleCurrencySelect(c)} />
                  ))}
                </Row>
              </Column>
            )}

            {existingCredit > 0 && (
              <Feedback
                variant="success"
                description={t('existingCredit', { amount: existingCredit.toFixed(2), currency: currency ? currencyLabel(currency) : '' })}
              />
            )}

            <Table data={{ headers, rows }} emptyState={t('noPendingInstallments')} />

            <Row gap="16" wrap>
              <Input
                id="amount"
                type="number"
                label={t('fields.amountReceived')}
                value={Number.isNaN(amountReceived) ? '' : amountReceived}
                onChange={(e) => {
                  setAmountEdited(true);
                  setAmountReceived(e.target.valueAsNumber);
                }}
              />
              <Input id="currency-display" label={t('fields.currency')} value={currency ? currencyLabel(currency) : ''} disabled readOnly />
            </Row>

            <DateInput
              id="payment_date"
              label={t('fields.paymentDate')}
              value={paymentDate}
              onChange={(date) => setPaymentDate(date)}
            />
            <Input id="reference" label={t('fields.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
            <Textarea id="notes" label={t('fields.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <Row gap="12">
              <Button type="button" variant="primary" loading={isPending} disabled={!canSubmit} onClick={onSubmit}>
                {t('submit')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/pagos')}>
                {t('cancel')}
              </Button>
            </Row>
          </>
        )}
      </Column>

      <Column gap="12" flex={1} minWidth={16} padding="24" radius="l" background="neutral-alpha-weak" fitHeight>
        <Heading variant="heading-strong-s">{t('summary.heading')}</Heading>
        {!preview && (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('summary.empty')}
          </Text>
        )}
        {preview && (
          <Column gap="12">
            {preview.allocations.map((a) => {
              const inst = selectedInstallments.find((i) => i.id === a.installment_id)!;
              return (
                <Row key={a.installment_id} horizontal="between" wrap>
                  <Text variant="body-default-s">{inst.name}</Text>
                  <Row gap="8" vertical="center">
                    <Text variant="body-default-s">
                      {a.amountApplied.toFixed(2)} {currency ? currencyLabel(currency) : ''}
                    </Text>
                    <Tag variant={a.newStatus === 'paid' ? 'success' : 'warning'} label={t(`status.${a.newStatus}`)} />
                  </Row>
                </Row>
              );
            })}
            <Row horizontal="between">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('summary.total')}
              </Text>
              <Text variant="label-strong-s">
                {amountReceived.toFixed(2)} {currency ? currencyLabel(currency) : ''}
              </Text>
            </Row>
            {existingCredit > 0 && (
              <Row horizontal="between">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('summary.creditUsed')}
                </Text>
                <Text variant="label-strong-s">
                  {existingCredit.toFixed(2)} {currency ? currencyLabel(currency) : ''}
                </Text>
              </Row>
            )}
            {preview.leftoverCents > 0 && (
              <Feedback
                variant="info"
                description={t('summary.resultingCredit', {
                  amount: (preview.leftoverCents / 100).toFixed(2),
                  currency: currency ? currencyLabel(currency) : '',
                })}
              />
            )}
            {preview.leftoverCents === 0 && preview.allocations.every((a) => a.newStatus === 'paid') && (
              <Feedback variant="success" description={t('summary.upToDate')} />
            )}
          </Column>
        )}
      </Column>
    </Row>
  );
}

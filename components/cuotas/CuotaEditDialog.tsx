'use client';

import { useEffect, useState, useTransition } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Dialog, Column, Row, Input, Textarea, Select, DateInput, Button, Feedback, Text } from '@once-ui-system/core';
import { updateTemplateSchema, type UpdateTemplateInput } from '@/lib/validation/cuotas';
import { updateInstallmentTemplate, getPriceHistory, type PriceHistoryEntry } from '@/lib/actions/cuotas';
import { toDateOnly } from '@/lib/cuotas/generate';
import { CURRENCY_SELECT_OPTIONS, currencyLabel } from '@/lib/currency';
import type { TemplateWithInstallments } from './types';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

// Edit is intentionally narrow — see lib/validation/cuotas.ts's
// updateTemplateSchema comment: structural fields (cadence, dates,
// installment count, house targeting) aren't editable after creation.
export function CuotaEditDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateWithInstallments;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('cuotas');
  const tv = useTranslations('validation.cuotas');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  // Not a form field (DateInput works with Date, the schema field is a
  // string) -- kept separate and merged in at submit time, same pattern
  // PaymentFormClient uses for its own date input.
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>(undefined);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[] | null>(null);

  useEffect(() => {
    if (template.is_divided) return;
    let cancelled = false;
    getPriceHistory(template.id, locale).then((result) => {
      if (!cancelled && 'entries' in result) setPriceHistory(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [template.id, template.is_divided, locale]);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<z.input<ReturnType<typeof updateTemplateSchema>>, unknown, UpdateTemplateInput>({
    resolver: zodResolver(updateTemplateSchema(tv)),
    defaultValues: {
      name: template.name,
      description: template.description ?? '',
      currency: template.currency,
      amount: template.amount,
    },
  });

  const onSubmit = (data: UpdateTemplateInput) => {
    setServerError(null);
    startTransition(async () => {
      const payload = { ...data, effective_from: effectiveFrom ? toDateOnly(effectiveFrom) : '' };
      const result = await updateInstallmentTemplate(template.id, payload, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('editCuota')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            {t('cancel')}
          </Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit(onSubmit)} type="button">
            {t('save')}
          </Button>
        </>
      }
    >
      <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
        {serverError && <Feedback variant="danger" description={serverError} />}
        {template.is_divided && (
          <Feedback variant="info" description={t('editDividedAmountLocked')} />
        )}
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              id="name"
              label={t('fields.name')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.name}
              errorMessage={errors.name?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Textarea
              id="description"
              label={t('fields.description')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              id="currency"
              label={t('fields.currency')}
              options={CURRENCY_SELECT_OPTIONS}
              value={field.value}
              onSelect={(value) => field.onChange(Array.isArray(value) ? value[0] : value)}
              error={!!errors.currency}
              errorMessage={errors.currency?.message}
              fillWidth
            />
          )}
        />
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <Input
              id="amount"
              type="number"
              label={t('fields.amount')}
              disabled={template.is_divided}
              value={field.value as number}
              onChange={(e) => field.onChange(e.target.valueAsNumber)}
              error={!!errors.amount}
              errorMessage={errors.amount?.message}
            />
          )}
        />
        {!template.is_divided && (
          <>
            <DateInput
              id="effective_from"
              label={t('fields.effectiveFrom')}
              placeholder={t('fields.effectiveFromPlaceholder')}
              value={effectiveFrom}
              onChange={(date) => setEffectiveFrom(date)}
            />
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('effectiveFromHelp')}
            </Text>
          </>
        )}
        <Text variant="label-default-s" onBackground="neutral-weak">
          {t('editCascadeNote')}
        </Text>
        {!template.is_divided && priceHistory && priceHistory.length > 0 && (
          <Column gap="8" fillWidth paddingTop="8" style={{ borderTop: '1px solid var(--neutral-border-weak)' }}>
            <Text variant="label-strong-s">{t('priceHistory.heading')}</Text>
            <Column gap="8" fillWidth style={{ maxHeight: '9rem', overflowY: 'auto' }}>
              {priceHistory.map((entry) => (
                <Row key={entry.id} horizontal="between" vertical="center" gap="8" fillWidth>
                  <Column gap="2">
                    <Text variant="body-default-s">
                      {formatAmount(entry.old_amount, template.currency)} → {formatAmount(entry.new_amount, template.currency)}
                    </Text>
                    <Text variant="label-default-s" onBackground="neutral-weak">
                      {entry.effective_from
                        ? t('priceHistory.effectiveFrom', {
                            date: format(new Date(entry.effective_from), 'dd/MM/yyyy', { locale: dateLocale }),
                          })
                        : t('priceHistory.effectiveFromAll')}
                    </Text>
                  </Column>
                  <Text variant="label-default-s" onBackground="neutral-weak">
                    {format(new Date(entry.changed_at), 'dd/MM/yyyy', { locale: dateLocale })}
                  </Text>
                </Row>
              ))}
            </Column>
          </Column>
        )}
      </Column>
    </Dialog>
  );
}

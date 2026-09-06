'use client';

import { useState, useTransition } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Dialog, Column, Input, Textarea, Select, Button, Feedback, Text } from '@once-ui-system/core';
import { updateTemplateSchema, type UpdateTemplateInput } from '@/lib/validation/cuotas';
import { updateInstallmentTemplate } from '@/lib/actions/cuotas';
import type { TemplateWithInstallments } from './types';

const CURRENCY_OPTIONS = [
  { label: 'USD', value: 'USD' },
  { label: 'Bs', value: 'Bs' },
  { label: 'USDT', value: 'USDT' },
];

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
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
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
      const result = await updateInstallmentTemplate(template.id, data, locale);
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
        <Input
          id="name"
          label={t('fields.name')}
          {...register('name')}
          error={!!errors.name}
          errorMessage={errors.name?.message}
        />
        <Textarea
          id="description"
          label={t('fields.description')}
          {...register('description')}
        />
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              id="currency"
              label={t('fields.currency')}
              options={CURRENCY_OPTIONS}
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
        <Text variant="label-default-s" onBackground="neutral-weak">
          {t('editCascadeNote')}
        </Text>
      </Column>
    </Dialog>
  );
}

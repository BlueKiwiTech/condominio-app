'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { useTranslations, useLocale } from 'next-intl';
import {
  Row,
  Column,
  Input,
  Select,
  SegmentedControl,
  DateInput,
  Button,
  Feedback,
  Text,
  Heading,
} from '@once-ui-system/core';
import { createExpenseTemplateSchema, type CreateExpenseTemplateInput, type Cadence } from '@/lib/validation/gastos';
import { createExpenseTemplate } from '@/lib/actions/gastos';
import { computeVariablePeriodDates, splitAmount, toDateOnly } from '@/lib/gastos/generate';
import { CURRENCY_SELECT_OPTIONS, currencyLabel } from '@/lib/currency';
import type { CategoryOption } from './types';

type FormValues = {
  kind: 'fixed' | 'variable';
  name: string;
  category_id: string;
  provider: string;
  currency: 'USD' | 'Bs' | 'USDT';
  default_amount: number;
  start_date: Date;
  cadence: Cadence;
  installment_count: number;
};

export function GastoFormClient({ categories }: { categories: CategoryOption[] }) {
  const t = useTranslations('gastos');
  const tv = useTranslations('validation.gastos');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      kind: 'fixed',
      name: '',
      category_id: categories[0]?.id ?? '',
      provider: '',
      currency: 'USD',
      default_amount: 0,
      start_date: new Date(),
      cadence: 'monthly',
      installment_count: 1,
    },
  });

  const values = watch();
  const isVariable = values.kind === 'variable';

  const preview = useMemo(() => {
    if (!isVariable) return null;
    if (!values.default_amount || values.default_amount <= 0 || !values.start_date) return null;
    if (!values.installment_count || values.installment_count < 1) return null;
    const periodDates = computeVariablePeriodDates(values.start_date, values.installment_count);
    const amounts = splitAmount(values.default_amount, values.installment_count);
    return { periodDates, amounts };
  }, [isVariable, values.default_amount, values.start_date, values.installment_count]);

  const onSubmit = (data: FormValues) => {
    setServerError(null);
    const shared = {
      name: data.name,
      category_id: data.category_id,
      provider: data.provider,
      currency: data.currency,
      default_amount: data.default_amount,
      start_date: toDateOnly(data.start_date),
    };
    const payload: CreateExpenseTemplateInput =
      data.kind === 'fixed'
        ? { kind: 'fixed', ...shared, cadence: data.cadence }
        : { kind: 'variable', ...shared, installment_count: data.installment_count };

    const parsed = createExpenseTemplateSchema(tv).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t('errors.invalid'));
      return;
    }

    startTransition(async () => {
      const result = await createExpenseTemplate(parsed.data, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.push('/gastos');
      router.refresh();
    });
  };

  return (
    <Row gap="32" fillWidth wrap>
      <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" flex={2} minWidth={22}>
        {serverError && <Feedback variant="danger" description={serverError} />}

        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <SegmentedControl
              buttons={[
                { value: 'fixed', label: t('form.kindFixed') },
                { value: 'variable', label: t('form.kindVariable') },
              ]}
              selected={field.value}
              onToggle={(value) => field.onChange(value as FormValues['kind'])}
            />
          )}
        />

        <Input
          id="name"
          label={t('fields.name')}
          {...register('name', { required: true })}
          error={!!errors.name}
          errorMessage={errors.name?.message}
        />

        <Row gap="16" wrap>
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <Select
                id="category_id"
                label={t('fields.category')}
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
                value={field.value}
                onSelect={(value) => field.onChange(Array.isArray(value) ? value[0] : value)}
              />
            )}
          />
          <Input id="provider" label={t('fields.provider')} {...register('provider')} />
        </Row>

        <Row gap="16" wrap>
          <Controller
            control={control}
            name="default_amount"
            render={({ field }) => (
              <Input
                id="default_amount"
                type="number"
                label={isVariable ? t('form.amountTotal') : t('form.amountPerPeriod')}
                value={Number.isNaN(field.value) ? '' : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                error={!!errors.default_amount}
                errorMessage={errors.default_amount?.message}
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
              />
            )}
          />
        </Row>

        {!isVariable && (
          <Controller
            control={control}
            name="cadence"
            render={({ field }) => (
              <Select
                id="cadence"
                label={t('form.cadence')}
                options={[
                  { label: t('cadence.weekly'), value: 'weekly' },
                  { label: t('cadence.biweekly'), value: 'biweekly' },
                  { label: t('cadence.monthly'), value: 'monthly' },
                  { label: t('cadence.quarterly'), value: 'quarterly' },
                  { label: t('cadence.annual'), value: 'annual' },
                ]}
                value={field.value}
                onSelect={(value) => field.onChange(Array.isArray(value) ? value[0] : value)}
                fillWidth
              />
            )}
          />
        )}

        <Controller
          control={control}
          name="start_date"
          render={({ field }) => (
            <DateInput id="start_date" label={t('fields.startDate')} value={field.value} onChange={(date) => date && field.onChange(date)} />
          )}
        />

        {isVariable && (
          <Controller
            control={control}
            name="installment_count"
            render={({ field }) => (
              <Input
                id="installment_count"
                type="number"
                label={t('form.installmentCount')}
                value={Number.isNaN(field.value) ? '' : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
              />
            )}
          />
        )}

        <Row gap="12">
          <Button type="submit" variant="primary" loading={isPending}>
            {t('form.submit')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push('/gastos')}>
            {t('cancel')}
          </Button>
        </Row>
      </Column>

      {isVariable && (
        <Column gap="12" flex={1} minWidth={16} padding="24" radius="l" background="neutral-alpha-weak" fitHeight>
          <Heading variant="heading-strong-s">{t('new.previewHeading')}</Heading>
          {!preview ? (
            <Text variant="body-default-s" onBackground="neutral-weak">
              {t('new.previewEmpty')}
            </Text>
          ) : (
            <Column gap="4">
              {preview.periodDates.map((date, idx) => (
                <Row key={idx} horizontal="between">
                  <Text variant="body-default-s">{toDateOnly(date)}</Text>
                  <Text variant="body-default-s">
                    {preview.amounts[idx].toFixed(2)} {currencyLabel(values.currency)}
                  </Text>
                </Row>
              ))}
            </Column>
          )}
        </Column>
      )}
    </Row>
  );
}

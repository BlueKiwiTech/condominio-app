'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { useTranslations, useLocale } from 'next-intl';
import {
  Row,
  Column,
  Input,
  Textarea,
  Select,
  SegmentedControl,
  DateInput,
  Switch,
  Chip,
  Button,
  Feedback,
  Text,
  Heading,
} from '@once-ui-system/core';
import { createTemplateSchema, type CreateTemplateInput, type Cadence } from '@/lib/validation/cuotas';
import { createInstallmentTemplate } from '@/lib/actions/cuotas';
import { buildPreview, toDateOnly, type DueDateMode } from '@/lib/cuotas/generate';
import { CURRENCY_SELECT_OPTIONS, currencyLabel } from '@/lib/currency';
import type { HouseOption } from './types';

type FormValues = {
  installment_type: 'recurring' | 'special';
  name: string;
  description: string;
  currency: 'USD' | 'Bs' | 'USDT';
  amount: number;
  start_date: Date;
  cadence: Cadence;
  number_of_installments: number;
  is_divided: boolean;
};

export function CuotaFormClient({ houses }: { houses: HouseOption[] }) {
  const t = useTranslations('cuotas');
  const tv = useTranslations('validation.cuotas');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [houseSelection, setHouseSelection] = useState<'all' | string[]>('all');

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      installment_type: 'recurring',
      name: '',
      description: '',
      currency: 'USD',
      amount: 0,
      start_date: new Date(),
      cadence: 'monthly',
      number_of_installments: 1,
      is_divided: false,
    },
  });

  const values = watch();
  const installmentType = values.installment_type;
  const isDivided = installmentType === 'special' && values.is_divided;
  const showInstallmentCount = installmentType === 'recurring' || isDivided;

  const selectedHouseCount = houseSelection === 'all' ? houses.length : houseSelection.length;

  const preview = useMemo(() => {
    if (!values.amount || values.amount <= 0 || !values.start_date) return null;
    const mode: DueDateMode =
      installmentType === 'recurring'
        ? { kind: 'recurring', cadence: values.cadence }
        : isDivided
          ? { kind: 'special-divided' }
          : { kind: 'special-single' };
    const count = installmentType === 'recurring' ? values.number_of_installments : isDivided ? values.number_of_installments : 1;
    if (!count || count < 1) return null;
    return buildPreview({ mode, startDate: values.start_date, count, amount: values.amount, isDivided });
  }, [installmentType, isDivided, values.amount, values.start_date, values.cadence, values.number_of_installments]);

  const toggleHouse = (houseId: string) => {
    setHouseSelection((prev) => {
      const list = prev === 'all' ? [] : prev;
      return list.includes(houseId) ? list.filter((id) => id !== houseId) : [...list, houseId];
    });
  };

  const onSubmit = (data: FormValues) => {
    setServerError(null);
    const applicable_houses = houseSelection === 'all' ? [] : houseSelection;
    const shared = {
      name: data.name,
      description: data.description,
      currency: data.currency,
      amount: data.amount,
      start_date: toDateOnly(data.start_date),
      applicable_houses,
    };
    const payload: CreateTemplateInput =
      data.installment_type === 'recurring'
        ? {
            installment_type: 'recurring',
            ...shared,
            cadence: data.cadence,
            number_of_installments: data.number_of_installments,
          }
        : {
            installment_type: 'special',
            ...shared,
            is_divided: data.is_divided,
            number_of_installments: data.is_divided ? data.number_of_installments : 1,
          };

    const parsed = createTemplateSchema(tv).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t('errors.invalid'));
      return;
    }

    startTransition(async () => {
      const result = await createInstallmentTemplate(parsed.data, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.push('/cuotas');
      router.refresh();
    });
  };

  return (
    <Row gap="32" fillWidth wrap>
      <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" flex={2} minWidth={22}>
        {serverError && <Feedback variant="danger" description={serverError} />}

        <Controller
          control={control}
          name="installment_type"
          render={({ field }) => (
            <SegmentedControl
              buttons={[
                { value: 'recurring', label: t('form.typeRecurring') },
                { value: 'special', label: t('form.typeSpecial') },
              ]}
              selected={field.value}
              onToggle={(value) => field.onChange(value as FormValues['installment_type'])}
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
        <Textarea id="description" label={t('fields.description')} {...register('description')} />

        <Row gap="16" wrap>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Input
                id="amount"
                type="number"
                label={installmentType === 'recurring' ? t('form.amountPerInstallment') : t('form.amountTotal')}
                value={Number.isNaN(field.value) ? '' : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                error={!!errors.amount}
                errorMessage={errors.amount?.message}
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

        {installmentType === 'recurring' && (
          <Controller
            control={control}
            name="cadence"
            render={({ field }) => (
              <Select
                id="cadence"
                label={t('form.cadence')}
                options={[
                  { label: t('cadence.weekly'), value: 'weekly' },
                  { label: t('cadence.monthly'), value: 'monthly' },
                  { label: t('cadence.annual'), value: 'annual' },
                ]}
                value={field.value}
                onSelect={(value) => field.onChange(Array.isArray(value) ? value[0] : value)}
                fillWidth
              />
            )}
          />
        )}

        {installmentType === 'special' && (
          <Row gap="12" vertical="center">
            <Controller
              control={control}
              name="is_divided"
              render={({ field }) => (
                <Switch isChecked={field.value} onToggle={() => field.onChange(!field.value)} ariaLabel={t('form.isDivided')} />
              )}
            />
            <Text variant="body-default-s">{t('form.isDivided')}</Text>
          </Row>
        )}

        <Controller
          control={control}
          name="start_date"
          render={({ field }) => (
            <DateInput
              id="start_date"
              label={
                installmentType === 'recurring'
                  ? t('form.startDate')
                  : isDivided
                    ? t('form.firstInstallmentDate')
                    : t('form.dueDate')
              }
              value={field.value}
              onChange={(date) => field.onChange(date)}
            />
          )}
        />

        {showInstallmentCount && (
          <Controller
            control={control}
            name="number_of_installments"
            render={({ field }) => (
              <Input
                id="number_of_installments"
                type="number"
                label={t('form.numberOfInstallments')}
                value={Number.isNaN(field.value) ? '' : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
              />
            )}
          />
        )}

        <Column gap="8">
          <Text variant="label-default-s" onBackground="neutral-weak">
            {t('form.applicableHouses')}
          </Text>
          <Row gap="8" wrap>
            <Chip label={t('form.allHouses')} selected={houseSelection === 'all'} onClick={() => setHouseSelection('all')} />
            {houses.map((house) => (
              <Chip
                key={house.id}
                label={house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number}
                selected={houseSelection !== 'all' && houseSelection.includes(house.id)}
                onClick={() => toggleHouse(house.id)}
              />
            ))}
          </Row>
        </Column>

        <Row gap="12">
          <Button type="submit" variant="primary" loading={isPending}>
            {t('form.submit')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push('/cuotas')}>
            {t('cancel')}
          </Button>
        </Row>
      </Column>

      <Column gap="12" flex={1} minWidth={16} padding="24" radius="l" background="neutral-alpha-weak" fitHeight>
        <Heading variant="heading-strong-s">{t('preview.heading')}</Heading>
        {!preview && (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('preview.empty')}
          </Text>
        )}
        {preview && (
          <Column gap="12">
            <Text variant="body-default-s" onBackground="neutral-weak">
              {t('preview.info')}
            </Text>
            <Column gap="4">
              {preview.dueDates.map((date, idx) => (
                <Row key={idx} horizontal="between">
                  <Text variant="body-default-s">{toDateOnly(date)}</Text>
                  <Text variant="body-default-s">
                    {preview.amounts[idx].toFixed(2)} {currencyLabel(values.currency)}
                  </Text>
                </Row>
              ))}
            </Column>
            <Row horizontal="between">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('preview.totalPerHouse')}
              </Text>
              <Text variant="label-strong-s">
                {preview.totalPerHouse.toFixed(2)} {currencyLabel(values.currency)}
              </Text>
            </Row>
            <Row horizontal="between">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('preview.houses')}
              </Text>
              <Text variant="label-strong-s">{selectedHouseCount}</Text>
            </Row>
            <Row horizontal="between">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('preview.expectedTotal')}
              </Text>
              <Text variant="label-strong-s">
                {(preview.totalPerHouse * selectedHouseCount).toFixed(2)} {currencyLabel(values.currency)}
              </Text>
            </Row>
            <Feedback variant="info" description={t('preview.noConversionNote')} />
          </Column>
        )}
      </Column>
    </Row>
  );
}

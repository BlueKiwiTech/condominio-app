'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Select, PasswordInput, Button, Feedback, Text } from '@once-ui-system/core';
import { residentLoginSchema, type ResidentLoginInput } from '@/lib/validation/residentAuth';
import { residentLogin } from '@/lib/actions/residentAuth';

type HouseOption = {
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
};

export function ResidentLoginForm({ houses }: { houses: HouseOption[] }) {
  const t = useTranslations('residentAuth');
  const tv = useTranslations('validation.residentAuth');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResidentLoginInput>({ resolver: zodResolver(residentLoginSchema(tv)) });

  const options = houses.map((h) => ({
    label: [h.house_number, h.house_name, h.owner_name].filter(Boolean).join(' — '),
    value: h.house_number,
  }));

  const onSubmit = (data: ResidentLoginInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await residentLogin(data, locale);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Controller
        control={control}
        name="house_number"
        render={({ field }) => (
          <Select
            id="house_number"
            label={t('labels.house')}
            options={options}
            value={field.value}
            onSelect={(value) => field.onChange(Array.isArray(value) ? value[0] : value)}
            error={!!errors.house_number}
            errorMessage={errors.house_number?.message}
            fillWidth
          />
        )}
      />
      <PasswordInput
        id="pin"
        label={t('labels.pin')}
        inputMode="numeric"
        maxLength={4}
        {...register('pin')}
        error={!!errors.pin}
        errorMessage={errors.pin?.message}
      />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>
        {t('cta')}
      </Button>
      <Text variant="label-default-s" onBackground="neutral-weak" align="center">
        {t('forgotPin')}
      </Text>
    </Column>
  );
}

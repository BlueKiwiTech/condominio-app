'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Dialog, Column, Input, PasswordInput, Button, Feedback } from '@once-ui-system/core';
import {
  createHouseSchema,
  updateHouseSchema,
  type CreateHouseInput,
  type UpdateHouseInput,
} from '@/lib/validation/houses';
import { createHouse, updateHouse } from '@/lib/actions/houses';
import { ResidentsManager } from './ResidentsManager';
import type { HouseWithResidents } from './types';

// house === null -> create mode. house === HouseWithResidents -> edit mode.
export function HouseFormDialog({
  house,
  onClose,
  onSaved,
}: {
  house: HouseWithResidents | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('houses');
  const tv = useTranslations('validation.houses');
  const locale = useLocale();
  const isEdit = house !== null;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateHouseInput | UpdateHouseInput>({
    resolver: zodResolver(isEdit ? updateHouseSchema(tv) : createHouseSchema(tv)),
    defaultValues: isEdit
      ? {
          house_number: house.house_number,
          house_name: house.house_name ?? '',
          owner_name: house.owner_name ?? '',
          owner_phone: house.owner_phone ?? '',
          owner_email: house.owner_email ?? '',
          pin: '',
        }
      : {
          house_number: '',
          house_name: '',
          owner_name: '',
          owner_phone: '',
          owner_email: '',
          pin: '',
        },
  });

  const onSubmit = (data: CreateHouseInput | UpdateHouseInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateHouse(house.id, data as UpdateHouseInput, locale)
        : await createHouse(data as CreateHouseInput, locale);
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
      title={isEdit ? t('editHouse') : t('newHouse')}
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
        <Controller
          control={control}
          name="house_number"
          render={({ field }) => (
            <Input
              id="house_number"
              label={t('fields.houseNumber')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.house_number}
              errorMessage={errors.house_number?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="house_name"
          render={({ field }) => (
            <Input
              id="house_name"
              label={t('fields.houseName')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.house_name}
              errorMessage={errors.house_name?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="owner_name"
          render={({ field }) => (
            <Input
              id="owner_name"
              label={t('fields.ownerName')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.owner_name}
              errorMessage={errors.owner_name?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="owner_phone"
          render={({ field }) => (
            <Input
              id="owner_phone"
              label={t('fields.ownerPhone')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.owner_phone}
              errorMessage={errors.owner_phone?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="owner_email"
          render={({ field }) => (
            <Input
              id="owner_email"
              type="email"
              label={t('fields.ownerEmail')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.owner_email}
              errorMessage={errors.owner_email?.message}
            />
          )}
        />
        <PasswordInput
          id="pin"
          label={isEdit ? t('fields.pinResetLabel') : t('fields.pinLabel')}
          inputMode="numeric"
          maxLength={4}
          {...register('pin')}
          error={!!errors.pin}
          errorMessage={errors.pin?.message}
        />
        {isEdit && <ResidentsManager houseId={house.id} initialResidents={house.condo_house_residents} />}
      </Column>
    </Dialog>
  );
}

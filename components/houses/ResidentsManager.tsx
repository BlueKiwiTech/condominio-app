'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Row, Input, Button, Text, Feedback } from '@once-ui-system/core';
import { residentSchema, type ResidentInput } from '@/lib/validation/houses';
import { addResident, deleteResident } from '@/lib/actions/houses';
import type { HouseResident } from './types';

export function ResidentsManager({
  houseId,
  initialResidents,
}: {
  houseId: string;
  initialResidents: HouseResident[];
}) {
  const t = useTranslations('houses');
  const tv = useTranslations('validation.houses');
  const locale = useLocale();
  const [residents, setResidents] = useState(initialResidents);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResidentInput>({ resolver: zodResolver(residentSchema(tv)) });

  const onSubmit = (data: ResidentInput) => {
    setError(null);
    startTransition(async () => {
      const result = await addResident(houseId, data, locale);
      if (result && 'error' in result) {
        setError(result.error);
        return;
      }
      setResidents((prev) => [
        ...prev,
        { id: crypto.randomUUID(), resident_name: data.resident_name, resident_phone: data.resident_phone ?? null },
      ]);
      reset();
    });
  };

  const handleDelete = (residentId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteResident(residentId, locale);
      if (result && 'error' in result) {
        setError(result.error);
        return;
      }
      setResidents((prev) => prev.filter((r) => r.id !== residentId));
    });
  };

  return (
    <Column gap="12" fillWidth>
      <Text variant="label-default-s" onBackground="neutral-weak">
        {t('residents.heading')}
      </Text>
      {error && <Feedback variant="danger" description={error} />}
      {residents.length === 0 && (
        <Text variant="body-default-s" onBackground="neutral-weak">
          {t('residents.empty')}
        </Text>
      )}
      {residents.map((resident) => (
        <Row key={resident.id} fillWidth horizontal="between" vertical="center" gap="8">
          <Column gap="2">
            <Text variant="body-default-s">{resident.resident_name}</Text>
            {resident.resident_phone && (
              <Text variant="label-default-s" onBackground="neutral-weak">
                {resident.resident_phone}
              </Text>
            )}
          </Column>
          <Button
            size="s"
            variant="danger"
            disabled={isPending}
            onClick={() => handleDelete(resident.id)}
            type="button"
          >
            {t('actions.delete')}
          </Button>
        </Row>
      ))}
      <Row as="form" onSubmit={handleSubmit(onSubmit)} gap="8" vertical="end" fillWidth>
        <Input
          id="resident_name"
          label={t('residents.nameLabel')}
          {...register('resident_name')}
          error={!!errors.resident_name}
          errorMessage={errors.resident_name?.message}
        />
        <Input
          id="resident_phone"
          label={t('residents.phoneLabel')}
          {...register('resident_phone')}
          error={!!errors.resident_phone}
          errorMessage={errors.resident_phone?.message}
        />
        <Button type="submit" variant="secondary" loading={isPending}>
          {t('residents.add')}
        </Button>
      </Row>
    </Column>
  );
}

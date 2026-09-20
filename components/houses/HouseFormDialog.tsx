'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editHouse') : t('newHouse')}</DialogTitle>
        </DialogHeader>
        {/*
          ResidentsManager below has its own independent <form> (a separate
          add-resident Server Action, not part of this house-edit submit) —
          nesting it inside this form would be invalid HTML (a <form> can't
          contain another <form>) and throws a hydration error. So this outer
          form only wraps the house fields; the Save button in DialogFooter
          is linked to it via `form="house-form"` instead of living inside it.
        */}
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <form id="house-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <Controller
            control={control}
            name="house_number"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="house_number">{t('fields.houseNumber')}</Label>
                <Input
                  id="house_number"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.house_number}
                />
                {errors.house_number && <p className="text-sm text-destructive">{errors.house_number.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="house_name"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="house_name">{t('fields.houseName')}</Label>
                <Input
                  id="house_name"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.house_name}
                />
                {errors.house_name && <p className="text-sm text-destructive">{errors.house_name.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="owner_name"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="owner_name">{t('fields.ownerName')}</Label>
                <Input
                  id="owner_name"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.owner_name}
                />
                {errors.owner_name && <p className="text-sm text-destructive">{errors.owner_name.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="owner_phone"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="owner_phone">{t('fields.ownerPhone')}</Label>
                <Input
                  id="owner_phone"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.owner_phone}
                />
                {errors.owner_phone && <p className="text-sm text-destructive">{errors.owner_phone.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="owner_email"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="owner_email">{t('fields.ownerEmail')}</Label>
                <Input
                  id="owner_email"
                  type="email"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.owner_email}
                />
                {errors.owner_email && <p className="text-sm text-destructive">{errors.owner_email.message}</p>}
              </div>
            )}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="pin">{isEdit ? t('fields.pinResetLabel') : t('fields.pinLabel')}</Label>
            <PasswordInput
              id="pin"
              inputMode="numeric"
              maxLength={4}
              {...register('pin')}
              aria-invalid={!!errors.pin}
            />
            {errors.pin && <p className="text-sm text-destructive">{errors.pin.message}</p>}
          </div>
          </form>
          {isEdit && <ResidentsManager houseId={house.id} initialResidents={house.condo_house_residents} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            {t('cancel')}
          </Button>
          <Button disabled={isPending} type="submit" form="house-form">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

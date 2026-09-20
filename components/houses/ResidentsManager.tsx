'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <div className="flex w-full flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground">{t('residents.heading')}</span>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {residents.length === 0 && <span className="text-sm text-muted-foreground">{t('residents.empty')}</span>}
      {residents.map((resident) => (
        <div key={resident.id} className="flex w-full items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{resident.resident_name}</span>
            {resident.resident_phone && <span className="text-xs text-muted-foreground">{resident.resident_phone}</span>}
          </div>
          <Button size="sm" variant="destructive" disabled={isPending} onClick={() => handleDelete(resident.id)} type="button">
            {t('actions.delete')}
          </Button>
        </div>
      ))}
      <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="resident_name">{t('residents.nameLabel')}</Label>
          <Input id="resident_name" {...register('resident_name')} aria-invalid={!!errors.resident_name} />
          {errors.resident_name && <p className="text-sm text-destructive">{errors.resident_name.message}</p>}
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="resident_phone">{t('residents.phoneLabel')}</Label>
          <Input id="resident_phone" {...register('resident_phone')} aria-invalid={!!errors.resident_phone} />
          {errors.resident_phone && <p className="text-sm text-destructive">{errors.resident_phone.message}</p>}
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {t('residents.add')}
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="house_number">{t('labels.house')}</Label>
        <Controller
          control={control}
          name="house_number"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="house_number" className="w-full" aria-invalid={!!errors.house_number}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.house_number && (
          <p className="text-sm text-destructive">{errors.house_number.message}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pin">{t('labels.pin')}</Label>
        <PasswordInput
          id="pin"
          inputMode="numeric"
          maxLength={4}
          aria-invalid={!!errors.pin}
          {...register('pin')}
        />
        {errors.pin && <p className="text-sm text-destructive">{errors.pin.message}</p>}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {t('cta')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t('forgotPin')}</p>
    </form>
  );
}

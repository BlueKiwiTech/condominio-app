'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Combobox as BaseCombobox } from '@base-ui/react';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
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
  } = useForm<ResidentLoginInput>({
    resolver: zodResolver(residentLoginSchema(tv)),
    // Select must never receive `value={undefined}` on first render (Base
    // UI treats that as "uncontrolled" and warns when it later flips to
    // controlled once a house is picked) — an explicit '' default keeps it
    // controlled from the start; SelectValue shows its placeholder for it.
    defaultValues: { house_number: '', pin: '' },
  });

  const options = useMemo(
    () =>
      houses.map((h) => ({
        label: [h.house_number, h.house_name, h.owner_name].filter(Boolean).join(' — '),
        value: h.house_number,
      })),
    [houses],
  );
  const labelByValue = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const houseValues = useMemo(() => options.map((o) => o.value), [options]);
  const [houseQuery, setHouseQuery] = useState('');

  // Board request: the house list must start empty and only start matching
  // once the resident has typed at least 3 characters — with ~60 houses,
  // dumping the full list open on focus is more noise than help on a phone.
  // The `filter` prop alone doesn't cover this: Base UI special-cases an
  // empty query to show every item regardless of a custom filter function,
  // so the list still opened full on focus. `filteredItems` (externally
  // computed, per Base UI's own docs for "control filtering logic
  // externally") bypasses that default entirely.
  const baseFilter = BaseCombobox.useFilter();
  const filteredHouseValues = useMemo(() => {
    if (houseQuery.trim().length < 3) return [];
    const itemToString = (value: string) => labelByValue.get(value) ?? value;
    return houseValues.filter((value) => baseFilter.contains(value, houseQuery, itemToString));
  }, [baseFilter, houseQuery, houseValues, labelByValue]);

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
            <Combobox
              items={houseValues}
              filteredItems={filteredHouseValues}
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? '')}
              itemToStringLabel={(value) => labelByValue.get(value) ?? value}
              onInputValueChange={(value) => setHouseQuery(value)}
            >
              <ComboboxInput
                id="house_number"
                placeholder={t('housePlaceholder')}
                aria-invalid={!!errors.house_number}
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxEmpty>
                  {houseQuery.trim().length < 3 ? t('houseMinChars') : t('houseNoResults')}
                </ComboboxEmpty>
                <ComboboxList>
                  {(value: string) => (
                    <ComboboxItem key={value} value={value}>
                      {labelByValue.get(value) ?? value}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
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

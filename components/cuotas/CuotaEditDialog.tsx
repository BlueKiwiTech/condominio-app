'use client';

import { useEffect, useState, useTransition } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { updateTemplateSchema, type UpdateTemplateInput } from '@/lib/validation/cuotas';
import { updateInstallmentTemplate, getPriceHistory, type PriceHistoryEntry } from '@/lib/actions/cuotas';
import { toDateOnly } from '@/lib/cuotas/generate';
import { formatShortDate } from '@/lib/dateFormat';
import { CURRENCY_SELECT_OPTIONS, formatAmount } from '@/lib/currency';
import type { TemplateWithInstallments } from './types';

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
  // Not a form field (DateInput works with Date, the schema field is a
  // string) -- kept separate and merged in at submit time, same pattern
  // PaymentFormClient uses for its own date input.
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>(undefined);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[] | null>(null);

  useEffect(() => {
    if (template.is_divided) return;
    let cancelled = false;
    getPriceHistory(template.id, locale).then((result) => {
      if (!cancelled && 'entries' in result) setPriceHistory(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [template.id, template.is_divided, locale]);

  const {
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
      const payload = { ...data, effective_from: effectiveFrom ? toDateOnly(effectiveFrom) : '' };
      const result = await updateInstallmentTemplate(template.id, payload, locale);
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
          <DialogTitle>{t('editCuota')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          {template.is_divided && (
            <Alert>
              <AlertDescription>{t('editDividedAmountLocked')}</AlertDescription>
            </Alert>
          )}
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="name">{t('fields.name')}</Label>
                <Input
                  id="name"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="description">{t('fields.description')}</Label>
                <Textarea id="description" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
              </div>
            )}
          />
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="currency">{t('fields.currency')}</Label>
                <Select value={field.value} onValueChange={field.onChange} items={CURRENCY_SELECT_OPTIONS}>
                  <SelectTrigger id="currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_SELECT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="amount">{t('fields.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  disabled={template.is_divided}
                  value={field.value as number}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  aria-invalid={!!errors.amount}
                />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
            )}
          />
          {!template.is_divided && (
            <>
              <DateInput
                id="effective_from"
                label={t('fields.effectiveFrom')}
                placeholder={t('fields.effectiveFromPlaceholder')}
                value={effectiveFrom}
                onChange={(date) => setEffectiveFrom(date)}
              />
              <p className="text-xs text-muted-foreground">{t('effectiveFromHelp')}</p>
            </>
          )}
          <p className="text-xs text-muted-foreground">{t('editCascadeNote')}</p>
          {!template.is_divided && priceHistory && priceHistory.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-2">
              <span className="text-sm font-semibold">{t('priceHistory.heading')}</span>
              <div className="flex max-h-36 flex-col gap-2 overflow-y-auto">
                {priceHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">
                        {formatAmount(entry.old_amount, template.currency)} → {formatAmount(entry.new_amount, template.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.effective_from
                          ? t('priceHistory.effectiveFrom', {
                              date: formatShortDate(new Date(entry.effective_from), locale),
                            })
                          : t('priceHistory.effectiveFromAll')}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatShortDate(new Date(entry.changed_at), locale)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            {t('cancel')}
          </Button>
          <Button disabled={isPending} onClick={handleSubmit(onSubmit)} type="button">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

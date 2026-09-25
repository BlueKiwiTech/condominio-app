'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createExpenseCategorySchema, type CreateExpenseCategoryInput } from '@/lib/validation/gastos';
import { createExpenseCategory, deleteExpenseCategory } from '@/lib/actions/gastos';
import type { CategoryOption } from './types';

export function CategoryManagerDialog({
  categories,
  onClose,
  onCategoryCreated,
  onCategoryDeleted,
}: {
  categories: CategoryOption[];
  onClose: () => void;
  onCategoryCreated: (category: CategoryOption) => void;
  onCategoryDeleted: (categoryId: string) => void;
}) {
  const t = useTranslations('gastos');
  const tv = useTranslations('validation.gastos');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateExpenseCategoryInput>({ resolver: zodResolver(createExpenseCategorySchema(tv)) });

  const onSubmit = (data: CreateExpenseCategoryInput) => {
    setError(null);
    startTransition(async () => {
      const result = await createExpenseCategory(data, locale);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onCategoryCreated(result.category);
      reset();
    });
  };

  const handleDelete = (categoryId: string) => {
    setError(null);
    setPendingDeleteId(categoryId);
    startTransition(async () => {
      const result = await deleteExpenseCategory(categoryId, locale);
      setPendingDeleteId(null);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onCategoryDeleted(categoryId);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('categories.manage')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="category_name">{t('categories.nameLabel')}</Label>
              <Input id="category_name" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending && !pendingDeleteId && <Loader2 className="size-4 animate-spin" />}
              {t('categories.add')}
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            {categories.length === 0 && <span className="text-sm text-muted-foreground">{t('categories.empty')}</span>}
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{category.name}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => handleDelete(category.id)}
                  type="button"
                >
                  {pendingDeleteId === category.id && <Loader2 className="size-4 animate-spin" />}
                  {t('actions.delete')}
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            {t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { setExpenseTemplateActive, deleteExpenseTemplate } from '@/lib/actions/gastos';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { FixedTemplateRow } from './types';

const ACTIVE_CLASSES: Record<'active' | 'inactive', string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
};

export function GastosPlantillasPageClient({ fixedTemplates }: { fixedTemplates: FixedTemplateRow[] }) {
  const t = useTranslations('gastos');
  const locale = useLocale();
  const router = useRouter();
  const [isTogglingActive, startToggleTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleActive = (templateId: string, active: boolean) => {
    setServerError(null);
    startToggleTransition(async () => {
      const result = await setExpenseTemplateActive(templateId, active, locale);
      if ('error' in result) {
        setServerError(result.error);
      }
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmDeleteAll'))) return;
    setServerError(null);
    startDeleteTransition(async () => {
      const result = await deleteExpenseTemplate(templateId, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="flex w-full justify-end">
        <Button render={<Link href="/gastos/new" />} nativeButton={false}>{t('newConcept')}</Button>
      </div>

      <div className="w-full overflow-hidden rounded-[var(--radius)] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('templates.table.name')}</TableHead>
              <TableHead>{t('table.category')}</TableHead>
              <TableHead>{t('table.provider')}</TableHead>
              <TableHead className="text-right">{t('table.amount')}</TableHead>
              <TableHead>{t('form.cadence')}</TableHead>
              <TableHead>{t('fields.startDate')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fixedTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {t('templates.empty')}
                </TableCell>
              </TableRow>
            ) : (
              fixedTemplates.map((tpl) => (
                <TableRow key={tpl.id} className="h-11">
                  <TableCell className="whitespace-normal font-medium">{tpl.name}</TableCell>
                  <TableCell className="whitespace-normal">{tpl.condo_expense_categories?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{tpl.provider ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(tpl.default_amount, tpl.currency)}</TableCell>
                  <TableCell>{t(`cadence.${tpl.cadence}`)}</TableCell>
                  <TableCell>{formatShortDate(new Date(`${tpl.start_date}T00:00:00`), locale)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTIVE_CLASSES[tpl.active ? 'active' : 'inactive']}>
                      {tpl.active ? t('templates.status.active') : t('templates.status.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTogglingActive}
                        onClick={() => toggleActive(tpl.id, !tpl.active)}
                      >
                        {tpl.active ? t('actions.deactivate') : t('actions.activate')}
                      </Button>
                      <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => handleDeleteTemplate(tpl.id)}>
                        {t('actions.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

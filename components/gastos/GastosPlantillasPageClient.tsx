'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setExpenseTemplateActive, deleteExpenseTemplate } from '@/lib/actions/gastos';
import type { FixedTemplateRow } from './types';

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
      {fixedTemplates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('templates.empty')}</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {fixedTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex w-full items-center justify-between rounded-[var(--radius)] border bg-card p-3 shadow-sm"
            >
              <span className="text-sm font-medium">
                {tpl.name} <span className="font-normal text-muted-foreground">· {t(`cadence.${tpl.cadence}`)}</span>
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={isTogglingActive} onClick={() => toggleActive(tpl.id, !tpl.active)}>
                  {tpl.active ? t('actions.deactivate') : t('actions.activate')}
                </Button>
                <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => handleDeleteTemplate(tpl.id)}>
                  {t('actions.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

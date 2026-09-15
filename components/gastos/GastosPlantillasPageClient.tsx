'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Row, Text, Button, Feedback, SmartLink } from '@once-ui-system/core';
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
    <Column fillWidth gap="24">
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Row horizontal="end" fillWidth>
        <SmartLink href="/gastos/new">
          <Button variant="primary" type="button">
            {t('newExpense')}
          </Button>
        </SmartLink>
      </Row>
      {fixedTemplates.length === 0 ? (
        <Text variant="body-default-s" onBackground="neutral-weak">
          {t('templates.empty')}
        </Text>
      ) : (
        <Column gap="8" fillWidth>
          {fixedTemplates.map((tpl) => (
            <Row
              key={tpl.id}
              fillWidth
              horizontal="between"
              vertical="center"
              padding="12"
              radius="s"
              border="neutral-alpha-weak"
            >
              <Text variant="label-default-s">{tpl.name}</Text>
              <Row gap="8">
                <Button
                  size="s"
                  variant="secondary"
                  loading={isTogglingActive}
                  onClick={() => toggleActive(tpl.id, !tpl.active)}
                >
                  {tpl.active ? t('actions.deactivate') : t('actions.activate')}
                </Button>
                <Button size="s" variant="danger" disabled={isDeleting} onClick={() => handleDeleteTemplate(tpl.id)}>
                  {t('actions.delete')}
                </Button>
              </Row>
            </Row>
          ))}
        </Column>
      )}
    </Column>
  );
}

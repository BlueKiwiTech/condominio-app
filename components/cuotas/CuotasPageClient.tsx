'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Row, Button, Table, Tag, Feedback, SmartLink, type TableHeader } from '@once-ui-system/core';
import { deleteInstallmentTemplate } from '@/lib/actions/cuotas';
import { summarizeTemplate } from '@/lib/cuotas/status';
import { CuotaEditDialog } from './CuotaEditDialog';
import type { TemplateWithInstallments } from './types';

export function CuotasPageClient({ initialTemplates }: { initialTemplates: TemplateWithInstallments[] }) {
  const t = useTranslations('cuotas');
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateWithInstallments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Computed once per render, server clock (this component only ever runs
  // after server-fetched data lands) -- "overdue" is never stored, always
  // derived at query/render time (CLAUDE.md anti-pattern rule).
  const today = useMemo(() => new Date(), []);

  const handleDelete = (template: TemplateWithInstallments) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmDelete', { name: template.name }))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteInstallmentTemplate(template.id, locale);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const headers: TableHeader[] = [
    { key: 'name', content: t('table.name') },
    { key: 'type', content: t('table.type') },
    { key: 'amount', content: t('table.amount') },
    { key: 'houses', content: t('table.houses') },
    { key: 'status', content: t('table.status') },
    { key: 'actions', content: '' },
  ];

  const rows = initialTemplates.map((template) => {
    const summary = summarizeTemplate(template.condo_installments, today);
    const typeLabel =
      template.installment_type === 'recurring'
        ? t(`cadence.${template.cadence ?? 'monthly'}`)
        : template.is_divided
          ? t('type.specialDivided')
          : t('type.specialSingle');

    return [
      template.name,
      typeLabel,
      `${summary.totalAmount.toFixed(2)} ${template.currency}`,
      String(summary.housesCount),
      <Row key={`status-${template.id}`} gap="8" wrap>
        {summary.pendingCount > 0 && <Tag variant="info" label={t('status.pending', { count: summary.pendingCount })} />}
        {summary.partialCount > 0 && <Tag variant="warning" label={t('status.partial', { count: summary.partialCount })} />}
        {summary.overdueCount > 0 && <Tag variant="danger" label={t('status.overdue', { count: summary.overdueCount })} />}
        {summary.paidCount > 0 && <Tag variant="success" label={t('status.paid', { count: summary.paidCount })} />}
      </Row>,
      <Row key={`actions-${template.id}`} gap="8">
        <Button size="s" variant="secondary" type="button" onClick={() => setEditing(template)}>
          {t('actions.edit')}
        </Button>
        <Button size="s" variant="danger" type="button" disabled={isPending} onClick={() => handleDelete(template)}>
          {t('actions.delete')}
        </Button>
      </Row>,
    ];
  });

  return (
    <Column gap="16" fillWidth>
      {error && <Feedback variant="danger" description={error} />}
      <Row horizontal="end" fillWidth>
        <SmartLink href="/cuotas/new">
          <Button variant="primary" type="button">
            {t('newCuota')}
          </Button>
        </SmartLink>
      </Row>
      <Table data={{ headers, rows }} searchable searchPlaceholder={t('searchPlaceholder')} emptyState={t('empty')} />
      {editing && (
        <CuotaEditDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </Column>
  );
}

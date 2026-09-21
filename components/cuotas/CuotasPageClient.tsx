'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { deleteInstallmentTemplate } from '@/lib/actions/cuotas';
import { summarizeTemplate } from '@/lib/cuotas/status';
import { CuotaEditDialog } from './CuotaEditDialog';
import { formatAmount } from '@/lib/currency';
import type { TemplateWithInstallments } from './types';

export function CuotasPageClient({
  initialTemplates,
  gracePeriodDays = 0,
}: {
  initialTemplates: TemplateWithInstallments[];
  gracePeriodDays?: number;
}) {
  const t = useTranslations('cuotas');
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateWithInstallments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  // Computed once per render, server clock (this component only ever runs
  // after server-fetched data lands) -- "overdue" is never stored, always
  // derived at query/render time (CLAUDE.md anti-pattern rule).
  const today = useMemo(() => new Date(), []);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return initialTemplates;
    return initialTemplates.filter((template) => template.name.toLowerCase().includes(query));
  }, [initialTemplates, search]);

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

  return (
    <div className="flex w-full flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="max-w-xs"
        />
        <Link href="/cuotas/new" className="inline-flex">
          <Button type="button">
            <Plus className="size-4" />
            {t('newCuota')}
          </Button>
        </Link>
      </div>
      <div className="rounded-[var(--radius)] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.name')}</TableHead>
              <TableHead>{t('table.type')}</TableHead>
              <TableHead className="text-right">{t('table.amount')}</TableHead>
              <TableHead className="text-right">{t('table.houses')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-11 text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredTemplates.map((template) => {
                const summary = summarizeTemplate(template.condo_installments, gracePeriodDays, today);
                const typeLabel =
                  template.installment_type === 'recurring'
                    ? t(`cadence.${template.cadence ?? 'monthly'}`)
                    : template.is_divided
                      ? t('type.specialDivided')
                      : t('type.specialSingle');

                return (
                  <TableRow key={template.id}>
                    <TableCell className="h-11">{template.name}</TableCell>
                    <TableCell className="h-11">{typeLabel}</TableCell>
                    <TableCell className="h-11 text-right">{formatAmount(summary.totalAmount, template.currency)}</TableCell>
                    <TableCell className="h-11 text-right">{summary.housesCount}</TableCell>
                    <TableCell className="h-11">
                      <div className="flex flex-wrap gap-1.5">
                        {summary.pendingCount > 0 && (
                          <Badge variant="outline">{t('status.pending', { count: summary.pendingCount })}</Badge>
                        )}
                        {summary.partialCount > 0 && (
                          <StatusBadge status="proximo" label={t('status.partial', { count: summary.partialCount })} />
                        )}
                        {summary.overdueCount > 0 && (
                          <StatusBadge status="vencido" label={t('status.overdue', { count: summary.overdueCount })} />
                        )}
                        {summary.paidCount > 0 && (
                          <StatusBadge status="al-dia" label={t('status.paid', { count: summary.paidCount })} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="h-11">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(template)}>
                          {t('actions.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(template)}
                        >
                          {t('actions.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
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
    </div>
  );
}

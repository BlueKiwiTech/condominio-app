'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Column, Row, Button, Table, Select, SmartLink, type TableHeader } from '@once-ui-system/core';
import { groupPaymentsByBatch, type PaymentRow, type HouseOption } from './types';

export function PaymentsPageClient({
  initialPayments,
  houses,
}: {
  initialPayments: PaymentRow[];
  houses: HouseOption[];
}) {
  const t = useTranslations('payments');
  const [houseFilter, setHouseFilter] = useState<string>('all');

  const houseOptions = [
    { label: t('filterAllHouses'), value: 'all' },
    ...houses.map((h) => ({
      label: h.house_name ? `${h.house_number} · ${h.house_name}` : h.house_number,
      value: h.id,
    })),
  ];

  const filtered = useMemo(
    () => (houseFilter === 'all' ? initialPayments : initialPayments.filter((p) => p.house_id === houseFilter)),
    [initialPayments, houseFilter],
  );

  const batches = useMemo(() => groupPaymentsByBatch(filtered), [filtered]);

  const headers: TableHeader[] = [
    { key: 'date', content: t('table.date') },
    { key: 'receipt', content: t('table.receipt') },
    { key: 'house', content: t('table.house') },
    { key: 'cuotas', content: t('table.cuotas') },
    { key: 'amount', content: t('table.amount') },
    { key: 'reference', content: t('table.reference') },
    { key: 'actions', content: '' },
  ];

  const rows = batches.map((batch) => [
    batch.paymentDate,
    batch.receiptNumber ? `#${String(batch.receiptNumber).padStart(4, '0')}` : '—',
    batch.houseLabel,
    `${batch.installmentNames.length} ${batch.installmentNames.length === 1 ? t('cuotaSingular') : t('cuotaPlural')}`,
    `${batch.totalAmount.toFixed(2)} ${batch.currency}`,
    batch.reference ?? '—',
    <SmartLink key={`detail-${batch.batchId}`} href={`/pagos/${batch.batchId}`}>
      {t('viewDetail')}
    </SmartLink>,
  ]);

  return (
    <Column gap="16" fillWidth>
      <Row gap="16" fillWidth vertical="end" wrap>
        <Select
          id="house-filter"
          label={t('filterHouse')}
          options={houseOptions}
          value={houseFilter}
          onSelect={(value) => setHouseFilter(Array.isArray(value) ? value[0] : value)}
        />
        <Row flex={1} horizontal="end">
          <SmartLink href="/pagos/nuevo">
            <Button variant="primary" type="button">
              {t('registerPayment')}
            </Button>
          </SmartLink>
        </Row>
      </Row>
      <Table data={{ headers, rows }} searchable searchPlaceholder={t('searchPlaceholder')} emptyState={t('empty')} />
    </Column>
  );
}

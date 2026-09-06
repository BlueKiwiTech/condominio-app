'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Row, Button, Table, Feedback, type TableHeader } from '@once-ui-system/core';
import { deleteHouse } from '@/lib/actions/houses';
import { HouseFormDialog } from './HouseFormDialog';
import type { HouseWithResidents } from './types';

// dialogState: undefined = closed, null = create mode, HouseWithResidents = edit mode.
export function HousesPageClient({ initialHouses }: { initialHouses: HouseWithResidents[] }) {
  const t = useTranslations('houses');
  const locale = useLocale();
  const router = useRouter();
  const [dialogState, setDialogState] = useState<HouseWithResidents | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = (house: HouseWithResidents) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirmDelete', { house: house.house_number }))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteHouse(house.id, locale);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const headers: TableHeader[] = [
    { key: 'house_number', content: t('table.house') },
    { key: 'house_name', content: t('table.name') },
    { key: 'owner_name', content: t('table.owner') },
    { key: 'owner_phone', content: t('table.phone') },
    { key: 'owner_email', content: t('table.email') },
    { key: 'actions', content: '' },
  ];

  const rows = initialHouses.map((house) => [
    house.house_number,
    house.house_name ?? '—',
    house.owner_name ?? '—',
    house.owner_phone ?? '—',
    house.owner_email ?? '—',
    <Row key={`actions-${house.id}`} gap="8">
      <Button size="s" variant="secondary" type="button" onClick={() => setDialogState(house)}>
        {t('actions.edit')}
      </Button>
      <Button size="s" variant="danger" type="button" disabled={isPending} onClick={() => handleDelete(house)}>
        {t('actions.delete')}
      </Button>
    </Row>,
  ]);

  return (
    <Column gap="16" fillWidth>
      {error && <Feedback variant="danger" description={error} />}
      <Row horizontal="end" fillWidth>
        <Button variant="primary" type="button" onClick={() => setDialogState(null)}>
          {t('newHouse')}
        </Button>
      </Row>
      <Table
        data={{ headers, rows }}
        searchable
        searchPlaceholder={t('searchPlaceholder')}
        emptyState={t('empty')}
      />
      {dialogState !== undefined && (
        <HouseFormDialog
          house={dialogState}
          onClose={() => setDialogState(undefined)}
          onSaved={() => {
            setDialogState(undefined);
            router.refresh();
          }}
        />
      )}
    </Column>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filteredHouses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return initialHouses;
    return initialHouses.filter((house) =>
      [house.house_number, house.house_name, house.owner_name, house.owner_phone, house.owner_email]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query)),
    );
  }, [initialHouses, search]);

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
        <Button type="button" onClick={() => setDialogState(null)}>
          <Plus className="size-4" />
          {t('newHouse')}
        </Button>
      </div>
      <div className="rounded-[var(--radius)] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.house')}</TableHead>
              <TableHead>{t('table.name')}</TableHead>
              <TableHead>{t('table.owner')}</TableHead>
              <TableHead>{t('table.phone')}</TableHead>
              <TableHead>{t('table.email')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHouses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-11 text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredHouses.map((house) => (
                <TableRow key={house.id}>
                  <TableCell className="h-11">{house.house_number}</TableCell>
                  <TableCell className="h-11">{house.house_name ?? '—'}</TableCell>
                  <TableCell className="h-11">{house.owner_name ?? '—'}</TableCell>
                  <TableCell className="h-11">{house.owner_phone ?? '—'}</TableCell>
                  <TableCell className="h-11">{house.owner_email ?? '—'}</TableCell>
                  <TableCell className="h-11">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" type="button" onClick={() => setDialogState(house)}>
                        {t('actions.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(house)}
                      >
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
    </div>
  );
}

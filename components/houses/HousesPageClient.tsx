'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteHouse } from '@/lib/actions/houses';
import { HouseFormDialog } from './HouseFormDialog';
import type { HouseWithResidents } from './types';

type SortColumn = 'house_number' | 'house_name' | 'owner_name' | 'phone' | 'owner_email';
type SortState = { column: SortColumn; direction: 'asc' | 'desc' };

function primaryPhone(house: HouseWithResidents): string {
  return house.owner_phone ?? house.condo_house_phones[0]?.phone ?? '';
}

function allPhones(house: HouseWithResidents): string[] {
  return [house.owner_phone, ...house.condo_house_phones.map((p) => p.phone)].filter((p): p is string => !!p);
}

function SortableHead({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <TableHead>
      <button type="button" onClick={() => onSort(column)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {active ? (
          sort.direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
        ) : (
          <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}

// dialogState: undefined = closed, null = create mode, HouseWithResidents = edit mode.
export function HousesPageClient({ initialHouses }: { initialHouses: HouseWithResidents[] }) {
  const t = useTranslations('houses');
  const locale = useLocale();
  const router = useRouter();
  const [dialogState, setDialogState] = useState<HouseWithResidents | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ column: 'house_number', direction: 'asc' });
  const [isPending, startTransition] = useTransition();

  const filteredHouses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return initialHouses;
    return initialHouses.filter((house) =>
      [house.house_number, house.house_name, house.owner_name, ...allPhones(house), house.owner_email]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query)),
    );
  }, [initialHouses, search]);

  const sortedHouses = useMemo(() => {
    const getValue = (house: HouseWithResidents) =>
      sort.column === 'phone' ? primaryPhone(house) : (house[sort.column] ?? '');
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    return [...filteredHouses].sort((a, b) => {
      const cmp = collator.compare(getValue(a), getValue(b));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredHouses, sort, locale]);

  const handleSort = (column: SortColumn) =>
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' }));

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
              <SortableHead column="house_number" label={t('table.house')} sort={sort} onSort={handleSort} />
              <SortableHead column="house_name" label={t('table.name')} sort={sort} onSort={handleSort} />
              <SortableHead column="owner_name" label={t('table.owner')} sort={sort} onSort={handleSort} />
              <SortableHead column="phone" label={t('table.phone')} sort={sort} onSort={handleSort} />
              <SortableHead column="owner_email" label={t('table.email')} sort={sort} onSort={handleSort} />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHouses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-11 text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              sortedHouses.map((house) => (
                <TableRow key={house.id}>
                  <TableCell className="h-11">{house.house_number}</TableCell>
                  <TableCell className="h-11">{house.house_name ?? '—'}</TableCell>
                  <TableCell className="h-11">{house.owner_name ?? '—'}</TableCell>
                  <TableCell className="h-11">{allPhones(house).join(', ') || '—'}</TableCell>
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

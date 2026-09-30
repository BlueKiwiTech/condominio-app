'use client';

import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from 'cn';
import { TableHead } from '@/components/ui/table';

export type SortDirection = 'asc' | 'desc';
export type SortState<K extends string> = { column: K; direction: SortDirection };

/**
 * Client-side sort for a table's already-fetched rows. `getValue` returns
 * whatever should actually be compared for a given column (e.g. a badge's
 * underlying status string, a phone's raw digits, not the JSX rendered in
 * the cell) -- numbers are compared numerically, everything else through an
 * Intl.Collator (locale-aware, numeric-aware for strings like "20-50").
 */
export function useSortableTable<T, K extends string>(
  items: T[],
  getValue: (item: T, column: K) => string | number,
  initial: SortState<K>,
  locale?: string,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const collator = useMemo(() => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }), [locale]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = getValue(a, sort.column);
      const vb = getValue(b, sort.column);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getValue is a fresh closure every render by design (reads whatever fields the caller's column union needs); only `items`/`sort`/`collator` changing should re-sort.
  }, [items, sort, collator]);

  const handleSort = (column: K) =>
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' }));

  return { sorted, sort, handleSort };
}

/** Drop-in replacement for TableHead on any column worth sorting -- click to sort, click again to reverse. */
export function SortableTableHead<K extends string>({
  column,
  label,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  column: K;
  label: React.ReactNode;
  sort: SortState<K>;
  onSort: (column: K) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'flex-row-reverse')}
      >
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

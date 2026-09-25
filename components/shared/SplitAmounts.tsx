'use client';

import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { splitAmount } from '@/lib/cuotas/generate';

// Per-installment amounts (and, optionally, per-installment dates) for a
// total split across several installments, each editable individually --
// they don't have to be equal, only sum to the total. Reset to a fresh even
// split (prefilling every installment) whenever the count, total, or
// baseline dates change; the admin's own edits persist until one of those
// changes again.
//
// Recomputed synchronously during render (React's "adjusting state when a
// prop changes" pattern, via a ref instead of useEffect) so the split is
// already correct on the very render that shows the new installment rows --
// a post-render effect would leave the newly added rows reading undefined
// amounts for one frame.
//
// `baselineDates`, when passed, makes the dates array resettable/editable
// too (component's `dates` return value + `updateDate`) -- used by
// components/cuotas/CuotaFormClient.tsx's special-divided cuotas, whose
// installment dates aren't locked to a fixed cadence like a recurring
// cuota's. Omitted by components/gastos/GastoFormClient.tsx (variable/split
// gastos), which only needs the amounts half.
export function useSplitAmounts(count: number, total: number, active: boolean, baselineDates?: Date[]) {
  const [amounts, setAmounts] = useState<number[]>([]);
  const [dates, setDates] = useState<Date[]>([]);
  const splitKeyRef = useRef<string | null>(null);

  if (active) {
    const safeCount = count > 0 ? count : 0;
    const safeTotal = total > 0 ? total : 0;
    const datesKey = baselineDates ? baselineDates.map((d) => d.getTime()).join(',') : '';
    const splitKey = `${safeCount}:${safeTotal}:${datesKey}`;
    if (splitKeyRef.current !== splitKey) {
      splitKeyRef.current = splitKey;
      setAmounts(safeCount > 0 && safeTotal > 0 ? splitAmount(safeTotal, safeCount) : []);
      if (baselineDates) setDates(baselineDates);
    }
  } else if (splitKeyRef.current !== null) {
    splitKeyRef.current = null;
  }

  const sum = useMemo(() => amounts.reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0), [amounts]);
  const mismatch = active && amounts.length > 0 && Math.round(sum * 100) !== Math.round((total || 0) * 100);

  const updateAmount = (index: number, value: number) => {
    setAmounts((prev) => prev.map((a, i) => (i === index ? value : a)));
  };
  const updateDate = (index: number, value: Date) => {
    setDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  };

  return { amounts, updateAmount, dates, updateDate, sum, mismatch };
}

// One row per installment: an editable amount input, and -- when
// `onDateChange` is passed -- an editable date input alongside it. Without
// `onDateChange`, the date is read-only and folded into the amount's own
// label instead (GastoFormClient's case: "Monto de la cuota {number} —
// {date}"); with it, `amountLabel`/`dateLabel` get just the installment
// number so each field can carry its own label (CuotaFormClient's case).
export function SplitAmountsFields({
  dates,
  amounts,
  onAmountChange,
  onDateChange,
  amountLabel,
  dateLabel,
}: {
  dates: Date[];
  amounts: number[];
  onAmountChange: (index: number, value: number) => void;
  onDateChange?: (index: number, value: Date) => void;
  amountLabel: (installmentNumber: number, date: Date) => string;
  dateLabel?: (installmentNumber: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {dates.map((date, idx) => (
        <div key={idx} className={onDateChange ? 'flex flex-wrap gap-2' : 'grid gap-1.5'}>
          {onDateChange && (
            <div className="min-w-[160px] flex-1">
              <DateInput
                id={`installment-date-${idx}`}
                label={dateLabel ? dateLabel(idx + 1) : amountLabel(idx + 1, date)}
                value={date}
                onChange={(d) => d && onDateChange(idx, d)}
              />
            </div>
          )}
          <div className={onDateChange ? 'grid min-w-[140px] flex-1 gap-1.5' : 'contents'}>
            <Label htmlFor={`installment-amount-${idx}`}>{amountLabel(idx + 1, date)}</Label>
            <Input
              id={`installment-amount-${idx}`}
              type="number"
              value={Number.isFinite(amounts[idx]) ? amounts[idx] : ''}
              onChange={(e) => onAmountChange(idx, e.target.valueAsNumber)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Pure date/amount math for cuota-installment generation — no Supabase calls,
// no next/* imports. Safe to import from BOTH the create Server Action
// (lib/actions/cuotas.ts, to build the rows actually persisted) and the
// create-cuota Client Component (to render the identical live preview the
// admin sees before submitting, per the A4 mockup's right-panel preview).
//
// Calendar-day-safe throughout (date-fns, never raw UTC string splitting) —
// PLAN.md RPRT-05 / CLAUDE.md date-math rule, applied here since due-date
// generation is the other place date bugs would surface.
import { addWeeks, addMonths, setDate, format, parseISO } from 'date-fns';

export type Cadence = 'weekly' | 'monthly' | 'annual';
export type Currency = 'USD' | 'Bs' | 'USDT';

// Discriminates the three due-date generation rules (PLAN.md Phase 4
// decisions + this phase's own documented assumption for special-divided
// staggering — see PLAN.md "Assumption made" note under Phase 4):
// - recurring/monthly & recurring/annual: ALWAYS day 1 of the resulting
//   month, regardless of the start date's own day-of-month (locked decision).
// - recurring/weekly: straight +7-day increments, no day forcing (a week has
//   no "day of month" concept to normalize).
// - special-single: exactly the one date the admin picked, no math.
// - special-divided: staggered one calendar month apart, PRESERVING the
//   admin's chosen day-of-month (this is NOT a "recurring" cuota per the
//   locked decision, so the day-1 forcing rule does not apply here).
export type DueDateMode =
  | { kind: 'recurring'; cadence: Cadence }
  | { kind: 'special-single' }
  | { kind: 'special-divided' };

export function computeDueDates(mode: DueDateMode, startDate: Date, count: number): Date[] {
  if (mode.kind === 'special-single') return [startDate];

  const dates: Date[] = [];
  for (let n = 0; n < count; n++) {
    if (mode.kind === 'special-divided') {
      dates.push(addMonths(startDate, n));
      continue;
    }
    // mode.kind === 'recurring'
    if (mode.cadence === 'weekly') {
      dates.push(addWeeks(startDate, n));
    } else if (mode.cadence === 'annual') {
      dates.push(setDate(addMonths(startDate, n * 12), 1));
    } else {
      dates.push(setDate(addMonths(startDate, n), 1));
    }
  }
  return dates;
}

// Equal split, remainder cent(s) absorbed by the LAST installment so
// sum(parts) === total exactly — never lose or invent money to rounding.
// Amounts are decimal(12,2) in the DB, so we work in integer cents.
export function splitAmount(total: number, count: number): number[] {
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i === count - 1 ? remainder : 0)) / 100);
}

export function toDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseDateOnly(value: string): Date {
  return parseISO(value);
}

export type GeneratedInstallment = {
  house_id: string;
  installment_number: number;
  name: string;
  amount: number;
  currency: Currency;
  due_date: string;
};

export type GenerationPreview = {
  dueDates: Date[];
  amounts: number[];
  totalPerHouse: number;
  count: number;
};

export function buildPreview(params: {
  mode: DueDateMode;
  startDate: Date;
  count: number;
  amount: number;
  isDivided: boolean;
}): GenerationPreview {
  const { mode, startDate, count, amount, isDivided } = params;
  const dueDates = computeDueDates(mode, startDate, count);
  const amounts =
    mode.kind === 'special-divided' && isDivided ? splitAmount(amount, count) : Array(count).fill(amount);
  const totalPerHouse = amounts.reduce((sum, a) => sum + a, 0);
  return { dueDates, amounts, totalPerHouse, count };
}

export function buildInstallmentRows(params: {
  name: string;
  currency: Currency;
  houseIds: string[];
  dueDates: Date[];
  amounts: number[];
}): GeneratedInstallment[] {
  const { name, currency, houseIds, dueDates, amounts } = params;
  const rows: GeneratedInstallment[] = [];
  for (const houseId of houseIds) {
    dueDates.forEach((date, idx) => {
      rows.push({
        house_id: houseId,
        installment_number: idx + 1,
        name,
        amount: amounts[idx],
        currency,
        due_date: toDateOnly(date),
      });
    });
  }
  return rows;
}

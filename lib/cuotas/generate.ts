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

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type Currency = 'USD' | 'Bs' | 'USDT';

// Discriminates the three due-date generation rules (PLAN.md Phase 4
// decisions + this phase's own documented assumption for special-divided
// staggering — see PLAN.md "Assumption made" note under Phase 4):
// - recurring/monthly & recurring/annual: ALWAYS day 1 of the resulting
//   month, regardless of the start date's own day-of-month (locked decision).
// - recurring/weekly: straight +7-day increments, no day forcing (a week has
//   no "day of month" concept to normalize).
// - special-single: exactly the one date the admin picked, no math.
// - special-divided: staggered by the chosen cadence (defaults to one
//   calendar month apart), PRESERVING the admin's chosen day-of-month (this
//   is NOT a "recurring" cuota per the locked decision, so the day-1 forcing
//   rule does not apply here). This is only the BASELINE the admin sees
//   before individually overriding installment dates in the form — see
//   components/shared/SplitInstallments.tsx's useSplitDates.
export type DueDateMode =
  | { kind: 'recurring'; cadence: Cadence }
  | { kind: 'special-single' }
  | { kind: 'special-divided'; cadence?: Cadence };

export function computeDueDates(mode: DueDateMode, startDate: Date, count: number): Date[] {
  if (mode.kind === 'special-single') return [startDate];

  const dates: Date[] = [];
  for (let n = 0; n < count; n++) {
    if (mode.kind === 'special-divided') {
      const cadence = mode.cadence ?? 'monthly';
      switch (cadence) {
        case 'weekly':
          dates.push(addWeeks(startDate, n));
          break;
        case 'biweekly':
          dates.push(addWeeks(startDate, n * 2));
          break;
        case 'quarterly':
          dates.push(addMonths(startDate, n * 3));
          break;
        case 'annual':
          dates.push(addMonths(startDate, n * 12));
          break;
        default:
          dates.push(addMonths(startDate, n));
      }
      continue;
    }
    // mode.kind === 'recurring'
    switch (mode.cadence) {
      case 'weekly':
        dates.push(addWeeks(startDate, n));
        break;
      case 'biweekly':
        dates.push(addWeeks(startDate, n * 2));
        break;
      case 'quarterly':
        dates.push(setDate(addMonths(startDate, n * 3), 1));
        break;
      case 'annual':
        dates.push(setDate(addMonths(startDate, n * 12), 1));
        break;
      default:
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

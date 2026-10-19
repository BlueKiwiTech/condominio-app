// Loads what lib/reporting/communityBalance.ts needs, with minimal selects, and
// returns the community balance per currency. Server-side only (takes the
// admin's Supabase client, so RLS applies, or the service role).
//
// PostgREST caps a response at 1000 rows by default and silently truncates, so
// every table is read in pages: a balance computed from a truncated list would
// be wrong without any error.
import type { DbClient } from '@/lib/supabase/dbClient';
import {
  communityBalance,
  type CreditForBalance,
  type ExpenseForBalance,
  type PaymentForBalance,
} from './communityBalance';
import type { CurrencyAmountMap } from './dashboard';

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`could not load ${what}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchCommunityBalance(db: DbClient): Promise<CurrencyAmountMap> {
  const [payments, credits, expenses] = await Promise.all([
    fetchAll<PaymentForBalance>(
      (from, to) =>
        db
          .from('condo_payments')
          .select('installment_id, amount_paid, currency, funding_breakdown')
          .order('id')
          .range(from, to),
      'payments',
    ),
    fetchAll<CreditForBalance>(
      (from, to) => db.from('condo_house_credits').select('currency, balance').order('house_id').order('currency').range(from, to),
      'house credits',
    ),
    fetchAll<ExpenseForBalance>(
      (from, to) =>
        db
          .from('condo_expenses')
          .select('status, currency, amount, paid_currency, paid_amount')
          .is('deleted_at', null)
          .in('status', ['paid', 'on_hold'])
          .order('id')
          .range(from, to),
      'expenses',
    ),
  ]);
  return communityBalance(payments, credits, expenses);
}

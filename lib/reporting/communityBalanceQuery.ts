// Reads the stored community balance and its ledger (change
// saldo-comunidad-libro). Server-side only: takes the admin's Supabase client,
// so RLS applies (only admins of the community can read these tables).
import type { DbClient } from '@/lib/supabase/dbClient';
import type { Currency, CurrencyAmountMap } from './dashboard';

export type MovementType = 'opening' | 'payment_in' | 'expense_out' | 'adjustment';

export type CommunityMovement = {
  id: string;
  type: MovementType;
  currency: Currency;
  /** Signed: positive adds to the balance, negative subtracts. */
  amount: number;
  reference_id: string | null;
  occurred_on: string;
  note: string | null;
  created_by: string | null;
  author_email: string | null;
  created_at: string;
};

export const MOVEMENTS_PAGE_SIZE = 25;

/** The stored balance per currency. Only currencies that ever had a movement appear. */
export async function fetchCommunityBalance(db: DbClient): Promise<CurrencyAmountMap> {
  const { data, error } = await db.from('condo_community_balances').select('currency, balance');
  if (error) throw new Error(`could not load the community balance: ${error.message}`);
  const out: CurrencyAmountMap = {};
  for (const row of data ?? []) out[row.currency as Currency] = Number(row.balance);
  return out;
}

/** One page of the ledger, newest first (page is 1-based), with the total row count. */
export async function fetchMovementsPage(
  db: DbClient,
  page: number,
): Promise<{ movements: CommunityMovement[]; total: number; pageSize: number }> {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const from = (safePage - 1) * MOVEMENTS_PAGE_SIZE;
  const { data, error, count } = await db
    .from('condo_community_movements')
    .select('id, type, currency, amount, reference_id, occurred_on, note, created_by, author_email, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + MOVEMENTS_PAGE_SIZE - 1);
  if (error) throw new Error(`could not load the movements: ${error.message}`);
  const movements = (data ?? []).map((m) => ({ ...m, amount: Number(m.amount) })) as CommunityMovement[];
  return { movements, total: count ?? movements.length, pageSize: MOVEMENTS_PAGE_SIZE };
}

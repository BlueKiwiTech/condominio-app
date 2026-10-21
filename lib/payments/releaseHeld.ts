// Releases what is "en espera de tasa" (change pagos-en-espera-por-tasa).
//
// A Bs payment/expense whose BCV (or euro) rate for its own date doesn't exist
// yet is stored with status 'on_hold' instead of being rejected. Whenever a
// rate arrives (the daily rates cron, or an admin typing one) this runs and
// processes whatever can now be processed:
//   - admin-registered payment (condo_payment_reports.created_by set): applied
//     for real with applyPaymentAllocation -> 'confirmed' + receipt link.
//   - resident report (created_by null): back to 'pending' so the admin
//     confirms it as usual. Nothing is applied for the resident.
//   - expense: gets its exchange_rate (and, for Bs paid in Bs, the equivalent)
//     and becomes 'paid'. A cross-currency expense keeps the paid amount the
//     admin typed; it is not recomputed.
//
// Runs with the service role (the cron has no admin session), so it is a plain
// module, never a 'use server' export: nothing here may be callable from a
// browser. Idempotent: every row is claimed with a short lease
// (release_claimed_at) before being touched, so the cron and a manual rate
// firing together can't pay the same thing twice; a crashed run's lease simply
// expires and the row is retried next time.
import { revalidatePath } from 'next/cache';
import type { DbClient } from '@/lib/supabase/dbClient';
import { logAudit } from '@/lib/audit';
import { isRateFresh } from '@/lib/exchangeRate';
import { fetchRatesAsOf } from '@/lib/rates/asOf';
import { parseDateOnly } from '@/lib/gastos/generate';
import { referenceAmount, referenceCurrencyFor, type ExpensePaymentRateType } from '@/lib/gastos/paymentRate';
import { applyPaymentAllocation, evaluatePaymentAllocation, type ApplyAllocationErrors } from './applyAllocation';

// A claim older than this is considered abandoned (the run that took it died).
const LEASE_MS = 10 * 60 * 1000;

// Messages are only logged, never shown to a user: the release runs unattended.
const LOGGED_ERRORS: ApplyAllocationErrors = {
  installmentsGone: 'a selected cuota no longer exists',
  mixedHouses: 'cuotas from different houses',
  alreadyPaid: 'a selected cuota is already paid',
  insufficientAmount: 'nothing received',
  staleExchangeRate: 'exchange rate missing or stale',
  concurrentPayment: 'another payment to the same house kept changing the state',
};

export type ReleaseSummary = {
  /** Rows that left 'on_hold' (applied, sent back to 'pending', or paid). */
  released: number;
  /** Rows whose rate still isn't there: they stay on hold. */
  stillWaiting: number;
  /** Rows that could not be processed (kept on hold, reason logged). */
  failed: number;
};

type HeldReport = {
  id: string;
  house_id: string;
  amount: number;
  currency: 'USD' | 'Bs' | 'USDT';
  payment_date: string;
  reference: string | null;
  notes: string | null;
  installment_ids: string[];
  created_by: string | null;
  explicit_installments: boolean;
};

type HeldExpense = {
  id: string;
  currency: 'USD' | 'Bs' | 'USDT';
  amount: number;
  paid_date: string | null;
  exchange_rate_type: ExpensePaymentRateType | null;
  paid_currency: 'USD' | 'Bs' | null;
};

/** Takes the lease on one row; false when someone else holds a live one (or it left 'on_hold'). */
async function claim(db: DbClient, table: 'condo_payment_reports' | 'condo_expenses', id: string): Promise<boolean> {
  const now = new Date();
  const expired = new Date(now.getTime() - LEASE_MS).toISOString();
  const { data, error } = await db
    .from(table)
    .update({ release_claimed_at: now.toISOString() })
    .eq('id', id)
    .eq('status', 'on_hold')
    .or(`release_claimed_at.is.null,release_claimed_at.lt.${expired}`)
    .select('id');
  if (error) {
    console.error(`[release-held] could not claim ${table}:${id}`, error.message);
    return false;
  }
  return !!data && data.length > 0;
}

async function unclaim(db: DbClient, table: 'condo_payment_reports' | 'condo_expenses', id: string) {
  const { error } = await db.from(table).update({ release_claimed_at: null }).eq('id', id).eq('status', 'on_hold');
  if (error) console.error(`[release-held] could not clear the lease on ${table}:${id}`, error.message);
}

async function releaseReport(db: DbClient, report: HeldReport, summary: ReleaseSummary) {
  if (!(await claim(db, 'condo_payment_reports', report.id))) return;
  try {
    // Same cuota set confirmPaymentReport uses: the tagged ones, or every unpaid one.
    let installmentIds = report.installment_ids;
    if (installmentIds.length === 0) {
      const { data: unpaid } = await db
        .from('condo_installments')
        .select('id')
        .eq('house_id', report.house_id)
        .neq('status', 'paid')
        .is('deleted_at', null);
      installmentIds = (unpaid ?? []).map((r) => r.id as string);
    }
    const params = {
      house_id: report.house_id,
      currency: report.currency,
      amount_received: report.amount,
      payment_date: report.payment_date,
      reference: report.reference,
      notes: report.notes,
      installment_ids: installmentIds,
      created_by: report.created_by,
      // Special cuotas the admin chose: they keep skipping the 30-day window on release.
      explicit_installments: report.explicit_installments,
    };

    const evaluation = await evaluatePaymentAllocation(db, params, LOGGED_ERRORS);
    if (evaluation.kind === 'blockedByRate') {
      summary.stillWaiting++;
      await unclaim(db, 'condo_payment_reports', report.id);
      return;
    }

    if (report.created_by === null) {
      // A resident's report: the rate is there, so it is no longer waiting on the
      // system -- it goes back to the admin's queue like any other pending report.
      const { error } = await db
        .from('condo_payment_reports')
        .update({ status: 'pending', release_claimed_at: null })
        .eq('id', report.id)
        .eq('status', 'on_hold');
      if (error) throw new Error(error.message);
      summary.released++;
      return;
    }

    // Registered by the admin: apply it for real, as registerPayment would have.
    const result = await applyPaymentAllocation(db, params, LOGGED_ERRORS);
    if ('onHold' in result) {
      summary.stillWaiting++;
      await unclaim(db, 'condo_payment_reports', report.id);
      return;
    }
    if ('error' in result) throw new Error(result.error);

    // No `status = 'on_hold'` guard on purpose: the payment above is already
    // applied, so if an admin rejected the report during this (rare) window the
    // truthful final state is 'confirmed' with its receipt, not 'rejected'.
    const { error } = await db
      .from('condo_payment_reports')
      .update({
        status: 'confirmed',
        resulting_payment_batch_id: result.batchId,
        resulting_receipt_number: result.receiptNumber,
        release_claimed_at: null,
      })
      .eq('id', report.id);
    if (error) throw new Error(error.message);
    await logAudit(db, {
      userId: report.created_by,
      action: 'payment_report.release',
      entityType: 'payment_report',
      entityId: report.id,
    });
    summary.released++;
  } catch (err) {
    console.error(`[release-held] report ${report.id} could not be released:`, err);
    summary.failed++;
    await unclaim(db, 'condo_payment_reports', report.id);
  }
}

async function releaseExpense(db: DbClient, expense: HeldExpense, summary: ReleaseSummary) {
  if (!(await claim(db, 'condo_expenses', expense.id))) return;
  try {
    const type = expense.exchange_rate_type;
    if (!expense.paid_date || (type !== 'bcv' && type !== 'eur')) {
      throw new Error('on-hold expense without a paid_date or a bcv/eur rate type');
    }
    const row = (await fetchRatesAsOf(db, expense.paid_date))[type];
    if (!row || !isRateFresh(row.updated_at, parseDateOnly(expense.paid_date))) {
      summary.stillWaiting++;
      await unclaim(db, 'condo_expenses', expense.id);
      return;
    }

    // Bs paid in Bs also keeps the USD (or EUR) equivalent of its final amount.
    // A cross-currency payment only gets the rate: paid_amount is what the admin typed.
    const sameCurrencyBs = expense.currency === 'Bs' && expense.paid_currency === null;
    const reference = sameCurrencyBs ? referenceAmount(expense.amount, row.rate) : null;
    if (sameCurrencyBs && reference === null) throw new Error('could not compute the equivalent amount');

    const { error } = await db
      .from('condo_expenses')
      .update({
        exchange_rate: row.rate,
        ...(sameCurrencyBs ? { reference_amount: reference, reference_currency: referenceCurrencyFor(type) } : {}),
        status: 'paid',
        release_claimed_at: null,
      })
      .eq('id', expense.id)
      .eq('status', 'on_hold');
    if (error) throw new Error(error.message);
    summary.released++;
  } catch (err) {
    console.error(`[release-held] expense ${expense.id} could not be released:`, err);
    summary.failed++;
    await unclaim(db, 'condo_expenses', expense.id);
  }
}

/** Processes every held payment/report/expense whose rate is now available. Safe to call any time, as often as needed. */
export async function releaseHeldTransactions(db: DbClient): Promise<ReleaseSummary> {
  const summary: ReleaseSummary = { released: 0, stillWaiting: 0, failed: 0 };

  const { data: reports, error: reportsError } = await db
    .from('condo_payment_reports')
    .select('id, house_id, amount, currency, payment_date, reference, notes, installment_ids, created_by, explicit_installments')
    .eq('status', 'on_hold')
    .order('created_at', { ascending: true });
  if (reportsError) throw new Error(`could not read held reports: ${reportsError.message}`);
  for (const report of (reports ?? []) as HeldReport[]) await releaseReport(db, report, summary);

  const { data: expenses, error: expensesError } = await db
    .from('condo_expenses')
    .select('id, currency, amount, paid_date, exchange_rate_type, paid_currency')
    .eq('status', 'on_hold')
    .is('deleted_at', null);
  if (expensesError) throw new Error(`could not read held expenses: ${expensesError.message}`);
  for (const expense of (expenses ?? []) as HeldExpense[]) await releaseExpense(db, expense, summary);

  if (summary.released > 0) {
    // Outside a request (a script) there is no cache to revalidate: ignore.
    try {
      for (const path of ['/pagos', '/pagos-reportados', '/cuotas', '/gastos', '/gastos-pagados', '/dashboard', '/saldo-comunidad']) revalidatePath(path);
    } catch {
      /* nothing to revalidate */
    }
  }
  return summary;
}

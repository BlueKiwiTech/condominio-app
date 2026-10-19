import type { ExpensePaymentCurrency, ExpensePaymentRateType, ExpenseReferenceCurrency } from '@/lib/gastos/paymentRate';

export type Currency = 'USD' | 'Bs' | 'USDT';
export type ExpenseKind = 'fixed' | 'variable';
export type ExpenseCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type ExpenseStatus = 'pending' | 'on_hold' | 'paid';

export type CategoryOption = { id: string; name: string };

export type ExpenseRow = {
  id: string;
  template_id: string;
  category_id: string;
  provider: string | null;
  currency: Currency;
  amount: number;
  installment_number: number | null;
  period_date: string;
  status: ExpenseStatus;
  paid_date: string | null;
  notes: string | null;
  // Set only when an expense in Bs was paid (change gastos-pago-multimoneda);
  // all four are null for USD/USDT expenses and ones paid before it.
  exchange_rate: number | null;
  exchange_rate_type: ExpensePaymentRateType | null;
  reference_amount: number | null;
  reference_currency: ExpenseReferenceCurrency | null;
  // Set only when the payment currency differs from the expense's own: what was
  // actually paid, while `amount` keeps what was owed.
  paid_currency: ExpensePaymentCurrency | null;
  paid_amount: number | null;
  condo_expense_templates: { name: string; kind: ExpenseKind } | null;
  condo_expense_categories: { name: string } | null;
};

export type FixedTemplateRow = {
  id: string;
  name: string;
  active: boolean;
  cadence: ExpenseCadence;
  provider: string | null;
  currency: Currency;
  default_amount: number;
  start_date: string;
  condo_expense_categories: { name: string } | null;
};

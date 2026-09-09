export type Currency = 'USD' | 'Bs' | 'USDT';
export type ExpenseKind = 'fixed' | 'variable';
export type ExpenseCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type ExpenseStatus = 'pending' | 'paid';

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
  condo_expense_templates: { name: string; kind: ExpenseKind } | null;
  condo_expense_categories: { name: string } | null;
};

export type FixedTemplateRow = { id: string; name: string; active: boolean };

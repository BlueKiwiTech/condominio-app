import type { Currency } from '@/lib/reporting/dashboard';
import type { InstallmentStatus } from '@/lib/cuotas/status';
import type { PaymentRow } from '@/components/payments/types';

export type { Currency, PaymentRow };

export const CURRENCIES: Currency[] = ['USD', 'Bs', 'USDT'];

export type DashboardInstallment = {
  house_id: string;
  due_date: string;
  status: InstallmentStatus;
  amount: number;
  amount_paid: number;
  currency: Currency;
};

export type DashboardHouse = {
  id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
};

export type DashboardCredit = {
  house_id: string;
  currency: Currency;
  balance: number;
};

export type DashboardExpense = {
  currency: Currency;
  amount: number;
  period_date: string;
  status: 'pending' | 'paid';
};

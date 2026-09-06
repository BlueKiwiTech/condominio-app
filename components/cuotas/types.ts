import type { InstallmentStatus } from '@/lib/cuotas/status';

export type Currency = 'USD' | 'Bs' | 'USDT';
export type Cadence = 'weekly' | 'monthly' | 'annual';
export type InstallmentType = 'recurring' | 'special';

export type InstallmentRow = {
  id: string;
  status: InstallmentStatus;
  due_date: string;
  amount: number;
  house_id: string;
};

export type TemplateWithInstallments = {
  id: string;
  name: string;
  description: string | null;
  installment_type: InstallmentType;
  cadence: Cadence | null;
  amount: number;
  currency: Currency;
  start_date: string;
  number_of_installments: number;
  is_divided: boolean;
  applicable_houses: string[];
  created_at: string;
  condo_installments: InstallmentRow[];
};

export type HouseOption = {
  id: string;
  house_number: string;
  house_name: string | null;
};

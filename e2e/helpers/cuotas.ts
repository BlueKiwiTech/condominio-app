import { expect, type Page } from '@playwright/test';
import { gotoReady, selectOption, pickDate } from './ui';

// start_date defaults to `new Date()` (today) in both cuota types -- left
// untouched (and so left out of these opts) unless a caller passes one.
const CURRENCY_OPTION_LABEL: Record<'USD' | 'Bs' | 'USDT', string> = {
  USD: '$ Efectivo',
  Bs: 'Bs.',
  USDT: 'Binance',
};

export async function createRecurringCuota(
  page: Page,
  opts: { name: string; amount: string; cadence: string; houseNumber: string; currency?: 'USD' | 'Bs' | 'USDT' },
) {
  await gotoReady(page, '/cuotas/new');
  await page.getByRole('button', { name: 'Recurrente' }).click();
  await page.getByLabel('Descripción').fill(opts.name);
  await page.getByLabel('Monto por cuota').fill(opts.amount);
  await selectOption(page, 'Moneda', CURRENCY_OPTION_LABEL[opts.currency ?? 'USD']);
  await selectOption(page, 'Frecuencia', opts.cadence);
  await page.getByRole('button', { name: new RegExp(opts.houseNumber) }).click();
  await page.getByRole('button', { name: 'Crear cuota' }).click();
  await expect(page).toHaveURL(/\/cuotas$/);
}

export async function createSpecialDividedCuota(
  page: Page,
  opts: {
    name: string;
    amount: string;
    installments: number;
    houseNumber: string;
    currency?: 'USD' | 'Bs' | 'USDT';
    startDate?: Date;
  },
) {
  await gotoReady(page, '/cuotas/new');
  await page.getByRole('button', { name: 'Especial' }).click();
  await page.getByLabel('Descripción').fill(opts.name);
  await page.getByLabel('Monto total').fill(opts.amount);
  await selectOption(page, 'Moneda', CURRENCY_OPTION_LABEL[opts.currency ?? 'USD']);
  await page.getByRole('switch', { name: 'Dividir en cuotas' }).click();
  await page.getByLabel('Número de cuotas').fill(String(opts.installments));
  if (opts.startDate) {
    await pickDate(page, 'start_date', opts.startDate);
  }
  await page.getByRole('button', { name: new RegExp(opts.houseNumber) }).click();
  await page.getByRole('button', { name: 'Crear cuota' }).click();
  await expect(page).toHaveURL(/\/cuotas$/);
}

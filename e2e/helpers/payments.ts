import { expect, type Page } from '@playwright/test';
import { gotoReady, selectOption, pickDate } from './ui';

const CURRENCY_OPTION_LABEL: Record<'USD' | 'Bs' | 'USDT', string> = {
  USD: '$ Efectivo',
  Bs: 'Bs.',
  USDT: 'Binance',
};

export async function registerPayment(
  page: Page,
  opts: { houseNumber: string; amount: string; currency?: 'USD' | 'Bs' | 'USDT'; paymentDate?: Date },
) {
  await gotoReady(page, '/pagos/nuevo');
  await selectOption(page, 'Casa', new RegExp(opts.houseNumber));
  await page.getByRole('button', { name: 'Ingresar manualmente' }).click();
  if (opts.paymentDate) {
    await pickDate(page, 'payment_date', opts.paymentDate);
  }
  if (opts.currency) {
    await selectOption(page, 'Moneda', CURRENCY_OPTION_LABEL[opts.currency]);
  }
  // MoneyInput only commits to React state on blur (format-on-blur, not
  // live-reformatting) -- fill() alone leaves the field's bound value NaN.
  await page.getByLabel('Monto recibido').fill(opts.amount);
  await page.getByLabel('Monto recibido').press('Tab');
  await page.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(page.getByText('Abono registrado correctamente.')).toBeVisible();
}

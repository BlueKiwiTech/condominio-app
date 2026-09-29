import { expect, type Page } from '@playwright/test';
import { gotoReady, selectOption } from './ui';

export async function registerPayment(page: Page, opts: { houseNumber: string; amount: string }) {
  await gotoReady(page, '/pagos/nuevo');
  await selectOption(page, 'Casa', new RegExp(opts.houseNumber));
  await page.getByRole('button', { name: 'Ingresar manualmente' }).click();
  // MoneyInput only commits to React state on blur (format-on-blur, not
  // live-reformatting) -- fill() alone leaves the field's bound value NaN.
  await page.getByLabel('Monto recibido').fill(opts.amount);
  await page.getByLabel('Monto recibido').press('Tab');
  await page.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(page.getByText('Abono registrado correctamente.')).toBeVisible();
}

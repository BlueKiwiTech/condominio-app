import { expect, type Page } from '@playwright/test';
import { gotoReady, selectOption } from './ui';

// start_date is left untouched everywhere below -- both cuota types default
// it to `new Date()` (today), so there's nothing to fill.

export async function createRecurringCuota(
  page: Page,
  opts: { name: string; amount: string; cadence: string; houseNumber: string },
) {
  await gotoReady(page, '/cuotas/new');
  await page.getByRole('button', { name: 'Recurrente' }).click();
  await page.getByLabel('Descripción').fill(opts.name);
  await page.getByLabel('Monto por cuota').fill(opts.amount);
  await selectOption(page, 'Moneda', '$ Efectivo');
  await selectOption(page, 'Frecuencia', opts.cadence);
  await page.getByRole('button', { name: new RegExp(opts.houseNumber) }).click();
  await page.getByRole('button', { name: 'Crear cuota' }).click();
  await expect(page).toHaveURL(/\/cuotas$/);
}

export async function createSpecialDividedCuota(
  page: Page,
  opts: { name: string; amount: string; installments: number; houseNumber: string },
) {
  await gotoReady(page, '/cuotas/new');
  await page.getByRole('button', { name: 'Especial' }).click();
  await page.getByLabel('Descripción').fill(opts.name);
  await page.getByLabel('Monto total').fill(opts.amount);
  await selectOption(page, 'Moneda', '$ Efectivo');
  await page.getByRole('switch', { name: 'Dividir en cuotas' }).click();
  await page.getByLabel('Número de cuotas').fill(String(opts.installments));
  await page.getByRole('button', { name: new RegExp(opts.houseNumber) }).click();
  await page.getByRole('button', { name: 'Crear cuota' }).click();
  await expect(page).toHaveURL(/\/cuotas$/);
}

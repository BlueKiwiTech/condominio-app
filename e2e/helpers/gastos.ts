import { expect, type Page } from '@playwright/test';
import { gotoReady, selectOption } from './ui';

// start_date is left untouched -- defaults to `new Date()` (today).

export async function createFixedGastoWithNewCategory(
  page: Page,
  opts: { name: string; categoryName: string; amount: string; cadence: string },
) {
  await gotoReady(page, '/gastos/new');
  await page.getByLabel('Nombre del gasto').fill(opts.name);

  await page.getByLabel('Categoría', { exact: true }).click();
  await page.getByRole('option', { name: '+ Agregar nueva categoría' }).click();
  await page.getByLabel('Nombre de la categoría').fill(opts.categoryName);
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByLabel('Monto por período').fill(opts.amount);
  await selectOption(page, 'Moneda', '$ Efectivo');
  await selectOption(page, 'Frecuencia', opts.cadence);
  await page.getByRole('button', { name: 'Crear gasto' }).click();
  await expect(page).toHaveURL(/\/gastos$/);
}

export async function markGastoPaid(page: Page, gastoName: string) {
  await gotoReady(page, '/gastos');
  const row = page.getByRole('row', { name: new RegExp(gastoName) });
  await row.getByRole('button', { name: 'Registrar pago' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(dialog).toHaveCount(0);
}

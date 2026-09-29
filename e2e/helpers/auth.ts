import { expect, type Page } from '@playwright/test';
import { gotoReady } from './ui';

export async function loginAsAdmin(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not set -- run `npm run test:e2e:setup` first.',
    );
  }

  await gotoReady(page, '/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function residentLogin(page: Page, houseNumber: string, pin: string) {
  await gotoReady(page, '/resident-login');
  await page.getByLabel('Mi casa').fill(houseNumber);
  await page.getByRole('option', { name: new RegExp(houseNumber) }).click();
  await page.getByLabel('Mi Pin').fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/mi-comunidad/);
}

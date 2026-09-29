import { expect, type Page } from '@playwright/test';
import { gotoReady } from './ui';

export type TestHouse = {
  houseNumber: string;
  houseName: string;
  ownerName: string;
  ownerPhone: string;
  pin: string;
};

export async function createHouse(page: Page, house: TestHouse) {
  await gotoReady(page, '/houses');
  await page.getByRole('button', { name: 'Nueva casa' }).click();
  await page.getByLabel('Número de casa').fill(house.houseNumber);
  await page.getByLabel('Nombre').fill(house.houseName);
  await page.getByLabel('Propietario').fill(house.ownerName);
  await page.getByLabel('Teléfono', { exact: true }).fill(house.ownerPhone);
  await page.getByLabel('PIN (4 dígitos)').fill(house.pin);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('cell', { name: house.houseNumber, exact: true })).toBeVisible();
}

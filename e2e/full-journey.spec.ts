import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsAdmin, residentLogin } from './helpers/auth';
import { createHouse } from './helpers/houses';
import { createRecurringCuota, createSpecialDividedCuota } from './helpers/cuotas';
import { registerPayment } from './helpers/payments';
import { createFixedGastoWithNewCategory, markGastoPaid } from './helpers/gastos';
import { gotoReady } from './helpers/ui';

// One continuous admin -> resident journey against the local Supabase stack
// (npm run test:e2e:setup resets it first). Steps run in order because each
// depends on state the previous one created -- this is a full-run smoke
// test, not a suite of independent unit-style specs.
const HOUSE = {
  houseNumber: 'E2E-01',
  houseName: 'Casa E2E',
  ownerName: 'Vecino E2E',
  ownerPhone: '04120000000',
  pin: '1234',
};
const RECURRING_CUOTA_NAME = 'Mantenimiento E2E';
const SPECIAL_CUOTA_NAME = 'Especial E2E';
const GASTO_NAME = 'Vigilancia E2E';
const GASTO_CATEGORY_NAME = 'Seguridad E2E';

test.describe.serial('full admin + resident journey', () => {
  let adminContext: BrowserContext;
  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await adminContext.close();
  });

  test('admin logs in', async () => {
    await loginAsAdmin(adminPage);
  });

  test('admin creates a house with a known PIN', async () => {
    await createHouse(adminPage, HOUSE);
  });

  test('admin creates a recurring cuota scoped to that house', async () => {
    await createRecurringCuota(adminPage, {
      name: RECURRING_CUOTA_NAME,
      amount: '50',
      cadence: 'Mensual',
      houseNumber: HOUSE.houseNumber,
    });
  });

  test('admin creates a divided special cuota scoped to that house', async () => {
    await createSpecialDividedCuota(adminPage, {
      name: SPECIAL_CUOTA_NAME,
      amount: '100',
      installments: 2,
      houseNumber: HOUSE.houseNumber,
    });
  });

  test('admin registers a payment covering everything owed', async () => {
    // Deliberately larger than every installment generated above (the
    // recurring cuota alone auto-generates ~6 months) so the whole house
    // ends up paid off regardless of exactly how many were created.
    await registerPayment(adminPage, { houseNumber: HOUSE.houseNumber, amount: '10000' });
  });

  test('admin creates a gasto and marks it paid', async () => {
    await createFixedGastoWithNewCategory(adminPage, {
      name: GASTO_NAME,
      categoryName: GASTO_CATEGORY_NAME,
      amount: '200',
      cadence: 'Mensual',
    });
    await markGastoPaid(adminPage, GASTO_NAME);

    await gotoReady(adminPage, '/gastos-pagados');
    await expect(adminPage.getByRole('row', { name: new RegExp(GASTO_NAME) })).toBeVisible();
  });

  test('dashboard no longer lists the house as moroso', async () => {
    await gotoReady(adminPage, '/dashboard');
    await expect(adminPage.getByRole('row', { name: new RegExp(HOUSE.houseNumber) })).toHaveCount(0);
  });

  test('resident logs in and sees a paid-up account', async ({ browser }) => {
    // A separate context: resident auth is a distinct signed cookie from
    // the admin's Supabase Auth session (dual-auth pattern), never mixed.
    const residentContext = await browser.newContext();
    const residentPage = await residentContext.newPage();

    await residentLogin(residentPage, HOUSE.houseNumber, HOUSE.pin);

    await gotoReady(residentPage, '/mis-pagos');
    await expect(residentPage.getByText(RECURRING_CUOTA_NAME).first()).toBeVisible();
    await expect(residentPage.getByText(SPECIAL_CUOTA_NAME).first()).toBeVisible();
    await expect(residentPage.getByText('Pagada').first()).toBeVisible();
    await expect(residentPage.getByText('Pendiente', { exact: true })).toHaveCount(0);
    await expect(residentPage.getByText('Vencida', { exact: true })).toHaveCount(0);

    await residentContext.close();
  });
});

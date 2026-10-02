import { test, expect, type Page } from '@playwright/test';
import { subDays, addDays, addMonths } from 'date-fns';
import { loginAsAdmin } from './helpers/auth';
import { createHouse } from './helpers/houses';
import { createSpecialDividedCuota } from './helpers/cuotas';
import { registerPayment } from './helpers/payments';
import { gotoReady, selectOption } from './helpers/ui';

// Covers lib/payments/allocate.ts's filterEligibleForConversionWindow: a
// payment's own-day rate only reaches cuotas already vencida (no limit
// looking backward) plus cuotas due up to 30 calendar days AHEAD of the
// payment date -- anything further out is left pending instead of being
// swept in at a rate from a date it doesn't belong to. The scenario this
// mirrors: "today" far in the future, a payment reported for a date well in
// the past should settle every older due plus the next one or two ahead of
// it, but not something due a couple months out. Applies uniformly to Bs,
// USD, and USDT (2026-10-01 -- previously USD/USDT were unrestricted and
// could prepay any number of future months at face value).
const HOUSE = {
  houseNumber: 'E2E-WIN',
  houseName: 'Casa Ventana',
  ownerName: 'Vecino Ventana',
  ownerPhone: '04120000001',
  pin: '4321',
};
const CUOTA_NAME = 'Especial Ventana E2E';

test.describe.serial('Bs payment conversion window: unlimited backward, capped 30 days forward', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await loginAsAdmin(page);
  });

  // 4 Bs installments, one per month, starting ~95 days ago -- due dates
  // land near T-95, T-65, T-35, T-5 (date-fns addMonths, so exact spacing
  // shifts a day or two with calendar month lengths; the assertions below
  // only rely on being comfortably on either side of the 30-day cutoff
  // below, never on an exact day).
  const startDate = subDays(new Date(), 95);

  test('admin creates a house with 4 Bs installments spanning ~3 months', async () => {
    await createHouse(page, HOUSE);
    await createSpecialDividedCuota(page, {
      name: CUOTA_NAME,
      amount: '400',
      installments: 4,
      houseNumber: HOUSE.houseNumber,
      currency: 'Bs',
      startDate,
    });
  });

  // Payment reported ~50 days ago: due dates already vencida as of then
  // (T-95, T-65) pay off with no backward limit, plus anything due up to 30
  // days AHEAD of that date -- cutoff T-20, which still reaches T-35 but not
  // the last installment at T-5.
  const paymentDate = subDays(new Date(), 50);

  test('a Bs payment backdated ~50 days pays the 3 installments inside its window, leaving the 4th', async () => {
    await registerPayment(page, {
      houseNumber: HOUSE.houseNumber,
      amount: '300', // exactly 3 of the 4 installments (100 each) -- zero leftover if the window math is right
      currency: 'Bs',
      paymentDate,
    });
    await expect(page).toHaveURL(/\/pagos\/[^/]+$/);
    // One row per paid cuota -- confirms exactly 3 (not 4) were swept in.
    await expect(page.getByRole('cell', { name: CUOTA_NAME })).toHaveCount(3);
  });

  test('the house still owes exactly the 4th installment, untouched by the backdated payment', async () => {
    await gotoReady(page, '/pagos/nuevo');
    await selectOption(page, 'Casa', new RegExp(HOUSE.houseNumber));
    await page.getByRole('button', { name: 'Ingresar manualmente' }).click();
    await page.getByLabel('Monto recibido').fill('100');
    await page.getByLabel('Monto recibido').press('Tab');
    // Only shows once the one remaining due is fully covered with nothing
    // left over and nothing deferred -- proves the balance left behind by
    // the backdated payment was exactly this one installment, not more.
    await expect(page.getByText('Con este pago, la casa queda al día.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Abono registrado correctamente.')).toBeVisible();
  });
});

const HOUSE_USD = {
  houseNumber: 'E2E-WINU',
  houseName: 'Casa Ventana USD',
  ownerName: 'Vecino Ventana USD',
  ownerPhone: '04120000002',
  pin: '4321',
};
const CUOTA_NAME_USD = 'Especial Ventana USD E2E';

test.describe.serial('USD payment conversion window: same 30-day cap as Bs', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await loginAsAdmin(page);
  });

  const startDate = subDays(new Date(), 95);

  test('admin creates a house with 4 USD installments spanning ~3 months', async () => {
    await createHouse(page, HOUSE_USD);
    await createSpecialDividedCuota(page, {
      name: CUOTA_NAME_USD,
      amount: '400',
      installments: 4,
      houseNumber: HOUSE_USD.houseNumber,
      currency: 'USD',
      startDate,
    });
  });

  const paymentDate = subDays(new Date(), 50);

  test('a USD payment backdated ~50 days pays the 3 installments inside its window, leaving the 4th (no longer unrestricted)', async () => {
    await registerPayment(page, {
      houseNumber: HOUSE_USD.houseNumber,
      amount: '300', // exactly 3 of the 4 installments (100 each) -- zero leftover if the window math is right
      currency: 'USD',
      paymentDate,
    });
    await expect(page).toHaveURL(/\/pagos\/[^/]+$/);
    await expect(page.getByRole('cell', { name: CUOTA_NAME_USD })).toHaveCount(3);
  });

  test('the house still owes exactly the 4th installment, untouched by the backdated payment', async () => {
    await gotoReady(page, '/pagos/nuevo');
    await selectOption(page, 'Casa', new RegExp(HOUSE_USD.houseNumber));
    await page.getByRole('button', { name: 'Ingresar manualmente' }).click();
    await page.getByLabel('Monto recibido').fill('100');
    await page.getByLabel('Monto recibido').press('Tab');
    await expect(page.getByText('Con este pago, la casa queda al día.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Abono registrado correctamente.')).toBeVisible();
  });
});

const HOUSE_BOUNDARY = {
  houseNumber: 'E2E-WINB',
  houseName: 'Casa Frontera',
  ownerName: 'Vecino Frontera',
  ownerPhone: '04120000003',
  pin: '4321',
};
const CUOTA_VENCIDA = 'Especial Frontera Vencida E2E';
const CUOTA_WITHIN = 'Especial Frontera Dentro E2E';
const CUOTA_JUST_OUTSIDE = 'Especial Frontera Fuera1 E2E';
const CUOTA_FURTHER_OUTSIDE = 'Especial Frontera Fuera2 E2E';

// Mirrors the exact walkthrough discussed with the user: "today" Sept 29, a
// payment backdated to Aug 30 (30 days earlier), cuotas due Aug 29 (already
// vencida relative to the payment) and Sept 15 (within the window) get
// swept in and paid; cuotas due Sept 30 and Oct 1 -- one and three days PAST
// the Aug 30 + 30 days = Sept 29 cutoff -- stay pending untouched. Expressed
// here relative to "today" (T) so it passes on any run date, not just that
// specific calendar scenario: payment at T-30, installments at T-31
// (vencida), T-14 (within), T+1 (just past cutoff), T+2 (further past).
test.describe.serial('Conversion window boundary: the cutoff day itself is reachable, one day past it is not', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await loginAsAdmin(page);
  });

  const today = new Date();
  const paymentDate = subDays(today, 30);
  const dueVencida = subDays(today, 31);
  const dueWithinWindow = subDays(today, 14);
  const dueJustOutside = addDays(today, 1);
  const dueFurtherOutside = addDays(today, 2);

  test('admin creates 4 single-installment Bs cuotas straddling the cutoff', async () => {
    await createHouse(page, HOUSE_BOUNDARY);
    const cuotas: Array<[string, Date]> = [
      [CUOTA_VENCIDA, dueVencida],
      [CUOTA_WITHIN, dueWithinWindow],
      [CUOTA_JUST_OUTSIDE, dueJustOutside],
      [CUOTA_FURTHER_OUTSIDE, dueFurtherOutside],
    ];
    for (const [name, dueDate] of cuotas) {
      await createSpecialDividedCuota(page, {
        name,
        amount: '100',
        installments: 1,
        houseNumber: HOUSE_BOUNDARY.houseNumber,
        currency: 'Bs',
        startDate: dueDate,
      });
    }
  });

  test('a Bs payment backdated 30 days pays the vencida + within-window cuotas, deferring both past-cutoff ones', async () => {
    await registerPayment(page, {
      houseNumber: HOUSE_BOUNDARY.houseNumber,
      amount: '200', // exactly the 2 eligible installments (100 each) -- zero leftover if the boundary math is right
      currency: 'Bs',
      paymentDate,
    });
    await expect(page).toHaveURL(/\/pagos\/[^/]+$/);
    await expect(page.getByRole('cell', { name: CUOTA_VENCIDA })).toHaveCount(1);
    await expect(page.getByRole('cell', { name: CUOTA_WITHIN })).toHaveCount(1);
    // Neither past-cutoff cuota appears on the receipt -- confirms the
    // payment swept in exactly 2 (not 3 or 4) installments.
    await expect(page.getByRole('cell', { name: CUOTA_JUST_OUTSIDE })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: CUOTA_FURTHER_OUTSIDE })).toHaveCount(0);
  });

  test('both past-cutoff cuotas remain pending, untouched by the backdated payment', async () => {
    await gotoReady(page, '/pagos/nuevo');
    await selectOption(page, 'Casa', new RegExp(HOUSE_BOUNDARY.houseNumber));
    await page.getByRole('button', { name: 'Ingresar manualmente' }).click();
    await page.getByLabel('Monto recibido').fill('200');
    await page.getByLabel('Monto recibido').press('Tab');
    // Only shows once both remaining dues are fully covered with nothing
    // left over -- proves the balance left behind by the backdated payment
    // was exactly these two installments, not more or fewer.
    await expect(page.getByText('Con este pago, la casa queda al día.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Abono registrado correctamente.')).toBeVisible();
  });
});

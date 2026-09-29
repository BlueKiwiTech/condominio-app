import type { Page } from '@playwright/test';

// `next dev` compiles each route on first visit -- clicking before that
// finishes (and before React hydrates) makes the browser fall back to a
// native, JS-less form submission instead of the React handler. Every
// navigation in this suite goes through this instead of a bare page.goto().
export async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

// Shared shadcn/Base UI Select interaction -- the trigger is associated to
// its Label via id/htmlFor, so getByLabel finds it like any other field.
// `option` is exact-matched when given a full label (e.g. a currency name),
// or a substring/regex when only part of the option text is known (e.g. a
// house's option also includes its name/owner, which the caller may not
// know at the call site).
export async function selectOption(page: Page, labelText: string, option: string | RegExp) {
  await page.getByLabel(labelText, { exact: true }).click();
  const exact = typeof option === 'string';
  await page.getByRole('option', { name: option, exact }).click();
}

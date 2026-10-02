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

// components/ui/date-input.tsx is a Popover+Calendar (react-day-picker), not
// a native <input type="date"> -- there's no text to type into. Opens the
// popover behind `fieldId`'s trigger button, steps month-by-month using
// react-day-picker's default English nav labels (Calendar is never given a
// `locale` prop, so these stay English regardless of app locale), then
// clicks the target day via its `data-day` attribute (components/ui/
// calendar.tsx's CalendarDayButton sets it from `date.toLocaleDateString()`
// with no locale arg -- computed the same way here, in-page, so it matches
// whatever locale/timezone the browser actually runs under).
export async function pickDate(page: Page, fieldId: string, date: Date) {
  await page.locator(`#${fieldId}`).click();
  const today = new Date();
  const monthsDiff = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
  const label = monthsDiff < 0 ? 'Go to the Previous Month' : 'Go to the Next Month';
  for (let i = 0; i < Math.abs(monthsDiff); i++) {
    await page.getByRole('button', { name: label }).click();
  }
  const dataDay = await page.evaluate(
    ({ y, m, d }) => new Date(y, m, d).toLocaleDateString(),
    { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() },
  );
  await page.locator(`[data-day="${dataDay}"]`).click();
}

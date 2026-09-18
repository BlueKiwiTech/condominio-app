import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
  // Switcher is hidden (ES-only for now) — don't let the browser's
  // Accept-Language header or a stale NEXT_LOCALE cookie override that.
  localeDetection: false,
});

import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware Link/router/usePathname wrappers (next-intl's documented
// `createNavigation` helper) — used by the LocaleSwitcher to change locale
// for the current page without losing the current route (I18N-02).
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

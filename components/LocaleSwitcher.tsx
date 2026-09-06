'use client';

import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Row, Button } from '@once-ui-system/core';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

// I18N-02: switches locale for the current page without losing the user's
// place — re-navigates to the same pathname + query string, only the
// `locale` option changes (next-intl's documented pattern for this, see
// i18n/navigation.ts). Mounted once per top-level shell (auth layout,
// resident layout, admin dashboard) rather than duplicated per screen.
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const switchTo = (nextLocale: string) => {
    if (nextLocale === locale) return;
    router.replace(
      { pathname, query: Object.fromEntries(searchParams.entries()) },
      { locale: nextLocale },
    );
  };

  return (
    <Row gap="4" data-locale-switcher>
      {routing.locales.map((l) => (
        <Button
          key={l}
          size="s"
          variant={l === locale ? 'primary' : 'tertiary'}
          type="button"
          onClick={() => switchTo(l)}
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </Row>
  );
}

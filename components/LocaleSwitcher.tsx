'use client';

import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

// I18N-02: switches locale for the current page without losing the user's
// place — re-navigates to the same pathname + query string, only the
// `locale` option changes (next-intl's documented pattern for this, see
// i18n/navigation.ts).
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
    <div className="flex gap-1" data-locale-switcher>
      {routing.locales.map((l) => (
        <Button
          key={l}
          size="sm"
          variant={l === locale ? 'default' : 'ghost'}
          type="button"
          className={cn(l !== locale && 'text-muted-foreground')}
          onClick={() => switchTo(l)}
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

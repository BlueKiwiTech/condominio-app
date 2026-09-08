'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Row, Column, SmartLink, Icon, Text, type IconName } from '@once-ui-system/core';
import { residentLogout } from '@/lib/actions/residentAuth';

const TABS: { href: string; icon: IconName; labelKey: 'home' | 'cuotas' | 'payments' }[] = [
  { href: '/mi-hogar', icon: 'person', labelKey: 'home' },
  { href: '/mis-cuotas', icon: 'calendar', labelKey: 'cuotas' },
  { href: '/mis-pagos', icon: 'document', labelKey: 'payments' },
];

// V2/V3/V4's shared "bottom tab bar" (mobile-first, 390px per the Design
// Reference). Sticky rather than a hard position:fixed so it never overlaps
// content on very short viewports; usePathname (not next-intl's locale-aware
// routing helpers) is enough here since we only need a same-locale suffix
// match to highlight the active tab.
//
// "Cerrar sesión" lives here as a 4th tab-styled item (a <form> submit
// button, not a Link) instead of a separate button in the top header --
// keeps the header down to just the locale switcher and gives every
// resident action one consistent home at the bottom, matching how the
// other 3 destinations are presented.
export function ResidentTabBar() {
  const pathname = usePathname();
  const t = useTranslations('residentNav');

  return (
    <Row
      as="nav"
      fillWidth
      horizontal="around"
      paddingX="16"
      paddingY="8"
      gap="4"
      border="neutral-alpha-weak"
      background="page"
      style={{ position: 'sticky', bottom: 0, zIndex: 10 }}
    >
      {TABS.map((tab) => {
        const active = pathname.endsWith(tab.href);
        return (
          <SmartLink key={tab.href} href={tab.href} unstyled fillWidth>
            <Column horizontal="center" gap="4" paddingY="4">
              <Icon name={tab.icon} size="s" onBackground={active ? 'brand-strong' : 'neutral-weak'} />
              <Text variant="label-default-xs" onBackground={active ? 'brand-strong' : 'neutral-weak'}>
                {t(tab.labelKey)}
              </Text>
            </Column>
          </SmartLink>
        );
      })}
      <form action={residentLogout} style={{ display: 'contents' }}>
        <button type="submit" className="reset-button-styles" style={{ width: '100%', cursor: 'pointer' }}>
          <Column horizontal="center" gap="4" paddingY="4">
            <Icon name="logout" size="s" onBackground="neutral-weak" />
            <Text variant="label-default-xs" onBackground="neutral-weak">
              {t('logout')}
            </Text>
          </Column>
        </button>
      </form>
    </Row>
  );
}

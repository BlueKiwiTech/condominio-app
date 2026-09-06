'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Row, Column, SmartLink, Icon, Text, type IconName } from '@once-ui-system/core';

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
    </Row>
  );
}

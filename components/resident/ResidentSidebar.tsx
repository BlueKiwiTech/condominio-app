'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Row, Column, SmartLink, Icon, Text, Button, IconButton, Dialog, type IconName } from '@once-ui-system/core';
import { residentLogout } from '@/lib/actions/residentAuth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

type NavItem = { href: string; icon: IconName; labelKey: 'home' | 'cuotas' | 'payments' | 'profile' };

const ITEMS: NavItem[] = [
  { href: '/mi-hogar', icon: 'radialGauge', labelKey: 'home' },
  { href: '/mis-cuotas', icon: 'calendar', labelKey: 'cuotas' },
  { href: '/mis-pagos', icon: 'document', labelKey: 'payments' },
  { href: '/perfil', icon: 'person', labelKey: 'profile' },
];

// Resident (resident)/* sidebar -- deliberately mirrors components/admin/
// AdminSidebar.tsx structure/behavior (user request: unify the two shells
// instead of the resident portal's previous mobile-app bottom-tab-bar
// pattern). Desktop: fixed left column. Mobile (<=768px, the `s`
// breakpoint): a slim top bar + hamburger opening the same nav content in a
// Dialog, via one shared `navContent` render so the two variants can't
// drift apart -- same technique AdminSidebar already uses.
export function ResidentSidebar({ houseLabel }: { houseLabel: string | null }) {
  const pathname = usePathname();
  const t = useTranslations('residentNav');
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname.endsWith(href);

  const brand = (
    <Row gap="8" vertical="center" paddingX="8" paddingY="4">
      <Column
        horizontal="center"
        vertical="center"
        radius="m"
        background="brand-strong"
        style={{ width: 30, height: 30, flex: '0 0 30px' }}
      >
        <Text variant="label-strong-xs" style={{ color: '#fff' }}>
          AB
        </Text>
      </Column>
      <Column gap="2">
        <Text variant="label-strong-s">{t('brand.name')}</Text>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {t('brand.subtitle')}
        </Text>
      </Column>
    </Row>
  );

  const navContent = (onNavigate?: () => void) => (
    <Column gap="2">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <SmartLink
            key={item.href}
            href={item.href}
            unstyled
            fillWidth
            // Once UI's SmartLink/ElementType only wires an internal-Link
            // click to onLinkClick -- a plain `onClick` is captured but
            // silently discarded for the href-present branch (confirmed via
            // ElementType.js), so onClick alone would never close the
            // mobile menu on navigation. Not in SmartLink's own TS type,
            // but supported at runtime -- see the same fix in AdminSidebar.
            {...({ onLinkClick: onNavigate } as object)}
          >
            <Row
              gap="8"
              vertical="center"
              paddingX="8"
              radius="m"
              background={active ? 'brand-alpha-weak' : undefined}
              border={active ? 'brand-alpha-medium' : undefined}
              style={{ height: 34 }}
            >
              <Icon name={item.icon} size="s" onBackground={active ? 'brand-strong' : 'neutral-medium'} />
              <Text variant="label-default-s" onBackground={active ? 'brand-strong' : 'neutral-medium'}>
                {t(item.labelKey)}
              </Text>
            </Row>
          </SmartLink>
        );
      })}
    </Column>
  );

  const accountFooter = (
    <Column gap="8" style={{ marginTop: 'auto' }}>
      <LocaleSwitcher />
      <Row gap="8" vertical="center" paddingX="8" paddingY="8" radius="m" background="neutral-alpha-weak">
        <Column
          horizontal="center"
          vertical="center"
          radius="full"
          background="accent-alpha-weak"
          style={{ width: 26, height: 26, flex: '0 0 26px' }}
        >
          <Icon name="person" size="xs" onBackground="accent-strong" />
        </Column>
        <Column gap="0" style={{ minWidth: 0 }}>
          <Text variant="label-default-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {houseLabel ?? t('unknownHouse')}
          </Text>
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {t('roleLabel')}
          </Text>
        </Column>
      </Row>
      <form action={residentLogout}>
        <Button type="submit" variant="tertiary" size="s" fillWidth>
          {t('logout')}
        </Button>
      </form>
    </Column>
  );

  return (
    <>
      {/* Desktop sidebar — hidden at/below the `s` (768px) breakpoint */}
      <Column
        as="nav"
        gap="20"
        paddingX="12"
        paddingY="16"
        style={{ width: 232, flex: '0 0 232px', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto' }}
        background="neutral-weak"
        borderRight="neutral-alpha-weak"
        s={{ hide: true }}
      >
        {brand}
        {navContent()}
        {accountFooter}
      </Column>

      {/* Mobile top bar — hidden by default, shown only at/below `s` */}
      <Row
        as="header"
        hide
        s={{ hide: false }}
        fillWidth
        vertical="center"
        horizontal="between"
        paddingX="16"
        paddingY="12"
        background="neutral-weak"
        borderBottom="neutral-alpha-weak"
        style={{ position: 'sticky', top: 0, zIndex: 10 }}
      >
        <Row gap="8" vertical="center">
          <Column
            horizontal="center"
            vertical="center"
            radius="m"
            background="brand-strong"
            style={{ width: 26, height: 26, flex: '0 0 26px' }}
          >
            <Text variant="label-strong-xs" style={{ color: '#fff' }}>
              AB
            </Text>
          </Column>
          <Text variant="label-strong-s">{t('brand.name')}</Text>
        </Row>
        <IconButton
          icon="menu"
          variant="tertiary"
          tooltip={t('openMenu')}
          aria-label={t('openMenu')}
          onClick={() => setMobileOpen(true)}
        />
      </Row>

      <Dialog isOpen={mobileOpen} onClose={() => setMobileOpen(false)} title={t('menuTitle')}>
        <Column gap="20" fillWidth>
          {navContent(() => setMobileOpen(false))}
          {accountFooter}
        </Column>
      </Dialog>
    </>
  );
}

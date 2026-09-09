'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Row, Column, SmartLink, Icon, Text, Button, IconButton, Dialog, type IconName } from '@once-ui-system/core';
import { logout } from '@/lib/actions/auth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

type NavItem = { href: string; icon: IconName; labelKey: string };
type NavGroup = { titleKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    titleKey: 'groups.general',
    items: [
      { href: '/dashboard', icon: 'linearGauge', labelKey: 'items.dashboard' },
      { href: '/houses', icon: 'person', labelKey: 'items.houses' },
    ],
  },
  {
    titleKey: 'groups.collection',
    items: [
      { href: '/cuotas', icon: 'calendar', labelKey: 'items.cuotas' },
      { href: '/pagos/nuevo', icon: 'plus', labelKey: 'items.registerPayment' },
      { href: '/pagos-reportados', icon: 'checkbox', labelKey: 'items.paymentReports' },
    ],
  },
  {
    titleKey: 'groups.expenses',
    items: [{ href: '/gastos', icon: 'arrowUpRight', labelKey: 'items.gastos' }],
  },
  {
    titleKey: 'groups.reports',
    items: [
      { href: '/reporte', icon: 'clipboard', labelKey: 'items.report' },
      { href: '/pagos', icon: 'document', labelKey: 'items.paymentsHistory' },
    ],
  },
];

// Admin (admin)/* sidebar (matches design/reference/AdminNav.dc.html's
// layout, using Once UI's own icon set + tokens rather than the mockup's
// inline SVGs). Mounted once via app/[locale]/(admin)/layout.tsx so every
// admin screen (houses/cuotas/pagos/reporte/dashboard) gets consistent
// navigation + the locale switcher, instead of only the dashboard having a
// nav row (the gap flagged in PLAN.md's Phase 8 polish notes).
//
// Responsive (Phase 8 mobile polish pass): the desktop-fixed 232px column
// (below, `<=` Once UI's `s` breakpoint = 768px) is hidden below that
// width and replaced with a slim top bar + hamburger button that opens the
// exact same nav content inside a Dialog — one shared `NavContent` render
// so the two variants never drift out of sync.
export function AdminSidebar({ adminEmail }: { adminEmail: string | null }) {
  const pathname = usePathname();
  const t = useTranslations('adminNav');
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname.endsWith(href);
  const initials = adminEmail ? adminEmail.slice(0, 2).toUpperCase() : '—';

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

  const navGroups = (onNavigate?: () => void) => (
    <Column gap="16">
      {GROUPS.map((group) => (
        <Column key={group.titleKey} gap="2">
          <Text
            variant="label-default-xs"
            onBackground="neutral-weak"
            paddingX="8"
            paddingBottom="4"
            style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            {t(group.titleKey)}
          </Text>
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <SmartLink
                key={item.href}
                href={item.href}
                unstyled
                fillWidth
                // Once UI's SmartLink/ElementType only wires an internal-Link
                // click to onLinkClick -- a plain `onClick` is captured but
                // silently discarded for the href-present branch (confirmed
                // via ElementType.js), so onClick alone never closed the
                // mobile menu on navigation (pre-existing bug, found while
                // building the resident portal's equivalent sidebar). Not in
                // SmartLink's own TS type, but supported at runtime.
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
      ))}
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
          <Text variant="label-strong-xs" onBackground="accent-strong">
            {initials}
          </Text>
        </Column>
        <Column gap="0" style={{ minWidth: 0 }}>
          <Text variant="label-default-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {adminEmail ?? t('unknownAdmin')}
          </Text>
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {t('roleLabel')}
          </Text>
        </Column>
      </Row>
      <form action={logout}>
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
        {navGroups()}
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
          {navGroups(() => setMobileOpen(false))}
          {accountFooter}
        </Column>
      </Dialog>
    </>
  );
}

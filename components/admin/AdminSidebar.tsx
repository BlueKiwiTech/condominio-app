'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Users,
  Plus,
  ClipboardCheck,
  Calendar,
  Receipt,
  Copy,
  ClipboardList,
  FileText,
  CheckCircle2,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { logout } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type NavItem = { href: string; icon: LucideIcon; labelKey: string };
type NavGroup = { titleKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    titleKey: 'groups.general',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, labelKey: 'items.dashboard' },
      { href: '/houses', icon: Users, labelKey: 'items.houses' },
    ],
  },
  {
    titleKey: 'groups.collection',
    items: [
      { href: '/pagos/nuevo', icon: Plus, labelKey: 'items.registerPayment' },
      { href: '/pagos-reportados', icon: ClipboardCheck, labelKey: 'items.paymentReports' },
      { href: '/cuotas', icon: Calendar, labelKey: 'items.cuotas' },
    ],
  },
  {
    titleKey: 'groups.expenses',
    items: [
      { href: '/gastos', icon: Receipt, labelKey: 'items.gastos' },
      { href: '/gastos/plantillas', icon: Copy, labelKey: 'items.expenseTemplates' },
    ],
  },
  {
    titleKey: 'groups.reports',
    items: [
      { href: '/reporte', icon: ClipboardList, labelKey: 'items.report' },
      { href: '/pagos', icon: FileText, labelKey: 'items.paymentsHistory' },
      { href: '/gastos-pagados', icon: CheckCircle2, labelKey: 'items.expensePayments' },
    ],
  },
];

export function AdminSidebar({
  adminEmail,
  pendingReportsCount = 0,
}: {
  adminEmail: string | null;
  pendingReportsCount?: number;
}) {
  const pathname = usePathname();
  const t = useTranslations('adminNav');
  const isActive = (href: string) => pathname.endsWith(href);
  const initials = adminEmail ? adminEmail.slice(0, 2).toUpperCase() : '—';

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Image src="/logo-abc-mark.png" alt="ABC" width={36} height={37} className="w-[36px] h-[37px] shrink-0" priority />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold">{t('brand.name')}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{t('brand.subtitle')}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.titleKey}>
            <SidebarGroupLabel>{t(group.titleKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const showBadge = item.href === '/pagos-reportados' && pendingReportsCount > 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton render={<Link href={item.href} />} isActive={active}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuButton>
                      {showBadge && (
                        <SidebarMenuBadge>
                          <Badge variant="destructive" className="h-5 min-w-5 justify-center rounded-full px-1">
                            {pendingReportsCount}
                          </Badge>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{adminEmail ?? t('unknownAdmin')}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{t('roleLabel')}</span>
          </div>
        </div>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            {t('logout')}
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Building2, Calendar, FileText, LogOut, User, AlertTriangle, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { residentLogout } from '@/lib/actions/residentAuth';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

type NavItem = {
  href: string;
  icon: LucideIcon;
  labelKey: 'reportPayment' | 'community' | 'home' | 'cuotas' | 'payments' | 'profile';
  warning?: boolean;
};

export function ResidentSidebar({
  houseLabel,
  lastReportRejected = false,
  hasDuePayment = false,
}: {
  houseLabel: string | null;
  lastReportRejected?: boolean;
  hasDuePayment?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations('residentNav');
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = (href: string) => pathname.endsWith(href.split('?')[0]);
  // Tapping a nav link on mobile navigates but the offcanvas sheet stayed
  // open over the new page until manually dismissed -- close it on tap
  // (user request, 2026-09-20).
  const closeOnMobileNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  // "Reportar pago" deep-links into /mi-cartera with a query flag that
  // MisPagosClient reads on mount to auto-open ReportPaymentDialog.
  // Warning icons (board request 2026-09-21): Mis Pagos flags an actual due
  // cuota, Mi Cartera flags the last reported payment having been rejected
  // -- so a resident sees something needs attention without opening either
  // screen first.
  const items: NavItem[] = [
    { href: '/mi-cartera?report=1', icon: Plus, labelKey: 'reportPayment' },
    { href: '/mi-comunidad', icon: Building2, labelKey: 'community' },
    { href: '/mis-pagos', icon: Calendar, labelKey: 'cuotas', warning: hasDuePayment },
    { href: '/mi-cartera', icon: FileText, labelKey: 'payments', warning: lastReportRejected },
  ];

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Image src="/logo-abc-mark.png" alt="ABC" width={36} height={37} className="w-[36px] h-[37px] shrink-0" priority />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{t('brand.name')}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{t('brand.subtitle')}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} onClick={closeOnMobileNavigate} />}
                      isActive={active}
                      size="lg"
                    >
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                      {item.warning && (
                        <AlertTriangle
                          aria-label={t('needsAttention')}
                          className="ml-auto size-4 shrink-0 text-destructive"
                        />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
            <User className="size-3.5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{houseLabel ?? t('unknownHouse')}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{t('roleLabel')}</span>
          </div>
        </div>
        <form action={residentLogout}>
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

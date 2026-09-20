'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Building2, Calendar, FileText, LogOut, User, type LucideIcon } from 'lucide-react';
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
} from '@/components/ui/sidebar';

type NavItem = {
  href: string;
  icon: LucideIcon;
  labelKey: 'reportPayment' | 'community' | 'home' | 'cuotas' | 'payments' | 'profile';
};

// "Reportar pago" deep-links into /mis-pagos with a query flag that
// MisPagosClient reads on mount to auto-open ReportPaymentDialog.
const ITEMS: NavItem[] = [
  { href: '/mis-pagos?report=1', icon: Plus, labelKey: 'reportPayment' },
  { href: '/mi-comunidad', icon: Building2, labelKey: 'community' },
  { href: '/mis-cuotas', icon: Calendar, labelKey: 'cuotas' },
  { href: '/mis-pagos', icon: FileText, labelKey: 'payments' },
];

export function ResidentSidebar({ houseLabel }: { houseLabel: string | null }) {
  const pathname = usePathname();
  const t = useTranslations('residentNav');
  const isActive = (href: string) => pathname.endsWith(href.split('?')[0]);

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
              {ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton render={<Link href={item.href} />} isActive={active} size="lg">
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
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

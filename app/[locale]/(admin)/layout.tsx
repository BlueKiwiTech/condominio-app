import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

// Shared shell for every admin screen (dashboard/houses/cuotas/pagos/reporte)
// — proxy.ts already gates all of these via PROTECTED_PATHS + getClaims(),
// this redirect is defense in depth, same rationale the resident layout
// uses. Also the one place that mounts the AdminSidebar so every admin page
// gets consistent navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');

  const adminEmail = (data.claims as { email?: string }).email ?? null;

  // Lets the sidebar flag "Pagos reportados" with a count so the admin
  // notices there's something to review without opening the page first.
  // RLS (condo_payment_reports_admin_all) already scopes this to the
  // signed-in admin, same as the page itself.
  const { count: pendingReportsCount } = await supabase
    .from('condo_payment_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return (
    <SidebarProvider>
      <AdminSidebar adminEmail={adminEmail} pendingReportsCount={pendingReportsCount ?? 0} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <Image src="/logo-abc-mark.png" alt="ABC" width={28} height={29} className="w-[28px] h-[29px]" />
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

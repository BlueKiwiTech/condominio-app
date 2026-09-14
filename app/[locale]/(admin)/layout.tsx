import { redirect } from 'next/navigation';
import { Row, Column } from '@once-ui-system/core';
import { createClient } from '@/lib/supabase/server';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// Shared shell for every admin screen (dashboard/houses/cuotas/pagos/reporte)
// — mirrors the (resident)/layout.tsx pattern: proxy.ts already gates all of
// these via PROTECTED_PATHS + getClaims(), this redirect is defense in
// depth, same rationale the resident layout uses. Also the one place that
// mounts the AdminSidebar (matching design/reference/AdminNav.dc.html) so
// every admin page gets consistent navigation + the locale switcher instead
// of only the dashboard having its own ad hoc nav row.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');

  const adminEmail = (data.claims as { email?: string }).email ?? null;

  // Lets the sidebar flag "Pagos reportados" with a count so the admin
  // notices there's something to review without opening the page first
  // (user-requested, 2026-09-13). RLS (condo_payment_reports_admin_all)
  // already scopes this to the signed-in admin, same as the page itself.
  const { count: pendingReportsCount } = await supabase
    .from('condo_payment_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return (
    <Row fillWidth style={{ minHeight: '100vh' }} s={{ direction: 'column' }}>
      <AdminSidebar adminEmail={adminEmail} pendingReportsCount={pendingReportsCount ?? 0} />
      <Column fillWidth flex={1} style={{ overflowY: 'auto' }}>
        {children}
      </Column>
    </Row>
  );
}

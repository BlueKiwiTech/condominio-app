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

  return (
    <Row fillWidth style={{ minHeight: '100vh' }} s={{ direction: 'column' }}>
      <AdminSidebar adminEmail={adminEmail} />
      <Column fillWidth flex={1} style={{ overflowY: 'auto' }}>
        {children}
      </Column>
    </Row>
  );
}

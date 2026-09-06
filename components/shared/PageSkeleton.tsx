import { Column, Row, Skeleton } from '@once-ui-system/core';

// Shared loading-skeleton patterns (Phase 8 polish pass — PLAN.md flagged
// "a shared loading-skeleton pattern for slower data fetches has not been
// added anywhere"). Dropped into each admin/resident route's `loading.tsx`
// — Next.js's App Router renders this automatically while the sibling
// `page.tsx` (an async Server Component awaiting Supabase queries) is still
// resolving, no Suspense boundary wiring needed beyond the file convention.

// Generic list/table screens: Houses, Cuotas, Pagos, Reporte.
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Skeleton shape="line" width="l" height="l" />
      <Row gap="12" wrap>
        <Skeleton shape="block" height="xl" style={{ flex: '1 1 220px' }} />
        <Skeleton shape="block" height="xl" style={{ flex: '0 1 140px' }} />
      </Row>
      <Column gap="8" fillWidth>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} shape="block" height="l" fillWidth />
        ))}
      </Column>
    </Column>
  );
}

// A2 · Dashboard: heading + KPI card row + chart + list.
export function DashboardSkeleton() {
  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Skeleton shape="line" width="l" height="l" />
      <Row gap="16" wrap fillWidth>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="block" height="xl" style={{ flex: '1 1 220px' }} />
        ))}
      </Row>
      <Skeleton shape="block" height="xl" fillWidth style={{ height: 220 }} />
      <Column gap="8" fillWidth>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="block" height="l" fillWidth />
        ))}
      </Column>
    </Column>
  );
}

// Resident (mobile) screens: greeting/card stack, no table.
export function ResidentPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <Column fillWidth gap="16" paddingY="24" paddingX="20">
      <Skeleton shape="line" width="m" height="m" />
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} shape="block" height="xl" fillWidth />
      ))}
    </Column>
  );
}

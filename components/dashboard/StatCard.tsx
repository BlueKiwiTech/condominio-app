import type { ReactNode } from 'react';
import { Card, Flex, type Colors } from '@once-ui-system/core';

// Quiet-outline KPI card: thin border, flat surface, optional 3px stripe on
// top for semantic color (danger/warning/success/brand) instead of the
// old full-color fill. Approved direction, see components/dashboard/
// DashboardPageClient.tsx callers for the color-per-metric mapping.
export function StatCard({ stripeColor, children }: { stripeColor?: Colors; children: ReactNode }) {
  return (
    <Card
      radius="m"
      border="neutral-alpha-medium"
      background="surface"
      position="relative"
      overflow="hidden"
      padding="20"
      fillWidth
    >
      {stripeColor && (
        <Flex position="absolute" top="0" left="0" right="0" background={stripeColor} style={{ height: 3 }} />
      )}
      {children}
    </Card>
  );
}

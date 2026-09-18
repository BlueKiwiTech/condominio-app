import { Column } from '@once-ui-system/core';

// Root layout (app/[locale]/layout.tsx) already provides the CSS imports,
// NextIntlClientProvider and Providers wrapping for every nested segment —
// this route-group layout only adds the single centered auth-card shell
// shared by all five screens in Phase 2's UI-SPEC (plus resident-login,
// Phase 3). Locale switcher hidden — app is ES-only for now (I18N-02).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Column fillWidth center paddingY="48" paddingX="32" style={{ minHeight: '100vh' }}>
      {children}
    </Column>
  );
}

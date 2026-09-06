import { Column, Row } from '@once-ui-system/core';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

// Root layout (app/[locale]/layout.tsx) already provides the CSS imports,
// NextIntlClientProvider and Providers wrapping for every nested segment —
// this route-group layout only adds the single centered auth-card shell
// shared by all five screens in Phase 2's UI-SPEC (plus resident-login,
// Phase 3), with a locale switcher (I18N-02) available before login.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Column fillWidth center paddingY="48" paddingX="32" style={{ minHeight: '100vh' }}>
      <Row fillWidth horizontal="end" maxWidth={28} paddingBottom="16">
        <LocaleSwitcher />
      </Row>
      {children}
    </Column>
  );
}

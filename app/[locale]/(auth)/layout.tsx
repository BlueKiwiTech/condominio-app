// Root layout (app/[locale]/layout.tsx) already provides globals.css,
// NextIntlClientProvider and Providers wrapping for every nested segment —
// this route-group layout only adds the single centered auth-card shell
// shared by all auth screens. Locale switcher hidden — app is ES-only for
// now (I18N-02).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 px-4 py-12">
      {children}
    </div>
  );
}

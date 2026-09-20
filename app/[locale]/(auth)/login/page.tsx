import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetSuccess?: string; confirmError?: string }>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center gap-4 text-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          AB
        </div>
        <h1 className="text-2xl font-bold">{t('login.heading')}</h1>
      </CardHeader>
      <CardContent>
        <LoginForm
          initialSuccess={params.resetSuccess ? t('login.resetSuccess') : undefined}
          initialError={params.confirmError ? t('errors.confirmError') : undefined}
        />
      </CardContent>
    </Card>
  );
}

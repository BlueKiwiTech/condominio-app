import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { VerifyEmailActions } from '@/components/auth/VerifyEmailActions';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const t = await getTranslations('auth');
  const { email = '' } = await searchParams;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center gap-4 text-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          AB
        </div>
        <h1 className="text-2xl font-bold">{t('verifyEmail.heading')}</h1>
        <p className="text-center text-sm text-muted-foreground">{t('verifyEmail.body', { email })}</p>
      </CardHeader>
      <CardContent>
        <VerifyEmailActions email={email} />
      </CardContent>
    </Card>
  );
}

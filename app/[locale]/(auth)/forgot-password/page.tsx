import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center gap-4 text-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          AB
        </div>
        <h1 className="text-2xl font-bold">{t('forgotPassword.heading')}</h1>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}

import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <Image
        src="/logo-abc-mark.png"
        alt="ABC"
        width={200}
        height={205}
        className="h-[205px] w-[200px]"
        priority
      />
      <Card className="w-full">
      <CardHeader className="items-center text-center">
        <h1 className="text-2xl font-bold">{t('forgotPassword.heading')}</h1>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
    </div>
  );
}

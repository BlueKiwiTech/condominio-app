import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
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
        <h1 className="text-2xl font-bold">{t('verifyEmail.heading')}</h1>
        <p className="text-center text-sm text-muted-foreground">{t('verifyEmail.body', { email })}</p>
      </CardHeader>
      <CardContent>
        <VerifyEmailActions email={email} />
      </CardContent>
    </Card>
    </div>
  );
}

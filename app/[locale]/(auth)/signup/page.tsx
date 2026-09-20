import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SignupForm } from '@/components/auth/SignupForm';

export default async function SignupPage() {
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
        <h1 className="text-2xl font-bold">{t('signup.heading')}</h1>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
    </div>
  );
}

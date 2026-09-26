import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/LoginForm';
import packageJson from '@/package.json';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetSuccess?: string; confirmError?: string }>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;
  // VERCEL_GIT_COMMIT_SHA is a Vercel System Environment Variable (build +
  // runtime, requires "Enable access to System Environment Variables" in the
  // project's dashboard settings) — the full 40-char SHA, no short form, so
  // it's truncated here. Absent entirely in local dev, so the suffix is
  // simply omitted rather than showing "-undefined".
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const buildLabel = `v${packageJson.version}${commitSha ? `-${commitSha.slice(0, 5)}` : ''}`;

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
        <h1 className="text-2xl font-bold">{t('login.heading')}</h1>
      </CardHeader>
      <CardContent>
        <LoginForm
          initialSuccess={params.resetSuccess ? t('login.resetSuccess') : undefined}
          initialError={params.confirmError ? t('errors.confirmError') : undefined}
        />
      </CardContent>
    </Card>
      <span className="text-xs text-primary">{buildLabel}</span>
    </div>
  );
}

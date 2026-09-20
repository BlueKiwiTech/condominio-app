'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { resendVerificationEmail } from '@/lib/actions/auth';

export function VerifyEmailActions({ email }: { email: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleResend = () => {
    setServerError(null);
    startTransition(async () => {
      const result = await resendVerificationEmail(email, locale);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSent(true);
    });
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {sent && (
        <Alert>
          <AlertDescription>{t('verifyEmail.resendSent')}</AlertDescription>
        </Alert>
      )}
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Button variant="outline" size="lg" className="w-full" disabled={isPending} onClick={handleResend}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {t('verifyEmail.resend')}
      </Button>
      <Link href="/login" className="text-center text-sm text-primary hover:underline">
        {t('verifyEmail.backToLogin')}
      </Link>
    </div>
  );
}

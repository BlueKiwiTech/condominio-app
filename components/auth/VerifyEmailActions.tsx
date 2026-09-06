'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Column, Button, Feedback, SmartLink } from '@once-ui-system/core';
import { resendVerificationEmail } from '@/lib/actions/auth';

export function VerifyEmailActions({ email }: { email: string }) {
  const t = useTranslations('auth');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleResend = () => {
    setServerError(null);
    startTransition(async () => {
      const result = await resendVerificationEmail(email);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSent(true);
    });
  };

  return (
    <Column gap="16" fillWidth>
      {sent && <Feedback variant="success" description={t('verifyEmail.resendSent')} />}
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Button variant="secondary" fillWidth loading={isPending} onClick={handleResend}>
        {t('verifyEmail.resend')}
      </Button>
      <SmartLink href="/login">{t('verifyEmail.backToLogin')}</SmartLink>
    </Column>
  );
}

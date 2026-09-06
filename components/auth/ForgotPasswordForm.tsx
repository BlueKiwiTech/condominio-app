'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Column, Input, Button, Feedback, SmartLink } from '@once-ui-system/core';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validation/auth';
import { forgotPassword } from '@/lib/actions/auth';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (data: ForgotPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await forgotPassword(data);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return <Feedback variant="success" description={t('success.resetEmailSent')} />;
  }

  return (
    <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Input
        id="email"
        type="email"
        label={t('labels.email')}
        {...register('email')}
        error={!!errors.email}
        errorMessage={errors.email?.message}
      />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>
        {t('forgotPassword.cta')}
      </Button>
      <SmartLink href="/login">{t('forgotPassword.backToLogin')}</SmartLink>
    </Column>
  );
}

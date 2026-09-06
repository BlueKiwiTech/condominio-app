'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Column, PasswordInput, Button, Feedback } from '@once-ui-system/core';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validation/auth';
import { resetPassword } from '@/lib/actions/auth';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = (data: ResetPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await resetPassword(data);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
      {serverError && <Feedback variant="danger" description={serverError} />}
      <PasswordInput
        id="password"
        label={t('labels.password')}
        {...register('password')}
        error={!!errors.password}
        errorMessage={errors.password?.message}
      />
      <PasswordInput
        id="confirmPassword"
        label={t('labels.confirmPassword')}
        {...register('confirmPassword')}
        error={!!errors.confirmPassword}
        errorMessage={errors.confirmPassword?.message}
      />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>
        {t('resetPassword.cta')}
      </Button>
    </Column>
  );
}

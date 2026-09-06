'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Input, PasswordInput, Button, Feedback, SmartLink, Text } from '@once-ui-system/core';
import { loginSchema, type LoginInput } from '@/lib/validation/auth';
import { login } from '@/lib/actions/auth';

export function LoginForm({
  initialSuccess,
  initialError,
}: {
  initialSuccess?: string;
  initialError?: string;
}) {
  const t = useTranslations('auth');
  const tv = useTranslations('validation.auth');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(initialError ?? null);
  const [successMessage] = useState<string | null>(initialSuccess ?? null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema(tv)) });

  const onSubmit = (data: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login(data, locale);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
      {successMessage && <Feedback variant="success" description={successMessage} />}
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Input
        id="email"
        type="email"
        label={t('labels.email')}
        {...register('email')}
        error={!!errors.email}
        errorMessage={errors.email?.message}
      />
      <PasswordInput
        id="password"
        label={t('labels.password')}
        {...register('password')}
        error={!!errors.password}
        errorMessage={errors.password?.message}
      />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>
        {t('login.cta')}
      </Button>
      <SmartLink href="/forgot-password">{t('login.forgotPassword')}</SmartLink>
      <Text variant="label-default-s" onBackground="neutral-weak" align="center">
        {t('login.noAccount')} <SmartLink href="/signup">{t('login.signupLink')}</SmartLink>
      </Text>
      <Text variant="label-default-s" onBackground="neutral-weak" align="center">
        <SmartLink href="/resident-login">{t('login.residentLink')}</SmartLink>
      </Text>
    </Column>
  );
}

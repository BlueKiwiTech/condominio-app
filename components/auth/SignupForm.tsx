'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Column, Input, PasswordInput, Button, Feedback, SmartLink, Text } from '@once-ui-system/core';
import { signupSchema, type SignupInput } from '@/lib/validation/auth';
import { signup } from '@/lib/actions/auth';

export function SignupForm() {
  const t = useTranslations('auth');
  const tv = useTranslations('validation.auth');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema(tv)) });

  const onSubmit = (data: SignupInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signup(data, locale);
      if (result?.error) setServerError(result.error);
    });
  };

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
      <PasswordInput
        id="password"
        label={t('labels.password')}
        {...register('password')}
        error={!!errors.password}
        errorMessage={errors.password?.message}
      />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>
        {t('signup.cta')}
      </Button>
      <Text variant="label-default-s" onBackground="neutral-weak" align="center">
        {t('signup.haveAccount')}{' '}
        <SmartLink href="/login">{t('signup.loginLink')}</SmartLink>
      </Text>
    </Column>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-4">
      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">{t('labels.email')}</Label>
        <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t('labels.password')}</Label>
        <PasswordInput id="password" aria-invalid={!!errors.password} {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {t('login.cta')}
      </Button>
      <Link href="/forgot-password" className="text-sm text-primary hover:underline">
        {t('login.forgotPassword')}
      </Link>
      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="text-primary hover:underline">
          {t('login.signupLink')}
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/resident-login" className="text-primary hover:underline">
          {t('login.residentLink')}
        </Link>
      </p>
    </form>
  );
}

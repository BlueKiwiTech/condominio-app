import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading } from '@once-ui-system/core';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetSuccess?: string; confirmError?: string }>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;

  return (
    <Card maxWidth={24} padding="24" radius="l">
      <Column gap="24" fillWidth>
        <Heading variant="heading-strong-m" align="center">
          {t('login.heading')}
        </Heading>
        <LoginForm
          initialSuccess={params.resetSuccess ? t('login.resetSuccess') : undefined}
          initialError={params.confirmError ? t('errors.confirmError') : undefined}
        />
      </Column>
    </Card>
  );
}

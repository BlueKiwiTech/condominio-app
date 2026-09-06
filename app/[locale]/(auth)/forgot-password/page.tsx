import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading } from '@once-ui-system/core';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');

  return (
    <Card maxWidth={24} padding="24" radius="l">
      <Column gap="24" fillWidth>
        <Heading variant="heading-strong-m" align="center">
          {t('forgotPassword.heading')}
        </Heading>
        <ForgotPasswordForm />
      </Column>
    </Card>
  );
}

import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading } from '@once-ui-system/core';
import { SignupForm } from '@/components/auth/SignupForm';

export default async function SignupPage() {
  const t = await getTranslations('auth');

  return (
    <Card maxWidth={24} padding="24" radius="l">
      <Column gap="24" fillWidth>
        <Heading variant="heading-strong-m" align="center">
          {t('signup.heading')}
        </Heading>
        <SignupForm />
      </Column>
    </Card>
  );
}

import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading, Text } from '@once-ui-system/core';
import { VerifyEmailActions } from '@/components/auth/VerifyEmailActions';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const t = await getTranslations('auth');
  const { email = '' } = await searchParams;

  return (
    <Card maxWidth={24} padding="24" radius="l">
      <Column gap="24" fillWidth>
        <Heading variant="heading-strong-m" align="center">
          {t('verifyEmail.heading')}
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-weak" align="center">
          {t('verifyEmail.body', { email })}
        </Text>
        <VerifyEmailActions email={email} />
      </Column>
    </Card>
  );
}

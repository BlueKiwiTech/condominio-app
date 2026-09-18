import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading, Row } from '@once-ui-system/core';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetSuccess?: string; confirmError?: string }>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;

  return (
    <Row maxWidth={24} fillWidth>
      <Card fillWidth padding="24" radius="s">
        <Column gap="24" fillWidth>
          <Row horizontal="center" fillWidth>
            <Image src="/logo-abc.png" alt="ASOBARCELONA" width={256} height={256} priority />
          </Row>
          <Heading variant="heading-strong-m" align="center">
            {t('login.heading')}
          </Heading>
          <LoginForm
            initialSuccess={params.resetSuccess ? t('login.resetSuccess') : undefined}
            initialError={params.confirmError ? t('errors.confirmError') : undefined}
          />
        </Column>
      </Card>
    </Row>
  );
}

import { getTranslations } from 'next-intl/server';
import { Card, Column, Heading, Row } from '@once-ui-system/core';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');

  return (
    <Row maxWidth={24} fillWidth>
      <Card fillWidth padding="24" radius="l">
        <Column gap="24" fillWidth>
          <Heading variant="heading-strong-m" align="center">
            {t('resetPassword.heading')}
          </Heading>
          <ResetPasswordForm />
        </Column>
      </Card>
    </Row>
  );
}

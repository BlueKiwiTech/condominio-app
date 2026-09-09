'use client';

import { useTranslations } from 'next-intl';
import { Column, Row, Card, Heading, Text } from '@once-ui-system/core';
import type { ResidentPortalData } from '@/lib/resident/queries';

export function PerfilClient({ data }: { data: ResidentPortalData }) {
  const t = useTranslations('residentPerfil');
  const house = data.house!;

  const houseLabel = house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number;

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Column gap="4">
        <Heading variant="display-strong-s">{t('heading')}</Heading>
        <Text variant="body-default-m" onBackground="neutral-weak">
          {t('subtitle')}
        </Text>
      </Column>

      <Card padding="20" radius="l" fillWidth border="neutral-alpha-weak">
        <Column gap="16">
          <Row gap="24" wrap>
            <Column gap="4">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('houseNumber')}
              </Text>
              <Text variant="body-default-m">{houseLabel}</Text>
            </Column>
            {house.owner_name && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('owner')}
                </Text>
                <Text variant="body-default-m">{house.owner_name}</Text>
              </Column>
            )}
            {house.owner_phone && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('phone')}
                </Text>
                <Text variant="body-default-m">{house.owner_phone}</Text>
              </Column>
            )}
            {house.owner_email && (
              <Column gap="4">
                <Text variant="label-default-s" onBackground="neutral-weak">
                  {t('email')}
                </Text>
                <Text variant="body-default-m">{house.owner_email}</Text>
              </Column>
            )}
          </Row>
          {data.residents.length > 0 && (
            <Column gap="8">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('residents')}
              </Text>
              <Column gap="4">
                {data.residents.map((r) => (
                  <Text key={r.id} variant="body-default-s">
                    {r.resident_name}
                    {r.resident_phone ? ` · ${r.resident_phone}` : ''}
                  </Text>
                ))}
              </Column>
            </Column>
          )}
        </Column>
      </Card>
    </Column>
  );
}

import { Column, Heading, Text } from '@once-ui-system/core';

export default function Home() {
  return (
    <Column fillWidth center paddingY="64" gap="16">
      <Heading variant="display-strong-l">ASOBARCELONA</Heading>
      <Text variant="body-default-m" onBackground="neutral-weak">
        Condominio App — foundation deployed.
      </Text>
    </Column>
  );
}

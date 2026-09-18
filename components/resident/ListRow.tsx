import { Column, Row, Text, Tag, type TagProps } from '@once-ui-system/core';

// Standard resident-portal list row: title + subtitle on the left, amount
// (+ optional status tag) right-aligned as a block on the right -- used by
// MisCuotasClient's InstallmentCard, MiComunidadClient's expense breakdown,
// and MisPagosClient's payment/report rows so every list row in the portal
// reads the same way. Always a plain white/bordered row -- status is
// communicated only through the tag, never a colored background, so every
// row (paid, pending, rejected, confirmed) looks the same shape (board
// request 2026-09-18: consistency over status-coded backgrounds). A plain
// Row here (not nested inside a non-fillWidth Column) so `between` actually
// has the full card width to distribute across.
export function ListRow({
  title,
  subtitle,
  amount,
  tag,
}: {
  title: string;
  subtitle: string;
  amount: string;
  tag?: { label: string; variant: TagProps['variant'] };
}) {
  return (
    <Row fillWidth horizontal="between" vertical="center" padding="16" radius="s" border="neutral-alpha-weak">
      <Column gap="2">
        <Text variant="label-strong-s">{title}</Text>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {subtitle}
        </Text>
      </Column>
      <Column gap="4" horizontal="end">
        <Text variant="label-strong-s">{amount}</Text>
        {tag && <Tag variant={tag.variant} label={tag.label} />}
      </Column>
    </Row>
  );
}

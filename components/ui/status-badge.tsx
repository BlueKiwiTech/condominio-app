import { cn } from "cn"

export type PaymentStatus = "al-dia" | "proximo" | "vencido"

const STATUS_STYLES: Record<PaymentStatus, string> = {
  "al-dia": "bg-success/10 text-success",
  proximo: "bg-warning/10 text-warning",
  vencido: "bg-destructive/10 text-destructive",
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  "al-dia": "Al día",
  proximo: "Próximo a vencer",
  vencido: "Vencido",
}

/**
 * Payment-status pill used across morosos tables, cuota lists and payment
 * history. Always success/warning/destructive — never the brand color — so
 * "is this house behind" stays visually distinct from ordinary interactive
 * accents. See design-system/asobarcelona/MASTER.md.
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: PaymentStatus
  label?: string
  className?: string
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_STYLES[status],
        className
      )}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  )
}

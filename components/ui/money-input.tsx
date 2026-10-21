"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/currency"
import { parseMoneyInput } from "@/lib/money/parseMoney"

/**
 * Amount input in the app's es-VE convention ("." thousands, "," decimals, e.g.
 * "1.234,56"). The text is kept exactly as typed or pasted and parsed with
 * lib/money/parseMoney.ts, which reads "1.234,56" as 1234.56 and REJECTS what it
 * can't read unambiguously (signs, letters, "1e9", "1,000.50"...): the field shows
 * a message and reports `null` instead of silently changing the amount (QA round 1:
 * "1.000,50" had been read as 1,00 and "-5" as +5). Format-on-blur, not
 * live-reformatting, to avoid cursor-position bugs; the caller's `onChange` fires on
 * every keystroke with the parsed number (or null when empty/invalid), and the
 * caller's value always holds the raw number, never a formatted string.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  className,
  ...props
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  className?: string
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "id" | "disabled" | "className">) {
  const t = useTranslations("common")
  const [isFocused, setIsFocused] = React.useState(false)
  const [syncedValue, setSyncedValue] = React.useState(value)
  const [text, setText] = React.useState(() => (value === null ? "" : formatMoney(value)))
  const parsed = parseMoneyInput(text)

  // Adjust state during render when `value` changes from outside while
  // unfocused (e.g. an OCR prefill) -- React's documented pattern for
  // deriving state from a changed prop, not a useEffect (avoids the extra
  // render a setState-in-effect would trigger).
  if (!isFocused && value !== syncedValue) {
    setSyncedValue(value)
    setText(value === null ? "" : formatMoney(value))
  }

  return (
    <>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        className={className}
        value={text}
        aria-invalid={parsed.error || undefined}
        onFocus={() => {
          setIsFocused(true)
          setText(value === null ? "" : String(value).replace(".", ","))
        }}
        onChange={(e) => {
          const next = e.target.value.slice(0, 24)
          setText(next)
          onChange(parseMoneyInput(next).value)
        }}
        onBlur={() => {
          setIsFocused(false)
          const result = parseMoneyInput(text)
          setSyncedValue(result.value)
          onChange(result.value)
          // A valid amount is reformatted; an invalid one is left as typed (with its
          // message) so the user sees what is wrong instead of an emptied field.
          if (!result.error) setText(result.value === null ? "" : formatMoney(result.value))
        }}
        {...props}
      />
      {parsed.error && (
        <p className="text-xs text-destructive" data-testid="money-input-error">
          {t("moneyInputInvalid")}
        </p>
      )}
      {/* "1.500" is read as one thousand five hundred (the app's own format): show the reading
          while typing so a keyboard that uses "." for decimals can't turn 1,5 into 1500 unseen. */}
      {isFocused && !parsed.error && parsed.value !== null && /[.,]/.test(text) && (
        <p className="text-xs text-muted-foreground" data-testid="money-input-reads">
          {t("moneyInputReads", { amount: formatMoney(parsed.value) })}
        </p>
      )}
    </>
  )
}

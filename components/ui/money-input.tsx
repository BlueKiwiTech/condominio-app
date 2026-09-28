"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/currency"

/**
 * Amount input matching lib/currency.ts's formatMoney display convention
 * (es-VE: "." thousands, "," decimals, e.g. "1.234,56") -- format-on-blur,
 * not live-reformatting-while-typing, to avoid cursor-position bugs. While
 * focused the field shows a plain editable numeric string using "." as the
 * decimal point; on blur it reformats and the caller's value always holds
 * the raw number, never a formatted string.
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
  const [isFocused, setIsFocused] = React.useState(false)
  const [syncedValue, setSyncedValue] = React.useState(value)
  const [text, setText] = React.useState(() => (value === null ? "" : formatMoney(value)))

  // Adjust state during render when `value` changes from outside while
  // unfocused (e.g. an OCR prefill) -- React's documented pattern for
  // deriving state from a changed prop, not a useEffect (avoids the extra
  // render a setState-in-effect would trigger).
  if (!isFocused && value !== syncedValue) {
    setSyncedValue(value)
    setText(value === null ? "" : formatMoney(value))
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className={className}
      value={text}
      onFocus={() => {
        setIsFocused(true)
        setText(value === null ? "" : String(value))
      }}
      onPaste={(e) => {
        // A paste is exactly the one case the generic typing filter below
        // can't safely handle: a user pasting an amount already in this
        // app's own es-VE display convention (e.g. "1.234,56", copied from
        // a receipt or payment list) would otherwise have its "." silently
        // treated as the decimal point and its "," dropped, corrupting the
        // value by ~1000x. Parse the pasted text as es-VE FIRST -- strip
        // every "." (thousands) and take "," as the decimal point -- and
        // only fall through to the generic filter if that doesn't produce
        // a valid number (e.g. a plain "1234.56" paste, which es-VE parsing
        // would mis-simplify to 123456 -- so it's not tried blindly).
        const pasted = e.clipboardData.getData("text").trim()
        if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(pasted) || /^\d+,\d+$/.test(pasted)) {
          const asEsVe = Number(pasted.replace(/\./g, "").replace(",", "."))
          if (Number.isFinite(asEsVe)) {
            e.preventDefault()
            setText(String(asEsVe))
          }
        }
      }}
      onChange={(e) => {
        // Keep digits plus AT MOST ONE decimal separator ("." or ",",
        // whichever comes first -- forgiving of comma-as-decimal muscle
        // memory) -- every later "." or "," is dropped. This keeps the
        // focused-state text unambiguous: exactly zero or one separator
        // character, so blur-time parsing never has to guess whether a
        // character is a thousands separator or the decimal point (the one
        // obvious way a naive filter would corrupt a pasted/typed value).
        let seenSeparator = false
        let out = ""
        for (const ch of e.target.value) {
          if (ch >= "0" && ch <= "9") out += ch
          else if ((ch === "." || ch === ",") && !seenSeparator) {
            out += ch
            seenSeparator = true
          }
        }
        setText(out)
      }}
      onBlur={() => {
        setIsFocused(false)
        const normalized = text.replace(",", ".").trim()
        const parsed = normalized === "" ? null : Number(normalized)
        const valid = parsed !== null && Number.isFinite(parsed)
        setSyncedValue(valid ? parsed : null)
        onChange(valid ? parsed : null)
        setText(valid ? formatMoney(parsed as number) : "")
      }}
      {...props}
    />
  )
}

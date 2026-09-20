"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Drop-in replacement for Once UI's <DateInput>: Popover + Calendar behind
 * a button styled like a text input, with the same
 * id/label/value/onChange/minDate/maxDate/placeholder surface.
 */
export function DateInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  minDate,
  maxDate,
  disabled,
  className,
}: {
  id: string
  label?: string
  value?: Date
  onChange?: (date: Date) => void
  placeholder?: string
  minDate?: Date
  maxDate?: Date
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={cn("grid gap-2", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className="w-full justify-start text-left font-normal"
            />
          }
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {value ? format(value, "dd/MM/yyyy") : <span className="text-muted-foreground">{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              if (date) {
                onChange?.(date)
                setOpen(false)
              }
            }}
            disabled={(date) =>
              (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false)
            }
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

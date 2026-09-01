import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  onChange,
  onValueChange,
  isInvalid,
  isDisabled,
  disabled,
  ...props
}: React.ComponentProps<"textarea"> & {
  onValueChange?: (value: string) => void
  isInvalid?: boolean
  isDisabled?: boolean
}) {
  const isInputDisabled = disabled || isDisabled
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) onChange(e)
    if (onValueChange) onValueChange(e.target.value)
  }

  return (
    <textarea
      data-slot="textarea"
      disabled={isInputDisabled}
      onChange={handleChange}
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-3 text-base transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        isInvalid && "border-destructive focus-visible:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

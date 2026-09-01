import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  onChange,
  onValueChange,
  isInvalid,
  isDisabled,
  disabled,
  ...props
}: React.ComponentProps<"input"> & {
  onValueChange?: (value: string) => void
  isInvalid?: boolean
  isDisabled?: boolean
}) {
  const isInputDisabled = disabled || isDisabled
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) onChange(e)
    if (onValueChange) onValueChange(e.target.value)
  }

  return (
    <input
      type={type}
      data-slot="input"
      disabled={isInputDisabled}
      onChange={handleChange}
      className={cn(
        "h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 py-1 text-base transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        isInvalid && "border-destructive focus-visible:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }

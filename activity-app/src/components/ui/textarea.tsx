import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textareaVariants = cva(
  "flex field-sizing-content w-full text-base transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "min-h-16 resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
        ghost:
          "min-h-8 resize-none rounded-lg border border-transparent bg-transparent px-1 py-0 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 pointer-coarse:min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea, textareaVariants }

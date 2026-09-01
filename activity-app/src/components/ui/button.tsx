import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        danger:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        tertiary:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        md: "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9 p-0",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  isDisabled,
  disabled,
  isLoading,
  isIconOnly,
  onPress,
  onClick,
  children,
  ...props
}: any) {
  const isBtnDisabled = disabled || isDisabled || isLoading
  const computedSize = isIconOnly ? "icon" : size
  const mappedVariant = variant === "primary" ? "default" : variant

  const handleClick = (e: any) => {
    if (onClick) onClick(e)
    if (onPress) onPress(e)
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={mappedVariant}
      data-size={computedSize}
      disabled={isBtnDisabled}
      onClick={handleClick}
      className={cn(buttonVariants({ variant: mappedVariant, size: computedSize, className }))}
      {...props}
    >
      {isLoading ? (
        <span className="mr-1 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }

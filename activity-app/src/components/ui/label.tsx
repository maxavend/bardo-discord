"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

const Description = ({ className, children, ...props }: any) => (
  <p className={cn("text-xs text-muted-foreground", className)} {...props}>
    {children}
  </p>
);

const Header = ({ className, children, ...props }: any) => (
  <header className={cn("text-sm font-semibold tracking-tight", className)} {...props}>
    {children}
  </header>
);

const TextField = ({ className, children, ...props }: any) => (
  <div className={cn("flex flex-col gap-1.5", className)} {...props}>
    {children}
  </div>
);

const Toolbar = ({ className, children, ...props }: any) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export { Label, Description, Header, TextField, Toolbar }

"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  viewportProps,
  contentClassName,
  contentStyle,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  contentStyle?: React.CSSProperties
  contentClassName?: string
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...viewportProps}
        data-slot="scroll-area-viewport"
        className={cn("size-full rounded-[inherit] outline-none", viewportProps?.className)}
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content" className={contentClassName} style={contentStyle}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-(--scrollbar-thumb) hover:bg-(--scrollbar-thumb-hover) transition-colors"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

// Surface stays outside the mask; only overflowing content fades.
function OverlayScrollArea({className, viewportProps, contentStyle, ...props}: React.ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      className={cn("overlay-scroll-area min-h-0 max-h-[inherit]", className)}
      contentStyle={{minWidth: 0, ...contentStyle}}
      viewportProps={{
        ...viewportProps,
        className: cn("scroll-fade scroll-fade-4 motion-reduce:scroll-fade-none overscroll-contain scroll-py-4", viewportProps?.className),
        style: {maxHeight: "inherit", ...viewportProps?.style},
      }}
      {...props}
    />
  )
}

export { ScrollArea, ScrollBar, OverlayScrollArea }

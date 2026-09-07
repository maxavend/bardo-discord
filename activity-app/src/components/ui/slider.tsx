"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  ariaLabel = "Valor",
  ...props
}: SliderPrimitive.Root.Props & {
  ariaLabel?: string
}) {
  const source = value ?? defaultValue ?? min
  const values = Array.isArray(source) ? source : [source]

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex w-full items-center py-2.5"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full overflow-visible rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="absolute h-full rounded-full bg-primary"
          />
          {values.map((_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              index={index}
              aria-label={values.length === 1 ? ariaLabel : `${ariaLabel} ${index + 1}`}
              data-slot="slider-thumb"
              className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-[box-shadow,transform] focus-visible:ring-3 focus-visible:ring-ring/30 data-dragging:scale-110"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

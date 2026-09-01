import * as React from "react";
import { cn } from "@/lib/utils";

export const ButtonGroup = ({ children, className, ...props }) => (
  <div className={cn("inline-flex items-center rounded-md shadow-sm", className)} {...props}>
    {children}
  </div>
);

ButtonGroup.Separator = ({ className }) => (
  <div className={cn("h-4 w-px bg-border my-auto mx-1", className)} aria-hidden="true" />
);

export const ToggleButton = React.forwardRef(({ className, isSelected, onPress, onClick, ...props }, ref) => {
  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (onPress) onPress(e);
  };
  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      data-state={isSelected ? "on" : "off"}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground cursor-pointer px-2.5 py-1.5",
        className
      )}
      {...props}
    />
  );
});
ToggleButton.displayName = "ToggleButton";

export const ToggleButtonGroup = ({ children, className, ...props }) => (
  <div className={cn("inline-flex items-center rounded-md bg-muted p-1", className)} {...props}>
    {children}
  </div>
);

ToggleButtonGroup.Separator = ButtonGroup.Separator;

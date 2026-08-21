import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children, delay = 500 }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={delay} render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner sideOffset={8} className="bardo-tooltip-positioner">
          <TooltipPrimitive.Popup className="bardo-tooltip-popup">
            <TooltipPrimitive.Arrow className="bardo-tooltip-arrow" />
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

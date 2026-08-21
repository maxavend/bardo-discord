import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '../../lib/cn.js';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverTitle = PopoverPrimitive.Title;
export const PopoverDescription = PopoverPrimitive.Description;

export function PopoverContent({ className, children, sideOffset = 8, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner className="bardo-ui-float-positioner" sideOffset={sideOffset}>
        <PopoverPrimitive.Popup className={cn('bardo-ui-popover-popup', className)} {...props}>{children}</PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

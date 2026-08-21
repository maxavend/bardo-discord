import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export const Select = SelectPrimitive.Root;

export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger className={cn('bardo-ui-select-trigger', className)} {...props}>
      {children ?? <SelectPrimitive.Value />}
      <SelectPrimitive.Icon className="bardo-ui-select-icon"><ChevronDown aria-hidden="true" size={15} /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, sideOffset = 6, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className="bardo-ui-float-positioner" sideOffset={sideOffset}>
        <SelectPrimitive.Popup className={cn('bardo-ui-select-popup', className)} {...props}>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn('bardo-ui-select-item', className)} {...props}>
      <SelectPrimitive.ItemIndicator className="bardo-ui-item-indicator"><Check aria-hidden="true" size={14} /></SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

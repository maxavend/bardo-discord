import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuSeparator = MenuPrimitive.Separator;

export function DropdownMenuContent({ className, children, sideOffset = 6, ...props }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="bardo-ui-float-positioner" sideOffset={sideOffset}>
        <MenuPrimitive.Popup className={cn('bardo-ui-menu-popup', className)} {...props}>{children}</MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }) {
  return <MenuPrimitive.Item className={cn('bardo-ui-menu-item', className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }) {
  return (
    <MenuPrimitive.CheckboxItem className={cn('bardo-ui-menu-item', className)} {...props}>
      <MenuPrimitive.CheckboxItemIndicator className="bardo-ui-item-indicator"><Check aria-hidden="true" size={14} /></MenuPrimitive.CheckboxItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

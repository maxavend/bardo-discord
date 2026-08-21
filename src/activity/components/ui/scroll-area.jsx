import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { cn } from '../../lib/cn.js';

export function ScrollArea({ className, children, ...props }) {
  return (
    <ScrollAreaPrimitive.Root className={cn('bardo-ui-scroll-area', className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="bardo-ui-scroll-viewport"><ScrollAreaPrimitive.Content>{children}</ScrollAreaPrimitive.Content></ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar className="bardo-ui-scrollbar"><ScrollAreaPrimitive.Thumb className="bardo-ui-scroll-thumb" /></ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '../../lib/cn.js';

export const Tabs = TabsPrimitive.Root;
export const TabsPanel = TabsPrimitive.Panel;

export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn('bardo-ui-tabs-list', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Tab className={cn('bardo-ui-tabs-trigger', className)} {...props} />;
}

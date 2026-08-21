import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '../../lib/cn.js';

export function Switch({ className, ...props }) {
  return <SwitchPrimitive.Root className={cn('bardo-ui-switch', className)} {...props}><SwitchPrimitive.Thumb className="bardo-ui-switch-thumb" /></SwitchPrimitive.Root>;
}

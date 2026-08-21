import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root className={cn('bardo-ui-checkbox', className)} {...props}>
      <CheckboxPrimitive.Indicator><Check aria-hidden="true" size={13} strokeWidth={3} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

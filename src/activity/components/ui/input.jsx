import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '../../lib/cn.js';

export function Input({ className, ...props }) {
  return <InputPrimitive className={cn('bardo-ui-input', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('bardo-ui-input bardo-ui-textarea', className)} {...props} />;
}

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

export const buttonVariants = cva('bardo-ui-button', {
  variants: {
    variant: {
      primary: 'bardo-ui-button--primary',
      secondary: 'bardo-ui-button--secondary',
      ghost: 'bardo-ui-button--ghost',
      danger: 'bardo-ui-button--danger',
    },
    size: {
      compact: 'bardo-ui-button--compact',
      default: 'bardo-ui-button--default',
      icon: 'bardo-ui-button--icon',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
});

export function Button({ className, variant, size, ...props }) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

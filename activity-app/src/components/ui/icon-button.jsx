import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Secondary action shown as an icon. Bardo's action hierarchy:
 * one primary button with text per view, frequent secondary actions as
 * IconButton (tooltip + accessible name), everything else in the "⋯" menu.
 * The label is the accessible name and the tooltip, so it must name the
 * action ("Editar reunión"), not the icon.
 */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'icon-sm',
  tooltipSide = 'bottom',
  className,
  ...props
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            className={cn(
              'rounded-full',
              variant === 'ghost' && 'text-muted-foreground hover:text-foreground',
              className,
            )}
            {...props}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}

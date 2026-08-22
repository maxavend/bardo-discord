import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from './button.jsx';
import { cn } from '../../lib/cn.js';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({ className, children, showClose = true, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="bardo-dialog-backdrop" />
      <DialogPrimitive.Viewport className="bardo-dialog-viewport">
        <DialogPrimitive.Popup className={cn('bardo-dialog-popup', className)} {...props}>
          {children}
          {showClose ? (
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon" className="bardo-dialog-close" aria-label="Cerrar"><X aria-hidden="true" size={17} /></Button>} />
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

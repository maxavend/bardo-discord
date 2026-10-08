import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Flag } from 'lucide-react';

/**
 * Confirmation before ending a meeting ("Terminar reunión"). Anyone can end a
 * meeting, but never with a single accidental tap; it can be reopened later
 * from the summary ("Reabrir reunión").
 */
export function FinishMeetingDialog({
  isOpen,
  hasActiveRecording,
  activeRecordingName,
  elapsedMinutes = 0,
  recordingsCount = 0,
  decisionsCount = 0,
  pendingTemasCount = 0,
  onClose,
  onConfirm,
  onConfirmInterrupt,
}) {
  const confirm = onConfirm || onConfirmInterrupt;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Flag className="size-4" />
            </div>
            <DialogTitle>¿Terminar la reunión?</DialogTitle>
          </div>
          <DialogDescription className="text-left text-xs leading-relaxed pt-2">
            Se guardarán los <strong className="text-foreground font-semibold">{elapsedMinutes} min</strong> de reunión,{' '}
            <strong className="text-foreground font-semibold">{recordingsCount} {recordingsCount === 1 ? 'grabación' : 'grabaciones'}</strong> y{' '}
            <strong className="text-foreground font-semibold">{decisionsCount} {decisionsCount === 1 ? 'acuerdo' : 'acuerdos'}</strong>.
            {hasActiveRecording && (
              <> La grabación en curso de <strong className="text-foreground font-semibold">“{activeRecordingName || 'este tema'}”</strong> se detendrá y se guardará.</>
            )}
            {pendingTemasCount > 0 && (
              <> Quedan <strong className="text-foreground font-semibold">{pendingTemasCount} {pendingTemasCount === 1 ? 'tema pendiente' : 'temas pendientes'}</strong> sin tratar.</>
            )}
            {' '}Si te equivocas, podrás reabrirla desde el resumen.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Seguir en la reunión
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={confirm}
            className="font-medium text-xs px-3.5"
          >
            Terminar reunión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Backwards-compatible name.
export const SessionInterruptModal = FinishMeetingDialog;

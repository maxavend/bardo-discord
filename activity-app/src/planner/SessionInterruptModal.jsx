import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';

export function SessionInterruptModal({
  isOpen,
  hasActiveRecording,
  activeRecordingName,
  onClose,
  onConfirmInterrupt,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <AlertCircle className="size-4" />
            </div>
            <DialogTitle>¿Interrumpir la reunión?</DialogTitle>
          </div>
          <DialogDescription className="text-left text-xs leading-relaxed pt-2">
            {hasActiveRecording ? (
              <>
                Bardo guardará la grabación de <strong className="text-foreground font-semibold">“{activeRecordingName || 'este punto'}”</strong> y conservará el progreso de la reunión. Podrás reanudarla después.
              </>
            ) : (
              <>
                El progreso, los acuerdos y las grabaciones quedarán guardados. Podrás reanudar la reunión después.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Continuar reunión
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirmInterrupt}
            className="font-medium text-xs px-3.5"
          >
            Interrumpir reunión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

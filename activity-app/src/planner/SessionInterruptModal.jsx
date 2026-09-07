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
  elapsedMinutes,
  recordingsCount,
  decisionsCount,
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
            <DialogTitle>¿Pausar esta reunión?</DialogTitle>
          </div>
          <DialogDescription className="text-left text-xs leading-relaxed pt-2">
            {hasActiveRecording ? (
              <>
                Se guardará automáticamente la grabación en curso de <strong className="text-foreground font-semibold">“{activeRecordingName || 'este tema'}”</strong> y se conservarán los <strong className="text-foreground font-semibold">{elapsedMinutes} min de actividad</strong>, <strong className="text-foreground font-semibold">{recordingsCount} grabaciones previas</strong> y <strong className="text-foreground font-semibold">{decisionsCount} decisiones</strong> registradas hasta ahora.
              </>
            ) : (
              <>
                Se conservarán los <strong className="text-foreground font-semibold">{elapsedMinutes} min de actividad</strong>, <strong className="text-foreground font-semibold">{recordingsCount} grabaciones</strong> y <strong className="text-foreground font-semibold">{decisionsCount} decisiones</strong> registradas hasta ahora. Podrás reanudar la reunión cuando quieras.
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
            variant="default"
            size="sm"
            onClick={onConfirmInterrupt}
            className="font-medium text-xs px-3.5"
          >
            Pausar reunión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

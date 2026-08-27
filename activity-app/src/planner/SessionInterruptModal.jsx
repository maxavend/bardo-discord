import {
  Modal,
  Button,
} from '@heroui/react';
import {
  CircleExclamation,
} from '@gravity-ui/icons';

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
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="sm">
        <Modal.Dialog className="bg-surface border border-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-w-md w-full">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-warning/15 text-warning flex items-center justify-center">
                <CircleExclamation width={16} height={16} />
              </div>
              <h2 className="text-base font-bold text-foreground">
                ¿Interrumpir esta sesión?
              </h2>
            </div>

            {hasActiveRecording ? (
              <p className="text-xs text-muted leading-relaxed">
                Se guardará automáticamente la grabación en curso de <strong className="text-foreground font-semibold">“{activeRecordingName || 'este punto'}”</strong> y se conservarán los <strong className="text-foreground font-semibold">{elapsedMinutes} min de actividad</strong>, <strong className="text-foreground font-semibold">{recordingsCount} grabaciones previas</strong> y <strong className="text-foreground font-semibold">{decisionsCount} decisiones</strong> registradas hasta ahora.
              </p>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Se conservarán los <strong className="text-foreground font-semibold">{elapsedMinutes} min de actividad</strong>, <strong className="text-foreground font-semibold">{recordingsCount} grabaciones</strong> y <strong className="text-foreground font-semibold">{decisionsCount} decisiones</strong> registradas hasta ahora. Podrás reanudar la sesión cuando quieras.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <Button
              variant="ghost"
              size="sm"
              onPress={onClose}
              className="text-xs text-muted hover:text-foreground"
            >
              Seguir en la sesión
            </Button>

            <Button
              variant="primary"
              size="sm"
              onPress={onConfirmInterrupt}
              className="font-medium text-xs px-3.5"
            >
              Interrumpir y conservar
            </Button>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

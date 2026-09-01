import {useState, useEffect} from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Microphone,
  Clock,
} from '@gravity-ui/icons';
import {formatMsToClock} from './session-assistant-engine.js';

export function RecordingSaveModal({
  isOpen,
  recordingEntity,
  onClose,
  onSave,
  onDiscard,
}) {
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (recordingEntity) {
      setCustomName(recordingEntity.name || recordingEntity.pointTitle || recordingEntity.blockTitle || 'Grabación');
    }
  }, [recordingEntity]);

  if (!recordingEntity) return null;

  const durationClock = formatMsToClock(recordingEntity.durationMs || 0);
  const sourcesLabel = recordingEntity.sourcesLabel || 'Micrófono';
  const parentContext = recordingEntity.pointTitle && recordingEntity.blockTitle && recordingEntity.pointTitle !== recordingEntity.blockTitle
    ? recordingEntity.blockTitle
    : null;

  const handleConfirmSave = () => {
    const trimmed = customName.trim() || recordingEntity.name || 'Grabación';
    onSave({
      ...recordingEntity,
      name: trimmed,
    });
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="sm">
        <Modal.Dialog className="container-surface bg-surface border border-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-w-md w-full">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-accent">
                <Microphone width={14} height={14} />
              </div>
              <h2 className="text-base font-bold text-foreground">
                Grabación finalizada
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Revisa el nombre de la grabación antes de guardarla.
            </p>
          </div>

          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-medium text-foreground">Nombre de la grabación</label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nombre de la grabación"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmSave();
                }}
              />
            </div>

            {/* Context & Duration Pills */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border/40 text-xs">
              <div className="flex flex-col min-w-0">
                {parentContext && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {parentContext}
                  </span>
                )}
                <span className="text-xs font-semibold text-foreground truncate">
                  {sourcesLabel}
                </span>
              </div>

              <div className="flex items-center gap-1 text-primary font-semibold shrink-0">
                <Clock width={12} height={12} />
                <span>{durationClock}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDiscard}
              className="text-xs"
            >
              Descartar
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmSave}
                className="font-medium text-xs px-4"
              >
                Guardar grabación
              </Button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

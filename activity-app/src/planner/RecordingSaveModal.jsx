import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Mic, Clock } from 'lucide-react';
import { formatMsToClock } from './session-assistant-engine.js';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Mic className="size-4" />
            </div>
            <DialogTitle>Grabación finalizada</DialogTitle>
          </div>
          <DialogDescription>
            Revisa el nombre de la grabación antes de guardarla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <Field>
            <FieldLabel>Nombre de la grabación</FieldLabel>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nombre de la grabación"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmSave();
              }}
            />
          </Field>

          {/* Context & Duration Pills */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/50 border border-border text-xs">
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

            <div className="flex items-center gap-1.5 text-primary font-semibold shrink-0">
              <Clock className="size-3.5" />
              <span>{durationClock}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={onDiscard}
            className="text-xs"
          >
            Descartar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleConfirmSave}
            className="font-medium text-xs px-4"
          >
            Guardar grabación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

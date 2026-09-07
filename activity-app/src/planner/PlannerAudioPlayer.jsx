import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Play,
  Pause,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Info,
} from 'lucide-react';
import { formatMsToClock } from './session-assistant-engine.js';

export function PlannerAudioPlayer({ recording, onRename, onDelete }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showTechModal, setShowTechModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [renameValue, setRenameValue] = useState(recording?.name || '');
  const audioRef = useRef(null);

  const durationMs = recording?.durationMs || 0;
  const currentFormatted = formatMsToClock(currentTimeMs);
  const totalFormatted = formatMsToClock(durationMs);
  const canPlay = Boolean(recording?.blobUrl);
  const isPending = recording?.status === 'pending';
  const hasPersistenceError = recording?.status === 'error';
  const progressPercent = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;
  const fileSizeKb = recording?.fileSize ? Math.round(recording.fileSize / 1024) : 0;
  const segmentsCount = recording?.segmentsCount || recording?.segments?.length || 1;

  useEffect(() => {
    setRenameValue(recording?.name || '');
  }, [recording?.name]);

  useEffect(() => {
    if (!recording?.blobUrl) {
      setIsPlaying(false);
      setCurrentTimeMs(0);
    }
  }, [recording?.blobUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !canPlay) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => setIsPlaying(false));
  };

  const handleSeek = (value) => {
    const percent = Number(Array.isArray(value) ? value[0] : value);
    const nextTimeMs = (percent / 100) * durationMs;
    setCurrentTimeMs(nextTimeMs);
    if (audioRef.current) audioRef.current.currentTime = nextTimeMs / 1000;
  };

  const handleConfirmRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && onRename) onRename(recording.id, trimmed);
    setShowRenameModal(false);
  };

  const handleEmergencyDownload = () => {
    if (!recording?.blobUrl) return;
    const mimeType = recording?.mimeType || 'audio/webm';
    const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const stem = String(recording?.name || recording?.pointTitle || recording?.blockTitle || 'grabacion')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'grabacion';
    const anchor = document.createElement('a');
    anchor.href = recording.blobUrl;
    anchor.download = `${stem}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
      {canPlay && (
        <audio
          ref={audioRef}
          src={recording.blobUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => setCurrentTimeMs((audioRef.current?.currentTime || 0) * 1000)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTimeMs(0);
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">
              {recording?.name || recording?.pointTitle || recording?.blockTitle || 'Grabación'}
            </span>
            {recording?.pointTitle && recording?.name !== recording.pointTitle && (
              <span className="text-xs text-muted-foreground truncate">· {recording.pointTitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span>{totalFormatted}</span>
            <span>·</span>
            <span>{recording?.sourcesLabel || 'Micrófono'}</span>
            {segmentsCount > 1 && <><span>·</span><span>{segmentsCount} segmentos</span></>}
            {isPending && <><span>·</span><span>Recuperando audio…</span></>}
            {hasPersistenceError && <><span>·</span><span className="text-destructive">Audio no persistido</span></>}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={!canPlay}
            aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
            onClick={togglePlay}
            className="rounded-full"
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
          </Button>

          <div className="flex items-center gap-2 flex-1 sm:w-48">
            <Slider
              min={0}
              max={100}
              step={0.5}
              value={progressPercent}
              onValueChange={handleSeek}
              disabled={!canPlay}
              ariaLabel="Progreso de reproducción de audio"
              className="flex-1"
            />
            <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">{currentFormatted}</span>
          </div>

          {(onRename || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-xs" aria-label="Opciones de la grabación" className="text-muted-foreground hover:text-foreground">
                    <MoreVertical className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {onRename && (
                  <DropdownMenuItem onClick={() => setShowRenameModal(true)}>
                    <Pencil className="size-4 text-muted-foreground" />
                    <span>Renombrar</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowTechModal(true)}>
                  <Info className="size-4 text-muted-foreground" />
                  <span>Información de la grabación</span>
                </DropdownMenuItem>
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                      <Trash2 className="size-4 text-destructive" />
                      <span>Eliminar grabación</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {hasPersistenceError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-destructive">Este audio todavía no está guardado de forma segura.</p>
            {recording?.persistenceError && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{recording.persistenceError}</p>
            )}
          </div>
          {canPlay && (
            <Button variant="outline" size="sm" onClick={handleEmergencyDownload} className="shrink-0">
              <Download className="size-3.5" />
              Descargar ahora
            </Button>
          )}
        </div>
      )}

      {/* Modal de detalles técnicos */}
      <Dialog open={showTechModal} onOpenChange={setShowTechModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Info className="size-4 text-primary" />
              <DialogTitle>Información de la grabación de la grabación</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex flex-col gap-2 divide-y divide-border/30 text-xs">
            <div className="flex justify-between gap-3 py-1.5"><span className="text-muted-foreground">Formato</span><span className="font-mono text-foreground text-right">{recording?.mimeType || 'audio/webm'}</span></div>
            <div className="flex justify-between gap-3 py-1.5"><span className="text-muted-foreground">Tamaño</span><span className="font-semibold text-foreground">{fileSizeKb} KB</span></div>
            <div className="flex justify-between gap-3 py-1.5"><span className="text-muted-foreground">Segmentos</span><span className="font-semibold text-foreground">{segmentsCount}</span></div>
            <div className="flex justify-between gap-3 py-1.5">
              <span className="text-muted-foreground">Guardado</span>
              <span className="font-semibold text-foreground">
                {recording?.status === 'saved' ? 'En este dispositivo' : recording?.status === 'pending' ? 'Recuperando…' : 'Requiere atención'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowTechModal(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta grabación?</AlertDialogTitle>
            <AlertDialogDescription>
              El audio se borrará del almacenamiento local y no se puede recuperar desde Bardo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete?.(recording.id);
              }}
            >
              Eliminar grabación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de renombrar grabación */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renombrar grabación</DialogTitle>
            <DialogDescription>Cambia sólo el nombre visible. El punto asociado no se modifica.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="Nombre de la grabación"
            autoFocus
            className="w-full"
            onKeyDown={(event) => event.key === 'Enter' && handleConfirmRename()}
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowRenameModal(false)}>Cancelar</Button>
            <Button variant="default" size="sm" onClick={handleConfirmRename}>Guardar nombre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

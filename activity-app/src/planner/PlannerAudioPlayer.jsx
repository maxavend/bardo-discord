import {useState, useRef, useEffect} from 'react';
import {
  Button,
  Dropdown,
  Label,
  Description,
  Modal,
  Input,
} from '@heroui/react';
import {
  Play,
  Pause,
  EllipsisVertical,
  Pencil,
  TrashBin,
  CircleInfo,
} from '@gravity-ui/icons';
import {formatMsToClock} from './session-assistant-engine.js';

export function PlannerAudioPlayer({recording, onRename, onDelete}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showTechModal, setShowTechModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
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

  const handleSeek = (event) => {
    const percent = Number(event.target.value);
    const nextTimeMs = (percent / 100) * durationMs;
    setCurrentTimeMs(nextTimeMs);
    if (audioRef.current) audioRef.current.currentTime = nextTimeMs / 1000;
  };

  const handleConfirmRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && onRename) onRename(recording.id, trimmed);
    setShowRenameModal(false);
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-secondary/35 border border-border/40 text-xs">
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
              <span className="text-[11px] text-muted truncate">· {recording.pointTitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5 flex-wrap">
            <span>{totalFormatted}</span>
            <span>·</span>
            <span>{recording?.sourcesLabel || 'Micrófono'}</span>
            {segmentsCount > 1 && <><span>·</span><span>{segmentsCount} segmentos</span></>}
            {isPending && <><span>·</span><span>Recuperando audio…</span></>}
            {hasPersistenceError && <><span>·</span><span className="text-danger">Audio no persistido</span></>}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="sm"
            isIconOnly
            isDisabled={!canPlay}
            aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
            onPress={togglePlay}
            className="h-8 w-8 rounded-full"
          >
            {isPlaying ? <Pause width={13} height={13} /> : <Play width={13} height={13} className="ml-0.5" />}
          </Button>

          <div className="flex items-center gap-2 flex-1 sm:w-48">
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={progressPercent}
              onChange={handleSeek}
              disabled={!canPlay}
              aria-label="Progreso de reproducción de audio"
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed bg-border accent-accent"
            />
            <span className="text-[10px] font-mono text-muted tabular-nums shrink-0">{currentFormatted}</span>
          </div>

          {(onRename || onDelete) && (
            <Dropdown>
              <Dropdown.Trigger>
                <Button variant="ghost" size="sm" isIconOnly aria-label="Opciones de la grabación" className="h-7 w-7 text-muted hover:text-foreground">
                  <EllipsisVertical width={13} height={13} />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={(key) => {
                  if (key === 'rename') setShowRenameModal(true);
                  if (key === 'tech-details') setShowTechModal(true);
                  if (key === 'delete' && onDelete) onDelete(recording.id);
                }}>
                  {onRename && (
                    <Dropdown.Item id="rename" textValue="Renombrar grabación">
                      <Pencil />
                      <Label>Renombrar grabación</Label>
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item id="tech-details" textValue="Detalles técnicos">
                    <CircleInfo />
                    <Label>Detalles técnicos</Label>
                    <Description>Formato, persistencia y segmentos</Description>
                  </Dropdown.Item>
                  {onDelete && (
                    <Dropdown.Item id="delete" variant="danger" textValue="Eliminar grabación">
                      <TrashBin />
                      <Label>Eliminar grabación</Label>
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          )}
        </div>
      </div>

      {hasPersistenceError && recording?.persistenceError && (
        <p className="text-[11px] text-danger leading-relaxed">{recording.persistenceError}</p>
      )}

      <Modal.Backdrop isOpen={showTechModal} onOpenChange={(open) => !open && setShowTechModal(false)}>
        <Modal.Container size="sm">
          <Modal.Dialog className="bg-surface border border-border rounded-2xl shadow-xl p-5 flex flex-col gap-4 max-w-sm w-full">
            <div className="flex items-center gap-2">
              <CircleInfo width={16} height={16} className="text-accent" />
              <h2 className="text-sm font-bold text-foreground">Detalles técnicos de la grabación</h2>
            </div>
            <div className="flex flex-col gap-2 divide-y divide-border/30 text-xs">
              <div className="flex justify-between gap-3 py-1.5"><span className="text-muted">Formato</span><span className="font-mono text-foreground text-right">{recording?.mimeType || 'audio/webm'}</span></div>
              <div className="flex justify-between gap-3 py-1.5"><span className="text-muted">Tamaño</span><span className="font-semibold text-foreground">{fileSizeKb} KB</span></div>
              <div className="flex justify-between gap-3 py-1.5"><span className="text-muted">Segmentos</span><span className="font-semibold text-foreground">{segmentsCount}</span></div>
              <div className="flex justify-between gap-3 py-1.5"><span className="text-muted">Persistencia</span><span className="font-semibold text-foreground">{recording?.binaryStorage === 'indexeddb' ? 'IndexedDB' : 'No persistida'}</span></div>
              <div className="flex justify-between gap-3 py-1.5"><span className="text-muted">Estado</span><span className="font-semibold text-foreground">{recording?.status || 'desconocido'}</span></div>
            </div>
            <div className="flex justify-end pt-2 border-t border-border/40">
              <Button variant="secondary" size="sm" onPress={() => setShowTechModal(false)}>Cerrar</Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={showRenameModal} onOpenChange={(open) => !open && setShowRenameModal(false)}>
        <Modal.Container size="sm">
          <Modal.Dialog className="bg-surface border border-border rounded-2xl shadow-xl p-5 flex flex-col gap-4 max-w-sm w-full">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-bold text-foreground">Renombrar grabación</h2>
              <p className="text-xs text-muted">Cambia sólo el nombre visible. El Point asociado no se modifica.</p>
            </div>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Nombre de la grabación"
              autoFocus
              className="w-full"
              onKeyDown={(event) => event.key === 'Enter' && handleConfirmRename()}
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="ghost" size="sm" onPress={() => setShowRenameModal(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" onPress={handleConfirmRename}>Guardar nombre</Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Plate, PlateContainer } from 'platejs/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from '@gravity-ui/icons';
import { toast } from '@/lib/toast';

import { createBardoEditor } from './bardo-editor-kit.js';
import { htmlToPlateValue, plateValueToHtml } from './bardo-editor-serialization.js';
import { BardoToolbar } from './BardoToolbar.jsx';
import { BardoEditorSurface } from './BardoEditorSurface.jsx';
import { BardoSlashMenu } from './BardoSlashMenu.jsx';
import { BardoBlockDragHandle } from './BardoBlockDragHandle.jsx';

const DRAFT_KEY = 'bardo.docs.heroui.draft.v1';
const AUTOSAVE_DELAY_MS = 1500;
// Copia local de seguridad mientras se escribe: no depende de que el navegador
// alcance a disparar pagehide/visibilitychange (Discord puede matar el iframe).
const JOURNAL_DELAY_MS = 250;

const SYNC_LABELS = {
  saving: 'Guardando…',
  saved: 'Guardado',
  offline: 'Sin conexión, reintentando',
  error: 'No se pudo guardar',
  conflict: 'Conflicto: se guardó una copia',
};

function initialSyncState(docId, remoteSync) {
  if (!remoteSync || !docId) return {state: 'saved'};
  try {
    return window.__bardoDocSyncState?.(docId) || {state: 'saved'};
  } catch {
    return {state: 'saved'};
  }
}

function singleLinePaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const input = e.currentTarget;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = input.value.slice(0, start) + text + input.value.slice(end);
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
}

function changeActorName(doc) {
  return doc?.updatedByName || doc?.createdByName || 'alguien';
}

function createdActorName(doc) {
  return doc?.createdByName || 'alguien';
}

function formatChangeTime(doc) {
  const stamp = new Date(doc?.updatedAt || doc?.createdAt || Date.now()).getTime();
  if (!Number.isFinite(stamp)) return 'ahora';
  const diff = Math.max(0, Date.now() - stamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours === 1 ? '1 hora' : `${hours} horas`}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days === 1 ? '1 día' : `${days} días`}`;

  const parts = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(stamp));
  const value = type => parts.find(part => part.type === type)?.value || '';
  return `a las ${value('hour')}:${value('minute')} del ${value('day')}/${value('month')}/${value('year')}`;
}

export function BardoEditor({
  doc,
  isNew,
  readOnly = false,
  remoteSync = false,
  onBack,
  onFinish,
  onAutosave,
  onJournal,
  onOpenLink,
  themeModeMenu: ThemeModeMenu,
}) {
  const initialDraft = useMemo(() => {
    if (!isNew) return null;
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch {
      return null;
    }
  }, [isNew]);

  const [title, setTitle] = useState(doc?.title ?? initialDraft?.title ?? '');
  const [description, setDescription] = useState(doc?.description ?? initialDraft?.description ?? '');
  const [isDirty, setIsDirty] = useState(false);
  const [syncState, setSyncState] = useState(() => initialSyncState(doc?.id, remoteSync && !isNew));
  const docId = doc?.id;
  const [isExiting, setIsExiting] = useState(false);

  // El editor se crea una sola vez por montaje (App usa una key por documento y
  // revisión), así los autosaves que cambian `doc.body` no reinician el contenido.
  const [editor] = useState(() => createBardoEditor(
    htmlToPlateValue(doc?.body ?? initialDraft?.body ?? '<p><br></p>')
  ));

  const shellRef = useRef(null);
  const bodyRef = useRef(null);
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const toolbarContainerRef = useRef(null);
  const saveTimer = useRef(null);
  const journalTimer = useRef(null);
  const exitTimer = useRef(null);
  const dirtyRef = useRef(false);

  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  titleRef.current = title;
  descriptionRef.current = description;

  const currentSnapshot = useCallback(() => {
    const bodyHtml = plateValueToHtml(editor.children);
    return {
      title: titleRef.current.trim(),
      description: descriptionRef.current.trim(),
      body: bodyHtml,
      updatedAt: new Date().toISOString(),
    };
  }, [editor]);

  const onAutosaveRef = useRef(onAutosave);
  onAutosaveRef.current = onAutosave;
  const onJournalRef = useRef(onJournal);
  onJournalRef.current = onJournal;

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    clearTimeout(journalTimer.current);
    journalTimer.current = null;
    const snap = currentSnapshot();
    if (readOnly) return snap;
    onAutosaveRef.current?.(snap);
    dirtyRef.current = false;
    setIsDirty(false);
    if (remoteSync && !isNew && docId) {
      setSyncState(initialSyncState(docId, true));
    }
    return snap;
  }, [currentSnapshot, docId, isNew, readOnly, remoteSync]);

  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;

  const markDirty = useCallback(() => {
    if (readOnly) return;
    dirtyRef.current = true;
    setIsDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushRef.current(), AUTOSAVE_DELAY_MS);
    if (!journalTimer.current) {
      journalTimer.current = setTimeout(() => {
        journalTimer.current = null;
        if (!dirtyRef.current) return;
        try {
          onJournalRef.current?.(currentSnapshot());
        } catch (error) {
          console.warn('Bardo Docs: no se pudo guardar la copia local de seguridad', error);
        }
      }, JOURNAL_DELAY_MS);
    }
  }, [currentSnapshot, readOnly]);

  // Guardar siempre antes de perder el editor: al ocultar/cerrar la página,
  // al cambiar de ruta y al desmontar.
  useEffect(() => {
    const flushIfDirty = () => {
      if (dirtyRef.current) flushRef.current();
    };
    // Al cerrar u ocultar: encolar el último snapshot y enviarlo de inmediato con
    // keepalive. Los listeners van en fase de captura para correr ANTES que los
    // del bridge (que se registraron antes y envían la cola con keepalive).
    const flushForUnload = () => {
      flushIfDirty();
      try {
        window.__bardoDocsSync?.flushKeepalive?.();
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushForUnload();
    };
    window.addEventListener('pagehide', flushForUnload, {capture: true});
    window.addEventListener('beforeunload', flushForUnload, {capture: true});
    window.addEventListener('hashchange', flushIfDirty);
    document.addEventListener('visibilitychange', onVisibility, {capture: true});
    return () => {
      window.removeEventListener('pagehide', flushForUnload, {capture: true});
      window.removeEventListener('beforeunload', flushForUnload, {capture: true});
      window.removeEventListener('hashchange', flushIfDirty);
      document.removeEventListener('visibilitychange', onVisibility, {capture: true});
      flushIfDirty();
    };
  }, []);

  // Estado real de sincronización con el servidor (modo Discord).
  useEffect(() => {
    if (!remoteSync || isNew || !docId) return undefined;
    const onStatus = event => {
      const detail = event.detail || {};
      if (detail.scope !== 'docs' || detail.id !== docId) return;
      setSyncState({state: detail.state, message: detail.message});
    };
    window.addEventListener('bardo-sync-status', onStatus);
    return () => window.removeEventListener('bardo-sync-status', onStatus);
  }, [docId, isNew, remoteSync]);

  const saveState = readOnly
    ? 'Procesando archivo…'
    : isDirty
      ? 'Cambios sin guardar'
      : isNew
        ? 'Borrador guardado'
        : remoteSync
          ? (SYNC_LABELS[syncState?.state] || 'Guardado')
          : 'Guardado';
  const saveStateTitle = !isDirty && remoteSync && syncState?.message ? syncState.message : undefined;

  const leaveEditor = useCallback((callback) => {
    if (exitTimer.current) return;
    setIsExiting(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      callback();
    }, 150);
  }, []);

  const finish = () => {
    if (readOnly) {
      leaveEditor(onBack);
      return;
    }
    const snap = flushSave();
    leaveEditor(() => onFinish(snap));
  };

  useLayoutEffect(() => {
    [titleInputRef.current, descriptionInputRef.current].forEach(input => {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    });
  }, [title, description]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(journalTimer.current);
    clearTimeout(exitTimer.current);
  }, []);

  // Manejo de atajos en título y descripción
  const handleTitleKey = e => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        editor.redo();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      descriptionInputRef.current?.focus();
    }
  };

  const handleDescriptionKey = e => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        editor.redo();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      editor.tf.focus();
    }
  };

  const handleCopyAll = useCallback(() => {
    const text = plateValueToHtml(editor.children);
    const tempEl = document.createElement('div');
    tempEl.innerHTML = text;
    const plain = tempEl.innerText || '';
    navigator.clipboard?.writeText(plain).then(() => {
      toast('Texto copiado al portapapeles');
    }).catch(() => {
      toast('No se pudo copiar el texto');
    });
  }, [editor]);

  const handleRemoveFormat = useCallback(() => {
    editor.tf.focus();
    ['bold', 'italic', 'underline', 'strikethrough', 'code'].forEach(mark => {
      editor.tf.removeMarks([mark]);
    });
    toast('Formato limpiado');
  }, [editor]);

  const handleOpenLinkModal = useCallback(() => {
    const isCollapsed = !editor.selection || editor.api.isCollapsed();
    onOpenLink?.({
      isCollapsed,
      apply: (url) => {
        if (!url) return;
        editor.tf.focus();
        if (isCollapsed) {
          editor.tf.insertNodes({
            type: 'a',
            url,
            target: '_blank',
            children: [{ text: url }],
          });
        } else {
          editor.tf.wrapNodes({
            type: 'a',
            url,
            target: '_blank',
            children: [],
          }, { split: true });
        }
        markDirty();
      },
    });
  }, [editor, markDirty, onOpenLink]);

  return (
    <section className={`doc-route route-active editing-route ${isExiting ? 'editor-transition-is-exiting' : ''}`}>
      <header className="doc-topbar glass-header app-host-header">
        <div className="topbar-left flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (isExiting) return;
              flushSave();
              leaveEditor(onBack);
            }}
            className="back-button"
          >
            <ChevronLeft width={16} height={16} /> Docs
          </Button>
          <Badge
            key={saveState}
            variant="secondary"
            className="save-state text-xs"
            data-dirty={isDirty ? 'true' : 'false'}
            data-sync-state={isDirty ? 'dirty' : syncState?.state || 'saved'}
            title={saveStateTitle}
            role="status"
          >
            <span key={saveState} className="save-state-label">{saveState}</span>
          </Badge>
        </div>
        <div className="topbar-right flex items-center gap-2">
          {ThemeModeMenu && <ThemeModeMenu />}
          <Button variant="default" size="sm" onClick={finish} className="save-action-button">
            <span key={isDirty ? 'dirty' : 'saved'} className="save-action-label">
              {isDirty ? 'Guardar' : 'Listo'}
            </span>
          </Button>
        </div>
      </header>

      <Plate
        editor={editor}
        readOnly={readOnly}
        onChange={({ editor: changed }) => {
          // Ignorar cambios que solo mueven el cursor/selección.
          const ops = changed?.operations || [];
          if (ops.length && ops.every(op => op.type === 'set_selection')) return;
          markDirty();
        }}
      >
        <PlateContainer>
          <article
            ref={shellRef}
            className="document-shell editor-shell relative"
          >
            <BardoBlockDragHandle shellRef={shellRef} bodyRef={bodyRef} />

            <header className="doc-intro">
              <div className="doc-meta flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {isNew ? 'Borrador privado' : `Creado por ${createdActorName(doc)}`}
                </Badge>
                {!isNew && (
                  <span className="text-xs text-muted-foreground">
                    Último cambio realizado por {changeActorName(doc)} · {formatChangeTime(doc)}
                  </span>
                )}
              </div>
              <textarea
                ref={titleInputRef}
                className="doc-title doc-title-input"
                aria-label="Título"
                rows={1}
                value={title}
                readOnly={readOnly}
                placeholder="Sin título"
                onChange={e => {
                  const nextTitle = e.target.value;
                  titleRef.current = nextTitle;
                  setTitle(nextTitle);
                  markDirty();
                }}
                onKeyDown={handleTitleKey}
                onPaste={singleLinePaste}
              />
              <textarea
                ref={descriptionInputRef}
                className="doc-description doc-description-input"
                aria-label="Descripción"
                rows={1}
                value={description}
                readOnly={readOnly}
                placeholder="Agrega una descripción…"
                onChange={e => {
                  const nextDescription = e.target.value;
                  descriptionRef.current = nextDescription;
                  setDescription(nextDescription);
                  markDirty();
                }}
                onKeyDown={handleDescriptionKey}
                onPaste={singleLinePaste}
              />
            </header>

            {readOnly ? (
              <div className="import-pending-banner text-sm text-muted-foreground" role="status">
                Procesando archivo… Bardo está convirtiendo el contenido. Podrás editarlo en cuanto termine.
              </div>
            ) : (
              <div className="editor-toolbar-sticky">
                <BardoToolbar
                  toolbarContainerRef={toolbarContainerRef}
                  onOpenLink={handleOpenLinkModal}
                  onCopyAll={handleCopyAll}
                  onRemoveFormat={handleRemoveFormat}
                />
              </div>
            )}

            <BardoEditorSurface ref={bodyRef} readOnly={readOnly} />

            {!readOnly && <BardoSlashMenu />}
          </article>
        </PlateContainer>
      </Plate>
    </section>
  );
}
export default BardoEditor;

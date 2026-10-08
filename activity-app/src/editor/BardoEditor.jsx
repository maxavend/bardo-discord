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
import { DOCS_KEYS, scopedDocsKey } from '../docs-storage.js';
import { flattenPastedTitle, htmlToPlainText } from '../docs-text.js';
import { copyTextToClipboard } from '../docs-clipboard.js';

const AUTOSAVE_DELAY_MS = 1500;
// Copia local de seguridad mientras se escribe: no depende de que el navegador
// alcance a disparar pagehide/visibilitychange (Discord puede matar el iframe).
const JOURNAL_DELAY_MS = 250;
const UNTITLED = 'Sin título';

// Cortos a propósito: deben caber junto a "Listo" en Discord móvil (~380 px).
const SYNC_LABELS = {
  saving: 'Guardando…',
  saved: 'Guardado',
  offline: 'Sin conexión',
  error: 'No se guardó',
  conflict: 'Se guardó una copia',
};

const SYNC_HINTS = {
  saved: 'Los cambios se guardan solos mientras escribes.',
  offline: 'Sin conexión con Bardo. Tus cambios quedan en este dispositivo y se enviarán al reconectar.',
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
  const text = flattenPastedTitle(e.clipboardData.getData('text/plain'));
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

function normalizeLinkUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return `https://${value}`;
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
  readOnlyMessage = '',
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
      return JSON.parse(localStorage.getItem(scopedDocsKey(DOCS_KEYS.draft)) || 'null');
    } catch {
      return null;
    }
  }, [isNew]);

  // "Sin título" es el valor por defecto del servidor: se muestra como placeholder.
  const initialTitle = doc ? (doc.title === UNTITLED ? '' : doc.title ?? '') : initialDraft?.title ?? '';
  const [title, setTitle] = useState(initialTitle);
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

  const syncKey = isDirty ? 'saving' : remoteSync ? (syncState?.state || 'saved') : 'saved';
  const saveState = readOnly
    ? (readOnlyMessage ? 'Solo lectura' : 'Procesando…')
    : isNew
      ? (isDirty ? 'Guardando…' : 'Borrador')
      : (SYNC_LABELS[syncKey] || 'Guardado');
  const saveStateTitle = isNew
    ? 'Solo tú ves este borrador, en este dispositivo, hasta que pulses Listo.'
    : (!isDirty && remoteSync && syncState?.message) || SYNC_HINTS[syncKey] || undefined;

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

  // Título y descripción: Ctrl/Cmd+Z es el deshacer nativo de cada campo (no
  // toca el cuerpo). Enter pasa al siguiente campo.
  const handleTitleKey = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      descriptionInputRef.current?.focus();
    }
  };

  const handleDescriptionKey = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor.tf.focus();
    }
  };

  const handleCopyAll = useCallback(async () => {
    const plain = htmlToPlainText(plateValueToHtml(editor.children));
    const copied = await copyTextToClipboard(plain);
    toast(copied ? 'Texto copiado' : 'No se pudo copiar. Selecciona el texto y cópialo manualmente.');
  }, [editor]);

  const handleRemoveFormat = useCallback(() => {
    editor.tf.focus();
    ['bold', 'italic', 'underline', 'strikethrough', 'code'].forEach(mark => {
      editor.tf.removeMarks([mark]);
    });
    toast('Formato limpiado');
  }, [editor]);

  const handleOpenLinkModal = useCallback(() => {
    const savedSelection = editor.selection;
    const isCollapsed = !savedSelection || editor.api.isCollapsed();
    const linkEntry = savedSelection ? editor.api.above({ match: n => n.type === 'a' }) : null;
    const restoreSelection = () => {
      editor.tf.focus();
      if (savedSelection) {
        try { editor.tf.select(savedSelection); } catch {}
      }
    };
    onOpenLink?.({
      isCollapsed,
      initialUrl: linkEntry?.[0]?.url || '',
      isEditing: Boolean(linkEntry),
      apply: (rawUrl) => {
        const url = normalizeLinkUrl(rawUrl);
        if (!url) return;
        restoreSelection();
        if (linkEntry) {
          editor.tf.setNodes({ url }, { at: linkEntry[1] });
        } else if (isCollapsed) {
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
      remove: linkEntry ? () => {
        restoreSelection();
        editor.tf.unwrapNodes({ at: linkEntry[1], match: n => n.type === 'a' });
        markDirty();
      } : undefined,
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
            aria-label="Volver a Documentos"
          >
            <ChevronLeft width={16} height={16} aria-hidden="true" />
            <span className="header-label">Documentos</span>
          </Button>
          <Badge
            key={saveState}
            variant="secondary"
            className="save-state text-xs"
            data-dirty={isDirty ? 'true' : 'false'}
            data-sync-state={isDirty ? 'dirty' : syncState?.state || 'saved'}
            title={saveStateTitle}
            aria-live="polite"
          >
            <span key={saveState} className="save-state-label">{saveState}</span>
          </Badge>
        </div>
        <div className="topbar-right flex items-center gap-2">
          {/* Un solo botón: el contenido ya se guarda solo; "Listo" vuelve al lector.
              El tema va último, igual que en el resto de las barras. */}
          <Button variant="default" size="sm" onClick={finish} className="save-action-button">
            <span className="save-action-label">Listo</span>
          </Button>
          {ThemeModeMenu && <ThemeModeMenu />}
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
                {isNew ? (
                  <span className="text-xs text-muted-foreground">
                    Solo tú lo ves hasta que pulses Listo.
                  </span>
                ) : (
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
                placeholder={UNTITLED}
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
                {readOnlyMessage || 'Procesando archivo… Bardo está convirtiendo el contenido. Podrás editarlo en cuanto termine.'}
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

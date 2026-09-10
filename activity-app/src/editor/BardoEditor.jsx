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

export function BardoEditor({ doc, isNew, onBack, onFinish, onAutosave, onOpenLink, themeModeMenu: ThemeModeMenu }) {
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
  const [saveState, setSaveState] = useState(isNew ? 'Borrador guardado' : 'Guardado');
  const [isDirty, setIsDirty] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const initialHtml = useMemo(
    () => doc?.body ?? initialDraft?.body ?? '<p><br></p>',
    [doc?.body, initialDraft?.body]
  );

  const initialValue = useMemo(
    () => htmlToPlateValue(initialHtml),
    [initialHtml]
  );

  const editor = useMemo(
    () => createBardoEditor(initialValue),
    [doc?.id, isNew]
  );

  const shellRef = useRef(null);
  const bodyRef = useRef(null);
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const toolbarContainerRef = useRef(null);
  const saveTimer = useRef(null);
  const exitTimer = useRef(null);

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

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    const snap = currentSnapshot();
    onAutosave(snap);
    setIsDirty(false);
    setSaveState(isNew ? 'Borrador guardado' : 'Guardado');
    return snap;
  }, [currentSnapshot, isNew, onAutosave]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveState('Cambios sin guardar');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 30000);
  }, [flushSave]);

  const leaveEditor = useCallback((callback) => {
    if (exitTimer.current) return;
    setIsExiting(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      callback();
    }, 150);
  }, []);

  const finish = () => {
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
    const isCollapsed = !editor.selection || editor.selection.anchor.offset === editor.selection.focus.offset;
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
        onChange={() => {
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

            <div className="editor-toolbar-sticky">
              <BardoToolbar
                toolbarContainerRef={toolbarContainerRef}
                onOpenLink={handleOpenLinkModal}
                onCopyAll={handleCopyAll}
                onRemoveFormat={handleRemoveFormat}
              />
            </div>

            <BardoEditorSurface ref={bodyRef} />

            <BardoSlashMenu />
          </article>
        </PlateContainer>
      </Plate>
    </section>
  );
}
export default BardoEditor;

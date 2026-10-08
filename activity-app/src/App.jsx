import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@/components/ui/input-group';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { toast } from '@/lib/toast';
import { Toaster } from '@/components/ui/toaster';
import { useTheme } from '@/lib/theme';
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRightFromSquare,
  ArrowUturnCwRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  EllipsisVertical,
  Eye,
  File,
  FileArrowUp,
  FileText,
  LinkSlash,
  Magnifier,
  Moon,
  Pencil,
  Plus,
  Sun,
  TrashBin,
  TriangleExclamation,
  Xmark,
} from '@gravity-ui/icons';
import {convertDocumentFile} from './production-import-normalizer.js';
import {htmlToMarkdown, markdownToHtml} from './editor/bardo-markdown.js';
import {DOCS_KEYS, getDocsStorageScope, scopedDocsKey} from './docs-storage.js';
import {checklistItems, documentPlainText, filterDocumentsByQuery, isEmptyDocSnapshot} from './docs-text.js';
import {copyTextToClipboard} from './docs-clipboard.js';
import {openExternalUrl} from './discord-links.js';
import {PlannerModule} from './planner/PlannerModule.jsx';
import {buildMinutesDoc} from './planner/minutes-doc.js';
import {BardoEditor} from './editor/BardoEditor.jsx';
export {applyDiscordTheme, collectDiscordThemeDiagnostics, resolveDiscordTheme} from './discord-theme.js';

// Claves por servidor + canal (ver docs-storage.js): nada de un canal aparece en otro.
const storeKey = () => scopedDocsKey(DOCS_KEYS.store);
const draftKey = () => scopedDocsKey(DOCS_KEYS.draft);
const lastOpenedKey = () => scopedDocsKey(DOCS_KEYS.lastOpened);
// Copia de seguridad de la edición en curso (se escribe mientras se tipea).
const journalKey = () => scopedDocsKey(DOCS_KEYS.journal);
const STORE_VERSION = 1;
const SHARE_CARD_HINT = 'Se publicará una tarjeta con una vista previa y un botón para abrirlo.';


function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (raw === 'planner' || raw.startsWith('planner-')) {
    const tab = raw.replace(/^planner-?/, '') || 'home';
    return {type: 'planner', tab: tab === 'planner' ? 'home' : tab, key: raw};
  }
  if (!raw || raw === 'docs') return {type: 'library', key: 'library'};
  if (raw === 'new') return {type: 'new', key: 'new'};
  if (raw.startsWith('edit-')) return {type: 'edit', id: raw.slice(5), key: raw};
  if (raw.startsWith('doc-')) return {type: 'doc', id: raw.slice(4), key: raw};
  return {type: 'library', key: 'library'};
}

function stripHtml(value = '') {
  const node = document.createElement('div');
  node.innerHTML = value;
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return `https://${value}`;
}

function sanitizeRichHtml(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const allowed = new Set([
    'P', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL',
    'CODE', 'PRE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A',
    'DETAILS', 'SUMMARY', 'DIV', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
    'BR', 'SPAN', 'KBD'
  ]);
  const classes = new Set(['checklist', 'done', 'spoiler', 'doc-callout']);
  [...doc.body.querySelectorAll('*')].forEach(el => {
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      return;
    }
    [...el.attributes].forEach(attr => {
      if (attr.name === 'href' && el.tagName === 'A') return;
      if (attr.name === 'start' && el.tagName === 'OL' && /^\d{1,9}$/.test(attr.value)) return;
      if (attr.name === 'class') return;
      el.removeAttribute(attr.name);
    });
    if (el.hasAttribute('class')) {
      const keep = [...el.classList].filter(c => classes.has(c) || (el.tagName === 'CODE' && /^language-[\w+#.-]+$/.test(c)));
      if (keep.length) el.className = keep.join(' ');
      else el.removeAttribute('class');
    }
    if (el.tagName === 'A') {
      const href = normalizeUrl(el.getAttribute('href') || '');
      if (!href || !/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
        el.removeAttribute('href');
      } else {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noreferrer');
      }
    }
  });
  doc.body.querySelectorAll('.check-control').forEach(el => el.remove());
  return doc.body.innerHTML;
}

function cleanEditorHtml(container) {
  if (!container) return '';
  const clone = container.cloneNode(true);
  clone.querySelectorAll('.check-control').forEach(el => el.remove());
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  return sanitizeRichHtml(clone.innerHTML);
}


function enhanceChecklistHtml(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(html)}</body>`, 'text/html');
  doc.body.querySelectorAll('ul.checklist > li').forEach(li => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'check-control';
    button.setAttribute('aria-label', li.classList.contains('done') ? 'Marcar como pendiente' : 'Marcar como completado');
    button.setAttribute('aria-pressed', li.classList.contains('done') ? 'true' : 'false');
    button.innerHTML = '<span aria-hidden="true">✓</span>';
    li.prepend(button);
  });
  return doc.body.innerHTML;
}

function changeActorName(doc) {
  return doc?.updatedByName || doc?.createdByName || 'alguien';
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

function currentEditorName() {
  const user = window.__BARDO_USER__;
  return user?.global_name || user?.username || null;
}

function markdownFromHtml(html = '') {
  return htmlToMarkdown(sanitizeRichHtml(html));
}

/** Descarga local (solo fuera de Discord, donde no hay enlace firmado del servidor). */
function downloadFile(filename, mime, content) {
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function documentMarkdown(doc) {
  return `# ${doc?.title || 'Sin título'}\n\n${doc?.description ? `${doc.description}\n\n` : ''}${markdownFromHtml(doc?.body || '')}`;
}

function documentFileStem(doc) {
  return doc?.title?.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '') || 'documento';
}

const EXPORT_FORMAT_LABELS = {md: 'el archivo de texto', docx: 'el archivo Word', pdf: 'el PDF'};

function channelLabel() {
  const name = window.__bardoChannelContext?.channelName;
  return name ? `#${name}` : 'este canal';
}

function isImportBlocked(doc) {
  return doc?.importStatus === 'pending' || doc?.importStatus === 'failed';
}

function newLocalId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (!draft) return null;
    const hasContent = Boolean(String(draft.title || '').trim() || String(draft.description || '').trim()
      || stripHtml(draft.body || ''));
    return hasContent ? draft : null;
  } catch {
    return null;
  }
}

function loadStore() {
  const initial = window.__BARDO_INITIAL_STORE__;
  if (initial && Array.isArray(initial.docs)) {
    return {version: STORE_VERSION, docs: initial.docs, deletedIds: [...new Set(initial.deletedIds || [])]};
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey()) || 'null');
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.docs)) {
      return {version: STORE_VERSION, docs: [], deletedIds: []};
    }
    return {
      version: STORE_VERSION,
      docs: parsed.docs,
      deletedIds: [...new Set(parsed.deletedIds || [])],
    };
  } catch {
    return {version: STORE_VERSION, docs: [], deletedIds: []};
  }
}

let storageWarningShown = false;

function warnStorageFull() {
  if (storageWarningShown) return;
  storageWarningShown = true;
  toast(window.__BARDO_PRODUCTION__
    ? 'El almacenamiento local está lleno. Tus cambios se siguen guardando en Bardo, pero no queda copia sin conexión.'
    : 'El almacenamiento local está lleno. Exporta o elimina documentos para no perder cambios.');
}

function saveStore(store) {
  try {
    localStorage.setItem(storeKey(), JSON.stringify(store));
    return true;
  } catch (error) {
    console.warn('Bardo Docs: no se pudo escribir en localStorage', error);
    warnStorageFull();
    return false;
  }
}

/**
 * Copia de seguridad de la edición en curso. Primero la de este canal; una
 * copia antigua sin ámbito solo se aplica si su documento existe en este canal
 * (applyJournal lo comprueba), así que nunca trae contenido de otro canal.
 */
function readJournal() {
  const keys = [journalKey()];
  if (getDocsStorageScope()) keys.push(DOCS_KEYS.journal);
  for (const key of keys) {
    try {
      const journal = JSON.parse(localStorage.getItem(key) || 'null');
      if (journal?.docId && journal.snapshot) return {...journal, storageKey: key};
    } catch {}
  }
  return null;
}

function writeJournal(entry) {
  try {
    localStorage.setItem(journalKey(), JSON.stringify(entry));
  } catch (error) {
    console.warn('Bardo Docs: no se pudo escribir la copia de seguridad', error);
  }
}

function clearJournal(docId) {
  try {
    const journal = readJournal();
    if (!journal || journal.docId === docId) localStorage.removeItem(journal?.storageKey || journalKey());
  } catch {}
}

/** Aplica una edición que quedó en la copia de seguridad (p. ej. tras cerrar la Activity). */
function applyJournal(store) {
  const journal = readJournal();
  if (!journal) return {store, journal: null};
  const doc = store.docs.find(item => item.id === journal.docId);
  if (!doc) return {store, journal: null};
  const snap = journal.snapshot;
  const same = (doc.title || '') === (snap.title || '')
    && (doc.description || '') === (snap.description || '')
    && (doc.body || '') === (snap.body || '');
  if (same) {
    clearJournal(journal.docId);
    return {store, journal: null};
  }
  return {
    store: {...store, docs: store.docs.map(item => (item.id === doc.id ? {...item, ...snap} : item))},
    journal,
  };
}

function saveDraft(snapshot) {
  try {
    localStorage.setItem(draftKey(), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Bardo Docs: no se pudo guardar el borrador', error);
    warnStorageFull();
  }
}

function DocActionMenu({doc, onAction, triggerLabel = 'Acciones'}) {
  const blocked = isImportBlocked(doc);
  const isProduction = Boolean(window.__BARDO_PRODUCTION__);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={triggerLabel}
            className="icon-button-circle text-muted-foreground hover:text-foreground shrink-0"
          >
            <EllipsisVertical width={16} height={16} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onAction('open', doc)}>
          <Eye width={15} height={15} className="text-muted-foreground" />
          <span>Abrir</span>
        </DropdownMenuItem>
        {!blocked && (
          <>
            <DropdownMenuItem onClick={() => onAction('edit', doc)}>
              <Pencil width={15} height={15} className="text-muted-foreground" />
              <span>Editar</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('duplicate', doc)}>
              <Copy width={15} height={15} className="text-muted-foreground" />
              <span>Duplicar</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('copy', doc)}>
              <FileText width={15} height={15} className="text-muted-foreground" />
              <span>Copiar texto</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('publish', doc)}>
              <ArrowUturnCwRight width={15} height={15} className="text-muted-foreground" />
              <span>Compartir en el canal</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileArrowUp width={15} height={15} className="text-muted-foreground" />
                <span>Descargar</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {isProduction && (
                  <>
                    <DropdownMenuItem onClick={() => onAction('pdf', doc)}>
                      <FileText width={15} height={15} className="text-muted-foreground" />
                      <span>PDF (.pdf)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction('docx', doc)}>
                      <FileText width={15} height={15} className="text-muted-foreground" />
                      <span>Word (.docx)</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => onAction('markdown', doc)}>
                  <FileText width={15} height={15} className="text-muted-foreground" />
                  <span>Texto con formato (.md)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction('text-preview', doc)}>
                  <Eye width={15} height={15} className="text-muted-foreground" />
                  <span>Ver como texto</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        <DropdownMenuSeparator />

        {doc.archived ? (
          <>
            <DropdownMenuItem onClick={() => onAction('restore', doc)}>
              <Archive width={15} height={15} className="text-muted-foreground" />
              <span>Restaurar documento</span>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onAction('permanent-delete', doc)}>
              <TrashBin width={15} height={15} className="text-destructive" />
              <span>Eliminar definitivamente</span>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => onAction('archive', doc)}>
            <Archive width={15} height={15} className="text-muted-foreground" />
            <span>Archivar documento</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RichBody({html, onChecklistChange, className = ''}) {
  const ref = useRef(null);
  const rendered = useMemo(() => enhanceChecklistHtml(html), [html]);
  return (
    <div
      ref={ref}
      className={`doc-body ${className}`}
      dangerouslySetInnerHTML={{__html: rendered}}
      onClick={e => {
        // Enlaces: dentro de Discord se abren con openExternalLink.
        const link = e.target.closest?.('a[href]');
        if (link && ref.current?.contains(link)) {
          e.preventDefault();
          void openExternalUrl(link.getAttribute('href')).then(opened => {
            if (!opened) toast('No se pudo abrir el enlace.');
          });
          return;
        }
        const control = e.target.closest?.('.check-control');
        if (!control || !ref.current?.contains(control) || !onChecklistChange) return;
        e.preventDefault();
        const li = control.closest('li');
        const index = checklistItems(ref.current).indexOf(li);
        li.classList.toggle('done');
        const done = li.classList.contains('done');
        control.setAttribute('aria-pressed', done ? 'true' : 'false');
        control.setAttribute('aria-label', done ? 'Marcar como pendiente' : 'Marcar como completado');
        onChecklistChange(cleanEditorHtml(ref.current), {index, done});
      }}
    />
  );
}

function EmptyState({query, onClearSearch, onNewDoc, onUpload, onShowArchived, archivedCount = 0, isArchived = false}) {
  return (
    <Empty className="my-8">
      <EmptyMedia variant="icon">
        {isArchived ? (
          <Archive width={20} height={20} className="text-muted-foreground" />
        ) : (
          <Magnifier width={20} height={20} className="text-muted-foreground" />
        )}
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>
          {query
            ? 'Sin resultados'
            : isArchived
              ? 'No hay documentos archivados'
              : 'Todavía no hay documentos'}
        </EmptyTitle>
        <EmptyDescription>
          {query
            ? `No encontramos documentos con “${query}”${!isArchived && archivedCount > 0 ? ' entre los activos' : ''}.`
            : isArchived
              ? 'Los documentos que archives aparecerán aquí. Puedes restaurarlos cuando quieras.'
              : 'Crea un documento o sube un archivo (Word, PDF o texto) para empezar.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {query ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClearSearch}>
              Limpiar búsqueda
            </Button>
            {!isArchived && archivedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onShowArchived}>
                Buscar en Archivados
              </Button>
            )}
          </div>
        ) : !isArchived ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="default" size="sm" onClick={onNewDoc}>
              <Plus width={16} height={16} /> Crear documento
            </Button>
            <Button variant="secondary" size="sm" onClick={onUpload}>
              <File width={16} height={16} /> Subir archivo
            </Button>
          </div>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}

function DocsHeader({children, actions, className = ''}) {
  return (
    <header className={`doc-topbar glass-header app-host-header ${className}`.trim()}>
      <div className="topbar-left">{children}</div>
      <div className="topbar-right header-actions">
        {actions}
        <ThemeModeMenu />
      </div>
    </header>
  );
}

function ThemeModeMenu() {
  const {theme, setTheme} = useTheme('dark');
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={toggleTheme}
      className="theme-mode-trigger icon-button-circle h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {isDark ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />}
    </Button>
  );
}

const UPLOAD_ACCEPT = '.md,.markdown,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function PersistentHeader({route, doc, onBack, onEdit, onAction, onNew, onUpload, onNavigateModule, onPlannerNew, uploading = false}) {
  const fileInputRef = useRef(null);
  const isLibrary = route.type === 'library';
  const isPlanner = route.type === 'planner';

  return (
    <DocsHeader
      className={isLibrary || isPlanner ? 'library-header' : ''}
      actions={isPlanner ? (
        <div key="planner-actions" className="header-slot-enter flex items-center gap-2">
          {route.tab === 'home' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onPlannerNew}
              className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
            >
              <Plus width={14} height={14} /> Nueva reunión
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateModule?.('docs')}
            className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <FileText width={14} height={14} /> Documentos
          </Button>
        </div>
      ) : isLibrary ? (
        <div key="library-actions" className="header-slot-enter flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateModule?.('planner')}
            aria-label="Reuniones"
            className="header-compact-button h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <Calendar width={14} height={14} aria-hidden="true" /> <span className="header-label">Reuniones</span>
          </Button>
          <input
            ref={fileInputRef}
            className="library-file-input"
            type="file"
            accept={UPLOAD_ACCEPT}
            aria-label="Seleccionar documento para subir"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onUpload(file);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            aria-label={uploading ? 'Subiendo archivo…' : 'Subir archivo'}
            className="header-compact-button h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <FileArrowUp width={14} height={14} aria-hidden="true" /> <span className="header-label">{uploading ? 'Subiendo…' : 'Subir archivo'}</span>
          </Button>
          <Button variant="default" size="sm" onClick={onNew} aria-label="Crear documento" className="header-compact-button h-8 px-3 font-medium text-xs flex items-center gap-1.5">
            <Plus width={15} height={15} aria-hidden="true" /> <span className="header-label">Nuevo</span>
          </Button>
        </div>
      ) : doc ? (
        <div key="document-actions" className="header-slot-enter flex items-center gap-2">
          {!isImportBlocked(doc) && (
            <Button variant="default" size="sm" onClick={onEdit} className="h-8 px-3.5 font-medium text-xs flex items-center gap-1.5">
              <Pencil width={14} height={14} /> Editar
            </Button>
          )}
          <DocActionMenu doc={doc} triggerLabel="Acciones del documento" onAction={onAction} />
        </div>
      ) : null}
    >
      {isPlanner ? (
        route.tab && route.tab !== 'home' ? (
          <Button
            key="planner-back"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="Volver"
            className="back-button h-8 px-2 text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
          >
            <ChevronLeft width={15} height={15} /> Volver
          </Button>
        ) : (
          <span key="planner-brand" className="topbar-title header-slot-enter font-bold text-sm tracking-tight text-foreground">
            <span>Bardo</span>
          </span>
        )
      ) : isLibrary ? (
        <span key="library-title" className="topbar-title header-slot-enter font-bold text-sm tracking-tight text-foreground">
          <span>Bardo</span>
        </span>
      ) : (
        <Button key="document-title" variant="ghost" size="sm" onClick={onBack} aria-label="Volver a Documentos" className="back-button h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1">
          <ChevronLeft width={15} height={15} aria-hidden="true" /> <span className="header-label">Documentos</span>
        </Button>
      )}
    </DocsHeader>
  );
}

function Library({
  docs,
  query,
  setQuery,
  continueDoc,
  onContinue,
  draft = null,
  onContinueDraft,
  onOpen,
  onNew,
  onUpload,
  onDocAction,
  activeTab = 'active',
  onTabChange,
  activeCount = 0,
  archivedCount = 0,
}) {
  const fileInputRef = useRef(null);
  const isArchivedTab = activeTab === 'archived';
  const tabClass = selected => `px-3 py-1 rounded-md font-medium transition-all ${
    selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;

  return (
    <section className="library route-active">
      <div className="library-inner">
        <input
          ref={fileInputRef}
          className="library-file-input"
          type="file"
          accept={UPLOAD_ACCEPT}
          aria-label="Seleccionar documento para subir"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onUpload(file);
          }}
        />
        <InputGroup className="docs-search">
          <InputGroupAddon align="inline-start">
            <Magnifier width={15} height={15} className="text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={isArchivedTab ? 'Buscar en archivados…' : 'Buscar documentos…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Buscar documentos"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <Xmark width={14} height={14} />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        {draft && !query && !isArchivedTab && (
          <section className="library-section continue-section">
            <h2 className="section-title">Borrador sin terminar</h2>
            <button className="continue-row" type="button" onClick={onContinueDraft}>
              <span className="continue-accent" aria-hidden="true" />
              <span className="continue-copy">
                <strong>{draft.title || 'Sin título'}</strong>
                <span>Solo tú lo ves, en este dispositivo · Pulsa Listo para crearlo</span>
              </span>
              <ChevronRight width={16} height={16} className="text-muted-foreground" />
            </button>
          </section>
        )}

        {continueDoc && !query && !isArchivedTab && (
          <section className="library-section continue-section">
            <h2 className="section-title">Continuar lectura</h2>
            <button className="continue-row" type="button" onClick={onContinue}>
              <span className="continue-accent" aria-hidden="true" />
              <span className="continue-copy">
                <strong>{continueDoc.title || 'Sin título'}</strong>
                <span>{continueDoc.origin || 'Creado en Bardo'} · {changeActorName(continueDoc)} · {formatChangeTime(continueDoc)}</span>
              </span>
              <ChevronRight width={16} height={16} className="text-muted-foreground" />
            </button>
          </section>
        )}

        <section className="library-section recent-section">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs" role="group" aria-label="Mostrar documentos">
              <button
                type="button"
                aria-pressed={activeTab === 'active'}
                onClick={() => onTabChange?.('active')}
                className={tabClass(activeTab === 'active')}
              >
                Activos ({activeCount})
              </button>
              <button
                type="button"
                aria-pressed={activeTab === 'archived'}
                onClick={() => onTabChange?.('archived')}
                className={tabClass(activeTab === 'archived')}
              >
                Archivados ({archivedCount})
              </button>
            </div>
            {query && (
              <span className="text-xs text-muted-foreground" role="status">
                {docs.length} {docs.length === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
          </div>
          {docs.length > 0 ? (
            <div className="docs-list">
              {docs.map(doc => (
                <article className={`doc-row ${doc.archived ? 'opacity-85' : ''}`} key={doc.id}>
                  <span className="doc-symbol">
                    {doc.archived ? <Archive width={18} height={18} /> : doc.importStatus === 'failed' ? <TriangleExclamation width={18} height={18} /> : <File width={18} height={18} />}
                  </span>
                  <button
                    className="doc-row-main"
                    type="button"
                    onClick={() => onOpen(doc.id)}
                  >
                    <strong>{doc.title || 'Sin título'}</strong>
                    <span>
                      {doc.archived
                        ? 'Archivado'
                        : doc.importStatus === 'failed'
                          ? 'No pudimos leer este archivo'
                          : doc.importStatus === 'pending'
                            ? 'Procesando archivo…'
                            : (doc.origin || 'Creado en Bardo')} · {changeActorName(doc)} · {formatChangeTime(doc)}
                    </span>
                  </button>
                  <DocActionMenu
                    doc={doc}
                    triggerLabel={`Acciones de ${doc.title || 'documento'}`}
                    onAction={(action) => onDocAction(action, doc.id)}
                  />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              query={query}
              isArchived={isArchivedTab}
              archivedCount={archivedCount}
              onClearSearch={() => setQuery('')}
              onShowArchived={() => onTabChange?.('archived')}
              onNewDoc={onNew}
              onUpload={() => fileInputRef.current?.click()}
            />
          )}
        </section>
      </div>
    </section>
  );
}

function ImportFailedState({doc, onRemove, onDownloadOriginal}) {
  return (
    <div className="import-failed-state" role="alert">
      <div className="flex items-start gap-3">
        <TriangleExclamation width={20} height={20} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">No pudimos leer este archivo</p>
          <p className="text-sm text-muted-foreground mt-1">
            {doc.importError || 'El archivo puede estar dañado, protegido con contraseña o ser un escaneo sin texto.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {doc.hasSource !== false && (
          <Button variant="secondary" size="sm" onClick={onDownloadOriginal}>
            <ArrowDownToLine width={15} height={15} /> Descargar original
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={onRemove}>
          <TrashBin width={15} height={15} /> Eliminar
        </Button>
      </div>
    </div>
  );
}

function Reader({
  doc,
  onChecklistChange,
  skipTransition = false,
  showSharePrompt = false,
  onShare,
  onDismissShare,
  onRestore,
  onRemoveFailedImport,
  onDownloadOriginal,
}) {
  const failed = doc.importStatus === 'failed';
  const pending = doc.importStatus === 'pending';
  return (
    <section className={`doc-route route-active ${skipTransition ? 'route-no-transition' : ''}`.trim()}>
      <article className="document-shell">
        <header className="doc-intro">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">
              Último cambio realizado por {changeActorName(doc)} · {formatChangeTime(doc)}
            </span>
          </div>
          <h1 className="doc-title">{doc.title || 'Sin título'}</h1>
          {doc.description && <p className="doc-description">{doc.description}</p>}
          {doc.archived && (
            <div className="doc-inline-notice" role="status">
              <span>Este documento está archivado. Solo aparece en la pestaña Archivados.</span>
              <Button variant="secondary" size="sm" onClick={onRestore}>Restaurar</Button>
            </div>
          )}
          {showSharePrompt && !doc.archived && (
            <div className="doc-inline-notice" role="status">
              <span>Documento creado. ¿Quieres avisar en {channelLabel()}? {SHARE_CARD_HINT}</span>
              <div className="flex gap-2">
                <Button variant="default" size="sm" onClick={onShare}>Compartir en el canal</Button>
                <Button variant="ghost" size="sm" onClick={onDismissShare}>Ahora no</Button>
              </div>
            </div>
          )}
          {pending && (
            <p className="import-pending-banner text-sm text-muted-foreground" role="status">
              Procesando archivo… Bardo está convirtiendo el contenido y lo mostrará aquí en cuanto termine.
            </p>
          )}
        </header>
        {failed ? (
          <ImportFailedState doc={doc} onRemove={onRemoveFailedImport} onDownloadOriginal={onDownloadOriginal} />
        ) : (
          <RichBody html={pending ? '' : doc.body} onChecklistChange={pending ? undefined : onChecklistChange} />
        )}
      </article>
    </section>
  );
}

function DeleteAlertDialog({isOpen, doc, action = 'archive', onConfirm, onCancel}) {
  const isArchive = action === 'archive';
  const isFailedImport = action === 'remove-failed-import';
  return (
    <AlertDialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArchive ? 'Archivar documento' : isFailedImport ? 'Eliminar documento' : 'Eliminar definitivamente'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchive
              ? `“${doc?.title || 'Sin título'}” dejará de aparecer en Activos para todo el canal. Podrás restaurarlo desde Archivados.`
              : `“${doc?.title || 'Sin título'}” se eliminará para todo el canal. Esta acción no se puede deshacer.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant={isArchive ? 'default' : 'destructive'}
            onClick={() => onConfirm(doc?.id, action)}
          >
            {isArchive ? 'Archivar' : isFailedImport ? 'Eliminar' : 'Eliminar definitivamente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ShareConfirmDialog({isOpen, doc, onConfirm, onCancel}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Compartir en el canal</AlertDialogTitle>
          <AlertDialogDescription>
            Se publicará una tarjeta de “{doc?.title || 'Sin título'}” en {channelLabel()} para que todos puedan abrirlo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(doc?.id)}>Publicar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NewDocChoiceDialog({isOpen, draft, onContinue, onStartNew, onCancel}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Tienes un borrador sin terminar</AlertDialogTitle>
          <AlertDialogDescription>
            “{draft?.title || 'Sin título'}” todavía no se ha creado. Si empiezas uno nuevo, ese borrador se descartará.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStartNew}>Empezar uno nuevo</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continuar borrador</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LaunchNoticeDialog({notice, onRestore, onClose}) {
  const archived = notice?.kind === 'archived';
  return (
    <AlertDialog open={Boolean(notice)} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{archived ? 'Este documento fue archivado' : 'Este documento ya no existe'}</AlertDialogTitle>
          <AlertDialogDescription>
            {archived
              ? `“${notice?.title || 'Sin título'}” está en Archivados. Puedes restaurarlo para que vuelva a aparecer en Activos.`
              : 'Pudo haber sido eliminado o no está compartido en este canal. Te mostramos los documentos de este canal.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {archived ? (
            <>
              <AlertDialogCancel onClick={onClose}>Cerrar</AlertDialogCancel>
              <AlertDialogAction onClick={onRestore}>Restaurar y abrir</AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction onClick={onClose}>Entendido</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InsertLinkModal({isOpen, isEditing = false, linkValue, setLinkValue, onApply, onRemove, onOpenLink, onCancel}) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar enlace' : 'Agregar enlace'}</DialogTitle>
        </DialogHeader>
        <Field className="w-full">
          <FieldLabel htmlFor="bardo-link-url">Dirección del enlace</FieldLabel>
          <Input
            id="bardo-link-url"
            autoFocus
            inputMode="url"
            placeholder="https://ejemplo.com"
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && linkValue.trim()) {
                e.preventDefault();
                onApply();
              }
            }}
          />
        </Field>
        <DialogFooter className="flex-wrap gap-2">
          {isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={onOpenLink} disabled={!linkValue.trim()}>
                <ArrowUpRightFromSquare width={14} height={14} /> Abrir
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <LinkSlash width={14} height={14} /> Quitar enlace
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="default" size="sm" disabled={!linkValue.trim()} onClick={onApply}>
            {isEditing ? 'Guardar' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextPreviewModal({isOpen, doc, onCopy, onCancel}) {
  const text = doc ? documentPlainText(doc) : '';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Texto del documento</DialogTitle>
          <DialogDescription className="truncate">{doc?.title || 'Sin título'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          <pre className="markdown-preview-content" tabIndex="0" aria-label="Texto del documento">{text}</pre>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ChevronLeft width={15} height={15} /> Atrás
          </Button>
          <Button variant="default" size="sm" onClick={() => onCopy(text)}>
            <Copy width={15} height={15} /> Copiar texto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  const storeRef = useRef(null);
  const recoveredJournalRef = useRef(null);
  const lastPersistOkRef = useRef(true);
  if (storeRef.current === null) {
    const recovered = applyJournal(loadStore());
    storeRef.current = recovered.store;
    recoveredJournalRef.current = recovered.journal;
  }
  const [store, setStoreState] = useState(() => storeRef.current);
  const [route, setRoute] = useState(parseRoute);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [linkValue, setLinkValue] = useState('');
  const [lastOpened, setLastOpened] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(lastOpenedKey()) || 'null');
    } catch {
      return null;
    }
  });
  const [draft, setDraft] = useState(readDraft);
  // Cambia para remontar el editor de documento nuevo con una hoja en blanco.
  const [newDocNonce, setNewDocNonce] = useState(0);
  // Documento recién creado: el lector ofrece compartirlo en el canal.
  const [sharePromptDocId, setSharePromptDocId] = useState(null);
  // Ids de archivados en el servidor (sin contenido) para el contador de la pestaña.
  const [archivedSummaryIds, setArchivedSummaryIds] = useState(() => new Set());
  // Tarjeta de un documento archivado o eliminado (ver production-bridge).
  const [launchNotice, setLaunchNotice] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Revisión por documento: cambia cuando se adopta una versión remota y obliga a
  // remontar el editor con el contenido nuevo.
  const [revisions, setRevisions] = useState({});
  const revisionsRef = useRef({});
  const conflictCopiesRef = useRef(new Map());
  // Documentos recreados con un id nuevo (403): los guardados tardíos se redirigen.
  const redirectsRef = useRef(new Map());
  const lastOpenedRef = useRef(lastOpened);
  const scrollMemory = useRef(new Map());
  const routeRef = useRef(route);
  const pendingRestore = useRef(null);
  const skipNextRouteAnimation = useRef(false);
  const isProduction = Boolean(window.__BARDO_PRODUCTION__);

  const [libraryTab, setLibraryTab] = useState('active');

  /**
   * Única vía para modificar el store: escribe localStorage (si hay espacio) y
   * encola la sincronización de forma síncrona, para que nada dependa de que
   * React alcance a re-renderizar (p. ej. al cerrar la Activity).
   */
  const commitStore = useCallback(updater => {
    const prev = storeRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (!next || next === prev) return prev;
    storeRef.current = next;
    lastPersistOkRef.current = saveStore(next);
    try {
      window.__bardoSyncDocs?.(next);
    } catch (error) {
      console.error('Bardo Docs: no se pudo encolar la sincronización', error);
    }
    setStoreState(next);
    return next;
  }, []);

  // Reenviar una edición recuperada de la copia de seguridad local.
  useEffect(() => {
    const journal = recoveredJournalRef.current;
    if (!journal) return;
    recoveredJournalRef.current = null;
    const doc = storeRef.current.docs.find(item => item.id === journal.docId);
    if (doc && window.__bardoDocsSync?.enqueue) {
      window.__bardoDocsSync.enqueue(doc, {baseUpdatedAt: journal.baseUpdatedAt ?? undefined});
    }
    const persisted = saveStore(storeRef.current);
    try {
      window.__bardoSyncDocs?.(storeRef.current);
    } catch {}
    if (persisted) clearJournal(journal.docId);
  }, []);

  const docs = store.docs;
  const activeDocs = useMemo(() => docs.filter(doc => !doc.archived), [docs]);
  const archivedDocs = useMemo(() => docs.filter(doc => Boolean(doc.archived)), [docs]);
  // Archivados reales sin abrir la pestaña: los del servidor (resumen) que no
  // estén activos o eliminados aquí, más los archivados en esta sesión.
  const archivedCount = useMemo(() => {
    const deleted = new Set(store.deletedIds || []);
    const ids = new Set(archivedDocs.map(doc => doc.id));
    const byId = new Map(docs.map(doc => [doc.id, doc]));
    archivedSummaryIds.forEach(id => {
      if (deleted.has(id)) return;
      const local = byId.get(id);
      if (!local || local.archived) ids.add(id);
    });
    return ids.size;
  }, [archivedDocs, archivedSummaryIds, docs, store.deletedIds]);

  const displayedDocs = libraryTab === 'archived' ? archivedDocs : activeDocs;
  const sortedDocs = useMemo(() => [...displayedDocs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [displayedDocs]);
  const docsById = useMemo(() => new Map(docs.map(doc => [doc.id, doc])), [docs]);
  const currentDoc = route.id ? docsById.get(route.id) : null;

  const showToast = useCallback(message => {
    toast(message);
  }, []);

  const bumpRevision = useCallback(ids => {
    const next = {...revisionsRef.current};
    ids.forEach(id => { next[id] = (next[id] || 0) + 1; });
    revisionsRef.current = next;
    setRevisions(next);
  }, []);

  // Contador de archivados al abrir la biblioteca (sin descargar su contenido).
  useEffect(() => {
    if (!window.__bardoFetchArchivedSummary) return undefined;
    let cancelled = false;
    window.__bardoFetchArchivedSummary().then(ids => {
      if (!cancelled && Array.isArray(ids)) setArchivedSummaryIds(new Set(ids));
    }).catch(error => console.warn('Bardo Docs: no se pudo contar los archivados', error));
    return () => { cancelled = true; };
  }, []);

  // Se abrió la tarjeta de un documento que ya no está entre los activos.
  useEffect(() => {
    const missingId = window.__BARDO_LAUNCH_MISSING_DOC__;
    if (!missingId) return undefined;
    window.__BARDO_LAUNCH_MISSING_DOC__ = null;
    let cancelled = false;
    Promise.resolve(window.__bardoFetchDocument?.(missingId) ?? null).then(serverDoc => {
      if (cancelled) return;
      if (serverDoc?.archived) {
        setLaunchNotice({kind: 'archived', id: serverDoc.id, title: serverDoc.title, doc: serverDoc});
      } else if (serverDoc) {
        // Existe pero no venía en la lista (p. ej. más de 150 documentos): abrirlo.
        commitStore(prev => (prev.docs.some(doc => doc.id === serverDoc.id)
          ? prev
          : {...prev, docs: [...prev.docs, serverDoc]}));
        location.hash = `#doc-${serverDoc.id}`;
      } else {
        setLaunchNotice({kind: 'missing', id: missingId});
      }
    }).catch(() => {
      if (!cancelled) setLaunchNotice({kind: 'missing', id: missingId});
    });
    return () => { cancelled = true; };
  }, [commitStore]);

  // Tarjeta antigua de /doc-new con título y un borrador sin terminar: preguntar.
  useEffect(() => {
    const pendingTitle = window.__BARDO_PENDING_NEW_TITLE__;
    if (!pendingTitle) return;
    window.__BARDO_PENDING_NEW_TITLE__ = null;
    const existing = readDraft();
    if (existing) setModal({type: 'new-doc-choice', draft: existing, title: pendingTitle});
  }, []);

  // Cargar archivados del servidor al abrir la pestaña (ya registrados como
  // confirmados en el motor de sincronización, así que no se reenvían).
  useEffect(() => {
    if (libraryTab !== 'archived' || !window.__bardoFetchArchivedDocs) return;
    let cancelled = false;
    window.__bardoFetchArchivedDocs().then(archived => {
      if (cancelled || !Array.isArray(archived) || archived.length === 0) return;
      commitStore(prev => {
        const existingIds = new Set(prev.docs.map(d => d.id));
        const newArchived = archived.filter(d => !existingIds.has(d.id));
        if (newArchived.length === 0) return prev;
        return {...prev, docs: [...prev.docs, ...newArchived]};
      });
    }).catch(err => {
      console.error('Bardo Docs: error fetching archived docs', err);
      if (!cancelled) showToast('No se pudieron cargar los documentos archivados');
    });
    return () => { cancelled = true; };
  }, [commitStore, libraryTab, showToast]);

  const captureBodyOffset = useCallback(() => {
    const body = document.querySelector('.route-active .doc-body');
    if (!body) return null;
    const bodyTop = body.getBoundingClientRect().top + window.scrollY;
    return window.scrollY - bodyTop;
  }, []);

  const go = useCallback((hash, {preserveBody = false, restore = null, skipTransition = false} = {}) => {
    scrollMemory.current.set(routeRef.current.key, window.scrollY);
    skipNextRouteAnimation.current = skipTransition;
    if (preserveBody) pendingRestore.current = {kind: 'body', target: hash.replace(/^#/, ''), offset: captureBodyOffset() ?? 0};
    else if (restore) pendingRestore.current = {kind: 'absolute', target: hash.replace(/^#/, ''), y: restore};
    else pendingRestore.current = {kind: 'absolute', target: hash.replace(/^#/, ''), y: 0};
    if (location.hash === hash) setRoute(parseRoute());
    else location.hash = hash;
  }, [captureBodyOffset]);

  // Cambios que llegan del motor de sincronización (conflictos, normalizaciones…).
  useEffect(() => {
    if (!window.__bardoSubscribeDocs) return undefined;
    return window.__bardoSubscribeDocs(event => {
      if (event?.type === 'conflict') {
        const copyId = newLocalId();
        const now = new Date().toISOString();
        let copyTitle = '';
        commitStore(prev => {
          const current = prev.docs.find(d => d.id === event.id) || event.localDoc;
          if (!current) return prev;
          copyTitle = `${current.title || 'Sin título'} (copia en conflicto)`;
          const copy = {
            ...current,
            id: copyId,
            title: copyTitle,
            origin: 'Copia en conflicto',
            archived: false,
            archivedAt: null,
            importStatus: 'ready',
            hasSource: false,
            createdAt: now,
            updatedAt: now,
          };
          const docsNext = prev.docs.map(d => (d.id === event.id && event.serverDoc ? {...event.serverDoc} : d));
          return {...prev, docs: [copy, ...docsNext]};
        });
        conflictCopiesRef.current.set(event.id, copyId);
        bumpRevision([event.id]);
        const editing = routeRef.current.type === 'edit' && routeRef.current.id === event.id;
        showToast(`Otra persona editó este documento al mismo tiempo. Guardamos tu versión como “${copyTitle}”.`);
        if (editing) go(`#edit-${copyId}`, {skipTransition: true});
        return;
      }
      if (event?.type === 'saved' && event.document?.id) {
        const saved = event.document;
        commitStore(prev => {
          let touched = false;
          const docsNext = prev.docs.map(d => {
            if (d.id !== event.id) return d;
            touched = true;
            return {
              ...d,
              updatedAt: saved.updatedAt || d.updatedAt,
              serverUpdatedAt: saved.updatedAt || d.serverUpdatedAt || null,
              updatedByName: saved.updatedByName || d.updatedByName,
            };
          });
          return touched ? {...prev, docs: docsNext} : prev;
        });
        return;
      }
      if (event?.type === 'replace' && Array.isArray(event.docs) && event.docs.length) {
        const incoming = new Map(event.docs.map(doc => [doc.id, doc]));
        commitStore(prev => ({
          ...prev,
          docs: prev.docs.map(d => (incoming.has(d.id) ? {...incoming.get(d.id), archived: d.archived} : d)),
        }));
        bumpRevision([...incoming.keys()]);
        return;
      }
      if (event?.type === 'refresh' && Array.isArray(event.docs)) {
        // Biblioteca recuperada tras arrancar sin conexión.
        const incoming = new Map(event.docs.map(doc => [doc.id, doc]));
        const replaced = [];
        commitStore(prev => {
          const known = new Set(prev.docs.map(d => d.id));
          const docsNext = prev.docs.map(d => {
            if (!incoming.has(d.id)) return d;
            replaced.push(d.id);
            return {...incoming.get(d.id)};
          });
          const added = event.docs.filter(doc => !known.has(doc.id));
          return {...prev, docs: [...added, ...docsNext]};
        });
        if (replaced.length) bumpRevision(replaced);
        return;
      }
      if (event?.type === 'recreated' && event.oldId && event.newId) {
        // Sin acceso al documento original (403): el trabajo se guarda como uno nuevo.
        redirectsRef.current.set(event.oldId, event.newId);
        commitStore(prev => {
          const current = prev.docs.find(d => d.id === event.oldId);
          const recreated = {
            ...(current || event.doc),
            ...event.doc,
            id: event.newId,
            origin: 'Recuperado en Bardo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            serverUpdatedAt: null,
          };
          return {...prev, docs: [recreated, ...prev.docs.filter(d => d.id !== event.oldId)]};
        });
        showToast('No tenías acceso a ese documento; guardamos tus cambios como un documento nuevo.');
        const viewing = routeRef.current.id === event.oldId;
        if (viewing) go(`#${routeRef.current.type === 'edit' ? 'edit' : 'doc'}-${event.newId}`, {skipTransition: true});
        return;
      }
      if (event?.type === 'import-failed' && event.id) {
        // El archivo no se pudo leer: mostrar el error con salida, no "Procesando…".
        commitStore(prev => ({
          ...prev,
          docs: prev.docs.map(d => (d.id === event.id && d.importStatus === 'pending'
            ? {...d, importStatus: 'failed', importError: event.message || ''}
            : d)),
        }));
        return;
      }
      if (event?.type === 'archive-failed' && event.id) {
        // Sin permiso para archivar/restaurar: volver al estado del servidor.
        commitStore(prev => ({
          ...prev,
          docs: prev.docs.map(d => (d.id === event.id
            ? {...d, archived: Boolean(event.archived), archivedAt: event.archived ? d.archivedAt : null}
            : d)),
        }));
        return;
      }
      if (event?.type === 'offline-boot') {
        showToast('Sin conexión con Bardo. Mostramos tu copia local y reintentaremos en segundo plano.');
        return;
      }
      if (event?.type === 'storage-warning') warnStorageFull();
    });
  }, [bumpRevision, commitStore, go, showToast]);

  // Errores de sincronización visibles fuera del editor (biblioteca, lector).
  useEffect(() => {
    let offlineNotified = false;
    const onStatus = event => {
      const detail = event.detail || {};
      if (detail.scope !== 'docs') return;
      if (detail.state === 'saved') offlineNotified = false;
      if (detail.state === 'offline' && !offlineNotified) {
        offlineNotified = true;
        showToast('Sin conexión con Bardo. Tus cambios quedan guardados y se enviarán al reconectar.');
      }
      if (detail.state === 'error' && detail.message) showToast(detail.message);
    };
    window.addEventListener('bardo-sync-status', onStatus);
    return () => window.removeEventListener('bardo-sync-status', onStatus);
  }, [showToast]);

  useEffect(() => {
    const onHash = () => {
      scrollMemory.current.set(routeRef.current.key, window.scrollY);
      const nextRoute = parseRoute();
      if (nextRoute.type === 'library') {
        if (lastOpenedRef.current) setLastOpened(lastOpenedRef.current);
        setDraft(readDraft());
      }
      const applyRoute = () => setRoute(nextRoute);
      const currentRoute = routeRef.current;
      const isDocumentModeSwitch = currentRoute.id
        && nextRoute.id
        && currentRoute.id === nextRoute.id
        && ((currentRoute.type === 'doc' && nextRoute.type === 'edit')
          || (currentRoute.type === 'edit' && nextRoute.type === 'doc'));
      const shouldAnimateRoute = !skipNextRouteAnimation.current
        && !isDocumentModeSwitch
        && typeof document.startViewTransition === 'function'
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (shouldAnimateRoute) {
        try {
          const transition = document.startViewTransition(applyRoute);
          // Una transición interrumpida rechaza estas promesas ("Transition was
          // aborted because of invalid state"); no es un error de la app.
          transition?.ready?.catch?.(() => {});
          transition?.finished?.catch?.(() => {});
          transition?.updateCallbackDone?.catch?.(() => {});
        } catch {
          applyRoute();
        }
      } else applyRoute();
    };
    window.addEventListener('hashchange', onHash);
    if (!location.hash) history.replaceState(null, '', '#docs');
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useLayoutEffect(() => {
    routeRef.current = route;
    requestAnimationFrame(() => {
      const pending = pendingRestore.current;
      if (pending && pending.target === route.key) {
        if (pending.kind === 'body') {
          const body = document.querySelector('.route-active .doc-body');
          if (body) {
            const bodyTop = body.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.max(0, bodyTop + pending.offset));
          }
        } else window.scrollTo(0, pending.y || 0);
        pendingRestore.current = null;
        return;
      }
      const saved = scrollMemory.current.get(route.key);
      window.scrollTo(0, saved ?? 0);
    });
    skipNextRouteAnimation.current = false;
  }, [route]);

  useEffect(() => {
    if (route.type !== 'doc' || !currentDoc) return;
    const onScroll = () => {
      const body = document.querySelector('.route-active .doc-body');
      const offset = body ? window.scrollY - (body.getBoundingClientRect().top + window.scrollY) : 0;
      const next = {id: currentDoc.id, offset, at: Date.now()};
      lastOpenedRef.current = next;
      try {
        localStorage.setItem(lastOpenedKey(), JSON.stringify(next));
      } catch {}
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, [route.type, currentDoc?.id]);

  const updateDoc = useCallback((id, patch) => {
    const actorName = patch.updatedByName || currentEditorName();
    commitStore(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? {
        ...doc,
        ...patch,
        updatedAt: patch.updatedAt || new Date().toISOString(),
        ...(actorName ? {updatedByName: actorName} : {}),
      } : doc)
    }));
  }, [commitStore]);

  /** Guardado del editor. Un snapshot de una revisión antigua (tras un conflicto) va a la copia. */
  const saveEditorSnapshot = useCallback((docId, revision, snapshot) => {
    const redirected = redirectsRef.current.get(docId);
    if (redirected) {
      updateDoc(redirected, snapshot);
      return;
    }
    const current = revisionsRef.current[docId] || 0;
    if (revision !== current) {
      const copyId = conflictCopiesRef.current.get(docId);
      if (copyId) updateDoc(copyId, {...snapshot, title: `${snapshot.title || 'Sin título'} (copia en conflicto)`});
      return;
    }
    updateDoc(docId, snapshot);
    if (lastPersistOkRef.current) clearJournal(docId);
  }, [updateDoc]);

  const journalEditorSnapshot = useCallback((docId, revision, snapshot) => {
    if (redirectsRef.current.has(docId)) return;
    if ((revisionsRef.current[docId] || 0) !== revision) return;
    writeJournal({
      docId,
      snapshot,
      baseUpdatedAt: window.__bardoDocsSync?.baseFor?.(docId) ?? null,
      at: Date.now(),
    });
  }, []);

  const duplicateDoc = useCallback(id => {
    const source = docsById.get(id);
    if (!source) return;
    const copy = {
      ...source,
      id: newLocalId(),
      title: `${source.title || 'Sin título'} (copia)`,
      createdByName: currentEditorName() || source.createdByName,
      updatedByName: currentEditorName() || source.updatedByName,
      builtin: false,
      stress: false,
      archived: false,
      archivedAt: null,
      importStatus: 'ready',
      hasSource: false,
      origin: 'Duplicado en Bardo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commitStore(prev => ({...prev, docs: [copy, ...prev.docs]}));
    showToast('Documento duplicado');
    go(`#doc-${copy.id}`);
  }, [commitStore, docsById, go, showToast]);

  const uploadingRef = useRef(false);
  const uploadDocument = useCallback(async file => {
    if (uploadingRef.current) {
      showToast('Ya estamos convirtiendo un archivo. Espera a que termine.');
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    try {
      showToast(`Convirtiendo “${file?.name || 'archivo'}”… puede tardar unos segundos.`);
      const imported = await convertDocumentFile(file);
      const now = new Date().toISOString();
      const doc = {
        id: newLocalId(),
        title: imported.title,
        description: '',
        body: markdownToHtml(imported.markdown, imported.title),
        origin: 'Subido a Bardo',
        sourceName: imported.sourceName,
        createdAt: now,
        updatedAt: now,
        createdByName: currentEditorName(),
        updatedByName: currentEditorName(),
        builtin: false,
        stress: false,
      };
      commitStore(prev => ({...prev, docs: [doc, ...prev.docs]}));
      showToast('Documento creado a partir del archivo');
      setSharePromptDocId(doc.id);
      go(`#doc-${doc.id}`);
    } catch (error) {
      console.error('Bardo Docs: no se pudo subir el documento', error);
      // Solo mensajes propios en español (ImportError); nunca el texto de pdf.js.
      showToast(error?.userMessage || 'No pudimos leer este archivo. Puede estar dañado o en un formato que Bardo no reconoce.');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }, [commitStore, go, showToast]);

  const deleteDoc = useCallback(async (id, action = 'archive') => {
    setModal(null);
    if (action === 'remove-failed-import') {
      // Importación que no se pudo leer: archivar y luego eliminar definitivamente.
      commitStore(prev => ({
        ...prev,
        docs: prev.docs.map(doc => doc.id === id ? {...doc, archived: true, archivedAt: new Date().toISOString()} : doc),
      }));
      if (routeRef.current.id === id) go('#docs');
      if (!window.__bardoDeleteDocumentPermanent) {
        commitStore(prev => ({...prev, docs: prev.docs.filter(doc => doc.id !== id)}));
        showToast('Documento eliminado');
        return;
      }
      try {
        const settled = await window.__bardoSettleDocument?.(id);
        if (settled === false) throw new Error('No pudimos conectar con Bardo. El documento quedó archivado; vuelve a intentarlo desde Archivados.');
        await window.__bardoDeleteDocumentPermanent(id);
        commitStore(prev => ({
          ...prev,
          docs: prev.docs.filter(doc => doc.id !== id),
          deletedIds: [...new Set([...(prev.deletedIds || []), id])],
        }));
        showToast('Documento eliminado');
      } catch (error) {
        showToast(error?.status === 403
          ? 'Lo archivamos, pero solo quien subió el archivo o quien modera el canal puede eliminarlo definitivamente.'
          : (error?.message || 'No se pudo eliminar el documento.'));
      }
      return;
    }
    if (action === 'permanent-delete') {
      if (window.__bardoDeleteDocumentPermanent) {
        try {
          await window.__bardoDeleteDocumentPermanent(id);
        } catch (error) {
          console.error('Bardo Docs: no se pudo eliminar definitivamente', error);
          showToast(error?.message || 'No se pudo eliminar el documento');
          return;
        }
      }
      commitStore(prev => ({
        ...prev,
        docs: prev.docs.filter(doc => doc.id !== id),
        deletedIds: [...new Set([...(prev.deletedIds || []), id])],
      }));
      setArchivedSummaryIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('Documento eliminado definitivamente');
      if (routeRef.current.id === id) go('#docs');
      return;
    }

    // Archivar: el motor de sincronización envía DELETE /api/docs/:id (= archivar).
    commitStore(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? {
        ...doc,
        archived: true,
        archivedAt: new Date().toISOString(),
      } : doc),
    }));
    showToast('Documento archivado');
    if (routeRef.current.type !== 'library') go('#docs');
  }, [commitStore, go, showToast]);

  const restoreDoc = useCallback(id => {
    commitStore(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? {
        ...doc,
        archived: false,
        archivedAt: null,
      } : doc),
    }));
    setArchivedSummaryIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast('Documento restaurado');
  }, [commitStore, showToast]);

  /** Documento nuevo: hoja en blanco, salvo que el usuario elija seguir su borrador. */
  const startNewDoc = useCallback(() => {
    const existing = readDraft();
    if (existing) {
      setModal({type: 'new-doc-choice', draft: existing});
      return;
    }
    try { localStorage.removeItem(draftKey()); } catch {}
    setDraft(null);
    setNewDocNonce(n => n + 1);
    go('#new');
  }, [go]);

  const continueDraft = useCallback(() => {
    setModal(null);
    go('#new');
  }, [go]);

  const discardDraftAndStart = useCallback(title => {
    setModal(null);
    try {
      if (title) {
        localStorage.setItem(draftKey(), JSON.stringify({title, description: '', body: '<p><br></p>', updatedAt: new Date().toISOString()}));
      } else {
        localStorage.removeItem(draftKey());
      }
    } catch {}
    setDraft(null);
    setNewDocNonce(n => n + 1);
    showToast('Borrador descartado. Empezaste un documento nuevo.');
    go('#new');
  }, [go, showToast]);

  /** Marcar una tarea en el lector (se reaplica sola si otra persona editó a la vez). */
  const toggleChecklistInReader = useCallback((id, body, op) => {
    const prevDoc = storeRef.current.docs.find(doc => doc.id === id);
    updateDoc(id, {body});
    if (op && Number.isInteger(op.index) && op.index >= 0) {
      try {
        window.__bardoNoteChecklistToggle?.(id, op, prevDoc);
      } catch {}
    }
  }, [updateDoc]);

  const publishDoc = useCallback(async id => {
    setModal(null);
    if (!window.__bardoPublishDocument) {
      showToast('Compartir en el canal solo está disponible dentro de Discord.');
      return;
    }
    try {
      await window.__bardoPublishDocument(id);
      setSharePromptDocId(current => (current === id ? null : current));
      showToast(`Documento compartido en ${channelLabel()}`);
    } catch (error) {
      console.error('Bardo Docs: no se pudo enviar el documento al canal', error);
      showToast(error?.message || 'No se pudo compartir el documento en el canal.');
    }
  }, [showToast]);

  const exportDoc = useCallback(async (doc, format) => {
    const label = EXPORT_FORMAT_LABELS[format] || 'el archivo';
    if (!window.__bardoExportLink) {
      // Fuera de Discord (desarrollo): solo el texto con formato, generado aquí.
      if (format === 'md') {
        downloadFile(`${documentFileStem(doc)}.md`, 'text/markdown;charset=utf-8', documentMarkdown(doc));
        showToast('Se generó el archivo .md');
      } else {
        showToast('Las descargas en PDF y Word están disponibles dentro de Discord.');
      }
      return;
    }
    showToast(`Preparando ${label}…`);
    try {
      const {url} = await window.__bardoExportLink(doc.id, format);
      const opened = await openExternalUrl(url);
      showToast(opened
        ? 'Abriendo la descarga en tu navegador…'
        : 'Discord no abrió el navegador. Vuelve a intentarlo y acepta el aviso de enlace externo.');
    } catch (error) {
      console.error(`Bardo Docs: no se pudo exportar ${format}`, error);
      showToast(error?.message || `No pudimos preparar ${label}.`);
    }
  }, [showToast]);

  const downloadOriginal = useCallback(async id => {
    if (!window.__bardoDownloadOriginal) {
      showToast('La descarga del archivo original está disponible dentro de Discord.');
      return;
    }
    try {
      const result = await window.__bardoDownloadOriginal(id);
      if (result?.url) {
        const opened = await openExternalUrl(result.url);
        showToast(opened ? 'Abriendo el archivo original en tu navegador…' : 'Discord no abrió el navegador. Vuelve a intentarlo.');
      } else {
        showToast('Iniciamos la descarga del archivo original.');
      }
    } catch (error) {
      showToast(error?.message || 'No pudimos descargar el archivo original.');
    }
  }, [showToast]);

  const restoreFromNotice = useCallback(() => {
    const notice = launchNotice;
    setLaunchNotice(null);
    if (!notice?.doc) return;
    const local = notice.doc;
    commitStore(prev => (prev.docs.some(doc => doc.id === local.id)
      ? prev
      : {...prev, docs: [...prev.docs, local]}));
    restoreDoc(local.id);
    go(`#doc-${local.id}`);
  }, [commitStore, go, launchNotice, restoreDoc]);

  const openDoc = useCallback((id, fromContinue = false) => {
    const target = `#doc-${id}`;
    if (fromContinue && lastOpened?.id === id) {
      pendingRestore.current = {kind: 'body', target: `doc-${id}`, offset: lastOpened.offset || 0};
      location.hash = target;
    } else go(target);
  }, [go, lastOpened]);

  const filteredDocs = useMemo(() => filterDocumentsByQuery(sortedDocs, query), [query, sortedDocs]);

  // "Continuar lectura" solo para un documento que de verdad se abrió antes.
  const continueDoc = lastOpened?.id && docsById.has(lastOpened.id) && !docsById.get(lastOpened.id).archived
    ? docsById.get(lastOpened.id)
    : null;

  const docAction = useCallback(async (action, targetDoc) => {
    const doc = targetDoc?.id ? targetDoc : docsById.get(targetDoc);
    if (!doc) return;
    if (action === 'open') openDoc(doc.id);
    if (action === 'edit') go(`#edit-${doc.id}`, {preserveBody: route.type === 'doc'});
    if (action === 'duplicate') duplicateDoc(doc.id);
    if (action === 'archive') setModal({type: 'delete', docId: doc.id, action: 'archive'});
    if (action === 'restore') restoreDoc(doc.id);
    if (action === 'permanent-delete') setModal({type: 'delete', docId: doc.id, action: 'permanent-delete'});
    if (action === 'remove-failed-import') setModal({type: 'delete', docId: doc.id, action: 'remove-failed-import'});

    if (action === 'copy') {
      const copied = await copyTextToClipboard(documentPlainText(doc));
      if (copied) {
        showToast('Texto copiado');
      } else {
        showToast('No se pudo copiar automáticamente. Selecciona el texto y cópialo desde aquí.');
        setModal({type: 'text-preview', docId: doc.id});
      }
    }
    if (action === 'publish') {
      if (!window.__bardoPublishDocument) showToast('Compartir en el canal solo está disponible dentro de Discord.');
      else setModal({type: 'share', docId: doc.id});
    }
    if (action === 'text-preview') setModal({type: 'text-preview', docId: doc.id});
    if (action === 'markdown') await exportDoc(doc, 'md');
    if (action === 'pdf' || action === 'docx') await exportDoc(doc, action);
  }, [docsById, duplicateDoc, exportDoc, go, openDoc, restoreDoc, route.type, showToast]);

  const editorDocId = route.type === 'edit' ? currentDoc?.id : null;
  const editorRevision = editorDocId ? (revisions[editorDocId] || 0) : 0;
  const showEditor = route.type === 'new' || (route.type === 'edit' && Boolean(currentDoc));
  const editorReadOnlyMessage = route.type === 'edit' && currentDoc?.importStatus === 'failed'
    ? 'No pudimos leer este archivo, así que no se puede editar. Ábrelo para descargar el original o eliminarlo.'
    : '';

  return (
    <main className="app-root">
      {(route.type === 'library' || route.type === 'planner' || (route.type === 'doc' && currentDoc)) && (
        <PersistentHeader
          route={route}
          doc={currentDoc}
          onBack={() => {
            if (route.type === 'planner' && route.tab && route.tab !== 'home') {
              go('#planner', {skipTransition: true});
            } else {
              go('#docs', {restore: scrollMemory.current.get('library') || 0});
            }
          }}
          onEdit={() => currentDoc && go(`#edit-${currentDoc.id}`, {preserveBody: true})}
          onAction={docAction}
          onNew={startNewDoc}
          onUpload={uploadDocument}
          uploading={uploading}
          onPlannerNew={() => go('#planner-new')}
          onNavigateModule={(mod) => go(mod === 'planner' ? '#planner' : '#docs')}
        />
      )}
      {route.type === 'planner' && (
        <PlannerModule
          initialTab={route.tab || 'home'}
          onSwitchTab={(tab) => {
            if (tab === 'home') go('#planner', {skipTransition: true});
            else if (tab === 'agenda') go('#planner-agenda', {skipTransition: true});
            else go(`#planner-${tab}`, {skipTransition: true});
          }}
          onSaveDocToLibrary={(docData) => {
            // The acta id is stable per meeting run: saving again updates it.
            const id = docData.id || newLocalId();
            const existing = (storeRef.current?.docs || []).find((d) => d.id === id) || null;
            const doc = buildMinutesDoc({...docData, id}, {existing, editorName: currentEditorName()});
            commitStore((prev) => ({...prev, docs: [doc, ...(prev.docs || []).filter((d) => d.id !== doc.id)]}));
            showToast(existing ? 'Acta actualizada en Documentos' : 'Acta guardada en Documentos');
            go(`#doc-${doc.id}`);
          }}
        />
      )}
      {route.type === 'library' && (
        <Library
          docs={filteredDocs}
          query={query}
          setQuery={setQuery}
          continueDoc={continueDoc}
          onContinue={() => continueDoc && openDoc(continueDoc.id, true)}
          draft={draft}
          onContinueDraft={() => go('#new')}
          onOpen={openDoc}
          onNew={startNewDoc}
          onUpload={uploadDocument}
          onDocAction={docAction}
          activeTab={libraryTab}
          onTabChange={setLibraryTab}
          activeCount={activeDocs.length}
          archivedCount={archivedCount}
        />
      )}

      {route.type === 'doc' && currentDoc && (
        <Reader
          doc={currentDoc}
          skipTransition={skipNextRouteAnimation.current}
          onChecklistChange={(body, op) => toggleChecklistInReader(currentDoc.id, body, op)}
          showSharePrompt={sharePromptDocId === currentDoc.id && Boolean(window.__bardoPublishDocument)}
          onShare={() => publishDoc(currentDoc.id)}
          onDismissShare={() => setSharePromptDocId(null)}
          onRestore={() => restoreDoc(currentDoc.id)}
          onRemoveFailedImport={() => docAction('remove-failed-import', currentDoc)}
          onDownloadOriginal={() => downloadOriginal(currentDoc.id)}
        />
      )}

      {showEditor && (
        <BardoEditor
          key={route.type === 'new' ? `new:${newDocNonce}` : `${editorDocId}:${editorRevision}`}
          doc={route.type === 'new' ? null : currentDoc}
          isNew={route.type === 'new'}
          readOnly={route.type === 'edit' && isImportBlocked(currentDoc)}
          readOnlyMessage={editorReadOnlyMessage}
          remoteSync={isProduction}
          themeModeMenu={ThemeModeMenu}
          onBack={() => (route.type === 'new' || !editorDocId
            ? go('#docs')
            : go(`#doc-${editorDocId}`, {preserveBody: true, skipTransition: true}))}
          onFinish={(snapshot) => {
            if (route.type === 'new' && isEmptyDocSnapshot(snapshot)) {
              // Nada escrito: no se crea un documento vacío "Sin título".
              try {
                localStorage.removeItem(draftKey());
              } catch {}
              setDraft(null);
              go('#docs');
              return;
            }
            if (route.type === 'new') {
              const doc = {
                id: newLocalId(),
                ...snapshot,
                title: snapshot.title || 'Sin título',
                origin: 'Creado en Bardo',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdByName: currentEditorName(),
                updatedByName: currentEditorName(),
                builtin: false,
                stress: false,
              };
              commitStore(prev => ({...prev, docs: [doc, ...prev.docs]}));
              try {
                localStorage.removeItem(draftKey());
              } catch {}
              setDraft(null);
              showToast('Documento creado');
              setSharePromptDocId(doc.id);
              go(`#doc-${doc.id}`);
            } else if (editorDocId) {
              saveEditorSnapshot(editorDocId, editorRevision, snapshot);
              const targetId = redirectsRef.current.get(editorDocId) || editorDocId;
              go(`#doc-${targetId}`, {preserveBody: true, skipTransition: true});
            }
          }}
          onAutosave={(snapshot) => {
            if (route.type === 'new') saveDraft(snapshot);
            else if (editorDocId) saveEditorSnapshot(editorDocId, editorRevision, snapshot);
          }}
          onJournal={(snapshot) => {
            if (route.type === 'new') saveDraft(snapshot);
            else if (editorDocId) journalEditorSnapshot(editorDocId, editorRevision, snapshot);
          }}
          onOpenLink={(api) => {
            setLinkValue(api?.initialUrl || '');
            setModal({type: 'link', api});
          }}
        />
      )}

      {route.type !== 'library' && route.type !== 'planner' && !currentDoc && route.type !== 'new' && (
        <div className="missing-state flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base text-muted-foreground mb-4">
            Este documento ya no existe o no está compartido en este canal.
          </p>
          <Button variant="secondary" onClick={() => go('#docs')}>
            Volver a Documentos
          </Button>
        </div>
      )}

      <DeleteAlertDialog
        isOpen={modal?.type === 'delete'}
        doc={modal?.type === 'delete' ? docsById.get(modal.docId) : null}
        action={modal?.type === 'delete' ? modal.action : 'archive'}
        onConfirm={deleteDoc}
        onCancel={() => setModal(null)}
      />

      <InsertLinkModal
        isOpen={modal?.type === 'link'}
        isEditing={Boolean(modal?.type === 'link' && modal.api?.isEditing)}
        linkValue={linkValue}
        setLinkValue={setLinkValue}
        onApply={() => {
          modal?.api?.apply?.(linkValue);
          setModal(null);
        }}
        onRemove={() => {
          modal?.api?.remove?.();
          setModal(null);
        }}
        onOpenLink={() => {
          const raw = linkValue.trim();
          void openExternalUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).then(opened => {
            if (!opened) showToast('No se pudo abrir el enlace.');
          });
        }}
        onCancel={() => {
          modal?.api?.cancel?.();
          setModal(null);
        }}
      />

      <TextPreviewModal
        isOpen={modal?.type === 'text-preview'}
        doc={modal?.type === 'text-preview' ? docsById.get(modal.docId) : null}
        onCopy={async text => {
          const copied = await copyTextToClipboard(text);
          showToast(copied ? 'Texto copiado' : 'No se pudo copiar. Mantén presionado el texto para seleccionarlo y copiarlo.');
        }}
        onCancel={() => setModal(null)}
      />

      <ShareConfirmDialog
        isOpen={modal?.type === 'share'}
        doc={modal?.type === 'share' ? docsById.get(modal.docId) : null}
        onConfirm={publishDoc}
        onCancel={() => setModal(null)}
      />

      <NewDocChoiceDialog
        isOpen={modal?.type === 'new-doc-choice'}
        draft={modal?.type === 'new-doc-choice' ? modal.draft : null}
        onContinue={continueDraft}
        onStartNew={() => discardDraftAndStart(modal?.title || '')}
        onCancel={() => setModal(null)}
      />

      <LaunchNoticeDialog
        notice={launchNotice}
        onRestore={restoreFromNotice}
        onClose={() => setLaunchNotice(null)}
      />

      <Toaster />
    </main>
  );
}


export default App;


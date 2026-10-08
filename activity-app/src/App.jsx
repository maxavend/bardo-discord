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
  Magnifier,
  Moon,
  Pencil,
  Plus,
  Printer,
  Sun,
  TrashBin,
  Xmark,
} from '@gravity-ui/icons';
import {convertDocumentFile} from './production-import-normalizer.js';
import {htmlToMarkdown, markdownToHtml} from './editor/bardo-markdown.js';
import {PlannerModule} from './planner/PlannerModule.jsx';
import {BardoEditor} from './editor/BardoEditor.jsx';
export {applyDiscordTheme, collectDiscordThemeDiagnostics, resolveDiscordTheme} from './discord-theme.js';

const STORE_KEY = 'bardo.docs.heroui.v1';
const DRAFT_KEY = 'bardo.docs.heroui.draft.v1';
const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';
// Copia de seguridad de la edición en curso (se escribe mientras se tipea).
const JOURNAL_KEY = 'bardo.docs.editing.v1';
const STORE_VERSION = 1;


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

function escapeHtmlText(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function documentHtml(doc) {
  const title = escapeHtmlText(doc?.title || 'Sin título');
  const description = doc?.description ? `<p>${escapeHtmlText(doc.description)}</p>` : '';
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><article><h1>${title}</h1>${description}${sanitizeRichHtml(doc?.body || '')}</article>`;
}

function isMobileViewport() {
  return window.matchMedia?.('(max-width: 759px)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function newLocalId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
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
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
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
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.warn('Bardo Docs: no se pudo escribir en localStorage', error);
    warnStorageFull();
    return false;
  }
}

function readJournal() {
  try {
    const journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || 'null');
    return journal?.docId && journal.snapshot ? journal : null;
  } catch {
    return null;
  }
}

function writeJournal(entry) {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn('Bardo Docs: no se pudo escribir la copia de seguridad', error);
  }
}

function clearJournal(docId) {
  try {
    const journal = readJournal();
    if (!journal || journal.docId === docId) localStorage.removeItem(JOURNAL_KEY);
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
    localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Bardo Docs: no se pudo guardar el borrador', error);
    warnStorageFull();
  }
}

function DocActionMenu({doc, onAction, triggerLabel = 'Acciones'}) {
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
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onAction('open', doc)}>
          <Eye width={15} height={15} className="text-muted-foreground" />
          <span>Abrir</span>
        </DropdownMenuItem>
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
            <span>Descargar y exportar</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem onClick={() => onAction('markdown-preview', doc)}>
              <Eye width={15} height={15} className="text-muted-foreground" />
              <span>Ver Markdown</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('markdown', doc)}>
              <FileText width={15} height={15} className="text-muted-foreground" />
              <span>Markdown (.md)</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('html', doc)}>
              <FileText width={15} height={15} className="text-muted-foreground" />
              <span>HTML (.html)</span>
            </DropdownMenuItem>
            {window.__BARDO_PRODUCTION__ && (
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction('print', doc)}>
              <Printer width={15} height={15} className="text-muted-foreground" />
              <span>Imprimir / PDF</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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
        const control = e.target.closest?.('.check-control');
        if (!control || !ref.current?.contains(control)) return;
        e.preventDefault();
        const li = control.closest('li');
        li.classList.toggle('done');
        control.setAttribute('aria-pressed', li.classList.contains('done') ? 'true' : 'false');
        control.setAttribute('aria-label', li.classList.contains('done') ? 'Marcar como pendiente' : 'Marcar como completado');
        onChecklistChange?.(cleanEditorHtml(ref.current));
      }}
    />
  );
}

function EmptyState({query, onClearSearch, onNewDoc, onUpload, isArchived = false}) {
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
            ? `No encontramos documentos con “${query}”.`
            : isArchived
              ? 'Los documentos que archives en Bardo aparecerán en este lugar.'
              : 'Crea un documento o sube un archivo para empezar.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {query ? (
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Limpiar búsqueda
          </Button>
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

function PersistentHeader({route, doc, onBack, onEdit, onAction, onNew, onUpload, onNavigateModule, onPlannerNew}) {
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
            className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <Calendar width={14} height={14} /> Reuniones
          </Button>
          <input
            ref={fileInputRef}
            className="library-file-input"
            type="file"
            accept=".md,.markdown,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="Seleccionar documento para subir"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onUpload(file);
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="h-8 px-3 font-medium text-xs flex items-center gap-1.5">
            <FileArrowUp width={14} height={14} /> Subir archivo
          </Button>
          <Button variant="default" size="icon-sm" onClick={onNew} aria-label="Crear documento" className="icon-button-circle h-8 w-8">
            <Plus width={16} height={16} />
          </Button>
        </div>
      ) : doc ? (
        <div key="document-actions" className="header-slot-enter flex items-center gap-2">
          <Button variant="default" size="sm" onClick={onEdit} className="h-8 px-3.5 font-medium text-xs flex items-center gap-1.5">
            <Pencil width={14} height={14} /> Editar
          </Button>
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
        <Button key="document-title" variant="ghost" size="sm" onClick={onBack} className="back-button h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1">
          <ChevronLeft width={15} height={15} /> Documentos
        </Button>
      )}
    </DocsHeader>
  );
}

function Library({
  docs,
  total: _total,
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

  return (
    <section className="library route-active">
      <div className="library-inner">
        <input
          ref={fileInputRef}
          className="library-file-input"
          type="file"
          accept=".md,.markdown,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
            placeholder="Buscar documentos..."
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
                <span>Borrador privado · se guarda en este dispositivo</span>
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
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
              <button
                type="button"
                onClick={() => onTabChange?.('active')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeTab === 'active'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activos ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => onTabChange?.('archived')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  activeTab === 'archived'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Archivados ({archivedCount})
              </button>
            </div>
            {query && (
              <span className="text-xs text-muted-foreground">
                {docs.length} {docs.length === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
          </div>
          {docs.length > 0 ? (
            <div className="docs-list">
              {docs.map(doc => (
                <article className={`doc-row ${doc.archived ? 'opacity-85' : ''}`} key={doc.id}>
                  <span className="doc-symbol">
                    {doc.archived ? <Archive width={18} height={18} /> : <File width={18} height={18} />}
                  </span>
                  <button
                    className="doc-row-main"
                    type="button"
                    onClick={() => onOpen(doc.id)}
                  >
                    <strong>{doc.title || 'Sin título'}</strong>
                    <span>
                      {doc.archived ? 'Archivado' : (doc.origin || 'Creado en Bardo')} · {changeActorName(doc)} · {formatChangeTime(doc)}
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
              onClearSearch={() => setQuery('')}
              onNewDoc={onNew}
              onUpload={() => fileInputRef.current?.click()}
            />
          )}
        </section>
      </div>
    </section>
  );
}


function Reader({doc, onBack: _onBack, onEdit: _onEdit, onAction: _onAction, onChecklistChange, skipTransition = false}) {
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
          {doc.importStatus === 'pending' && (
            <p className="import-pending-banner text-sm text-muted-foreground" role="status">
              Procesando archivo… Bardo está convirtiendo el contenido y lo mostrará aquí en cuanto termine.
            </p>
          )}
        </header>
        <RichBody html={doc.body} onChecklistChange={doc.importStatus === 'pending' ? undefined : onChecklistChange} />
      </article>
    </section>
  );
}

function DeleteAlertDialog({isOpen, doc, action = 'archive', onConfirm, onCancel}) {
  const isArchive = action === 'archive';
  const isPermanent = action === 'permanent-delete';
  return (
    <AlertDialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArchive ? 'Archivar documento' : 'Eliminar definitivamente'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchive
              ? `“${doc?.title || 'Sin título'}” se archivará y saldrá de la vista de documentos activos. Podrás restaurarlo desde Archivados.`
              : `“${doc?.title || 'Sin título'}” se eliminará de forma permanente para todo el canal. Esta acción no se puede deshacer.`}
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
            {isPermanent ? 'Eliminar definitivamente' : 'Archivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InsertLinkModal({isOpen, linkValue, setLinkValue, onApply, onCancel}) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar enlace</DialogTitle>
        </DialogHeader>
        <Field className="w-full">
          <FieldLabel>URL o Enlace</FieldLabel>
          <Input
            autoFocus
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
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="default" size="sm" disabled={!linkValue.trim()} onClick={onApply}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownPreviewModal({isOpen, doc, onCopy, onCancel}) {
  const markdown = doc ? documentMarkdown(doc) : '';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa de Markdown</DialogTitle>
          <DialogDescription className="truncate">{doc?.title || 'Sin título'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          <pre className="markdown-preview-content" tabIndex="0">{markdown}</pre>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ChevronLeft width={15} height={15} /> Atrás
          </Button>
          <Button variant="default" size="sm" onClick={() => onCopy(markdown)}>
            <Copy width={15} height={15} /> Copiar Markdown
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HtmlPreviewModal({isOpen, doc, onCopy, onCancel}) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa HTML</DialogTitle>
          <DialogDescription className="truncate">{doc?.title || 'Sin título'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          <div className="export-html-preview">
            <h1>{doc?.title || 'Sin título'}</h1>
            {doc?.description && <p className="text-muted-foreground">{doc.description}</p>}
            <RichBody html={doc?.body || ''} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ChevronLeft width={15} height={15} /> Atrás
          </Button>
          <Button variant="default" size="sm" onClick={() => onCopy(documentHtml(doc))}>
            <Copy width={15} height={15} /> Copiar HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PdfPreviewModal({isOpen, file, onCancel}) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa de PDF</DialogTitle>
          <DialogDescription className="truncate">{file?.filename || 'documento.pdf'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {file?.url && (
            <iframe
              className="export-pdf-preview"
              src={file.url}
              title={file.filename || 'Vista previa de PDF'}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ChevronLeft width={15} height={15} /> Atrás
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
      return JSON.parse(localStorage.getItem(LAST_OPENED_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [draft, setDraft] = useState(readDraft);
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
        localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(next));
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
      title: `${source.title} · copia`,
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

  const uploadDocument = useCallback(async file => {
    try {
      showToast('Preparando documento…');
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
      showToast('Documento listo');
      go(`#doc-${doc.id}`);
    } catch (error) {
      console.error('Bardo Docs: no se pudo subir el documento', error);
      showToast(error instanceof Error ? error.message : 'No se pudo subir el documento');
    }
  }, [commitStore, go, showToast]);

  const deleteDoc = useCallback(async (id, action = 'archive') => {
    setModal(null);
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
    showToast('Documento restaurado');
  }, [commitStore, showToast]);

  const openDoc = useCallback((id, fromContinue = false) => {
    const target = `#doc-${id}`;
    if (fromContinue && lastOpened?.id === id) {
      pendingRestore.current = {kind: 'body', target: `doc-${id}`, offset: lastOpened.offset || 0};
      location.hash = target;
    } else go(target);
  }, [go, lastOpened]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (!q) return sortedDocs;
    return sortedDocs.filter(doc => `${doc.title} ${doc.description} ${doc.origin} ${stripHtml(doc.body)}`.toLocaleLowerCase('es').includes(q));
  }, [query, sortedDocs]);

  const continueDoc = lastOpened?.id && docsById.has(lastOpened.id) && !docsById.get(lastOpened.id).archived
    ? docsById.get(lastOpened.id)
    : activeDocs[0];

  const docAction = useCallback(async (action, targetDoc) => {
    const doc = targetDoc?.id ? targetDoc : docsById.get(targetDoc);
    if (!doc) return;
    if (action === 'open') openDoc(doc.id);
    if (action === 'edit') go(`#edit-${doc.id}`, {preserveBody: route.type === 'doc'});
    if (action === 'duplicate') duplicateDoc(doc.id);
    if (action === 'archive') setModal({type: 'delete', docId: doc.id, action: 'archive'});
    if (action === 'restore') restoreDoc(doc.id);
    if (action === 'permanent-delete') setModal({type: 'delete', docId: doc.id, action: 'permanent-delete'});

    if (action === 'copy') {
      try {
        await copyText(`${doc.title}\n\n${doc.description}\n\n${stripHtml(doc.body)}`);
        showToast('Texto copiado al portapapeles');
      } catch {
        showToast('No se pudo copiar');
      }
    }
    if (action === 'publish') {
      if (!window.__bardoPublishDocument) {
        showToast('Esta acción está disponible dentro de Discord');
      } else {
        try {
          await window.__bardoPublishDocument(doc.id);
          showToast('Documento enviado al canal');
        } catch (error) {
          console.error('Bardo Docs: no se pudo enviar el documento al canal', error);
          showToast(error?.message && !/^HTTP \d+$/.test(error.message) ? error.message : 'No se pudo enviar el documento al canal');
        }
      }
    }
    if (action === 'markdown-preview') {
      setModal({type: 'markdown-preview', docId: doc.id});
    }
    if (action === 'markdown') {
      if (isMobileViewport()) {
        setModal({type: 'markdown-preview', docId: doc.id});
      } else {
        downloadFile(
          `${documentFileStem(doc)}.md`,
          'text/markdown;charset=utf-8',
          documentMarkdown(doc)
        );
        showToast('Markdown descargado');
      }
    }
    if (action === 'html') {
      if (isMobileViewport()) {
        setModal({type: 'html-preview', docId: doc.id});
      } else {
        downloadFile(
          `${documentFileStem(doc)}.html`,
          'text/html;charset=utf-8',
          documentHtml(doc)
        );
        showToast('HTML descargado');
      }
    }
    if ((action === 'pdf' || action === 'docx') && window.__bardoExportDocument) {
      try {
        const shouldPreviewPdf = action === 'pdf' && isMobileViewport();
        const file = await window.__bardoExportDocument(doc.id, action, {preview: shouldPreviewPdf});
        if (shouldPreviewPdf && file?.url) {
          setModal({type: 'pdf-preview', file});
        } else {
          showToast(action === 'pdf' ? 'PDF descargado' : 'Word descargado');
        }
      } catch (error) {
        console.error(`Bardo Docs: no se pudo descargar ${action}`, error);
        showToast(`No se pudo descargar ${action === 'pdf' ? 'el PDF' : 'el archivo Word'}`);
      }
    }
    if (action === 'print') window.print();
  }, [docsById, duplicateDoc, go, openDoc, restoreDoc, route.type, showToast]);

  const editorDocId = route.type === 'edit' ? currentDoc?.id : null;
  const editorRevision = editorDocId ? (revisions[editorDocId] || 0) : 0;
  const showEditor = route.type === 'new' || (route.type === 'edit' && Boolean(currentDoc));

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
          onNew={() => go('#new')}
          onUpload={uploadDocument}
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
            const now = new Date().toISOString();
            const doc = {
              id: docData.id || newLocalId(),
              title: docData.title || 'Acta de sesión',
              description: docData.description || '',
              body: docData.body || '',
              origin: 'Acta de Bardo Planner',
              createdAt: now,
              updatedAt: now,
              createdByName: docData.createdByName || currentEditorName(),
              updatedByName: docData.updatedByName || currentEditorName(),
              builtin: false,
              stress: false,
            };
            commitStore((prev) => ({...prev, docs: [doc, ...(prev.docs || []).filter((d) => d.id !== doc.id)]}));
            showToast('Minuta guardada en Bardo Docs');
            go(`#doc-${doc.id}`);
          }}
        />
      )}
      {route.type === 'library' && (
        <Library
          docs={filteredDocs}
          total={displayedDocs.length}
          query={query}
          setQuery={setQuery}
          continueDoc={continueDoc}
          onContinue={() => continueDoc && openDoc(continueDoc.id, true)}
          draft={draft}
          onContinueDraft={() => go('#new')}
          onOpen={openDoc}
          onNew={() => go('#new')}
          onUpload={uploadDocument}
          onDocAction={docAction}
          activeTab={libraryTab}
          onTabChange={setLibraryTab}
          activeCount={activeDocs.length}
          archivedCount={archivedDocs.length}
        />
      )}

      {route.type === 'doc' && currentDoc && (
        <Reader
          doc={currentDoc}
          skipTransition={skipNextRouteAnimation.current}
          onBack={() => go('#docs', {restore: scrollMemory.current.get('library') || 0})}
          onEdit={() => go(`#edit-${currentDoc.id}`, {preserveBody: true})}
          onAction={docAction}
          onChecklistChange={body => updateDoc(currentDoc.id, {body})}
        />
      )}

      {showEditor && (
        <BardoEditor
          key={route.type === 'new' ? 'new' : `${editorDocId}:${editorRevision}`}
          doc={route.type === 'new' ? null : currentDoc}
          isNew={route.type === 'new'}
          readOnly={route.type === 'edit' && currentDoc?.importStatus === 'pending'}
          remoteSync={isProduction}
          themeModeMenu={ThemeModeMenu}
          onBack={() => (route.type === 'new' || !editorDocId
            ? go('#docs')
            : go(`#doc-${editorDocId}`, {preserveBody: true, skipTransition: true}))}
          onFinish={(snapshot) => {
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
                localStorage.removeItem(DRAFT_KEY);
              } catch {}
              setDraft(null);
              showToast('Documento creado');
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
            setLinkValue('');
            setModal({type: 'link', api});
          }}
        />
      )}

      {route.type !== 'library' && route.type !== 'planner' && !currentDoc && route.type !== 'new' && (
        <div className="missing-state flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base text-muted-foreground mb-4">Este documento ya no existe.</p>
          <Button variant="secondary" onClick={() => go('#docs')}>
            Volver a Docs
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
        linkValue={linkValue}
        setLinkValue={setLinkValue}
        onApply={() => {
          modal?.api?.apply?.(linkValue);
          setModal(null);
        }}
        onCancel={() => {
          modal?.api?.cancel?.();
          setModal(null);
        }}
      />

      <MarkdownPreviewModal
        isOpen={modal?.type === 'markdown-preview'}
        doc={modal?.type === 'markdown-preview' ? docsById.get(modal.docId) : null}
        onCopy={async markdown => {
          try {
            await copyText(markdown);
            showToast('Markdown copiado al portapapeles');
          } catch {
            showToast('No se pudo copiar el Markdown');
          }
        }}
        onCancel={() => setModal(null)}
      />

      <HtmlPreviewModal
        isOpen={modal?.type === 'html-preview'}
        doc={modal?.type === 'html-preview' ? docsById.get(modal.docId) : null}
        onCopy={async html => {
          try {
            await copyText(html);
            showToast('HTML copiado al portapapeles');
          } catch {
            showToast('No se pudo copiar el HTML');
          }
        }}
        onCancel={() => setModal(null)}
      />

      <PdfPreviewModal
        isOpen={modal?.type === 'pdf-preview'}
        file={modal?.type === 'pdf-preview' ? modal.file : null}
        onCancel={() => {
          if (modal?.type === 'pdf-preview') URL.revokeObjectURL(modal.file?.url);
          setModal(null);
        }}
      />

      <Toaster />
    </main>
  );
}


export default App;


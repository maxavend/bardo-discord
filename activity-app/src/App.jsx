import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Chip,
  Dropdown,
  Header,
  Input,
  Kbd,
  Label,
  Modal,
  SearchField,
  Separator,
  TextField,
  ToastProvider,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  toast,
  useTheme,
} from '@heroui/react';
import {
  ArrowRotateLeft,
  ArrowUturnCcwLeft,
  ArrowUturnCwRight,
  Bold,
  Calendar,
  Check,
  Circle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  EllipsisVertical,
  Eye,
  File,
  FileArrowUp,
  FileText,
  Grip,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  ListOl,
  ListUl,
  Magnifier,
  Minus,
  Moon,
  Pencil,
  Plus,
  Printer,
  QuoteOpen,
  SquareCheck,
  Strikethrough,
  Sun,
  Text,
  TrashBin,
  Underline,
} from '@gravity-ui/icons';
import {convertDocumentFile} from './production-import-normalizer.js';
import {markdownToHtml} from './production-bridge.js';
import {PlannerModule} from './planner/PlannerModule.jsx';
import {applyDiscordTheme} from './discord-theme.js';
export {applyDiscordTheme, collectDiscordThemeDiagnostics, resolveDiscordTheme} from './discord-theme.js';

const STORE_KEY = 'bardo.docs.heroui.v1';
const DRAFT_KEY = 'bardo.docs.heroui.draft.v1';
const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';
const STORE_VERSION = 1;

const BLOCK_TYPES = [
  {id: 'p', label: 'Texto', icon: Text, shortcut: '', hint: 'Empieza a escribir texto plano'},
  {id: 'h1', label: 'Encabezado 1', icon: Heading1, shortcut: '#', hint: 'Título de sección principal'},
  {id: 'h2', label: 'Encabezado 2', icon: Heading2, shortcut: '##', hint: 'Subtítulo mediano'},
  {id: 'h3', label: 'Encabezado 3', icon: Heading3, shortcut: '###', hint: 'Subtítulo pequeño'},
  {id: 'blockquote', label: 'Cita', icon: QuoteOpen, shortcut: '', hint: 'Destaca una cita o referencia'},
  {id: 'pre', label: 'Bloque de código', icon: Code, shortcut: '', hint: 'Escribe código con formato monoespaciado'},
];

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
      const keep = [...el.classList].filter(c => classes.has(c));
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

function editorSnapshotsEqual(a, b) {
  return !!a && !!b && a.title === b.title && a.description === b.description && a.body === b.body;
}

function nodePath(root, node) {
  if (!root || !node || (node !== root && !root.contains(node))) return null;
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    path.unshift([...parent.childNodes].indexOf(current));
    current = parent;
  }
  return current === root ? path : null;
}

function nodeAtPath(root, path) {
  if (!root || !Array.isArray(path)) return null;
  return path.reduce((node, index) => node?.childNodes?.[index] || null, root);
}

function captureEditorSelection(root) {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const startPath = nodePath(root, range.startContainer);
  const endPath = nodePath(root, range.endContainer);
  if (!startPath || !endPath) return null;
  return {
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
    collapsed: range.collapsed,
  };
}

function restoreEditorSelection(root, bookmark) {
  if (!root || !bookmark) return false;
  const start = nodeAtPath(root, bookmark.startPath);
  const end = nodeAtPath(root, bookmark.endPath);
  if (!start || !end) return false;
  const range = document.createRange();
  try {
    range.setStart(start, Math.min(bookmark.startOffset, start.nodeType === Node.TEXT_NODE ? start.textContent.length : start.childNodes.length));
    range.setEnd(end, Math.min(bookmark.endOffset, end.nodeType === Node.TEXT_NODE ? end.textContent.length : end.childNodes.length));
  } catch {
    return false;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
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

function currentEditorName() {
  const user = window.__BARDO_USER__;
  return user?.global_name || user?.username || null;
}

function markdownFromHtml(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(html)}</body>`, 'text/html');
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    const inner = [...el.childNodes].map(walk).join('');
    switch (el.tagName) {
      case 'H2': return `\n## ${inner.trim()}\n\n`;
      case 'H3': return `\n### ${inner.trim()}\n\n`;
      case 'P': return `${inner.trim()}\n\n`;
      case 'STRONG': case 'B': return `**${inner}**`;
      case 'EM': case 'I': return `*${inner}*`;
      case 'U': return inner;
      case 'S': case 'DEL': return `~~${inner}~~`;
      case 'CODE': return el.parentElement?.tagName === 'PRE' ? inner : `\`${inner}\``;
      case 'PRE': return `\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
      case 'BLOCKQUOTE': return inner.split('\n').filter(Boolean).map(line => `> ${line}`).join('\n') + '\n\n';
      case 'A': return `[${inner || el.getAttribute('href')}](${el.getAttribute('href') || ''})`;
      case 'HR': return '\n---\n\n';
      case 'BR': return '\n';
      case 'LI': {
        const checklist = el.parentElement?.classList.contains('checklist');
        if (checklist) return `- [${el.classList.contains('done') ? 'x' : ' '}] ${inner.trim()}\n`;
        return `${el.parentElement?.tagName === 'OL' ? '1.' : '-'} ${inner.trim()}\n`;
      }
      case 'UL': case 'OL': return `\n${inner}\n`;
      case 'SUMMARY': return `**${inner.trim()}**\n\n`;
      case 'DETAILS': return `\n${inner}\n`;
      case 'DIV': return `\n${inner.trim()}\n\n`;
      case 'TABLE': return `\n${el.textContent?.replace(/\s+/g, ' ').trim() || ''}\n\n`;
      default: return inner;
    }
  };
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
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

function loadStore() {
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

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

function DocActionMenu({doc, onAction, triggerLabel = 'Acciones'}) {
  return (
    <Dropdown>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={triggerLabel}
        className="icon-button-circle text-muted hover:text-foreground shrink-0"
      >
        <EllipsisVertical width={16} height={16} />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu onAction={(key) => onAction(key, doc)}>
          <Dropdown.Item id="open" textValue="Abrir">
            <Eye width={15} height={15} className="text-muted" />
            <Label>Abrir</Label>
          </Dropdown.Item>
          <Dropdown.Item id="edit" textValue="Editar">
            <Pencil width={15} height={15} className="text-muted" />
            <Label>Editar</Label>
          </Dropdown.Item>
          <Dropdown.Item id="duplicate" textValue="Duplicar">
            <Copy width={15} height={15} className="text-muted" />
            <Label>Duplicar</Label>
          </Dropdown.Item>
          <Dropdown.Item id="copy" textValue="Copiar texto">
            <FileText width={15} height={15} className="text-muted" />
            <Label>Copiar texto</Label>
          </Dropdown.Item>
          <Dropdown.Item id="publish" textValue="Enviar como mensaje">
            <ArrowUturnCwRight width={15} height={15} className="text-muted" />
            <Label>Enviar como mensaje</Label>
          </Dropdown.Item>
      <Dropdown.Section>
        <Header>Exportar</Header>
            <Dropdown.Item id="markdown-preview" textValue="Ver Markdown">
              <Eye width={15} height={15} className="text-muted" />
              <Label>Ver Markdown</Label>
            </Dropdown.Item>
            <Dropdown.Item id="markdown" textValue="Descargar Markdown (.md)">
              <FileText width={15} height={15} className="text-muted" />
              <Label>Descargar Markdown</Label>
            </Dropdown.Item>
            <Dropdown.Item id="html" textValue="HTML (.html)">
              <Label>HTML (.html)</Label>
            </Dropdown.Item>
            {window.__BARDO_PRODUCTION__ && (
              <>
                <Dropdown.Item id="pdf" textValue="PDF (.pdf)">
                  <Label>PDF (.pdf)</Label>
                </Dropdown.Item>
                <Dropdown.Item id="docx" textValue="Word (.docx)">
                  <Label>Word (.docx)</Label>
                </Dropdown.Item>
              </>
            )}
            <Dropdown.Item id="print" textValue="Imprimir">
              <Printer width={15} height={15} className="text-muted" />
              <Label>Imprimir / PDF</Label>
            </Dropdown.Item>
          </Dropdown.Section>
          <Dropdown.Item id="delete" textValue="Eliminar" className="text-danger">
            <TrashBin width={15} height={15} className="text-danger" />
            <Label className="text-danger">Eliminar</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
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

function EmptyState({query, onClearSearch, onNewDoc, onUpload}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-default dark:bg-default/50 border border-border flex items-center justify-center text-muted mb-3.5">
        <Magnifier width={22} height={22} />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {query ? 'Sin resultados' : 'Biblioteca vacía'}
      </h3>
      <p className="text-sm text-muted max-w-xs mb-5">
        {query
          ? `No encontramos documentos con “${query}”.`
          : 'Aún no tienes documentos creados en este servidor.'}
      </p>
      {query ? (
        <Button variant="secondary" size="sm" onPress={onClearSearch}>
          Limpiar búsqueda
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="sm" onPress={onNewDoc}>
            <Plus width={16} height={16} /> Crear documento
          </Button>
          <Button variant="secondary" size="sm" onPress={onUpload}>
            <File width={16} height={16} /> Subir documento
          </Button>
        </div>
      )}
    </div>
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

const THEME_MODE_LABELS = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

const THEME_MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Circle,
};

function ThemeModeMenu() {
  const {theme: preference, setTheme} = useTheme('system');
  const CurrentIcon = THEME_MODE_ICONS[preference] || Circle;
  const currentLabel = THEME_MODE_LABELS[preference] || THEME_MODE_LABELS.system;

  useEffect(() => {
    const syncDiscordTheme = () => {
      if (preference === 'system') applyDiscordTheme();
    };
    window.addEventListener('discord-theme-change', syncDiscordTheme);
    return () => window.removeEventListener('discord-theme-change', syncDiscordTheme);
  }, [preference]);

  return (
    <Dropdown>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="theme-mode-trigger icon-button-circle h-8 w-8 text-muted hover:text-foreground"
        aria-label={`Tema: ${currentLabel}`}
        title={`Tema: ${currentLabel}`}
      >
        <CurrentIcon width={16} height={16} />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label="Seleccionar tema"
          onAction={key => {
            const nextTheme = String(key);
            setTheme(nextTheme);
            applyDiscordTheme();
          }}
        >
          {Object.entries(THEME_MODE_LABELS).map(([id, label]) => {
            const Icon = THEME_MODE_ICONS[id];
            return (
              <Dropdown.Item key={id} id={id} textValue={label}>
                <Icon width={15} height={15} className="text-muted" />
                <Label>{label}</Label>
                {preference === id && <Check width={15} height={15} className="theme-mode-check text-accent" />}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function PersistentHeader({route, doc, onBack, onEdit, onAction, onNew, onUpload, onNavigateModule, onPlannerNew, onPlannerDemo}) {
  const fileInputRef = useRef(null);
  const isLibrary = route.type === 'library';
  const isPlanner = route.type === 'planner';

  return (
    <DocsHeader
      className={isLibrary || isPlanner ? 'library-header' : ''}
      actions={isPlanner ? (
        <div key="planner-actions" className="header-slot-enter flex items-center gap-2">
          {route.tab === 'home' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onPress={onPlannerNew}
                className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
              >
                <Plus width={14} height={14} /> Nueva sesión
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={onPlannerDemo}
                className="h-8 px-2.5 font-medium text-xs flex items-center gap-1.5 text-muted hover:text-foreground"
              >
                <ArrowRotateLeft width={14} height={14} /> Demo
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            onPress={() => onNavigateModule?.('docs')}
            className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <FileText width={14} height={14} /> Docs
          </Button>
        </div>
      ) : isLibrary ? (
        <div key="library-actions" className="header-slot-enter flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => onNavigateModule?.('planner')}
            className="h-8 px-3 font-medium text-xs flex items-center gap-1.5"
          >
            <Calendar width={14} height={14} /> Planner
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
          <Button variant="secondary" size="sm" onPress={() => fileInputRef.current?.click()} className="h-8 px-3 font-medium text-xs flex items-center gap-1.5">
            <FileArrowUp width={14} height={14} /> Subir
          </Button>
          <Button isIconOnly variant="primary" size="sm" onPress={onNew} aria-label="Nuevo documento" className="icon-button-circle h-8 w-8">
            <Plus width={16} height={16} />
          </Button>
        </div>
      ) : doc ? (
        <div key="document-actions" className="header-slot-enter flex items-center gap-2">
          <Button variant="primary" size="sm" onPress={onEdit} className="h-8 px-3.5 font-medium text-xs flex items-center gap-1.5">
            <Pencil width={14} height={14} /> Editar
          </Button>
          <DocActionMenu doc={doc} triggerLabel="Acciones del documento" onAction={onAction} />
        </div>
      ) : null}
    >
      {isPlanner ? (
        <Button
          key="planner-brand"
          variant="ghost"
          size="sm"
          onPress={() => onNavigateModule?.('docs')}
          aria-label="Volver al home de Bardo Docs"
          className="topbar-title header-slot-enter h-8 px-1.5 -ml-1 font-bold text-sm tracking-tight text-foreground hover:bg-surface-secondary/50"
        >
          <ChevronLeft width={15} height={15} />
          <span>Bardo Planner</span>
        </Button>
      ) : isLibrary ? (
        <span key="library-title" className="topbar-title header-slot-enter font-bold text-sm tracking-tight text-foreground">
          <span>Bardo Docs</span>
        </span>
      ) : (
        <Button key="document-title" variant="ghost" size="sm" onPress={onBack} className="back-button h-8 px-2.5 text-xs text-muted hover:text-foreground font-medium flex items-center gap-1">
          <ChevronLeft width={15} height={15} /> Docs
        </Button>
      )}
    </DocsHeader>
  );
}

function Library({
  docs,
  total,
  query,
  setQuery,
  continueDoc,
  onContinue,
  onOpen,
  onNew,
  onUpload,
  onDocAction,
}) {
  const fileInputRef = useRef(null);
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
        <SearchField
          aria-label="Buscar documentos"
          fullWidth
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          className="docs-search"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Buscar documentos..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        {continueDoc && !query && (
          <section className="library-section continue-section">
            <h2 className="section-title">Continuar lectura</h2>
            <button className="continue-row" type="button" onClick={onContinue}>
              <span className="continue-accent" aria-hidden="true" />
              <span className="continue-copy">
                <strong>{continueDoc.title || 'Sin título'}</strong>
                <span>{continueDoc.origin || 'Creado en Bardo'} · {changeActorName(continueDoc)} · {formatChangeTime(continueDoc)}</span>
              </span>
              <ChevronRight width={16} height={16} className="text-muted" />
            </button>
          </section>
        )}

        <section className="library-section recent-section">
          <div className="flex items-center justify-between">
            <h2 className="section-title mb-0">
              {query ? `Resultados (${docs.length})` : `Recientes (${total})`}
            </h2>
          </div>
          {docs.length > 0 ? (
            <div className="docs-list">
              {docs.map(doc => (
                <article className="doc-row" key={doc.id}>
                  <span className="doc-symbol">
                    <File width={18} height={18} />
                  </span>
                  <button
                    className="doc-row-main"
                    type="button"
                    onClick={() => onOpen(doc.id)}
                  >
                    <strong>{doc.title || 'Sin título'}</strong>
                    <span>{doc.origin || 'Creado en Bardo'} · {changeActorName(doc)} · {formatChangeTime(doc)}</span>
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
            <span className="text-xs text-muted">
              Último cambio realizado por {changeActorName(doc)} · {formatChangeTime(doc)}
            </span>
          </div>
          <h1 className="doc-title">{doc.title || 'Sin título'}</h1>
          {doc.description && <p className="doc-description">{doc.description}</p>}
        </header>
        <RichBody html={doc.body} onChecklistChange={onChecklistChange} />
      </article>
    </section>
  );
}

function BlockTypeDropdown({value, onSelect}) {
  const current = BLOCK_TYPES.find(b => b.id === value) || BLOCK_TYPES[0];

  return (
    <Dropdown>
      <Button
        aria-label="Tipo de texto"
        variant="tertiary"
        size="md"
        className="mobile-toolbar-leading mobile-toolbar-leading-trigger gap-1.5 font-medium rounded-3xl px-3 inline-flex items-center"
      >
        <span className="mobile-toolbar-label truncate max-w-[78px] md:max-w-none block">{current.label}</span>
        <ChevronDown width={14} height={14} className="opacity-70 shrink-0" />
      </Button>
      <Dropdown.Popover
        placement="bottom start"
        className="toolbar-dropdown-popover scrollbar overflow-y-auto overscroll-contain"
      >
        <Dropdown.Menu onAction={onSelect}>
          {BLOCK_TYPES.map(item => {
            const ItemIcon = item.icon;
            return (
              <Dropdown.Item
                key={item.id}
                id={item.id}
                textValue={item.label}
              >
                <ItemIcon width={16} height={16} />
                <Label>{item.label}</Label>
                {item.shortcut && (
                  <Kbd variant="light">
                    <Kbd.Content>{item.shortcut}</Kbd.Content>
                  </Kbd>
                )}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

const TOOLBAR_OPTIONAL_ACTIONS = [
  ['redo', 32, 40],
  ['italic', 36, 40],
  ['underline', 36, 40],
  ['createLink', 32, 40],
  ['strikeThrough', 36, 40],
  ['code', 36, 40],
  ['insertUnorderedList', 48, 48],
  ['insertOrderedList', 36, 40],
  ['checklist', 36, 40],
  ['blockquote', 36, 40],
];

const TOOLBAR_ACTION_KEYS = TOOLBAR_OPTIONAL_ACTIONS.map(([action]) => action);

function useAdaptiveToolbar(containerRef) {
  const [visibleActions, setVisibleActions] = useState(() => new Set());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return undefined;

    const update = () => {
      const availableWidth = host.getBoundingClientRect().width;
      const usableWidth = Math.floor(availableWidth) - 2;
      const usesTouchSizedControls = window.matchMedia('(max-width: 759px)').matches;
      const next = new Set();

      // Text starts at its 120px minimum, then absorbs any remainder up to 200px.
      let usedWidth = 272;
      TOOLBAR_OPTIONAL_ACTIONS.forEach(([action, regularWidth, touchWidth]) => {
        const incrementalWidth = usesTouchSizedControls ? touchWidth : regularWidth;
        if (usedWidth + incrementalWidth <= usableWidth) {
          next.add(action);
          usedWidth += incrementalWidth;
        }
      });

      setVisibleActions(previous => {
        const previousKey = TOOLBAR_ACTION_KEYS.filter(action => previous.has(action)).join('|');
        const nextKey = TOOLBAR_ACTION_KEYS.filter(action => next.has(action)).join('|');
        return previousKey === nextKey ? previous : next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef]);

  return visibleActions;
}

function MoreActionsMenu({onAction, visibleActions}) {
  const handleAction = key => onAction(key === 'pre' ? 'insertPre' : key);
  const isHidden = action => !visibleActions.has(action);
  const showInline = ['strikeThrough', 'code', 'italic', 'underline', 'createLink'].some(isHidden);
  const showLists = ['insertUnorderedList', 'insertOrderedList', 'checklist'].some(isHidden);
  const showRedo = isHidden('redo');
  const showLinkSeparator = visibleActions.has('createLink');

  return (
    <Dropdown>
      <Button
        isIconOnly
        aria-label="Ver más"
        variant="tertiary"
        size="md"
        className="mobile-more-trigger rounded-none rounded-e-3xl relative"
      >
        <ButtonGroup.Separator className={showLinkSeparator ? 'mobile-more-separator' : 'hidden'} />
        <EllipsisVertical width={15} height={15} />
      </Button>
      <Dropdown.Popover
        placement="bottom end"
        className="toolbar-dropdown-popover scrollbar overflow-y-auto overscroll-contain"
      >
        <Dropdown.Menu onAction={handleAction}>
          {showInline && (
            <Dropdown.Section>
              {isHidden('strikeThrough') && <Dropdown.Item id="strikeThrough" textValue="Tachado"><Strikethrough width={16} height={16} /><Label>Tachado</Label></Dropdown.Item>}
              {isHidden('code') && <Dropdown.Item id="code" textValue="Código en línea"><Code width={16} height={16} /><Label>Código en línea</Label></Dropdown.Item>}
              {isHidden('italic') && <Dropdown.Item id="italic" textValue="Cursiva"><Italic width={16} height={16} /><Label>Cursiva</Label></Dropdown.Item>}
              {isHidden('underline') && <Dropdown.Item id="underline" textValue="Subrayado"><Underline width={16} height={16} /><Label>Subrayado</Label></Dropdown.Item>}
              {isHidden('createLink') && <Dropdown.Item id="createLink" textValue="Enlace"><Link width={16} height={16} /><Label>Enlace</Label></Dropdown.Item>}
            </Dropdown.Section>
          )}
          {showInline && showLists && <Separator className="toolbar-overflow-divider" />}
          {showLists && (
            <Dropdown.Section>
              {isHidden('insertUnorderedList') && <Dropdown.Item id="insertUnorderedList" textValue="Lista con viñetas"><ListUl width={16} height={16} /><Label>Lista con viñetas</Label></Dropdown.Item>}
              {isHidden('insertOrderedList') && <Dropdown.Item id="insertOrderedList" textValue="Lista numerada"><ListOl width={16} height={16} /><Label>Lista numerada</Label></Dropdown.Item>}
              {isHidden('checklist') && <Dropdown.Item id="checklist" textValue="Lista de tareas"><SquareCheck width={16} height={16} /><Label>Lista de tareas</Label></Dropdown.Item>}
            </Dropdown.Section>
          )}
          {(showInline || showLists) && <Separator className="toolbar-overflow-divider" />}
          <Dropdown.Section>
            <Dropdown.Item id="callout" textValue="Nota / Destacado">
              <QuoteOpen width={16} height={16} />
              <Label>Destacado</Label>
            </Dropdown.Item>
            <Dropdown.Item id="spoiler" textValue="Desplegable">
              <ChevronRight width={16} height={16} />
              <Label>Lista desplegable</Label>
            </Dropdown.Item>
            <Dropdown.Item id="hr" textValue="Línea separadora">
              <Minus width={16} height={16} />
              <Label>Separador</Label>
            </Dropdown.Item>
          </Dropdown.Section>
          <Separator className="overflow-utility-divider" />
          <Dropdown.Section>
            {showRedo && <Dropdown.Item id="redo" textValue="Rehacer"><ArrowUturnCwRight width={16} height={16} /><Label>Rehacer</Label></Dropdown.Item>}
            <Dropdown.Item id="copyAll" textValue="Copiar contenido">
              <Copy width={16} height={16} />
              <Label>Copiar texto</Label>
            </Dropdown.Item>
            <Dropdown.Item id="removeFormat" textValue="Limpiar formato">
              <ArrowRotateLeft width={16} height={16} />
              <Label>Limpiar formato</Label>
            </Dropdown.Item>
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function Editor({doc, isNew, onBack, onFinish, onAutosave, onOpenLink}) {
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
  const [blockValue, setBlockValue] = useState('p');
  const [inlineState, setInlineState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  });
  const bodyRef = useRef(null);
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const toolbarContainerRef = useRef(null);
  const visibleToolbarActions = useAdaptiveToolbar(toolbarContainerRef);
  const isToolbarActionVisible = action => visibleToolbarActions.has(action);
  const visibleStyleActions = ['italic', 'underline', 'strikeThrough', 'code'].filter(isToolbarActionVisible);
  const visibleListActions = ['insertUnorderedList', 'insertOrderedList', 'checklist', 'blockquote'].filter(isToolbarActionVisible);
  const lastVisibleStyleAction = visibleStyleActions.at(-1);
  const lastVisibleListAction = visibleListActions.at(-1);
  const isFullToolbar = visibleToolbarActions.size === TOOLBAR_OPTIONAL_ACTIONS.length;
  const shellRef = useRef(null);
  const lastRange = useRef(null);
  const activeEditable = useRef(null);
  const saveTimer = useRef(null);
  const exitTimer = useRef(null);
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  const loadedKey = useRef(null);
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const historyCurrentRef = useRef(null);
  const historyReadyRef = useRef(false);
  const historyApplyingRef = useRef(false);
  const historyInputSuppressionRef = useRef(0);
  const historyGroupRef = useRef({kind: null, at: 0});
  const rememberSelectionRef = useRef(null);
  const [historyState, setHistoryState] = useState({canUndo: false, canRedo: false});

  const handleRef = useRef(null);
  const dropLineRef = useRef(null);
  const activeHoveredBlockRef = useRef(null);
  const draggedBlockRef = useRef(null);
  const dropTargetRef = useRef(null);

  const getDirectBlock = useCallback((target) => {
    if (!bodyRef.current || !target || target === bodyRef.current) return null;
    let el = target;
    while (el && el.parentElement && el.parentElement !== bodyRef.current) {
      el = el.parentElement;
    }
    return el && el.parentElement === bodyRef.current ? el : null;
  }, []);

  const handleBodyPointerMove = useCallback((_e) => {
    // No-op: tracking is done via document-level listener below
  }, []);

  const handleBodyPointerLeave = useCallback(() => {
    // No-op: tracking is done via document-level listener below
  }, []);

  const handleDragStart = useCallback((e) => {
    const block = activeHoveredBlockRef.current;
    if (!block) return;
    draggedBlockRef.current = block;
    block.classList.add('is-dragging-block');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.innerText || '');
  }, []);

  const handleEditorDragOver = useCallback((e) => {
    if (!draggedBlockRef.current || !shellRef.current || !dropLineRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const block = getDirectBlock(e.target);
    if (!block) {
      dropLineRef.current.style.display = 'none';
      dropTargetRef.current = null;
      return;
    }
    const blockRect = block.getBoundingClientRect();
    const shellRect = shellRef.current.getBoundingClientRect();
    const isAfter = e.clientY > (blockRect.top + blockRect.height / 2);
    const lineY = (isAfter ? blockRect.bottom : blockRect.top) - shellRect.top;
    dropLineRef.current.style.transform = `translate3d(0, ${lineY}px, 0) translateY(-50%)`;
    dropLineRef.current.style.display = 'block';
    dropTargetRef.current = { block, isAfter };
  }, [getDirectBlock]);

  // handleEditorDrop and handleDragEnd are defined below after markDirty/rememberSelection

  titleRef.current = title;
  descriptionRef.current = description;

  const editorSnapshot = useCallback((overrides = {}) => ({
    title: overrides.title ?? titleRef.current,
    description: overrides.description ?? descriptionRef.current,
    body: overrides.body ?? cleanEditorHtml(bodyRef.current),
  }), []);

  const snapshot = useCallback(() => ({
    ...editorSnapshot(),
    title: titleRef.current.trim(),
    description: descriptionRef.current.trim(),
    updatedAt: new Date().toISOString(),
  }), [editorSnapshot]);

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyPastRef.current.length > 0,
      canRedo: historyFutureRef.current.length > 0,
    });
  }, []);

  const resetHistory = useCallback(() => {
    const currentSnapshot = editorSnapshot();
    historyPastRef.current = [];
    historyFutureRef.current = [];
    historyCurrentRef.current = {
      snapshot: currentSnapshot,
      selection: captureEditorSelection(bodyRef.current),
    };
    historyGroupRef.current = {kind: null, at: 0};
    historyReadyRef.current = true;
    syncHistoryState();
  }, [editorSnapshot, syncHistoryState]);

  const commitHistory = useCallback(({kind = 'atomic', merge = false, next = null} = {}) => {
    if (!historyReadyRef.current || historyApplyingRef.current) return false;
    const nextSnapshot = next || editorSnapshot();
    const current = historyCurrentRef.current;
    if (!current || editorSnapshotsEqual(current.snapshot, nextSnapshot)) return false;

    const now = Date.now();
    const previousGroup = historyGroupRef.current;
    const shouldMerge = merge && previousGroup.kind === kind && now - previousGroup.at < 700;
    const nextEntry = {
      snapshot: nextSnapshot,
      selection: captureEditorSelection(bodyRef.current),
    };

    if (!shouldMerge) {
      historyPastRef.current.push(current);
      if (historyPastRef.current.length > 100) historyPastRef.current.shift();
    }
    historyCurrentRef.current = nextEntry;
    historyFutureRef.current = [];
    historyGroupRef.current = {kind, at: now};
    syncHistoryState();
    return true;
  }, [editorSnapshot, syncHistoryState]);

  const applyHistoryEntry = useCallback((entry) => {
    if (!entry || !bodyRef.current) return;
    historyApplyingRef.current = true;
    titleRef.current = entry.snapshot.title;
    descriptionRef.current = entry.snapshot.description;
    setTitle(entry.snapshot.title);
    setDescription(entry.snapshot.description);
    bodyRef.current.innerHTML = sanitizeRichHtml(entry.snapshot.body || '<p><br></p>');
    hydrateChecklistControls(bodyRef.current);
    requestAnimationFrame(() => {
      restoreEditorSelection(bodyRef.current, entry.selection);
      rememberSelectionRef.current?.();
      historyApplyingRef.current = false;
    });
  }, []);

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    const snap = snapshot();
    onAutosave(snap);
    setIsDirty(false);
    setSaveState(isNew ? 'Borrador guardado' : 'Guardado');
    return snap;
  }, [isNew, onAutosave, snapshot]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveState('Cambios sin guardar');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 30000);
  }, [flushSave, isNew]);

  useLayoutEffect(() => {
    const key = isNew ? 'new' : doc?.id;
    if (!bodyRef.current || loadedKey.current === key) return;
    loadedKey.current = key;
    bodyRef.current.innerHTML = sanitizeRichHtml(doc?.body ?? initialDraft?.body ?? '<p><br></p>');
    hydrateChecklistControls(bodyRef.current);
    resetHistory();
  }, [doc?.id, doc?.body, initialDraft?.body, isNew, resetHistory]);

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

  const leaveEditor = useCallback((callback) => {
    if (exitTimer.current) return;
    setIsExiting(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      callback();
    }, 150);
  }, []);

  const rememberSelection = useCallback(({preserveNonCollapsed = false} = {}) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !bodyRef.current) return;
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) return;
    if (preserveNonCollapsed && range.collapsed && lastRange.current && !lastRange.current.collapsed) return;
    lastRange.current = range.cloneRange();
    activeEditable.current = bodyRef.current;
    updateToolbarState(bodyRef.current, setInlineState, setBlockValue);
  }, []);
  rememberSelectionRef.current = rememberSelection;

  const commitMutation = useCallback((mutator, {kind = 'atomic'} = {}) => {
    historyInputSuppressionRef.current += 1;
    try {
      mutator();
    } finally {
      historyInputSuppressionRef.current = Math.max(0, historyInputSuppressionRef.current - 1);
    }
    hydrateChecklistControls(bodyRef.current);
    const committed = commitHistory({kind});
    if (committed) markDirty();
    requestAnimationFrame(rememberSelection);
    return committed;
  }, [commitHistory, markDirty, rememberSelection]);

  const handleEditorDrop = useCallback((e) => {
    e.preventDefault();
    const dragged = draggedBlockRef.current;
    const targetInfo = dropTargetRef.current;
    if (dragged && targetInfo?.block && dragged !== targetInfo.block && bodyRef.current) {
      commitMutation(() => {
        if (targetInfo.isAfter) {
          bodyRef.current.insertBefore(dragged, targetInfo.block.nextSibling);
        } else {
          bodyRef.current.insertBefore(dragged, targetInfo.block);
        }
      }, {kind: 'reorder'});
    }
    if (dragged) {
      dragged.classList.remove('is-dragging-block');
    }
    draggedBlockRef.current = null;
    dropTargetRef.current = null;
    if (dropLineRef.current) {
      dropLineRef.current.style.display = 'none';
    }
    if (handleRef.current) {
      handleRef.current.style.opacity = '0';
      handleRef.current.style.pointerEvents = 'none';
    }
  }, [commitMutation]);

  const handleDragEnd = useCallback(() => {
    if (draggedBlockRef.current) {
      draggedBlockRef.current.classList.remove('is-dragging-block');
    }
    draggedBlockRef.current = null;
    dropTargetRef.current = null;
    if (dropLineRef.current) {
      dropLineRef.current.style.display = 'none';
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (!bodyRef.current) return false;
    bodyRef.current.focus({preventScroll: true});
    const range = lastRange.current;
    if (range && bodyRef.current.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range.cloneRange());
      return true;
    }
    const caret = document.createRange();
    caret.selectNodeContents(bodyRef.current);
    caret.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(caret);
    lastRange.current = caret.cloneRange();
    return true;
  }, []);

  useEffect(() => {
    const handler = () => {
      const body = bodyRef.current;
      const activeElement = document.activeElement;
      if (!body?.contains(activeElement) && lastRange.current && !lastRange.current.collapsed) return;
      rememberSelection();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [rememberSelection]);

  // Document-level pointermove for drag handle — works even in the gutter outside the article
  useEffect(() => {
    const onMove = (e) => {
      if (draggedBlockRef.current || !handleRef.current || !shellRef.current || !bodyRef.current) return;
      if (handleRef.current.contains(e.target)) return; // pointer is on the handle itself, keep as-is
      // Check if pointer is near the body (within ~60px to the left)
      const bodyRect = bodyRef.current.getBoundingClientRect();
      const gutterLeft = bodyRect.left - 60;
      const inGutter = e.clientX >= gutterLeft && e.clientX < bodyRect.right &&
                       e.clientY >= bodyRect.top && e.clientY <= bodyRect.bottom;
      if (!inGutter) {
        handleRef.current.style.opacity = '0';
        handleRef.current.style.pointerEvents = 'none';
        activeHoveredBlockRef.current = null;
        return;
      }
      // Find which block the Y coordinate aligns with
      const block = getDirectBlock(document.elementFromPoint(bodyRect.left + 4, e.clientY));
      if (!block) return;
      activeHoveredBlockRef.current = block;
      const blockRect = block.getBoundingClientRect();
      const shellRect = shellRef.current.getBoundingClientRect();
      const top = blockRect.top - shellRect.top;
      const offset = block.tagName === 'H1' ? 8 : block.tagName === 'H2' ? 6 : 2;
      handleRef.current.style.top = `${Math.max(0, top + offset)}px`;
      handleRef.current.style.opacity = '1';
      handleRef.current.style.pointerEvents = 'auto';
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [getDirectBlock]);

  const runFormat = useCallback(format => {
    const body = bodyRef.current;
    if (!body) return;
    // A toolbar press can happen immediately after a native selection (for
    // example a selection created by touch or another browser surface). Keep
    // that live range before focusing the editor, otherwise restoreSelection
    // could fall back to the previous caret and silently format nothing.
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const liveRange = selection.getRangeAt(0);
      if (!liveRange.collapsed && body.contains(liveRange.commonAncestorContainer)) {
        lastRange.current = liveRange.cloneRange();
      }
    }
    restoreSelection();
    if (format === 'createLink') {
      const bookmark = createLinkBookmark(lastRange.current);
      onOpenLink({
        bookmark,
        body,
        apply: (href) => {
          const committed = commitMutation(
            () => applyLinkBookmark(bookmark, normalizeUrl(href)),
            {kind: 'format'},
          );
          if (!committed) cleanupLinkBookmark(bookmark);
        },
        cancel: () => cleanupLinkBookmark(bookmark)
      });
      return;
    }

    commitMutation(() => {
      if (format === 'hr') insertTopLevelBlock(body, '<hr>', lastRange);
      else if (format === 'spoiler') {
        if (!applyStructuredFormat(body, lastRange, format)) {
          insertTopLevelBlock(body, '<details class="spoiler" open><summary>Detalles</summary><p>Escribe contenido oculto…</p></details>', lastRange);
        }
      }
      else if (format === 'checklist') {
        if (!applyStructuredFormat(body, lastRange, format)) {
          insertTopLevelBlock(body, '<ul class="checklist"><li>Elemento</li></ul>', lastRange);
        }
      }
      else if (format === 'callout') {
        if (!applyStructuredFormat(body, lastRange, format)) {
          insertTopLevelBlock(body, '<div class="doc-callout">Escribe una nota…</div>', lastRange);
        }
      }
      else if (format === 'insertPre') insertTopLevelBlock(body, '<pre><code><br></code></pre>', lastRange);
      else if (format === 'blockquote' || format === 'pre') applyBlockFormat(body, lastRange, format);
      else if (format === 'insertUnorderedList' || format === 'insertOrderedList') {
        const applied = manualList(body, lastRange, format === 'insertOrderedList');
        if (!applied) execCommand(format);
      } else {
        const savedRange = lastRange.current?.cloneRange?.();
        if (savedRange && !savedRange.collapsed && body.contains(savedRange.commonAncestorContainer)) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(savedRange);
          lastRange.current = savedRange.cloneRange();
          manualInlineFormat(body, lastRange, format);
        } else {
          const before = body.innerHTML;
          const applied = execCommand(format);
          const range = lastRange.current;
          if (range && !range.collapsed && (!applied || body.innerHTML === before)) {
            manualInlineFormat(body, lastRange, format);
          }
        }
      }
    }, {kind: format === 'hr' || format === 'spoiler' || format === 'checklist' || format === 'callout' || format === 'insertPre' ? 'insert' : 'format'});
  }, [commitMutation, onOpenLink, restoreSelection]);

  const applyBlock = useCallback(value => {
    restoreSelection();
    commitMutation(() => applyBlockFormat(bodyRef.current, lastRange, String(value || 'p')), {kind: 'format'});
  }, [commitMutation, restoreSelection]);

  const handleBlockSelect = useCallback((key) => {
    restoreSelection();
    if (['p', 'h1', 'h2', 'h3', 'blockquote', 'pre'].includes(key)) {
      setBlockValue(key);
      applyBlock(key);
    } else {
      runFormat(key);
    }
  }, [applyBlock, restoreSelection, runFormat]);

  const handleMoreAction = useCallback((action) => {
    restoreSelection();
    if (action === 'copyAll') {
      const text = bodyRef.current?.innerText || '';
      navigator.clipboard?.writeText(text).then(() => {
        toast('Texto copiado al portapapeles');
      }).catch(() => {
        toast('No se pudo copiar el texto');
      });
    } else if (action === 'removeFormat') {
      commitMutation(() => {
        const before = bodyRef.current?.innerHTML;
        const applied = execCommand('removeFormat');
        if (!applied || before === bodyRef.current?.innerHTML) {
          manualRemoveInlineFormatting(bodyRef.current, lastRange);
        }
      }, {kind: 'format'});
      toast('Formato limpiado');
    } else if (action === 'redo') {
      handleRedo();
    } else {
      runFormat(action);
    }
  }, [commitMutation, restoreSelection, runFormat]);

  const finish = () => {
    const snap = flushSave();
    leaveEditor(() => onFinish(snap));
  };

  const selectedInlineKeys = useMemo(() => {
    const keys = new Set();
    if (inlineState.bold) keys.add('bold');
    if (inlineState.italic) keys.add('italic');
    if (inlineState.underline) keys.add('underline');
    if (inlineState.strikeThrough) keys.add('strikeThrough');
    if (inlineState.code) keys.add('code');
    return keys;
  }, [inlineState]);

  const selectedListKeys = useMemo(() => {
    const keys = new Set();
    if (inlineState.insertUnorderedList) keys.add('insertUnorderedList');
    if (inlineState.insertOrderedList) keys.add('insertOrderedList');
    if (inlineState.checklist) keys.add('checklist');
    if (blockValue === 'blockquote') keys.add('blockquote');
    return keys;
  }, [inlineState.insertUnorderedList, inlineState.insertOrderedList, inlineState.checklist, blockValue]);

  const handleUndo = useCallback(() => {
    const current = historyCurrentRef.current;
    const previous = historyPastRef.current.pop();
    if (!current || !previous) return;
    historyFutureRef.current.push(current);
    historyCurrentRef.current = previous;
    historyGroupRef.current = {kind: null, at: 0};
    syncHistoryState();
    applyHistoryEntry(previous);
    markDirty();
  }, [applyHistoryEntry, markDirty, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const current = historyCurrentRef.current;
    const next = historyFutureRef.current.pop();
    if (!current || !next) return;
    historyPastRef.current.push(current);
    historyCurrentRef.current = next;
    historyGroupRef.current = {kind: null, at: 0};
    syncHistoryState();
    applyHistoryEntry(next);
    markDirty();
  }, [applyHistoryEntry, markDirty, syncHistoryState]);

  const handleTitleKey = e => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        e.shiftKey || key === 'y' ? handleRedo() : handleUndo();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      document.querySelector('.doc-description-input')?.focus();
    }
  };
  const handleDescriptionKey = e => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        e.shiftKey || key === 'y' ? handleRedo() : handleUndo();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      bodyRef.current?.focus();
    }
  };

  return (
    <section className={`doc-route route-active editing-route ${isExiting ? 'editor-transition-is-exiting' : ''}`}>
      <header className="doc-topbar glass-header app-host-header">
        <div className="topbar-left flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              if (isExiting) return;
              flushSave();
              leaveEditor(onBack);
            }}
            className="back-button"
          >
            <ChevronLeft width={16} height={16} /> Docs
          </Button>
          <Chip
            key={saveState}
            size="sm"
            variant="soft"
            color={isDirty ? 'warning' : 'success'}
            className="save-state text-xs"
            data-dirty={isDirty ? 'true' : 'false'}
          >
            <span key={saveState} className="save-state-label">{saveState}</span>
          </Chip>
        </div>
        <div className="topbar-right flex items-center gap-2">
          <ThemeModeMenu />
          <Button variant="primary" size="sm" onPress={finish} className="save-action-button">
            <span key={isDirty ? 'dirty' : 'saved'} className="save-action-label">
              {isDirty ? 'Guardar' : 'Listo'}
            </span>
          </Button>
        </div>
      </header>

      <article
        ref={shellRef}
        className="document-shell editor-shell"
        onPointerMove={handleBodyPointerMove}
        onPointerLeave={handleBodyPointerLeave}
        onDragOver={handleEditorDragOver}
        onDrop={handleEditorDrop}
      >
        <div
          ref={handleRef}
          role="button"
          tabIndex={-1}
          className="block-drag-handle"
          style={{opacity: 0, pointerEvents: 'none'}}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onPointerDown={e => e.stopPropagation()}
          aria-label="Arrastrar bloque"
          title="Arrastra para reordenar el bloque"
        >
          <Grip width={14} height={14} />
        </div>
        <div ref={dropLineRef} className="block-drop-line" style={{display: 'none', transform: 'translate3d(0, 0, 0)'}} />

        <header className="doc-intro">
          <div className="doc-meta flex items-center gap-2 flex-wrap">
            <Chip size="sm" variant="soft" color="default" className="text-xs">
              {isNew ? 'Borrador privado' : `Creado por ${createdActorName(doc)}`}
            </Chip>
            {!isNew && (
              <span className="text-xs text-muted">
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
              if (commitHistory({kind: 'title', merge: true, next: editorSnapshot({title: nextTitle})})) markDirty();
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
              if (commitHistory({kind: 'description', merge: true, next: editorSnapshot({description: nextDescription})})) markDirty();
            }}
            onKeyDown={handleDescriptionKey}
            onPaste={singleLinePaste}
          />
        </header>

        <div
          className="editor-toolbar-sticky"
          onPointerDownCapture={() => rememberSelection({preserveNonCollapsed: true})}
          onMouseDownCapture={() => rememberSelection({preserveNonCollapsed: true})}
          onTouchStartCapture={() => rememberSelection({preserveNonCollapsed: true})}
        >
          <div
            ref={toolbarContainerRef}
            className={`editor-toolbar-container ${isFullToolbar ? 'editor-toolbar-container-full' : ''}`}
          >
            <Toolbar aria-label="Editor toolbar" className="flex items-center justify-start gap-2 flex-nowrap">
              <BlockTypeDropdown value={blockValue} onSelect={handleBlockSelect} />

              <ButtonGroup variant="tertiary" aria-label="Historial de edición" className={`mobile-history-group ${isToolbarActionVisible('redo') ? '' : 'toolbar-group-standalone'}`}>
                <Button isIconOnly variant="tertiary" aria-label="Deshacer" title="Deshacer (⌘/Ctrl+Z)" onPress={handleUndo} isDisabled={!historyState.canUndo}>
                  <ArrowUturnCcwLeft width={15} height={15} />
                </Button>
                <Button isIconOnly variant="tertiary" aria-label="Rehacer" title="Rehacer (⌘/Ctrl+Y)" onPress={handleRedo} isDisabled={!historyState.canRedo} className={isToolbarActionVisible('redo') ? '' : 'toolbar-control-overflowed'}>
                  <ArrowUturnCwRight width={15} height={15} />
                </Button>
              </ButtonGroup>

              <ToggleButtonGroup
                aria-label="Estilos de texto"
                selectionMode="multiple"
                selectedKeys={selectedInlineKeys}
                className={visibleStyleActions.length ? '' : 'toolbar-group-standalone'}
              >
                <ToggleButton isIconOnly aria-label="Negrita" title="Negrita (⌘/Ctrl+B)" id="bold" onPress={() => runFormat('bold')}>
                  <Bold width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Cursiva" title="Cursiva (⌘/Ctrl+I)" id="italic" onPress={() => runFormat('italic')} className={`${isToolbarActionVisible('italic') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'italic' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <Italic width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Subrayado" title="Subrayado (⌘/Ctrl+U)" id="underline" onPress={() => runFormat('underline')} className={`${isToolbarActionVisible('underline') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'underline' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <Underline width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Tachado" title="Tachado" id="strikeThrough" onPress={() => runFormat('strikeThrough')} className={`${isToolbarActionVisible('strikeThrough') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'strikeThrough' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <Strikethrough width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Código en línea" title="Código en línea (⌘/Ctrl+E)" id="code" onPress={() => runFormat('code')} className={`${isToolbarActionVisible('code') ? '' : 'toolbar-control-overflowed'} ${lastVisibleStyleAction === 'code' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <Code width={15} height={15} />
                </ToggleButton>
              </ToggleButtonGroup>

              <ToggleButtonGroup
                aria-label="Listas y bloques"
                selectionMode="single"
                selectedKeys={selectedListKeys}
                className={`toolbar-list-group ${visibleListActions.length ? '' : 'toolbar-control-overflowed'} ${visibleListActions.length === 1 ? 'toolbar-group-standalone' : ''}`}
              >
                <ToggleButton isIconOnly aria-label="Lista con viñetas" title="Lista con viñetas" id="insertUnorderedList" onPress={() => runFormat('insertUnorderedList')} className={`${isToolbarActionVisible('insertUnorderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertUnorderedList' ? 'toolbar-last-visible' : ''}`}>
                  <ListUl width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Lista numerada" title="Lista numerada" id="insertOrderedList" onPress={() => runFormat('insertOrderedList')} className={`${isToolbarActionVisible('insertOrderedList') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'insertOrderedList' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <ListOl width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Lista de tareas" title="Lista de tareas" id="checklist" onPress={() => runFormat('checklist')} className={`${isToolbarActionVisible('checklist') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'checklist' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <SquareCheck width={15} height={15} />
                </ToggleButton>
                <ToggleButton isIconOnly aria-label="Cita" title="Cita" id="blockquote" onPress={() => runFormat('blockquote')} className={`${isToolbarActionVisible('blockquote') ? '' : 'toolbar-control-overflowed'} ${lastVisibleListAction === 'blockquote' ? 'toolbar-last-visible' : ''}`}>
                  <ToggleButtonGroup.Separator />
                  <QuoteOpen width={15} height={15} />
                </ToggleButton>
              </ToggleButtonGroup>

              <ButtonGroup variant="tertiary" className={`mobile-actions-group ${isToolbarActionVisible('createLink') ? '' : 'toolbar-group-standalone'}`}>
                <Button
                  isIconOnly
                  variant="tertiary"
                  aria-label="Enlace"
                  title="Enlace (⌘/Ctrl+K)"
                  aria-pressed={inlineState.link}
                  onPress={() => runFormat('createLink')}
                  className={`${isToolbarActionVisible('createLink') ? '' : 'toolbar-control-overflowed'} rounded-none rounded-s-3xl`}
                >
                  <Link width={15} height={15} />
                </Button>
                <MoreActionsMenu
                  onAction={handleMoreAction}
                  visibleActions={visibleToolbarActions}
                />
              </ButtonGroup>
            </Toolbar>
          </div>
        </div>

        <div
          ref={bodyRef}
          className="doc-body editable-body"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder="Empieza a escribir…"
          onKeyDown={e => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const key = e.key.toLowerCase();
            if (key === 'z') {
              e.preventDefault();
              e.shiftKey ? handleRedo() : handleUndo();
            } else if (key === 'y') {
              e.preventDefault();
              handleRedo();
            } else if (!e.altKey && key === 'b') {
              e.preventDefault();
              runFormat('bold');
            } else if (!e.altKey && key === 'i') {
              e.preventDefault();
              runFormat('italic');
            } else if (!e.altKey && key === 'u') {
              e.preventDefault();
              runFormat('underline');
            } else if (!e.altKey && key === 'e') {
              e.preventDefault();
              runFormat('code');
            } else if (!e.altKey && key === 'k') {
              e.preventDefault();
              runFormat('createLink');
            } else if (e.shiftKey && key === '7') {
              e.preventDefault();
              runFormat('insertOrderedList');
            } else if (e.shiftKey && key === '8') {
              e.preventDefault();
              runFormat('insertUnorderedList');
            }
          }}
          onInput={event => {
            hydrateChecklistControls(bodyRef.current);
            if (historyInputSuppressionRef.current === 0 && !historyApplyingRef.current) {
              const inputType = event.nativeEvent?.inputType || 'input';
              const kind = inputType.startsWith('delete') ? 'delete' : 'insert';
              commitHistory({kind, merge: true});
            }
            markDirty();
            rememberSelection();
          }}
          onKeyUp={rememberSelection}
          onPointerUp={rememberSelection}
          onPaste={() => setTimeout(() => {
            if (bodyRef.current) {
              bodyRef.current.innerHTML = sanitizeRichHtml(bodyRef.current.innerHTML);
            }
            commitHistory({kind: 'paste'});
            markDirty();
            rememberSelection();
          }, 0)}
          onClick={e => {
            const control = e.target.closest?.('.check-control');
            if (!control) return;
            e.preventDefault();
            e.stopPropagation();
            const li = control.closest('li');
            commitMutation(() => {
              li.classList.toggle('done');
              control.setAttribute('aria-pressed', li.classList.contains('done') ? 'true' : 'false');
              control.setAttribute('aria-label', li.classList.contains('done') ? 'Marcar como pendiente' : 'Marcar como completado');
            }, {kind: 'checklist'});
          }}
        />
      </article>
    </section>
  );
}

function DeleteAlertDialog({isOpen, doc, onConfirm, onCancel}) {
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={open => !open && onCancel()} variant="opaque" isDismissable>
        <AlertDialog.Container placement="auto" size="sm">
          <AlertDialog.Dialog aria-label="Eliminar documento">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Eliminar documento</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                “{doc?.title || 'Sin título'}” se eliminará de la biblioteca. Puedes restaurar los datos iniciales desde el menú de opciones.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="ghost" onPress={onCancel}>
                Cancelar
              </Button>
              <Button variant="danger" onPress={() => onConfirm(doc?.id)}>
                Eliminar
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

function InsertLinkModal({isOpen, linkValue, setLinkValue, onApply, onCancel}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={open => !open && onCancel()} variant="opaque" isDismissable>
        <Modal.Container placement="auto" size="sm">
          <Modal.Dialog aria-label="Agregar enlace">
            <Modal.Header>
              <Modal.Heading>Agregar enlace</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField className="w-full">
                <Label>URL o Enlace</Label>
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
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onCancel}>
                Cancelar
              </Button>
              <Button variant="primary" isDisabled={!linkValue.trim()} onPress={onApply}>
                Aplicar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
    </Modal.Backdrop>
  );
}

function MarkdownPreviewModal({isOpen, doc, onCopy, onCancel}) {
  const markdown = doc ? documentMarkdown(doc) : '';

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={open => !open && onCancel()} variant="opaque" isDismissable>
      <Modal.Container placement="auto" size="lg">
        <Modal.Dialog aria-label="Vista previa de Markdown">
          <Modal.Header>
            <Modal.Heading>Vista previa de Markdown</Modal.Heading>
            <p className="text-sm text-muted truncate">{doc?.title || 'Sin título'}</p>
          </Modal.Header>
          <Modal.Body>
            <pre className="markdown-preview-content" tabIndex="0">{markdown}</pre>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onCancel}>
              <ChevronLeft width={15} height={15} /> Atrás
            </Button>
            <Button variant="primary" onPress={() => onCopy(markdown)}>
              <Copy width={15} height={15} /> Copiar Markdown
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function HtmlPreviewModal({isOpen, doc, onCopy, onCancel}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={open => !open && onCancel()} variant="opaque" isDismissable>
      <Modal.Container placement="auto" size="lg">
        <Modal.Dialog aria-label="Vista previa HTML">
          <Modal.Header>
            <Modal.Heading>Vista previa HTML</Modal.Heading>
            <p className="text-sm text-muted truncate">{doc?.title || 'Sin título'}</p>
          </Modal.Header>
          <Modal.Body>
            <div className="export-html-preview">
              <h1>{doc?.title || 'Sin título'}</h1>
              {doc?.description && <p className="text-muted">{doc.description}</p>}
              <RichBody html={doc?.body || ''} />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onCancel}>
              <ChevronLeft width={15} height={15} /> Atrás
            </Button>
            <Button variant="primary" onPress={() => onCopy(documentHtml(doc))}>
              <Copy width={15} height={15} /> Copiar HTML
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function PdfPreviewModal({isOpen, file, onCancel}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={open => !open && onCancel()} variant="opaque" isDismissable>
      <Modal.Container placement="auto" size="lg">
        <Modal.Dialog aria-label="Vista previa de PDF">
          <Modal.Header>
            <Modal.Heading>Vista previa de PDF</Modal.Heading>
            <p className="text-sm text-muted truncate">{file?.filename || 'documento.pdf'}</p>
          </Modal.Header>
          <Modal.Body>
            {file?.url && (
              <iframe
                className="export-pdf-preview"
                src={file.url}
                title={file.filename || 'Vista previa de PDF'}
              />
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onCancel}>
              <ChevronLeft width={15} height={15} /> Atrás
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function App() {
  const [store, setStore] = useState(loadStore);
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
  const lastOpenedRef = useRef(lastOpened);
  const scrollMemory = useRef(new Map());
  const routeRef = useRef(route);
  const pendingRestore = useRef(null);
  const skipNextRouteAnimation = useRef(false);

  const docs = store.docs;
  const sortedDocs = useMemo(() => [...docs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [docs]);
  const docsById = useMemo(() => new Map(docs.map(doc => [doc.id, doc])), [docs]);
  const currentDoc = route.id ? docsById.get(route.id) : null;

  useEffect(() => saveStore(store), [store]);

  const showToast = useCallback(message => {
    toast(message);
  }, []);

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

  useEffect(() => {
    const onHash = () => {
      scrollMemory.current.set(routeRef.current.key, window.scrollY);
      const nextRoute = parseRoute();
      if (nextRoute.type === 'library' && lastOpenedRef.current) setLastOpened(lastOpenedRef.current);
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
          document.startViewTransition(applyRoute);
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
    setStore(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? {
        ...doc,
        ...patch,
        updatedAt: patch.updatedAt || new Date().toISOString(),
        ...(actorName ? {updatedByName: actorName} : {}),
      } : doc)
    }));
  }, []);

  const duplicateDoc = useCallback(id => {
    const source = docsById.get(id);
    if (!source) return;
    const copy = {
      ...source,
      id: `local-${Date.now().toString(36)}`,
      title: `${source.title} · copia`,
      builtin: false,
      stress: false,
      origin: 'Duplicado en Bardo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStore(prev => ({...prev, docs: [copy, ...prev.docs]}));
    showToast('Documento duplicado');
    go(`#doc-${copy.id}`);
  }, [docsById, go, showToast]);

  const uploadDocument = useCallback(async file => {
    try {
      showToast('Preparando documento…');
      const imported = await convertDocumentFile(file);
      const now = new Date().toISOString();
      const doc = {
        id: `local-${Date.now().toString(36)}`,
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
      setStore(prev => ({...prev, docs: [doc, ...prev.docs]}));
      showToast('Documento listo');
      go(`#doc-${doc.id}`);
    } catch (error) {
      console.error('Bardo Docs: no se pudo subir el documento', error);
      showToast(error instanceof Error ? error.message : 'No se pudo subir el documento');
    }
  }, [go, showToast]);

  const deleteDoc = useCallback(id => {
    setStore(prev => ({
      ...prev,
      docs: prev.docs.filter(doc => doc.id !== id),
      deletedIds: [...new Set([...(prev.deletedIds || []), id])]
    }));
    setModal(null);
    showToast('Documento eliminado');
    go('#docs');
  }, [go, showToast]);

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

  const continueDoc = lastOpened?.id && docsById.has(lastOpened.id) ? docsById.get(lastOpened.id) : sortedDocs[0];

  const docAction = useCallback(async (action, targetDoc) => {
    const doc = targetDoc?.id ? targetDoc : docsById.get(targetDoc);
    if (!doc) return;
    if (action === 'open') openDoc(doc.id);
    if (action === 'edit') go(`#edit-${doc.id}`, {preserveBody: route.type === 'doc'});
    if (action === 'duplicate') duplicateDoc(doc.id);
    if (action === 'delete') setModal({type: 'delete', docId: doc.id});
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
          showToast('No se pudo enviar el documento al canal');
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
  }, [docsById, duplicateDoc, go, openDoc, route.type, showToast]);

  return (
    <main className="app-root">
      {(route.type === 'library' || route.type === 'planner' || (route.type === 'doc' && currentDoc)) && (
        <PersistentHeader
          route={route}
          doc={currentDoc}
          onBack={() => go('#docs', {restore: scrollMemory.current.get('library') || 0})}
          onEdit={() => go(`#edit-${currentDoc.id}`, {preserveBody: true})}
          onAction={docAction}
          onNew={() => go('#new')}
          onUpload={uploadDocument}
          onPlannerNew={() => go('#planner-new')}
          onPlannerDemo={() => go('#planner-demo')}
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
              id: docData.id || `local-${Date.now().toString(36)}`,
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
            setStore((prev) => ({...prev, docs: [doc, ...(prev.docs || []).filter((d) => d.id !== doc.id)]}));
            showToast('Minuta guardada en Bardo Docs');
            go(`#doc-${doc.id}`);
          }}
        />
      )}
      {route.type === 'library' && (
        <Library
          docs={filteredDocs}
          total={docs.length}
          query={query}
          setQuery={setQuery}
          continueDoc={continueDoc}
          onContinue={() => continueDoc && openDoc(continueDoc.id, true)}
          onOpen={openDoc}
          onNew={() => go('#new')}
          onUpload={uploadDocument}
          onDocAction={docAction}
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

      {(route.type === 'edit' || route.type === 'new') && (
        <Editor
          key={route.type === 'new' ? 'new' : currentDoc?.id}
          doc={route.type === 'new' ? null : currentDoc}
          isNew={route.type === 'new'}
          onBack={() => route.type === 'new' ? go('#docs') : go(`#doc-${currentDoc.id}`, {preserveBody: true, skipTransition: true})}
          onFinish={(snapshot) => {
            if (route.type === 'new') {
              const doc = {
                id: `local-${Date.now().toString(36)}`,
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
              setStore(prev => ({...prev, docs: [doc, ...prev.docs]}));
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {}
              showToast('Documento creado');
              go(`#doc-${doc.id}`);
            } else {
              updateDoc(currentDoc.id, snapshot);
              go(`#doc-${currentDoc.id}`, {preserveBody: true, skipTransition: true});
            }
          }}
          onAutosave={(snapshot) => {
            if (route.type === 'new') {
              try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
              } catch {}
            } else updateDoc(currentDoc.id, snapshot);
          }}
          onOpenLink={(api) => {
            setLinkValue('');
            setModal({type: 'link', api});
          }}
        />
      )}

      {route.type !== 'library' && route.type !== 'planner' && !currentDoc && route.type !== 'new' && (
        <div className="missing-state flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base text-muted mb-4">Este documento ya no existe.</p>
          <Button variant="secondary" onPress={() => go('#docs')}>
            Volver a Docs
          </Button>
        </div>
      )}

      <DeleteAlertDialog
        isOpen={modal?.type === 'delete'}
        doc={modal?.type === 'delete' ? docsById.get(modal.docId) : null}
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

      <ToastProvider placement="bottom" />
    </main>
  );
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
  input.dispatchEvent(new Event('input', {bubbles: true}));
  requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
}

function hydrateChecklistControls(root) {
  if (!root) return;
  root.querySelectorAll('ul.checklist > li').forEach(li => {
    if (li.querySelector(':scope > .check-control')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'check-control';
    button.contentEditable = 'false';
    button.setAttribute('aria-label', li.classList.contains('done') ? 'Marcar como pendiente' : 'Marcar como completado');
    button.setAttribute('aria-pressed', li.classList.contains('done') ? 'true' : 'false');
    button.innerHTML = '<span aria-hidden="true">✓</span>';
    li.prepend(button);
  });
}

function elementForNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
}

function execCommand(command, value = null) {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

function selectNodeContents(node, rangeRef) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  rangeRef.current = range.cloneRange();
}

function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
  parent.normalize?.();
}

const INLINE_TAGS = {bold: 'strong', italic: 'em', underline: 'u', strikeThrough: 's', code: 'code'};

function manualInlineFormat(body, rangeRef, command) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const tag = INLINE_TAGS[command];
  if (!tag || range.collapsed) return false;
  const startEl = elementForNode(range.startContainer);
  const endEl = elementForNode(range.endContainer);
  const existing = startEl?.closest?.(tag);
  if (existing && body.contains(existing) && existing.contains(endEl)) {
    unwrapElement(existing);
    return true;
  }
  const wrapper = document.createElement(tag);
  try {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selectNodeContents(wrapper, rangeRef);
    return true;
  } catch {
    return false;
  }
}

function manualRemoveInlineFormatting(body, rangeRef) {
  const selection = window.getSelection();
  if (!body || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !body.contains(range.commonAncestorContainer)) return false;

  const fragment = range.extractContents();
  const inlineTags = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'CODE', 'A', 'SPAN', 'KBD']);
  [...fragment.querySelectorAll('*')]
    .filter(element => inlineTags.has(element.tagName))
    .forEach(unwrapElement);
  range.insertNode(fragment);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  rangeRef.current = range.cloneRange();
  return true;
}

function topLevelBlocksForRange(body, range) {
  if (!body || !range) return [];
  return [...body.children]
    .filter(el => {
      try {
        return range.intersectsNode(el);
      } catch {
        return false;
      }
    })
    .filter(el => /^(P|H1|H2|H3|H4|BLOCKQUOTE|PRE)$/i.test(el.tagName));
}

function replaceTag(el, tagName) {
  if (!el || el.tagName.toLowerCase() === tagName) return el;
  const replacement = document.createElement(tagName);
  while (el.firstChild) replacement.appendChild(el.firstChild);
  el.replaceWith(replacement);
  return replacement;
}

function applyBlockFormat(body, rangeRef, tagName) {
  if (!body) return false;
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  let blocks = topLevelBlocksForRange(body, range);
  if (!blocks.length) {
    let el = elementForNode(range.startContainer);
    while (el && el.parentElement !== body) el = el.parentElement;
    if (el && /^(P|H1|H2|H3|H4|BLOCKQUOTE|PRE)$/i.test(el.tagName)) blocks = [el];
  }
  if (!blocks.length) return execCommand('formatBlock', tagName);
  const replacements = blocks.map(el => {
    const replacement = replaceTag(el, tagName);
    if (tagName.toLowerCase() === 'pre' && !replacement.querySelector(':scope > code')) {
      const code = document.createElement('code');
      while (replacement.firstChild) code.appendChild(replacement.firstChild);
      replacement.appendChild(code);
    }
    return replacement;
  });
  const rr = document.createRange();
  rr.selectNodeContents(replacements[0]);
  rr.collapse(false);
  sel.removeAllRanges();
  sel.addRange(rr);
  rangeRef.current = rr.cloneRange();
  return true;
}

function manualList(body, rangeRef, ordered) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !body) return false;
  const range = sel.getRangeAt(0);
  const wantedTag = ordered ? 'OL' : 'UL';
  let anchor = elementForNode(range.startContainer);
  const currentLi = anchor?.closest?.('li');
  const currentList = currentLi?.parentElement;
  if (currentList && body.contains(currentList) && /^(UL|OL)$/.test(currentList.tagName)) {
    if (currentList.tagName === wantedTag) {
      const items = [...currentList.children].filter(li => li.tagName === 'LI');
      const idx = Math.max(0, items.indexOf(currentLi));
      const ps = items.map(li => {
        const p = document.createElement('p');
        p.innerHTML = li.innerHTML || '<br>';
        p.querySelector('.check-control')?.remove();
        return p;
      });
      currentList.before(...ps);
      currentList.remove();
      const target = ps[Math.min(idx, ps.length - 1)] || ps[0];
      if (target) {
        const rr = document.createRange();
        rr.selectNodeContents(target);
        rr.collapse(false);
        sel.removeAllRanges();
        sel.addRange(rr);
        rangeRef.current = rr.cloneRange();
      }
      return true;
    }
    const replacement = document.createElement(wantedTag.toLowerCase());
    while (currentList.firstChild) replacement.appendChild(currentList.firstChild);
    currentList.replaceWith(replacement);
    return true;
  }
  const blocks = topLevelBlocksForRange(body, range).filter(el => el.tagName !== 'PRE');
  if (!blocks.length) return false;
  const list = document.createElement(wantedTag.toLowerCase());
  blocks[0].before(list);
  blocks.forEach(block => {
    const li = document.createElement('li');
    li.innerHTML = block.innerHTML || '<br>';
    list.appendChild(li);
    block.remove();
  });
  const rr = document.createRange();
  rr.selectNodeContents(list.lastElementChild || list);
  rr.collapse(false);
  sel.removeAllRanges();
  sel.addRange(rr);
  rangeRef.current = rr.cloneRange();
  return true;
}

function rangeCoversNode(range, node) {
  if (!range || !node) return false;
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  try {
    return range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
  } catch {
    return false;
  }
}

function fragmentHasContent(fragment) {
  return !!fragment && (fragment.textContent?.length > 0 || fragment.childNodes.length > 0);
}

function removeChecklistControls(fragment) {
  fragment?.querySelectorAll?.('.check-control').forEach(control => control.remove());
}

function createStructuredContainer(format, contents) {
  const nodes = contents.flatMap(content => [...content.childNodes]);
  if (format === 'callout') {
    const container = document.createElement('div');
    container.className = 'doc-callout';
    nodes.forEach(node => container.appendChild(node));
    return {container, selectionTarget: container};
  }
  if (format === 'spoiler') {
    const container = document.createElement('details');
    container.className = 'spoiler';
    container.open = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Detalles';
    container.appendChild(summary);
    nodes.forEach(node => container.appendChild(node));
    const selectionTarget = container.querySelector(':scope > :not(summary)') || container;
    return {container, selectionTarget};
  }
  if (format === 'checklist') {
    const container = document.createElement('ul');
    container.className = 'checklist';
    contents.forEach(content => {
      const li = document.createElement('li');
      li.append(...[...content.childNodes]);
      removeChecklistControls(li);
      container.appendChild(li);
    });
    return {container, selectionTarget: container.lastElementChild || container};
  }
  return null;
}

function applyStructuredFormat(body, rangeRef, format) {
  const selection = window.getSelection();
  if (!body || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !body.contains(range.commonAncestorContainer)) return false;

  const blocks = topLevelBlocksForRange(body, range);
  if (!blocks.length) return false;

  // A partial selection inside one text block becomes the content of the new
  // container, while the text before and after it remains in place.
  if (blocks.length === 1 && !rangeCoversNode(range, blocks[0])) {
    const block = blocks[0];
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = document.createRange();
    afterRange.selectNodeContents(block);
    afterRange.setStart(range.endContainer, range.endOffset);
    const before = beforeRange.cloneContents();
    const selected = range.cloneContents();
    const after = afterRange.cloneContents();
    removeChecklistControls(selected);
    const structured = createStructuredContainer(format, [selected]);
    if (!structured) return false;

    const replacement = document.createDocumentFragment();
    if (fragmentHasContent(before)) {
      const beforeBlock = block.cloneNode(false);
      beforeBlock.append(...before.childNodes);
      replacement.appendChild(beforeBlock);
    }
    replacement.appendChild(structured.container);
    if (fragmentHasContent(after)) {
      const afterBlock = block.cloneNode(false);
      afterBlock.append(...after.childNodes);
      replacement.appendChild(afterBlock);
    }
    block.replaceWith(replacement);
    selectNodeContents(structured.selectionTarget, rangeRef);
    return true;
  }

  const contents = blocks.map(block => {
    const clone = block.cloneNode(true);
    clone.querySelectorAll?.('.check-control').forEach(control => control.remove());
    const fragment = document.createDocumentFragment();
    fragment.appendChild(clone);
    return fragment;
  });
  const structured = createStructuredContainer(format, contents);
  if (!structured) return false;
  blocks[0].before(structured.container);
  blocks.forEach(block => block.remove());
  selectNodeContents(structured.selectionTarget, rangeRef);
  return true;
}

function insertTopLevelBlock(body, html, rangeRef) {
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : rangeRef.current;
  let anchor = range?.startContainer || sel?.anchorNode;
  if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentElement;
  let top = anchor instanceof Element ? anchor : null;
  while (top && top.parentElement && top.parentElement !== body) top = top.parentElement;
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const nodes = [...template.content.childNodes];
  const caretBlock = document.createElement('p');
  caretBlock.innerHTML = '<br>';
  if (range?.collapsed && top && /^(P|H2|H3|BLOCKQUOTE|PRE)$/.test(top.tagName)) {
    try {
      const tailRange = document.createRange();
      tailRange.selectNodeContents(top);
      tailRange.setStart(range.startContainer, range.startOffset);
      const tail = tailRange.extractContents();
      const after = top.cloneNode(false);
      after.appendChild(tail);
      if (!after.textContent && !after.querySelector('*')) after.innerHTML = '<br>';
      top.after(...nodes, after);
      placeCaret(after, rangeRef, true);
      return;
    } catch {}
  }
  if (top?.parentElement === body) top.after(...nodes, caretBlock);
  else body.append(...nodes, caretBlock);
  placeCaret(caretBlock, rangeRef, true);
}

function placeCaret(el, rangeRef, atStart = true) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(atStart);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  rangeRef.current = r.cloneRange();
}

function updateToolbarState(body, setInline, setBlock) {
  const next = {};
  ['bold', 'italic', 'underline', 'strikeThrough'].forEach(cmd => {
    try {
      next[cmd] = document.queryCommandState(cmd);
    } catch {
      next[cmd] = false;
    }
  });
  const sel = window.getSelection();
  const el = sel?.rangeCount ? elementForNode(sel.getRangeAt(0).startContainer) : null;
  const list = el?.closest?.('ul,ol');
  const isChecklist = !!list && list.classList.contains('checklist');
  next.insertUnorderedList = !!list && body?.contains(list) && list.tagName === 'UL' && !isChecklist;
  next.checklist = isChecklist && body?.contains(list);
  next.insertOrderedList = !!list && body?.contains(list) && list.tagName === 'OL';
  next.code = !!el?.closest?.('code');
  next.link = !!el?.closest?.('a');
  setInline(next);

  let block = el;
  while (block && block.parentElement !== body) block = block.parentElement;
  const tag = block?.tagName?.toLowerCase();
  if (['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre'].includes(tag)) {
    setBlock(tag);
  } else if (next.checklist) {
    setBlock('checklist');
  } else if (next.insertUnorderedList) {
    setBlock('insertUnorderedList');
  } else if (next.insertOrderedList) {
    setBlock('insertOrderedList');
  } else if (block?.classList?.contains('doc-callout') || block?.classList?.contains('callout')) {
    setBlock('callout');
  } else if (block?.tagName === 'DETAILS' && block?.classList?.contains('spoiler')) {
    setBlock('spoiler');
  } else {
    setBlock('p');
  }
}

function createLinkBookmark(range) {
  if (!range) return null;
  try {
    if (range.collapsed) {
      const marker = document.createComment('bardo-link-caret');
      const point = range.cloneRange();
      point.collapse(true);
      point.insertNode(marker);
      return {collapsed: true, marker};
    }
    const endMarker = document.createComment('bardo-link-end');
    const startMarker = document.createComment('bardo-link-start');
    const end = range.cloneRange();
    end.collapse(false);
    end.insertNode(endMarker);
    const start = range.cloneRange();
    start.collapse(true);
    start.insertNode(startMarker);
    return {collapsed: false, startMarker, endMarker};
  } catch {
    return null;
  }
}

function cleanupLinkBookmark(bookmark) {
  bookmark?.marker?.remove?.();
  bookmark?.startMarker?.remove?.();
  bookmark?.endMarker?.remove?.();
}

function applyLinkBookmark(bookmark, href) {
  if (!bookmark || !href) return false;
  try {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer';
    if (bookmark.collapsed) {
      a.textContent = href;
      bookmark.marker.before(a);
      bookmark.marker.remove();
    } else {
      const range = document.createRange();
      range.setStartAfter(bookmark.startMarker);
      range.setEndBefore(bookmark.endMarker);
      const contents = range.extractContents();
      a.appendChild(contents);
      range.insertNode(a);
      bookmark.startMarker.remove();
      bookmark.endMarker.remove();
    }
    const sel = window.getSelection();
    const caret = document.createRange();
    caret.setStartAfter(a);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    return true;
  } catch {
    cleanupLinkBookmark(bookmark);
    return false;
  }
}

export default App;

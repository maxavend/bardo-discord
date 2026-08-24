import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  Button,
  Input,
  Label,
  Modal,
  SearchField,
  TextField,
  ToastProvider,
  Toolbar,
  toast,
} from '@heroui/react';
import {
  Bars,
  Check,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  File,
  Magnifier,
  Plus,
} from '@gravity-ui/icons';
import {createSeedDocs, SEED_COUNT} from './mockData.js';

const STORE_KEY = 'bardo.docs.heroui.v1';
const DRAFT_KEY = 'bardo.docs.heroui.draft.v1';
const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';
const STORE_VERSION = 1;

const BLOCK_OPTIONS = [
  ['p', 'Texto'],
  ['h2', 'Título 1'],
  ['h3', 'Título 2'],
  ['blockquote', 'Cita'],
  ['pre', 'Código'],
];

const ICONS = {
  search: Magnifier,
  plus: Plus,
  doc: File,
  back: ChevronLeft,
  chevron: ChevronRight,
  list: Bars,
  check: Check,
};

function Icon({name, size = 16}) {
  const Glyph = ICONS[name];
  return Glyph ? <Glyph width={size} height={size} aria-hidden="true" /> : null;
}

function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!raw || raw === 'docs') return {type:'library', key:'library'};
  if (raw === 'new') return {type:'new', key:'new'};
  if (raw.startsWith('edit-')) return {type:'edit', id:raw.slice(5), key:raw};
  if (raw.startsWith('doc-')) return {type:'doc', id:raw.slice(4), key:raw};
  return {type:'library', key:'library'};
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
  const allowed = new Set(['P','H2','H3','STRONG','B','EM','I','U','S','DEL','CODE','PRE','UL','OL','LI','BLOCKQUOTE','HR','A','DETAILS','SUMMARY','DIV','TABLE','THEAD','TBODY','TR','TH','TD','BR','SPAN','KBD']);
  const classes = new Set(['checklist','done','spoiler','doc-callout']);
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
      if (keep.length) el.className = keep.join(' '); else el.removeAttribute('class');
    }
    if (el.tagName === 'A') {
      const href = normalizeUrl(el.getAttribute('href') || '');
      if (!href || !/^(https?:\/\/|mailto:|tel:)/i.test(href)) el.removeAttribute('href');
      else {
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

function relativeMeta(doc) {
  const stamp = new Date(doc?.updatedAt || doc?.createdAt || Date.now()).getTime();
  const diff = Math.max(0, Date.now() - stamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return `${doc.origin || 'Creado en Bardo'} · ahora`;
  if (minutes < 60) return `${doc.origin || 'Creado en Bardo'} · hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${doc.origin || 'Creado en Bardo'} · hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `${doc.origin || 'Creado en Bardo'} · ayer`;
  return `${doc.origin || 'Creado en Bardo'} · hace ${days} días`;
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
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

function loadStore() {
  const seeds = createSeedDocs();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.docs)) {
      return {version:STORE_VERSION, docs:seeds, deletedIds:[]};
    }
    const deleted = new Set(parsed.deletedIds || []);
    const docs = [...parsed.docs];
    const ids = new Set(docs.map(d => d.id));
    seeds.forEach(seed => {
      if (!ids.has(seed.id) && !deleted.has(seed.id)) docs.push(seed);
    });
    return {version:STORE_VERSION, docs, deletedIds:[...deleted]};
  } catch {
    return {version:STORE_VERSION, docs:seeds, deletedIds:[]};
  }
}

function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

function NativeMenu({label, options, onAction, disabledKeys = [], className = ''}) {
  const disabled = new Set(disabledKeys);
  return (
    <span className={`native-menu ${className}`}>
      <span className="native-menu-visual" aria-hidden="true"><EllipsisVertical width={16} height={16}/></span>
      <select
        aria-label={label}
        value=""
        onChange={e => {
          const value = e.target.value;
          if (value) onAction(value);
        }}
      >
        <option value="" disabled>Más acciones</option>
        {options.map(item => <option key={item.value} value={item.value} disabled={disabled.has(item.value)}>{item.label}</option>)}
      </select>
    </span>
  );
}

function RichBody({html, onChecklistChange, className = ''}) {
  const ref = useRef(null);
  const rendered = useMemo(() => enhanceChecklistHtml(html), [html]);
  return (
    <div
      ref={ref}
      className={`doc-body ${className}`}
      dangerouslySetInnerHTML={{__html:rendered}}
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

function App() {
  const [store, setStore] = useState(loadStore);
  const [route, setRoute] = useState(parseRoute);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [linkValue, setLinkValue] = useState('');
  const [lastOpened, setLastOpened] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_OPENED_KEY) || 'null'); } catch { return null; }
  });
  const lastOpenedRef = useRef(lastOpened);
  const scrollMemory = useRef(new Map());
  const routeRef = useRef(route);
  const pendingRestore = useRef(null);

  const docs = store.docs;
  const sortedDocs = useMemo(() => [...docs].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [docs]);
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

  const go = useCallback((hash, {preserveBody = false, restore = null} = {}) => {
    scrollMemory.current.set(routeRef.current.key, window.scrollY);
    if (preserveBody) pendingRestore.current = {kind:'body', target:hash.replace(/^#/, ''), offset:captureBodyOffset() ?? 0};
    else if (restore) pendingRestore.current = {kind:'absolute', target:hash.replace(/^#/, ''), y:restore};
    else pendingRestore.current = {kind:'absolute', target:hash.replace(/^#/, ''), y:0};
    if (location.hash === hash) setRoute(parseRoute()); else location.hash = hash;
  }, [captureBodyOffset]);

  useEffect(() => {
    const onHash = () => {
      scrollMemory.current.set(routeRef.current.key, window.scrollY);
      const nextRoute = parseRoute();
      if (nextRoute.type === 'library' && lastOpenedRef.current) setLastOpened(lastOpenedRef.current);
      setRoute(nextRoute);
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
  }, [route]);

  useEffect(() => {
    if (route.type !== 'doc' || !currentDoc) return;
    const onScroll = () => {
      const body = document.querySelector('.route-active .doc-body');
      const offset = body ? window.scrollY - (body.getBoundingClientRect().top + window.scrollY) : 0;
      const next = {id:currentDoc.id, offset, at:Date.now()};
      lastOpenedRef.current = next;
      try { localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(next)); } catch {}
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive:true});
    return () => window.removeEventListener('scroll', onScroll);
  }, [route.type, currentDoc?.id]);

  const updateDoc = useCallback((id, patch) => {
    setStore(prev => ({...prev, docs:prev.docs.map(doc => doc.id === id ? {...doc, ...patch, updatedAt:patch.updatedAt || new Date().toISOString()} : doc)}));
  }, []);

  const duplicateDoc = useCallback(id => {
    const source = docsById.get(id); if (!source) return;
    const copy = {...source, id:`local-${Date.now().toString(36)}`, title:`${source.title} · copia`, builtin:false, stress:false, origin:'Duplicado en Bardo', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
    setStore(prev => ({...prev, docs:[copy, ...prev.docs]}));
    showToast('Documento duplicado');
    go(`#doc-${copy.id}`);
  }, [docsById, go, showToast]);

  const deleteDoc = useCallback(id => {
    setStore(prev => ({...prev, docs:prev.docs.filter(doc => doc.id !== id), deletedIds:[...new Set([...(prev.deletedIds || []), id])]}));
    setModal(null);
    showToast('Documento eliminado');
    go('#docs');
  }, [go, showToast]);

  const resetMockData = useCallback(() => {
    const next = {version:STORE_VERSION, docs:createSeedDocs(), deletedIds:[]};
    setStore(next);
    try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(LAST_OPENED_KEY); } catch {}
    lastOpenedRef.current = null; setLastOpened(null); setQuery(''); setModal(null);
    showToast('Datos mock restaurados');
    go('#docs');
  }, [go, showToast]);

  const openDoc = useCallback((id, fromContinue = false) => {
    const target = `#doc-${id}`;
    if (fromContinue && lastOpened?.id === id) {
      pendingRestore.current = {kind:'body', target:`doc-${id}`, offset:lastOpened.offset || 0};
      location.hash = target;
    } else go(target);
  }, [go, lastOpened]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (!q) return sortedDocs;
    return sortedDocs.filter(doc => `${doc.title} ${doc.description} ${doc.origin} ${stripHtml(doc.body)}`.toLocaleLowerCase('es').includes(q));
  }, [query, sortedDocs]);

  const continueDoc = lastOpened?.id && docsById.has(lastOpened.id) ? docsById.get(lastOpened.id) : sortedDocs[0];

  const docAction = useCallback(async (action, doc) => {
    if (!doc) return;
    if (action === 'open') openDoc(doc.id);
    if (action === 'edit') go(`#edit-${doc.id}`, {preserveBody:route.type === 'doc'});
    if (action === 'duplicate') duplicateDoc(doc.id);
    if (action === 'delete') setModal({type:'delete', docId:doc.id});
    if (action === 'copy') {
      try { await copyText(`${doc.title}\n\n${doc.description}\n\n${stripHtml(doc.body)}`); showToast('Documento copiado'); }
      catch { showToast('No se pudo copiar'); }
    }
    if (action === 'markdown') {
      downloadFile(`${doc.title.replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-|-$/g,'') || 'documento'}.md`, 'text/markdown;charset=utf-8', `# ${doc.title}\n\n${doc.description ? `${doc.description}\n\n` : ''}${markdownFromHtml(doc.body)}`);
      showToast('Markdown preparado');
    }
    if (action === 'html') {
      downloadFile(`${doc.title.replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-|-$/g,'') || 'documento'}.html`, 'text/html;charset=utf-8', `<!doctype html><meta charset="utf-8"><title>${doc.title}</title><article><h1>${doc.title}</h1><p>${doc.description}</p>${sanitizeRichHtml(doc.body)}</article>`);
      showToast('HTML preparado');
    }
    if ((action === 'pdf' || action === 'docx') && window.__bardoExportDocument) {
      await window.__bardoExportDocument(doc.id, action);
      showToast(action === 'pdf' ? 'PDF abierto' : 'Word abierto');
    }
    if (action === 'print') window.print();
  }, [duplicateDoc, go, openDoc, route.type, showToast]);

  return (
    <main className="app-root">
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
          onDocAction={(action,id) => docAction(action, docsById.get(id))}
          onLibraryAction={action => {
            if (action === 'clear-search') setQuery('');
            if (action === 'discard-draft') { try { localStorage.removeItem(DRAFT_KEY); } catch {} showToast('Borrador descartado'); }
            if (action === 'reset') setModal({type:'reset'});
          }}
        />
      )}

      {route.type === 'doc' && currentDoc && (
        <Reader
          doc={currentDoc}
          onBack={() => go('#docs', {restore:scrollMemory.current.get('library') || 0})}
          onEdit={() => go(`#edit-${currentDoc.id}`, {preserveBody:true})}
          onAction={action => docAction(action, currentDoc)}
          onChecklistChange={body => updateDoc(currentDoc.id, {body})}
        />
      )}

      {(route.type === 'edit' || route.type === 'new') && (
        <Editor
          key={route.type === 'new' ? 'new' : currentDoc?.id}
          doc={route.type === 'new' ? null : currentDoc}
          isNew={route.type === 'new'}
          onBack={() => route.type === 'new' ? go('#docs') : go(`#doc-${currentDoc.id}`, {preserveBody:true})}
          onFinish={(snapshot) => {
            if (route.type === 'new') {
              const doc = {id:`local-${Date.now().toString(36)}`, ...snapshot, title:snapshot.title || 'Sin título', origin:'Creado en Bardo', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), builtin:false, stress:false};
              setStore(prev => ({...prev, docs:[doc, ...prev.docs]}));
              try { localStorage.removeItem(DRAFT_KEY); } catch {}
              showToast('Documento creado');
              go(`#doc-${doc.id}`);
            } else {
              updateDoc(currentDoc.id, snapshot);
              go(`#doc-${currentDoc.id}`, {preserveBody:true});
            }
          }}
          onAutosave={(snapshot) => {
            if (route.type === 'new') {
              try { localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot)); } catch {}
            } else updateDoc(currentDoc.id, snapshot);
          }}
          onOpenLink={(api) => { setLinkValue(''); setModal({type:'link', api}); }}
        />
      )}

      {route.type !== 'library' && !currentDoc && route.type !== 'new' && (
        <div className="missing-state"><p>Este documento ya no existe.</p><Button variant="secondary" onPress={() => go('#docs')}>Volver a Docs</Button></div>
      )}

      <AppModal
        modal={modal}
        setModal={setModal}
        linkValue={linkValue}
        setLinkValue={setLinkValue}
        docsById={docsById}
        onDelete={deleteDoc}
        onReset={resetMockData}
      />

      <ToastProvider placement="bottom"/>
    </main>
  );
}

function Library({docs,total,query,setQuery,continueDoc,onContinue,onOpen,onNew,onDocAction,onLibraryAction}) {
  const hasDraft = (() => { try { return !!localStorage.getItem(DRAFT_KEY); } catch { return false; } })();
  return (
    <section className="library route-active">
      <div className="library-inner">
        <header className="library-header glass-header">
          <strong className="library-title">Docs</strong>
          <div className="header-actions">
            <Button variant="ghost" size="sm" onPress={onNew} className="new-button"><Icon name="plus"/>Nuevo</Button>
            <NativeMenu
              label="Más opciones de Docs"
              options={[
                {value:'clear-search', label:'Limpiar búsqueda'},
                {value:'discard-draft', label:'Descartar borrador'},
                {value:'reset', label:'Restaurar datos mock'},
              ]}
              disabledKeys={[!query && 'clear-search', !hasDraft && 'discard-draft'].filter(Boolean)}
              onAction={onLibraryAction}
            />
          </div>
        </header>

        <SearchField
          aria-label="Buscar documentos"
          fullWidth
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          className="docs-search"
        >
          <SearchField.Group>
            <SearchField.SearchIcon/>
            <SearchField.Input placeholder="Buscar"/>
            <SearchField.ClearButton/>
          </SearchField.Group>
        </SearchField>

        {continueDoc && !query && (
          <section className="library-section continue-section">
            <h2 className="section-title">Continuar</h2>
            <button className="continue-row" type="button" onClick={onContinue}>
              <span className="continue-accent" aria-hidden="true"/>
              <span className="continue-copy"><strong>{continueDoc.title}</strong><span>{relativeMeta(continueDoc)}</span></span>
              <Icon name="chevron"/>
            </button>
          </section>
        )}

        <section className="library-section recent-section">
          <h2 className="section-title">{query ? `Resultados · ${docs.length}` : `Recientes · ${total}`}</h2>
          <div className="docs-list">
            {docs.map(doc => (
              <article className="doc-row" key={doc.id}>
                <span className="doc-symbol"><Icon name="doc" size={20}/></span>
                <button className="doc-row-main" type="button" onClick={() => onOpen(doc.id)}>
                  <strong>{doc.title || 'Sin título'}</strong>
                  <span>{relativeMeta(doc)}</span>
                </button>
                <NativeMenu
                  label={`Acciones de ${doc.title}`}
                  options={[
                    {value:'open',label:'Abrir'},
                    {value:'edit',label:'Editar'},
                    {value:'duplicate',label:'Duplicar'},
                    {value:'copy',label:'Copiar todo'},
                    {value:'markdown',label:'Exportar Markdown'},
                    {value:'html',label:'Exportar HTML'},
                    ...(window.__BARDO_PRODUCTION__ ? [
                      {value:'pdf',label:'Exportar PDF'},
                      {value:'docx',label:'Exportar Word'},
                    ] : []),
                    {value:'delete',label:'Eliminar'},
                  ]}
                  onAction={action => onDocAction(action, doc.id)}
                />
              </article>
            ))}
          </div>
          {!docs.length && <div className="empty-state">No encontré documentos con “{query}”.</div>}
        </section>
      </div>
    </section>
  );
}

function Reader({doc,onBack,onEdit,onAction,onChecklistChange}) {
  return (
    <section className="doc-route route-active">
      <Topbar left={<Button variant="ghost" size="sm" onPress={onBack} className="back-button"><Icon name="back"/>Docs</Button>} right={<><Button variant="ghost" size="sm" onPress={onEdit}>Editar</Button><NativeMenu label="Acciones del documento" options={[
        {value:'copy',label:'Copiar todo'},
        {value:'markdown',label:'Exportar Markdown'},
        {value:'html',label:'Exportar HTML'},
                    ...(window.__BARDO_PRODUCTION__ ? [
                      {value:'pdf',label:'Exportar PDF'},
                      {value:'docx',label:'Exportar Word'},
                    ] : []),
        {value:'duplicate',label:'Duplicar'},
        {value:'print',label:'Imprimir / PDF'},
        {value:'delete',label:'Eliminar'},
      ]} onAction={onAction}/></>} />
      <article className="document-shell">
        <DocumentIntro doc={doc}/>
        <RichBody html={doc.body} onChecklistChange={onChecklistChange}/>
      </article>
    </section>
  );
}

function Topbar({left,center,right}) {
  return <header className="doc-topbar glass-header"><div className="topbar-left">{left}</div><div className="topbar-center">{center}</div><div className="topbar-right">{right}</div></header>;
}

function DocumentIntro({doc}) {
  return <header className="doc-intro"><h1 className="doc-title">{doc.title || 'Sin título'}</h1>{doc.description && <p className="doc-description">{doc.description}</p>}<div className="doc-meta">{relativeMeta(doc)}</div></header>;
}

function Editor({doc,isNew,onBack,onFinish,onAutosave,onOpenLink}) {
  const initialDraft = useMemo(() => {
    if (!isNew) return null;
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
  }, [isNew]);
  const [title, setTitle] = useState(doc?.title ?? initialDraft?.title ?? '');
  const [description, setDescription] = useState(doc?.description ?? initialDraft?.description ?? '');
  const [saveState, setSaveState] = useState(isNew ? 'Borrador guardado' : 'Guardado');
  const [blockValue, setBlockValue] = useState('p');
  const [inlineState, setInlineState] = useState({bold:false,italic:false,underline:false,strikeThrough:false,insertUnorderedList:false,insertOrderedList:false});
  const bodyRef = useRef(null);
  const lastRange = useRef(null);
  const activeEditable = useRef(null);
  const saveTimer = useRef(null);
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  const loadedKey = useRef(null);

  titleRef.current = title;
  descriptionRef.current = description;

  const snapshot = useCallback(() => ({
    title:titleRef.current.trim(),
    description:descriptionRef.current.trim(),
    body:cleanEditorHtml(bodyRef.current),
    updatedAt:new Date().toISOString(),
  }), []);
  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    const snap = snapshot();
    onAutosave(snap);
    setSaveState(isNew ? 'Borrador guardado' : 'Guardado');
    return snap;
  }, [isNew,onAutosave,snapshot]);

  const markDirty = useCallback(() => {
    setSaveState(isNew ? 'Guardando borrador…' : 'Guardando…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  }, [flushSave,isNew]);

  useLayoutEffect(() => {
    const key = isNew ? 'new' : doc?.id;
    if (!bodyRef.current || loadedKey.current === key) return;
    loadedKey.current = key;
    bodyRef.current.innerHTML = sanitizeRichHtml(doc?.body ?? initialDraft?.body ?? '<p><br></p>');
    hydrateChecklistControls(bodyRef.current);
  }, [doc?.id, doc?.body, initialDraft?.body, isNew]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const rememberSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !bodyRef.current) return;
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) return;
    lastRange.current = range.cloneRange();
    activeEditable.current = bodyRef.current;
    updateToolbarState(bodyRef.current, setInlineState, setBlockValue);
  }, []);

  const restoreSelection = useCallback(() => {
    if (!bodyRef.current) return false;
    bodyRef.current.focus({preventScroll:true});
    const range = lastRange.current;
    if (range && bodyRef.current.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range.cloneRange()); return true;
    }
    const caret = document.createRange(); caret.selectNodeContents(bodyRef.current); caret.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(caret); lastRange.current = caret.cloneRange();
    return true;
  }, []);

  useEffect(() => {
    const handler = () => rememberSelection();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [rememberSelection]);

  const runFormat = useCallback(format => {
    restoreSelection();
    const body = bodyRef.current; if (!body) return;
    let applied = true;
    if (format === 'hr') insertTopLevelBlock(body, '<hr>', lastRange);
    else if (format === 'spoiler') insertTopLevelBlock(body, '<details class="spoiler" open><summary>Detalles</summary><p>Escribe contenido oculto…</p></details>', lastRange);
    else if (format === 'checklist') insertTopLevelBlock(body, '<ul class="checklist"><li>Elemento</li></ul>', lastRange);
    else if (format === 'callout') insertTopLevelBlock(body, '<div class="doc-callout">Escribe una nota…</div>', lastRange);
    else if (format === 'createLink') {
      const bookmark = createLinkBookmark(lastRange.current);
      onOpenLink({bookmark, body, apply:(href) => {
        applyLinkBookmark(bookmark, normalizeUrl(href));
        hydrateChecklistControls(body); markDirty(); requestAnimationFrame(rememberSelection);
      }, cancel:() => cleanupLinkBookmark(bookmark)});
      return;
    } else if (format === 'insertUnorderedList' || format === 'insertOrderedList') {
      applied = manualList(body, lastRange, format === 'insertOrderedList');
      if (!applied) applied = execCommand(format);
    } else {
      const before = body.innerHTML;
      applied = execCommand(format);
      const range = lastRange.current;
      if (range && !range.collapsed && (!applied || body.innerHTML === before)) applied = manualInlineFormat(body, lastRange, format);
    }
    hydrateChecklistControls(body);
    if (applied !== false) markDirty();
    requestAnimationFrame(() => { rememberSelection(); updateToolbarState(body, setInlineState, setBlockValue); });
  }, [markDirty,onOpenLink,rememberSelection,restoreSelection]);

  const applyBlock = useCallback(value => {
    restoreSelection();
    if (applyBlockFormat(bodyRef.current, lastRange, String(value || 'p'))) markDirty();
    requestAnimationFrame(rememberSelection);
  }, [markDirty,rememberSelection,restoreSelection]);

  const finish = () => {
    const snap = flushSave();
    onFinish(snap);
  };

  const handleTitleKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.doc-description-input')?.focus(); }
  };
  const handleDescriptionKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); }
  };

  return (
    <section className="doc-route route-active editing-route">
      <Topbar
        left={<Button variant="ghost" size="sm" onPress={() => {flushSave(); onBack();}} className="back-button"><Icon name="back"/>Docs</Button>}
        center={<span className="save-state" data-dirty={saveState.includes('Guardando')}>{saveState}</span>}
        right={<Button variant="ghost" size="sm" onPress={finish}>Listo</Button>}
      />
      <article className="document-shell editor-shell">
        <header className="doc-intro">
          <input className="doc-title doc-title-input" aria-label="Título" value={title} placeholder="Sin título" onChange={e => {setTitle(e.target.value); markDirty();}} onKeyDown={handleTitleKey} onPaste={singleLinePaste}/>
          <input className="doc-description doc-description-input" aria-label="Descripción" value={description} placeholder="Agrega una descripción…" onChange={e => {setDescription(e.target.value); markDirty();}} onKeyDown={handleDescriptionKey} onPaste={singleLinePaste}/>
          <div className="doc-meta">{isNew ? 'Borrador privado' : relativeMeta(doc)}</div>
        </header>

        <div className="editor-toolbar-sticky" onPointerDownCapture={rememberSelection} onTouchStartCapture={rememberSelection}>
          <Toolbar isAttached className="editor-toolbar" aria-label="Formato del documento">
            <select
              aria-label="Tipo de texto"
              className="block-select native-option-select"
              value={blockValue}
              onChange={e => {
                const value = e.target.value;
                setBlockValue(value);
                applyBlock(value);
              }}
            >
              {BLOCK_OPTIONS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <span className="toolbar-separator"/>
            <ToolbarButton label="Negrita" active={inlineState.bold} onPress={() => runFormat('bold')}><strong>B</strong></ToolbarButton>
            <ToolbarButton label="Cursiva" active={inlineState.italic} onPress={() => runFormat('italic')}><em>I</em></ToolbarButton>
            <ToolbarButton label="Lista" active={inlineState.insertUnorderedList} onPress={() => runFormat('insertUnorderedList')} className="optional-bullets"><Icon name="list"/></ToolbarButton>
            <NativeInsertMenu onAction={runFormat}/>
            <NativeMenu
              label="Más formatos"
              className="toolbar-native-menu"
              options={[
                {value:'underline',label:'Subrayado'},
                {value:'strikeThrough',label:'Tachado'},
                {value:'insertUnorderedList',label:'Lista con bullets'},
                {value:'insertOrderedList',label:'Lista numerada'},
                {value:'createLink',label:'Agregar enlace'},
              ]}
              onAction={runFormat}
            />
          </Toolbar>
        </div>

        <div
          ref={bodyRef}
          className="doc-body editable-body"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder="Empieza a escribir…"
          onInput={() => { hydrateChecklistControls(bodyRef.current); markDirty(); rememberSelection(); }}
          onKeyUp={rememberSelection}
          onPointerUp={rememberSelection}
          onPaste={() => setTimeout(() => { if (bodyRef.current) bodyRef.current.innerHTML = sanitizeRichHtml(bodyRef.current.innerHTML); markDirty(); }, 0)}
          onClick={e => {
            const control = e.target.closest?.('.check-control');
            if (!control) return;
            e.preventDefault(); e.stopPropagation();
            const li = control.closest('li'); li.classList.toggle('done');
            control.setAttribute('aria-pressed', li.classList.contains('done') ? 'true':'false');
            markDirty(); rememberSelection();
          }}
        />
      </article>
    </section>
  );
}

function ToolbarButton({label,active,onPress,children,className=''}) {
  return <Button aria-label={label} aria-pressed={active} isIconOnly size="md" variant={active ? 'secondary' : 'ghost'} onPress={onPress} className={`toolbar-button ${className}`}>{children}</Button>;
}

function NativeInsertMenu({onAction}) {
  return (
    <span className="native-menu native-insert-menu">
      <span className="native-menu-visual" aria-hidden="true"><Icon name="plus"/></span>
      <select
        aria-label="Insertar bloque"
        value=""
        onChange={e => {
          const value = e.target.value;
          if (value) onAction(value);
        }}
      >
        <option value="" disabled>Insertar</option>
        <option value="checklist">☑︎  Checklist</option>
        <option value="callout">▣  Nota</option>
        <option value="spoiler">▸  Desplegable</option>
        <option value="hr">—  Separador</option>
      </select>
    </span>
  );
}

function AppModal({modal,setModal,linkValue,setLinkValue,docsById,onDelete,onReset}) {
  const open = !!modal;
  const close = () => {
    if (modal?.type === 'link') modal.api?.cancel?.();
    setModal(null);
  };
  const isDelete = modal?.type === 'delete';
  const isReset = modal?.type === 'reset';
  const isLink = modal?.type === 'link';
  const doc = isDelete ? docsById.get(modal.docId) : null;
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={value => {if (!value) close();}} variant="opaque" isDismissable>
        <Modal.Container placement="auto" size="sm">
          <Modal.Dialog aria-label={isDelete ? 'Eliminar documento' : isReset ? 'Restaurar datos mock' : 'Agregar enlace'}>
            <Modal.Header><Modal.Heading>{isDelete ? 'Eliminar documento' : isReset ? 'Restaurar datos mock' : 'Agregar enlace'}</Modal.Heading></Modal.Header>
            <Modal.Body>
              {isDelete && <p>“{doc?.title || 'Sin título'}” se eliminará de este prototipo. Puedes restaurar todos los datos mock desde el menú de Docs.</p>}
              {isReset && <p>Se eliminarán cambios locales, documentos creados y borradores, y volverán los {SEED_COUNT} documentos mock originales.</p>}
              {isLink && (
                <TextField className="modal-field">
                  <Label>URL</Label>
                  <Input autoFocus variant="secondary" placeholder="https://…" value={linkValue} onChange={e => setLinkValue(e.target.value)} />
                </TextField>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={close}>Cancelar</Button>
              {isDelete && <Button variant="danger" onPress={() => onDelete(modal.docId)}>Eliminar</Button>}
              {isReset && <Button variant="danger" onPress={onReset}>Restaurar</Button>}
              {isLink && <Button variant="primary" isDisabled={!linkValue.trim()} onPress={() => {modal.api?.apply?.(linkValue); setModal(null);}}>Aplicar</Button>}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function singleLinePaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain').replace(/\s*\n+\s*/g, ' ');
  const input = e.currentTarget;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = input.value.slice(0,start) + text + input.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', {bubbles:true}));
  requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
}

function hydrateChecklistControls(root) {
  if (!root) return;
  root.querySelectorAll('ul.checklist > li').forEach(li => {
    if (li.querySelector(':scope > .check-control')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'check-control'; button.contentEditable = 'false';
    button.setAttribute('aria-label', li.classList.contains('done') ? 'Marcar como pendiente' : 'Marcar como completado');
    button.setAttribute('aria-pressed', li.classList.contains('done') ? 'true' : 'false');
    button.innerHTML = '<span aria-hidden="true">✓</span>';
    li.prepend(button);
  });
}

function elementForNode(node) { return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement; }
function execCommand(command, value = null) { try { return document.execCommand(command, false, value); } catch { return false; } }
function selectNodeContents(node, rangeRef) {
  const range = document.createRange(); range.selectNodeContents(node);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); rangeRef.current = range.cloneRange();
}
function unwrapElement(el) {
  const parent = el.parentNode; if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove(); parent.normalize?.();
}
const INLINE_TAGS = {bold:'strong', italic:'em', underline:'u', strikeThrough:'s'};
function manualInlineFormat(body, rangeRef, command) {
  const sel = window.getSelection(); if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0); const tag = INLINE_TAGS[command]; if (!tag || range.collapsed) return false;
  const startEl = elementForNode(range.startContainer); const endEl = elementForNode(range.endContainer);
  const existing = startEl?.closest?.(tag);
  if (existing && body.contains(existing) && existing.contains(endEl)) { unwrapElement(existing); return true; }
  const wrapper = document.createElement(tag);
  try { wrapper.appendChild(range.extractContents()); range.insertNode(wrapper); selectNodeContents(wrapper, rangeRef); return true; } catch { return false; }
}
function topLevelBlocksForRange(body, range) {
  if (!body || !range) return [];
  return [...body.children].filter(el => { try { return range.intersectsNode(el); } catch { return false; } }).filter(el => /^(P|H2|H3|BLOCKQUOTE|PRE)$/.test(el.tagName));
}
function replaceTag(el, tagName) {
  if (!el || el.tagName.toLowerCase() === tagName) return el;
  const replacement = document.createElement(tagName);
  while (el.firstChild) replacement.appendChild(el.firstChild);
  el.replaceWith(replacement); return replacement;
}
function applyBlockFormat(body, rangeRef, tagName) {
  if (!body) return false;
  const sel = window.getSelection(); if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  let blocks = topLevelBlocksForRange(body, range);
  if (!blocks.length) {
    let el = elementForNode(range.startContainer); while (el && el.parentElement !== body) el = el.parentElement;
    if (el && /^(P|H2|H3|BLOCKQUOTE|PRE)$/.test(el.tagName)) blocks=[el];
  }
  if (!blocks.length) return execCommand('formatBlock', tagName);
  const replacements = blocks.map(el => replaceTag(el, tagName));
  const rr=document.createRange(); rr.selectNodeContents(replacements[0]); rr.collapse(false); sel.removeAllRanges(); sel.addRange(rr); rangeRef.current=rr.cloneRange(); return true;
}
function manualList(body, rangeRef, ordered) {
  const sel = window.getSelection(); if (!sel?.rangeCount || !body) return false;
  const range = sel.getRangeAt(0); const wantedTag = ordered ? 'OL' : 'UL';
  let anchor = elementForNode(range.startContainer); const currentLi=anchor?.closest?.('li'); const currentList=currentLi?.parentElement;
  if (currentList && body.contains(currentList) && /^(UL|OL)$/.test(currentList.tagName)) {
    if (currentList.tagName === wantedTag) {
      const items=[...currentList.children].filter(li=>li.tagName==='LI'); const idx=Math.max(0,items.indexOf(currentLi));
      const ps=items.map(li=>{const p=document.createElement('p'); p.innerHTML=li.innerHTML || '<br>'; p.querySelector('.check-control')?.remove(); return p;});
      currentList.before(...ps); currentList.remove(); const target=ps[Math.min(idx,ps.length-1)] || ps[0];
      if (target) {const rr=document.createRange(); rr.selectNodeContents(target); rr.collapse(false); sel.removeAllRanges(); sel.addRange(rr); rangeRef.current=rr.cloneRange();}
      return true;
    }
    const replacement=document.createElement(wantedTag.toLowerCase()); while(currentList.firstChild) replacement.appendChild(currentList.firstChild); currentList.replaceWith(replacement); return true;
  }
  const blocks=topLevelBlocksForRange(body,range).filter(el=>el.tagName!=='PRE'); if(!blocks.length) return false;
  const list=document.createElement(wantedTag.toLowerCase()); blocks[0].before(list); blocks.forEach(block=>{const li=document.createElement('li'); li.innerHTML=block.innerHTML || '<br>'; list.appendChild(li); block.remove();});
  const rr=document.createRange(); rr.selectNodeContents(list.lastElementChild || list); rr.collapse(false); sel.removeAllRanges(); sel.addRange(rr); rangeRef.current=rr.cloneRange(); return true;
}
function insertTopLevelBlock(body, html, rangeRef) {
  const sel=window.getSelection(); const range=sel?.rangeCount ? sel.getRangeAt(0) : rangeRef.current;
  let anchor=range?.startContainer || sel?.anchorNode; if(anchor?.nodeType===Node.TEXT_NODE) anchor=anchor.parentElement;
  let top=anchor instanceof Element ? anchor : null; while(top && top.parentElement && top.parentElement!==body) top=top.parentElement;
  const template=document.createElement('template'); template.innerHTML=html.trim(); const nodes=[...template.content.childNodes]; const caretBlock=document.createElement('p'); caretBlock.innerHTML='<br>';
  if(range?.collapsed && top && /^(P|H2|H3|BLOCKQUOTE|PRE)$/.test(top.tagName)) {
    try {const tailRange=document.createRange(); tailRange.selectNodeContents(top); tailRange.setStart(range.startContainer,range.startOffset); const tail=tailRange.extractContents(); const after=top.cloneNode(false); after.appendChild(tail); if(!after.textContent && !after.querySelector('*')) after.innerHTML='<br>'; top.after(...nodes,after); placeCaret(after,rangeRef,true); return; } catch {}
  }
  if(top?.parentElement===body) top.after(...nodes,caretBlock); else body.append(...nodes,caretBlock); placeCaret(caretBlock,rangeRef,true);
}
function placeCaret(el, rangeRef, atStart=true) { const r=document.createRange(); r.selectNodeContents(el); r.collapse(atStart); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); rangeRef.current=r.cloneRange(); }
function updateToolbarState(body,setInline,setBlock) {
  const next={}; ['bold','italic','underline','strikeThrough'].forEach(cmd=>{try{next[cmd]=document.queryCommandState(cmd);}catch{next[cmd]=false;}});
  const sel=window.getSelection(); const el=sel?.rangeCount ? elementForNode(sel.getRangeAt(0).startContainer) : null; const list=el?.closest?.('ul,ol');
  next.insertUnorderedList=!!list && body?.contains(list) && list.tagName==='UL'; next.insertOrderedList=!!list && body?.contains(list) && list.tagName==='OL'; setInline(next);
  let block=el; while(block && block.parentElement!==body) block=block.parentElement; const tag=block?.tagName?.toLowerCase(); if(['p','h2','h3','blockquote','pre'].includes(tag)) setBlock(tag);
}
function createLinkBookmark(range) {
  if(!range) return null;
  try {
    if(range.collapsed){const marker=document.createComment('bardo-link-caret'); const point=range.cloneRange(); point.collapse(true); point.insertNode(marker); return {collapsed:true,marker};}
    const endMarker=document.createComment('bardo-link-end'); const startMarker=document.createComment('bardo-link-start'); const end=range.cloneRange(); end.collapse(false); end.insertNode(endMarker); const start=range.cloneRange(); start.collapse(true); start.insertNode(startMarker); return {collapsed:false,startMarker,endMarker};
  } catch { return null; }
}
function cleanupLinkBookmark(bookmark){bookmark?.marker?.remove?.(); bookmark?.startMarker?.remove?.(); bookmark?.endMarker?.remove?.();}
function applyLinkBookmark(bookmark, href) {
  if(!bookmark || !href) return false;
  try {
    const a=document.createElement('a'); a.href=href; a.target='_blank'; a.rel='noreferrer';
    if(bookmark.collapsed){a.textContent=href; bookmark.marker.before(a); bookmark.marker.remove();}
    else {const range=document.createRange(); range.setStartAfter(bookmark.startMarker); range.setEndBefore(bookmark.endMarker); const contents=range.extractContents(); a.appendChild(contents); range.insertNode(a); bookmark.startMarker.remove(); bookmark.endMarker.remove();}
    const sel=window.getSelection(); const caret=document.createRange(); caret.setStartAfter(a); caret.collapse(true); sel.removeAllRanges(); sel.addRange(caret); return true;
  } catch { cleanupLinkBookmark(bookmark); return false; }
}

export default App;

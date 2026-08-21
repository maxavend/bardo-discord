import { createAppShell, createBacklinkList, createResourceCard } from './ui/patterns.js';

const auth = globalThis.__bardoActivityAuth;
const params = new URLSearchParams(location.search);
let currentContext = null;

async function getContext() {
  if (currentContext) return currentContext;
  await auth?.ready;
  const instanceId = auth?.state?.instanceId || params.get('instance_id');
  if (!instanceId) return null;
  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, { cache: 'no-store' });
  if (!response.ok) return null;
  currentContext = await response.json();
  return currentContext;
}

async function navigateTo(type, id = null) {
  const response = await fetch('/api/navigation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id }) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  location.assign(payload.route);
}
globalThis.__bardoNavigate = navigateTo;

function clearLegacyViews() {
  for (const selector of ['body > .shell', '.kanban-shell', '.event-app']) {
    document.querySelectorAll(selector).forEach((node) => { node.hidden = true; });
  }
}

function section(title, id) {
  const root = document.createElement('section'); root.className = 'bardo-home-section'; root.id = id;
  const head = document.createElement('div'); head.className = 'bardo-home-section-head';
  const heading = document.createElement('h2'); heading.textContent = title;
  const status = document.createElement('span'); status.className = 'bardo-home-section-status'; status.textContent = 'Cargando…'; status.setAttribute('role', 'status');
  const list = document.createElement('div'); list.className = 'bardo-home-list';
  head.append(heading, status); root.append(head, list); return { root, list, status };
}

function resourceButton({ title, meta, type, id }) {
  const card = createResourceCard({ title, meta });
  const button = document.createElement('button'); button.type = 'button'; button.className = 'bardo-resource-button';
  while (card.firstChild) button.appendChild(card.firstChild);
  button.addEventListener('click', () => { void navigateTo(type, id).catch(() => { button.dataset.error = 'true'; }); });
  return button;
}

async function loadHomeSection(endpoint, view, mapItem) {
  try {
    const response = await fetch(`/api/home/${endpoint}?limit=5`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    view.list.replaceChildren();
    const items = data.items || [];
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'bardo-home-empty'; empty.textContent = 'Nada por aquí todavía.'; view.list.appendChild(empty);
    } else items.forEach((item) => view.list.appendChild(mapItem(item)));
    view.status.textContent = items.length >= 5 ? '5 recientes · Ver todo desde el módulo' : `${items.length} ${items.length === 1 ? 'recurso' : 'recursos'}`;
  } catch {
    view.status.textContent = 'No se pudo cargar'; view.status.dataset.error = 'true';
  }
}

async function installHome() {
  const context = await getContext();
  const isHome = params.get('home') === '1'
    || String(context?.documentId || '').startsWith('bardo:home:')
    || document.documentElement.dataset.bardoBootMode === 'home';
  if (!isHome) return false;
  document.documentElement.dataset.bardoMode = 'home';
  document.title = 'Bardo · Inicio';
  clearLegacyViews();
  document.querySelector('#bardo-home')?.remove();
  const shell = createAppShell({ title: 'Bardo', subtitle: 'Tu trabajo, conectado' });
  shell.root.id = 'bardo-home'; shell.root.classList.add('bardo-home'); shell.header.classList.add('bardo-home-topbar');
  const intro = document.createElement('section'); intro.className = 'bardo-home-hero';
  intro.innerHTML = '<div><p class="bardo-eyebrow">Inicio</p><h1>Lo importante, sin ruido</h1><p>Eventos próximos, tareas activas y documentos recientes del servidor.</p></div>';
  const quick = document.createElement('div'); quick.className = 'bardo-home-quick'; quick.setAttribute('aria-label', 'Acciones rápidas');
  [['Documentos','documents'],['Tableros','boards'],['Agenda','agenda']].forEach(([label, anchor]) => { const b=document.createElement('button'); b.type='button'; b.className='bardo-button bardo-button-secondary'; b.textContent=label; b.addEventListener('click',()=>document.querySelector(`#home-${anchor}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})); quick.appendChild(b); });
  intro.appendChild(quick); shell.content.appendChild(intro);
  const events = section('Próximos eventos', 'home-agenda');
  const tasks = section('Mis tareas activas', 'home-tasks');
  const docs = section('Documentos recientes', 'home-documents');
  const boards = section('Tableros', 'home-boards');
  shell.content.append(events.root, tasks.root, docs.root, boards.root);
  document.body.appendChild(shell.root);
  void loadHomeSection('events', events, (item) => resourceButton({ title:item.title, meta:[item.event_date,item.start_time].filter(Boolean).join(' · '), type:'event', id:item.id }));
  void loadHomeSection('tasks', tasks, (item) => resourceButton({ title:item.title, meta:[item.board_name,item.due_at?`vence ${item.due_at}`:null].filter(Boolean).join(' · '), type:'task', id:item.id }));
  void loadHomeSection('documents', docs, (item) => resourceButton({ title:item.title, meta:'Documento', type:'document', id:item.id }));
  void loadHomeSection('boards', boards, (item) => resourceButton({ title:item.name, meta:item.description || 'Tablero', type:'board', id:item.id }));
  return true;
}

function selectedDocumentText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  const body = document.querySelector('#document-body');
  if (!body || !body.contains(range.commonAncestorContainer)) return '';
  return selection.toString().replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function searchMember(query, results, state) {
  if (query.trim().length < 2) { results.hidden = true; return; }
  const response = await fetch(`/api/member-directory?query=${encodeURIComponent(query.trim())}`);
  if (!response.ok) return;
  const data = await response.json(); results.replaceChildren();
  for (const member of data.members || []) {
    const option = document.createElement('button'); option.type='button'; option.className='bardo-picker-option'; option.textContent=member.displayName; option.addEventListener('click',()=>{ state.id=member.userId; state.name=member.displayName; results.hidden=true; }); results.appendChild(option);
  }
  results.hidden = !results.childElementCount;
}

async function openDocumentTaskModal(documentId) {
  const boardsRes = await fetch('/api/home/boards?limit=12');
  const boards = boardsRes.ok ? (await boardsRes.json()).items || [] : [];
  if (!boards.length) throw new Error('Crea un tablero antes de convertir contenido en tarea.');
  const selection = selectedDocumentText();
  const backdrop = document.createElement('div'); backdrop.className='bardo-product-modal-backdrop';
  const modal = document.createElement('section'); modal.className='bardo-product-modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
  const heading = document.createElement('h2'); heading.textContent='Crear tarea desde documento';
  const title = document.createElement('input'); title.className='bardo-input'; title.value=(selection.split(/[.!?\n]/)[0] || document.querySelector('#document-title')?.textContent || 'Nueva tarea').slice(0,120); title.setAttribute('aria-label','Título');
  const board = document.createElement('select'); board.className='bardo-input'; board.setAttribute('aria-label','Tablero'); boards.forEach((item)=>{ const o=document.createElement('option');o.value=item.id;o.textContent=item.name;board.appendChild(o); });
  const assignee = document.createElement('input'); assignee.className='bardo-input'; assignee.placeholder='Buscar responsable…'; assignee.setAttribute('aria-label','Responsable');
  const memberResults = document.createElement('div'); memberResults.className='bardo-entity-picker-list'; memberResults.hidden=true; const member={id:null,name:null}; let memberTimer;
  assignee.addEventListener('input',()=>{ member.id=null; member.name=null; clearTimeout(memberTimer); memberTimer=setTimeout(()=>{ void searchMember(assignee.value,memberResults,member); },180); });
  memberResults.addEventListener('click',(event)=>{ if(event.target instanceof HTMLButtonElement) assignee.value=event.target.textContent || ''; });
  const due = document.createElement('input'); due.type='date'; due.className='bardo-input'; due.setAttribute('aria-label','Fecha límite');
  const context = document.createElement('textarea'); context.className='bardo-input'; context.rows=3; context.value=selection; context.placeholder='Contexto breve (opcional)'; context.setAttribute('aria-label','Contexto del documento');
  const fields = [['Título',title],['Tablero',board],['Responsable',assignee],['Fecha límite',due],['Contexto',context]].map(([label,control])=>{const wrap=document.createElement('label');wrap.className='bardo-field';const span=document.createElement('span');span.className='bardo-field-label';span.textContent=label;wrap.append(span,control);if(control===assignee)wrap.appendChild(memberResults);return wrap;});
  const actions=document.createElement('div');actions.className='bardo-product-modal-actions'; const cancel=document.createElement('button');cancel.type='button';cancel.className='bardo-button bardo-button-secondary';cancel.textContent='Cancelar'; const save=document.createElement('button');save.type='button';save.className='bardo-button bardo-button-primary';save.textContent='Crear tarea'; actions.append(cancel,save);
  modal.append(heading,...fields,actions); backdrop.appendChild(modal); document.body.appendChild(backdrop); title.focus();
  cancel.addEventListener('click',()=>backdrop.remove());
  save.addEventListener('click',async()=>{ save.disabled=true; save.textContent='Creando…'; const response=await fetch(`/api/documents/${encodeURIComponent(documentId)}/tasks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({boardId:board.value,title:title.value,assigneeId:member.id,assigneeName:member.name,dueAt:due.value||null,excerpt:context.value})}); const data=await response.json().catch(()=>({})); if(!response.ok){save.disabled=false;save.textContent='Reintentar';return;} backdrop.remove(); showTaskToast(documentId,data.task,data.board); await renderDocumentBacklinks(documentId); });
}

function showTaskToast(documentId, task, board) {
  const toast=document.createElement('div');toast.className='bardo-product-toast';toast.setAttribute('role','status'); const text=document.createElement('span');text.textContent=`Tarea creada en ${board?.name || 'el tablero'}.`; const view=document.createElement('button');view.type='button';view.textContent='Ver tarea';view.addEventListener('click',()=>{ void navigateTo('task',task.id); }); const undo=document.createElement('button');undo.type='button';undo.textContent='Deshacer';undo.addEventListener('click',async()=>{const r=await fetch(`/api/documents/${encodeURIComponent(documentId)}/tasks/${encodeURIComponent(task.id)}`,{method:'DELETE'});if(r.ok){toast.remove();void renderDocumentBacklinks(documentId); }else{undo.disabled=true;undo.textContent='Ya no es seguro deshacer';}}); toast.append(text,view,undo);document.body.appendChild(toast);setTimeout(()=>toast.remove(),9000);
}

async function renderDocumentBacklinks(documentId) {
  const article=document.querySelector('#document'); if(!article)return;
  let section=article.querySelector('.bardo-related-resources'); if(!section){section=document.createElement('section');section.className='bardo-related-resources';const h=document.createElement('h2');h.textContent='Relacionado';section.appendChild(h);article.appendChild(section);} const response=await fetch(`/api/entity-links?type=document&id=${encodeURIComponent(documentId)}`);if(!response.ok)return;const links=(await response.json()).links||[]; const resources=links.map((link)=>{const other=link.source_type==='document'?{type:link.target_type,id:link.target_id}:{type:link.source_type,id:link.source_id};return {title:other.type==='task'?'Tarea vinculada':other.type==='event'?'Evento vinculado':'Recurso vinculado',meta:link.relation_type,href:null,...other};}); const list=createBacklinkList(resources); list.querySelectorAll('.bardo-resource-card').forEach((card,index)=>{card.tabIndex=0;card.setAttribute('role','button');card.addEventListener('click',()=>{ void navigateTo(resources[index].type,resources[index].id); });card.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void navigateTo(resources[index].type,resources[index].id);}});}); section.querySelector('ul')?.remove(); section.appendChild(list);
}

async function installDocumentTaskFlow() {
  const context=await getContext(); const documentId=String(context?.documentId||'');
  if (!documentId || documentId.startsWith('bardo:')) return;
  const actions=document.querySelector('.document-actions'); if(!actions || actions.querySelector('[data-bardo-create-task]'))return;
  const button=document.createElement('button');button.type='button';button.className='action-button action-button-secondary';button.dataset.bardoCreateTask='true';button.textContent='Crear tarea';button.addEventListener('click',()=>{ void openDocumentTaskModal(documentId).catch((error)=>{const status=document.querySelector('#action-status');if(status)status.textContent=error.message;}); });actions.appendChild(button);void renderDocumentBacklinks(documentId);
}

function installNavigationCapture() {
  document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest('[data-bardo-nav]'):null;if(!target)return;const key=target.dataset.bardoNav;if(!key)return;if(key==='home'){event.preventDefault();void navigateTo('home').catch(()=>{});} },true);
}

installNavigationCapture();
void getContext().then(async()=>{ if(!await installHome()) await installDocumentTaskFlow(); }).catch(()=>{});

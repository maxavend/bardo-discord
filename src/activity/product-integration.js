import { createBacklinkList } from './ui/patterns.js';

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

async function installHome() {
  const context = await getContext();
  const isHome = params.get('home') === '1' || String(context?.documentId || '').startsWith('bardo:home:');
  if (!isHome) return false;
  document.documentElement.dataset.bardoMode = 'home';
  document.title = 'Bardo · Inicio';
  clearLegacyViews();
  return Boolean(document.querySelector('#bardo-react-surface'));
}

async function renderDocumentBacklinks(documentId) {
  const article=document.querySelector('#document'); if(!article)return;
  let section=article.querySelector('.bardo-related-resources'); if(!section){section=document.createElement('section');section.className='bardo-related-resources';const h=document.createElement('h2');h.textContent='Relacionado';section.appendChild(h);article.appendChild(section);} const response=await fetch(`/api/entity-links?type=document&id=${encodeURIComponent(documentId)}`);if(!response.ok)return;const links=(await response.json()).links||[]; const resources=links.map((link)=>{const other=link.source_type==='document'?{type:link.target_type,id:link.target_id}:{type:link.source_type,id:link.source_id};return {title:other.type==='task'?'Tarea vinculada':other.type==='event'?'Evento vinculado':'Recurso vinculado',meta:link.relation_type,href:null,...other};}); const list=createBacklinkList(resources); list.querySelectorAll('.bardo-resource-card').forEach((card,index)=>{card.tabIndex=0;card.setAttribute('role','button');card.addEventListener('click',()=>{ void navigateTo(resources[index].type,resources[index].id); });card.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void navigateTo(resources[index].type,resources[index].id);}});}); section.querySelector('ul')?.remove(); section.appendChild(list);
}

async function installDocumentTaskFlow() {
  const context=await getContext(); const documentId=String(context?.documentId||'');
  if (!documentId || documentId.startsWith('bardo:')) return;
  const actions=document.querySelector('.document-actions');
  if (!actions) return;
  void renderDocumentBacklinks(documentId);
  document.addEventListener('bardo:document-task-changed',()=>{ void renderDocumentBacklinks(documentId); });
}

function installNavigationCapture() {
  document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest('[data-bardo-nav]'):null;if(!target)return;const key=target.dataset.bardoNav;if(!key)return;if(key==='home'){event.preventDefault();void navigateTo('home').catch(()=>{});} },true);
}

installNavigationCapture();
void getContext().then(async()=>{ if(!await installHome()) await installDocumentTaskFlow(); }).catch(()=>{});

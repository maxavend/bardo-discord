import { announce, enhanceDialog, restoreDialogFocus } from './primitives.js';

document.documentElement.dataset.bardoUi = '3';

const MODE_TO_NAV = { board: 'boards', event: 'agenda', document: 'documents' };
const NAV_ITEMS = [['home','Inicio'],['documents','Documentos'],['boards','Tableros'],['agenda','Agenda']];
const dirtyDialogs = new WeakSet();

function currentMode() { return MODE_TO_NAV[document.documentElement.dataset.bardoMode] || 'documents'; }
function hrefFor(key) {
  const url = new URL(location.href);
  const params = url.searchParams;
  const keyMap = { documents:'document', boards:'board', agenda:'event' };
  if (key === 'home') return null;
  const parameter = keyMap[key];
  if (!parameter || !params.get(parameter)) return key === currentMode() ? location.href : null;
  ['document','board','event','custom_id'].forEach((name)=>{ if(name!==parameter) params.delete(name); });
  return url.toString();
}
function buildNav() {
  const nav=document.createElement('nav'); nav.className='bardo-context-nav'; nav.setAttribute('aria-label','Navegación de Bardo');
  for(const [key,label] of NAV_ITEMS){ const href=hrefFor(key); const item=href?document.createElement('a'):document.createElement('button'); item.textContent=label; item.dataset.bardoNav=key;
    if(href)item.href=href; else { item.type='button'; item.setAttribute('aria-disabled','true'); item.title=key==='home'?'Inicio estará disponible con Bardo Home':`Abre un ${label.toLowerCase()} desde Discord para conservar el contexto`; }
    if(key===currentMode())item.setAttribute('aria-current','page'); nav.appendChild(item); }
  return nav;
}
function installNavigation(){ const mode=document.documentElement.dataset.bardoMode; const host=mode==='board'?document.querySelector('.kanban-topbar'):mode==='event'?document.querySelector('.ev-top'):document.querySelector('.topbar'); if(!host||host.querySelector('.bardo-context-nav'))return; host.appendChild(buildNav()); }

function dialogFor(target){ return target instanceof Element ? target.closest('.kanban-modal,.ev-modal,[role="dialog"]') : null; }
function markDirty(event){ const dialog=dialogFor(event.target); if(!dialog) return; dirtyDialogs.add(dialog); dialog.dataset.bardoDirty='true'; }
function wantsDiscard(target){ return target instanceof Element && Boolean(target.closest('[data-modal-cancel],#btn-modal-cancel,#btn-modal-close,#btn-board-modal-cancel,#btn-board-modal-close,#btn-col-modal-cancel,#btn-col-modal-close,.modal-close-btn')); }
function warnDirty(dialog, button){
  announce('Hay cambios sin guardar. Pulsa de nuevo para descartarlos.', 'assertive');
  if(button instanceof HTMLElement){ const original=button.dataset.bardoOriginalLabel || button.textContent || ''; button.dataset.bardoOriginalLabel=original; button.dataset.bardoDiscardArmed='true'; button.textContent='Descartar cambios'; window.setTimeout(()=>{ if(button.isConnected&&button.dataset.bardoDiscardArmed==='true'){ button.textContent=original; delete button.dataset.bardoDiscardArmed; } },3500); }
}

document.addEventListener('input', markDirty, true);
document.addEventListener('change', markDirty, true);
document.addEventListener('click',(event)=>{
  const backdrop=event.target instanceof Element ? event.target.closest('.kanban-modal-backdrop,.ev-modal-bg') : null;
  const dialog=dialogFor(event.target) || backdrop?.querySelector('.kanban-modal,.ev-modal,[role="dialog"]');
  if(!dialog||!dirtyDialogs.has(dialog)) return;
  const button=event.target instanceof Element ? event.target.closest('button') : null;
  const backdropClick=backdrop && event.target===backdrop;
  if(backdropClick || wantsDiscard(event.target)){
    if(button?.dataset.bardoDiscardArmed==='true'){ dirtyDialogs.delete(dialog); delete dialog.dataset.bardoDirty; return; }
    event.preventDefault(); event.stopImmediatePropagation(); warnDirty(dialog,button);
  }
},true);
document.addEventListener('keydown',(event)=>{
  if(event.key!=='Escape')return; const dialogs=[...document.querySelectorAll('.kanban-modal,.ev-modal,[role="dialog"]')].filter((node)=>node.getClientRects().length); const dialog=dialogs.at(-1); if(dialog&&dirtyDialogs.has(dialog)){ event.preventDefault(); event.stopImmediatePropagation(); warnDirty(dialog,null); }
},true);

function enhanceNode(node){
  if(!(node instanceof HTMLElement))return;
  if(node.matches('.kanban-modal,.ev-modal,[role="dialog"]')) enhanceDialog(node);
  node.querySelectorAll?.('.kanban-modal,.ev-modal,[role="dialog"]').forEach(enhanceDialog);
  node.querySelectorAll?.('.kanban-toast,.ev-toast,.action-status,.action-status-container').forEach((el)=>{ el.setAttribute('role',/error|no se pudo/i.test(el.textContent||'')?'alert':'status'); el.setAttribute('aria-live',/error|no se pudo/i.test(el.textContent||'')?'assertive':'polite'); });
  node.querySelectorAll?.('.view-state,.kanban-state').forEach((state)=>{ if(/no pudimos|error/i.test(state.textContent||'')) state.dataset.bardoError='true'; });
}
const removedDialogs=new Set();
const observer=new MutationObserver((records)=>{ for(const record of records){ record.addedNodes.forEach(enhanceNode); record.removedNodes.forEach((node)=>{ if(!(node instanceof HTMLElement))return; if(node.matches('.kanban-modal,.ev-modal,[role="dialog"]'))removedDialogs.add(node); node.querySelectorAll?.('.kanban-modal,.ev-modal,[role="dialog"]').forEach((d)=>removedDialogs.add(d)); }); } for(const dialog of removedDialogs){ restoreDialogFocus(dialog); removedDialogs.delete(dialog); } installNavigation(); });
function start(){ enhanceNode(document.body); observer.observe(document.body,{childList:true,subtree:true,characterData:true}); installNavigation(); new MutationObserver(installNavigation).observe(document.documentElement,{attributes:true,attributeFilter:['data-bardo-mode']}); window.addEventListener('bardo:save-error',()=>announce('No se pudo guardar. Reintenta.','assertive')); }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

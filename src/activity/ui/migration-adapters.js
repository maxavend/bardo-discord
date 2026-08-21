function visible(node){ return node instanceof HTMLElement && node.getClientRects().length>0; }
function migrate(root=document){
  root.querySelectorAll?.('.action-button,.btn-primary,.btn-secondary,.btn-icon,.ev-btn,.tb-btn').forEach((el)=>el.classList.add('bardo-button'));
  root.querySelectorAll?.('.form-input,.form-textarea,.form-select,.ev-input,.ev-textarea,.ev-select,.action-select').forEach((el)=>el.classList.add('bardo-input'));
  root.querySelectorAll?.('.task-card').forEach((card)=>{ card.setAttribute('aria-keyshortcuts','Enter Space'); if(!card.getAttribute('title'))card.title='Enter para editar; cambia la columna desde el formulario para mover con teclado.'; });
  root.querySelectorAll?.('.ev-tabs').forEach((tabs)=>tabs.setAttribute('role','tablist'));
  root.querySelectorAll?.('.ev-tab').forEach((tab)=>{ tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',tab.classList.contains('active')?'true':'false'); });
  root.querySelectorAll?.('.ev-members').forEach((list)=>{
    if(list.dataset.bardoCapped==='true')return; list.dataset.bardoCapped='true'; const rows=[...list.querySelectorAll('.ev-member')];
    if(rows.length>50){ rows.slice(50).forEach((row)=>row.hidden=true); const note=document.createElement('p'); note.className='bardo-member-cap-note'; note.textContent=`Mostrando 50 de ${rows.length}. Usa búsqueda de miembros en los flujos de asignación para equipos grandes.`; list.before(note); }
  });
  root.querySelectorAll?.('.action-status').forEach((status)=>{ const text=(status.textContent||'').toLowerCase(); status.classList.add('bardo-save-status'); status.dataset.state=text.includes('guardando')?'saving':text.includes('guardado')?'saved':text.includes('error')||text.includes('no se pudo')?'error':text.includes('cambios')?'dirty':''; });
}
const observer=new MutationObserver((records)=>{ for(const record of records)record.addedNodes.forEach((node)=>{ if(node instanceof HTMLElement)migrate(node); }); migrate(document); });
function start(){ migrate(document); observer.observe(document.body,{childList:true,subtree:true}); document.addEventListener('click',(event)=>{ const tab=event.target instanceof Element?event.target.closest('.ev-tab'):null; if(!tab)return; queueMicrotask(()=>migrate(document)); },true); }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

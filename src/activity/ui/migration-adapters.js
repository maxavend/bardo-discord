const MEMBER_LIMIT = 50;

function enhancePlannerMemberList(list) {
  if (list.dataset.bardoMemberSearch === 'true') return;
  list.dataset.bardoMemberSearch = 'true';
  const rows = [...list.querySelectorAll('.ev-member')];
  if (rows.length <= 8) return;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'bardo-input bardo-member-list-search';
  search.placeholder = 'Buscar participantes…';
  search.setAttribute('aria-label', 'Buscar participantes');
  list.before(search);

  const note = document.createElement('p');
  note.className = 'bardo-member-cap-note';
  search.after(note);

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    let visibleCount = 0;
    let matched = 0;
    for (const row of rows) {
      const checked = Boolean(row.querySelector('input[type="checkbox"]:checked');
      const match = !query || (row.textContent || '').toLowerCase().includes(query) || checked;
      if (match) matched += 1;
      const show = match && visibleCount < MEMBER_LIMIT;
      row.hidden = !show;
      if (show) visibleCount += 1;
    }
    note.textContent = matched > MEMBER_LIMIT
      ? `Mostrando ${MEMBER_LIMIT} de ${matched} coincidencias. Escribe más para afinar.`
      : `${matched} ${matched === 1 ? 'miembro' : 'miembros'}`;
  };
  search.addEventListener('input', apply);
  list.addEventListener('change', apply);
  apply();
}

function enhancePlannerAssignee(select) {
  if (select.dataset.bardoRemoteAssignee === 'true') return;
  select.dataset.bardoRemoteAssignee = 'true';
  select.hidden = true;

  const wrap = document.createElement('div');
  wrap.className = 'bardo-planner-assignee-picker';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'bardo-input';
  input.placeholder = 'Buscar miembro de Discord…';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'bardo-entity-picker-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  list.id = `planner-assignee-${crypto.randomUUID()}`;
  input.setAttribute('aria-controls', list.id);
  wrap.append(input, list);
  select.after(wrap);

  let controller = null;
  let timer = null;
  let results = [];
  let active = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = (member) => {
    let option = [...select.options].find((candidate) => candidate.value === member.userId);
    if (!option) { option = document.createElement('option'); option.value = member.userId; option.textContent = member.displayName; select.appendChild(option); }
    select.value = member.userId;
    input.value = member.displayName;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  };
  const setActive = (index) => {
    if (!results.length) return;
    active = (index + results.length) % results.length;
    [...list.querySelectorAll('[role="option"]')].forEach((node, i) => node.setAttribute('aria-selected', i === active ? 'true' : 'false'));
    const node = list.querySelector(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
    if (node) input.setAttribute('aria-activedescendant', node.id);
  };
  const render = (members) => {
    results = members;
    active = members.length ? 0 : -1;
    list.replaceChildren();
    if (!members.length) { const state=document.createElement('div'); state.className='member-picker-state'; state.textContent='Sin resultados'; state.role='status'; list.appendChild(state); }
    members.forEach((member, index) => {
      const button=document.createElement('button'); button.type='button'; button.role='option'; button.id=`${list.id}-option-${index}`; button.dataset.index=String(index); button.setAttribute('aria-selected', index===0?'true':'false'); button.className='member-menu-item'; button.textContent=member.username ? `${member.displayName} · @${member.username}` : member.displayName;
      button.addEventListener('mousedown',(event)=>{ event.preventDefault(); choose(member); });
      list.appendChild(button);
    });
    list.hidden=false; input.setAttribute('aria-expanded','true'); if(active>=0)input.setAttribute('aria-activedescendant',`${list.id}-option-0`);
  };
  const search = () => {
    const query=input.value.trim().replace(/^@/,'');
    if (timer) clearTimeout(timer);
    controller?.abort();
    if (query.length < 2) { close(); return; }
    timer=setTimeout(async()=>{
      controller=new AbortController();
      list.hidden=false; list.textContent='Buscando…'; input.setAttribute('aria-expanded','true');
      try {
        const response=await fetch(`/api/member-directory?query=${encodeURIComponent(query)}&limit=25`,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload=await response.json();
        if(!controller.signal.aborted) render(Array.isArray(payload.members)?payload.members:[]);
      } catch(error) {
        if(controller?.signal.aborted)return;
        list.textContent='No pudimos buscar miembros. Reintenta.'; list.hidden=false; input.setAttribute('aria-expanded','true');
      }
    },200);
  };
  input.addEventListener('input', search);
  input.addEventListener('keydown',(event)=>{ if(event.key==='ArrowDown'&&results.length){event.preventDefault();setActive(active+1);} else if(event.key==='ArrowUp'&&results.length){event.preventDefault();setActive(active-1);} else if(event.key==='Enter'&&active>=0){event.preventDefault();choose(results[active]);} else if(event.key==='Escape'||event.key==='Tab')close(); });
}

function enhanceKanbanScroll(container) {
  if (container.dataset.bardoAutoScroll === 'true') return;
  container.dataset.bardoAutoScroll = 'true';
  container.addEventListener('dragover', (event) => {
    const rect = container.getBoundingClientRect();
    const edge = Math.min(72, rect.width * 0.14);
    const distanceLeft = event.clientX - rect.left;
    const distanceRight = rect.right - event.clientX;
    if (distanceLeft < edge) container.scrollBy({ left: -Math.max(12, Math.round((edge - distanceLeft) / 2)), behavior: 'auto' });
    else if (distanceRight < edge) container.scrollBy({ left: Math.max(12, Math.round((edge - distanceRight) / 2)), behavior: 'auto' });
  });
}

function enhanceCycleControl(button) {
  if (button.dataset.bardoStateLabel === 'true') return;
  button.dataset.bardoStateLabel = 'true';
  const item = button.closest('.ev-item');
  const title = item?.querySelector('.ev-item-title')?.textContent?.trim() || 'punto de agenda';
  const state = button.classList.contains('done') ? 'hecho' : button.classList.contains('active') ? 'en curso' : 'pendiente';
  button.setAttribute('aria-label', `${title}: ${state}. Cambiar estado`);
}

function migrate(root=document) {
  root.querySelectorAll?.('.action-button,.btn-primary,.btn-secondary,.btn-icon,.ev-btn,.tb-btn').forEach((el)=>el.classList.add('bardo-button'));
  root.querySelectorAll?.('.form-input,.form-textarea,.form-select,.ev-input,.ev-textarea,.ev-select,.action-select').forEach((el)=>el.classList.add('bardo-input'));
  root.querySelectorAll?.('.task-card').forEach((card)=>{ card.setAttribute('aria-keyshortcuts','Enter Space'); if(!card.getAttribute('title'))card.title='Enter para editar; cambia la columna desde el formulario para mover con teclado.'; });
  root.querySelectorAll?.('.kanban-scroll-container').forEach(enhanceKanbanScroll);
  root.querySelectorAll?.('.ev-tabs').forEach((tabs)=>tabs.setAttribute('role','tablist'));
  root.querySelectorAll?.('.ev-tab').forEach((tab)=>{ tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',tab.classList.contains('active')?'true':'false'); });
  root.querySelectorAll?.('.ev-check').forEach(enhanceCycleControl);
  root.querySelectorAll?.('.ev-members').forEach(enhancePlannerMemberList);
  root.querySelectorAll?.('.ev-modal select[name="assignee"]').forEach(enhancePlannerAssignee);
  root.querySelectorAll?.('.action-status').forEach((status)=>{ const text=(status.textContent||'').toLowerCase(); status.classList.add('bardo-save-status'); status.dataset.state=text.includes('guardando')?'saving':text.includes('guardado')?'saved':text.includes('error')||text.includes('no se pudo')?'error':text.includes('cambios')?'dirty':''; });
}
const observer=new MutationObserver((records)=>{ for(const record of records)record.addedNodes.forEach((node)=>{ if(node instanceof HTMLElement)migrate(node); }); migrate(document); });
function start(){ migrate(document); observer.observe(document.body,{childList:true,subtree:true}); document.addEventListener('click',(event)=>{ const tab=event.target instanceof Element?event.target.closest('.ev-tab'):null; if(tab)queueMicrotask(()=>migrate(document)); },true); }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

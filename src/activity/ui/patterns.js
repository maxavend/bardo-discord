function labelledField(label, control, hint = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'bardo-field';
  const title = document.createElement('span'); title.className = 'bardo-field-label'; title.textContent = label;
  wrapper.append(title, control);
  if (hint) { const support=document.createElement('span'); support.className='bardo-field-hint'; support.textContent=hint; wrapper.appendChild(support); }
  return wrapper;
}

export function createEntityPicker({ label='Buscar', placeholder='Escribe para buscar…', onQuery } = {}) {
  const input=document.createElement('input'); input.className='bardo-input'; input.placeholder=placeholder; input.role='combobox'; input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-expanded','false');
  const list=document.createElement('div'); list.className='bardo-entity-picker-list'; list.role='listbox'; list.hidden=true; list.id=`bardo-picker-${crypto.randomUUID()}`; input.setAttribute('aria-controls',list.id);
  input.addEventListener('input',()=>onQuery?.(input.value));
  const wrap=document.createElement('div'); wrap.className='bardo-entity-picker'; wrap.append(labelledField(label,input),list); return { root:wrap,input,list };
}

export function createAssigneeField(options={}) { return createEntityPicker({ label:'Responsable', placeholder:'Buscar miembro de Discord…', ...options }); }
export function createDateTimeField({ date='', time='' }={}) { const root=document.createElement('div'); root.className='bardo-datetime-field'; const d=document.createElement('input'); d.type='date'; d.value=date; d.className='bardo-input'; const t=document.createElement('input'); t.type='text'; t.inputMode='text'; t.value=time; t.placeholder='15:30 o 3:30 pm'; t.className='bardo-input'; root.append(labelledField('Fecha',d),labelledField('Hora',t,'Acepta 24h y am/pm.')); return {root,date:d,time:t}; }
export function createDurationField({ value='' }={}) { const input=document.createElement('input'); input.className='bardo-input'; input.value=value; input.placeholder='90m, 3h o 3h30m'; return {root:labelledField('Duración',input,'También puedes escribir minutos.'),input}; }
export function createFilterBar(children=[]) { const root=document.createElement('div'); root.className='bardo-filter-bar'; root.setAttribute('role','search'); root.append(...children); return root; }
export function createStatusMenu({ label='Estado', items=[] }={}) { const select=document.createElement('select'); select.className='bardo-input'; select.setAttribute('aria-label',label); for(const item of items){ const option=document.createElement('option'); option.value=item.value; option.textContent=item.label; select.appendChild(option); } return select; }
export function createSaveStatus(state='saved') { const node=document.createElement('span'); node.className='bardo-save-status'; node.dataset.state=state; node.role=state==='error'?'alert':'status'; node.setAttribute('aria-live',state==='error'?'assertive':'polite'); const labels={dirty:'Cambios sin guardar',saving:'Guardando…',saved:'Guardado',error:'No se pudo guardar · Reintentar',conflict:'Otra persona modificó este contenido'}; node.textContent=labels[state]||state; return node; }
export function confirmDestructiveAction(button,{confirmLabel='Confirmar',timeout=3500,onConfirm}={}) { let armed=false; const original=button.textContent; button.addEventListener('click',async()=>{ if(!armed){armed=true;button.textContent=confirmLabel;window.setTimeout(()=>{armed=false;button.textContent=original;},timeout);return;} armed=false;button.textContent=original;await onConfirm?.(); }); }
export function createAppShell({ title='Bardo', subtitle='' }={}) { const root=document.createElement('main'); root.className='bardo-app-shell'; const header=document.createElement('header'); header.className='bardo-topbar'; const heading=document.createElement('div'); heading.innerHTML=`<strong></strong><span></span>`; heading.querySelector('strong').textContent=title; heading.querySelector('span').textContent=subtitle; const toolbar=document.createElement('div'); toolbar.className='bardo-toolbar'; header.append(heading,toolbar); const content=document.createElement('section'); content.className='bardo-app-content'; root.append(header,content); return {root,header,toolbar,content}; }
export function createResourceCard({ title, meta='', href=null }={}) { const root=href?document.createElement('a'):document.createElement('article'); root.className='bardo-resource-card'; if(href)root.href=href; const heading=document.createElement('strong'); heading.textContent=title||'Recurso'; const detail=document.createElement('span'); detail.textContent=meta; root.append(heading,detail); return root; }
export function createBacklinkList(resources=[]) { const list=document.createElement('ul'); list.className='bardo-backlink-list'; for(const resource of resources){ const item=document.createElement('li'); item.appendChild(createResourceCard(resource)); list.appendChild(item); } return list; }

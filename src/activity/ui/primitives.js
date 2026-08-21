export function announce(message, tone = 'polite') {
  let region = document.querySelector('#bardo-live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'bardo-live-region';
    region.className = 'bardo-live-region';
    region.setAttribute('aria-live', tone === 'assertive' ? 'assertive' : 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  region.setAttribute('aria-live', tone === 'assertive' ? 'assertive' : 'polite');
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = String(message || ''); });
}

export function enhanceDialog(dialog) {
  if (!(dialog instanceof HTMLElement) || dialog.dataset.bardoDialogEnhanced === 'true') return;
  dialog.dataset.bardoDialogEnhanced = 'true';
  dialog.setAttribute('role', dialog.getAttribute('role') || 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
  const heading = dialog.querySelector('h1,h2,h3,.modal-title');
  if (heading && !dialog.hasAttribute('aria-labelledby')) {
    if (!heading.id) heading.id = `bardo-dialog-title-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog._bardoPreviousFocus = previous;
  const focusables = () => [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden && el.getClientRects().length);
  queueMicrotask(() => (focusables()[0] || dialog).focus?.());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const nodes = focusables();
    if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export function restoreDialogFocus(dialog) { dialog?._bardoPreviousFocus?.focus?.({ preventScroll: true }); }
export function markStatus(element, state) { if (!element) return; element.dataset.state = state; element.setAttribute('role', state === 'error' ? 'alert' : 'status'); element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite'); }

export function createButton({ label, variant = 'secondary', type = 'button', onClick } = {}) { const el=document.createElement('button'); el.type=type; el.className=`bardo-button bardo-button-${variant}`; el.textContent=label || 'Acción'; if(onClick)el.addEventListener('click',onClick); return el; }
export function createIconButton({ label, icon, onClick } = {}) { const el=createButton({label:'',variant:'icon',onClick}); el.classList.add('bardo-icon-button'); el.setAttribute('aria-label',label || 'Acción'); if(icon instanceof Node)el.appendChild(icon); else el.textContent=String(icon || '•'); return el; }
export function createInput({ label, type='text', value='', placeholder='' }={}) { const el=document.createElement('input'); el.type=type; el.value=value; el.placeholder=placeholder; el.className='bardo-input'; if(label)el.setAttribute('aria-label',label); return el; }
export function createTextarea({ label, value='', placeholder='' }={}) { const el=document.createElement('textarea'); el.value=value; el.placeholder=placeholder; el.className='bardo-input bardo-textarea'; if(label)el.setAttribute('aria-label',label); return el; }
export function createSelect({ label, options=[] }={}) { const el=document.createElement('select'); el.className='bardo-input bardo-select'; if(label)el.setAttribute('aria-label',label); for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;el.appendChild(option);} return el; }
export function createCombobox({ label='Buscar', placeholder='Escribe para buscar…' }={}) { const input=createInput({label,placeholder}); input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-expanded','false'); const list=document.createElement('div'); list.role='listbox'; list.hidden=true; list.id=`bardo-combobox-${crypto.randomUUID()}`; input.setAttribute('aria-controls',list.id); const root=document.createElement('div'); root.className='bardo-combobox'; root.append(input,list); return {root,input,list}; }
export function createCheckbox({ label, checked=false }={}) { const wrapper=document.createElement('label'); wrapper.className='bardo-checkbox'; const input=document.createElement('input'); input.type='checkbox'; input.checked=checked; wrapper.append(input,document.createTextNode(label || 'Opción')); return {root:wrapper,input}; }
export function createSwitch({ label, checked=false }={}) { const {root,input}=createCheckbox({label,checked}); root.className='bardo-switch'; input.setAttribute('role','switch'); input.setAttribute('aria-checked',String(checked)); input.addEventListener('change',()=>input.setAttribute('aria-checked',String(input.checked))); return {root,input}; }
export function createAvatar({ name='', src='', size=36 }={}) { const root=document.createElement('span'); root.className='bardo-avatar'; root.style.width=`${size}px`; root.style.height=`${size}px`; if(src){const img=document.createElement('img');img.src=src;img.alt=name;img.width=size;img.height=size;root.appendChild(img);}else{root.textContent=String(name||'?').trim().charAt(0).toUpperCase()||'?';root.setAttribute('aria-label',name||'Avatar');} return root; }
export function createBadge({ label, tone='neutral' }={}) { const el=document.createElement('span'); el.className=`bardo-badge bardo-badge-${tone}`; el.textContent=label || ''; return el; }
export function createChip({ label, removable=false, onRemove }={}) { const el=document.createElement('span'); el.className='bardo-chip'; const text=document.createElement('span'); text.textContent=label||''; el.appendChild(text); if(removable){el.appendChild(createIconButton({label:`Quitar ${label||'chip'}`,icon:'×',onClick:onRemove}));} return el; }
export function createSpinner({ label='Cargando…' }={}) { const el=document.createElement('span'); el.className='bardo-spinner'; el.role='status'; el.setAttribute('aria-label',label); return el; }
export function createSkeleton({ label='Cargando contenido' }={}) { const el=document.createElement('span'); el.className='bardo-skeleton'; el.role='status'; el.setAttribute('aria-label',label); return el; }
export function createDivider() { const el=document.createElement('hr'); el.className='bardo-divider'; return el; }
export function createTooltip(trigger, text) { const tooltip=document.createElement('span'); tooltip.className='bardo-tooltip'; tooltip.role='tooltip'; tooltip.id=`bardo-tooltip-${crypto.randomUUID()}`; tooltip.textContent=text; trigger.setAttribute('aria-describedby',tooltip.id); trigger.after(tooltip); return tooltip; }
export function createToast(message,{tone='info',duration=3200}={}) { const el=document.createElement('div'); el.className=`bardo-toast bardo-toast-${tone}`; el.textContent=message; el.role=tone==='error'?'alert':'status'; el.setAttribute('aria-live',tone==='error'?'assertive':'polite'); document.body.appendChild(el); window.setTimeout(()=>el.remove(),duration); return el; }
export function createMenu({ label='Menú', items=[] }={}) { const root=document.createElement('div'); root.className='bardo-menu'; root.role='menu'; root.setAttribute('aria-label',label); for(const item of items){const button=createButton({label:item.label,onClick:item.onSelect});button.role='menuitem';root.appendChild(button);} return root; }
export function createPopover({ trigger, content }={}) { const pop=document.createElement('div'); pop.className='bardo-popover'; pop.hidden=true; pop.id=`bardo-popover-${crypto.randomUUID()}`; if(content instanceof Node)pop.appendChild(content); else pop.textContent=String(content||''); if(trigger){trigger.setAttribute('aria-controls',pop.id);trigger.setAttribute('aria-expanded','false');trigger.addEventListener('click',()=>{pop.hidden=!pop.hidden;trigger.setAttribute('aria-expanded',String(!pop.hidden));});trigger.after(pop);} return pop; }
export function createModal({ title='Bardo', content, onClose }={}) { const backdrop=document.createElement('div'); backdrop.className='bardo-modal-backdrop'; const dialog=document.createElement('section'); dialog.className='bardo-modal'; const heading=document.createElement('h2'); heading.textContent=title; dialog.appendChild(heading); if(content instanceof Node)dialog.appendChild(content); const close=createButton({label:'Cerrar',onClick:()=>{restoreDialogFocus(dialog);backdrop.remove();onClose?.();}}); dialog.appendChild(close); backdrop.appendChild(dialog); enhanceDialog(dialog); return {backdrop,dialog,close}; }
export function createSheet(options={}) { const result=createModal(options); result.dialog.classList.add('bardo-sheet'); return result; }
export function createEmptyState({ title='Sin resultados', description='', action }={}) { const root=document.createElement('section'); root.className='bardo-empty-state'; const heading=document.createElement('h2'); heading.textContent=title; const text=document.createElement('p'); text.textContent=description; root.append(heading,text); if(action)root.appendChild(action); return root; }

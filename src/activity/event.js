import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  BARDO_EVENT_PREFIX,
  calculateEventTimeline,
  eventBlockTypeLabel,
  eventStatusLabel,
  formatDuration,
  parseEventTarget,
  totalEventAgendaMinutes,
} from '../event.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
let sdk = null;
let instanceId = null;
let eventId = null;
let data = null;
let currentTab = 'agenda';
let pollTimer = null;
let modalOpen = false;
let draggedBlockId = null;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveClientId() {
  const host = window.location.hostname || '';
  return host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i)?.[1] || FALLBACK_CLIENT_ID;
}

async function initSdk() {
  const params = new URLSearchParams(location.search);
  const embedded = params.has('frame_id') || location.hostname.endsWith('.discordsays.com');
  if (!embedded) return null;
  try {
    const client = new DiscordSDK(resolveClientId());
    await client.ready();
    sdk = client;
    instanceId = client.instanceId || params.get('instance_id');
    return client;
  } catch (error) {
    console.warn('Event Planner: DiscordSDK no disponible', error);
    instanceId = params.get('instance_id');
    return null;
  }
}

async function fetchContext(id, attempts = 5) {
  if (!id) return null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(`/api/activity-context/${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) return res.json();
    await new Promise((resolve) => setTimeout(resolve, Math.min(180 * (2 ** i), 1200)));
  }
  return null;
}

async function resolveEventId() {
  const params = new URLSearchParams(location.search);
  if (params.get('document')) return null;
  const direct = parseEventTarget(sdk?.customId) || parseEventTarget(params.get('custom_id')) || params.get('event');
  if (direct) return direct;
  const context = await fetchContext(instanceId);
  return parseEventTarget(context?.documentId);
}

function apiHeaders(json = false) {
  const headers = { 'x-bardo-instance-id': instanceId || '' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function api(path = '', options = {}) {
  const method = options.method || 'GET';
  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}${path}`, {
    method,
    headers: { ...apiHeaders(Boolean(options.body)), ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

async function loadEvent({ quiet = false } = {}) {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      headers: apiHeaders(),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    render();
  } catch (error) {
    if (!quiet) renderError(error.message || 'No pude cargar el evento.');
  }
}

function injectStyles() {
  if (document.querySelector('#bardo-event-styles')) return;
  const style = document.createElement('style');
  style.id = 'bardo-event-styles';
  style.textContent = `
    html[data-bardo-mode="event"] body > .shell { display:none!important }
    .event-app{--bg:#111214;--surface:#1e1f22;--surface2:#2b2d31;--hover:#35373c;--text:#f2f3f5;--muted:#949ba4;--dim:#6d717a;--line:rgba(255,255,255,.08);--accent:#5865f2;--green:#23a55a;--amber:#f0b232;--red:#f23f43;min-height:100vh;background:var(--bg);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:16px max(18px,env(safe-area-inset-right)) max(36px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));box-sizing:border-box}
    @media(prefers-color-scheme:light){.event-app{--bg:#f5f5f6;--surface:#fff;--surface2:#e9eaec;--hover:#dcdee1;--text:#111214;--muted:#5c5f66;--dim:#80848e;--line:rgba(0,0,0,.08)}}
    html[data-theme="light"] .event-app{--bg:#f5f5f6;--surface:#fff;--surface2:#e9eaec;--hover:#dcdee1;--text:#111214;--muted:#5c5f66;--dim:#80848e;--line:rgba(0,0,0,.08)}
    .ev-wrap{max-width:1180px;margin:auto}.ev-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}.ev-brand{display:flex;align-items:center;gap:10px}.ev-brand img{width:34px;height:34px;border-radius:50%;object-fit:cover}.ev-brand strong{display:block}.ev-brand small{display:block;color:var(--muted)}
    .ev-tabs{display:flex;gap:3px;padding:3px;background:var(--surface);border-radius:9px}.ev-tab{border:0;background:transparent;color:var(--muted);padding:7px 11px;border-radius:7px;cursor:pointer}.ev-tab.active{background:var(--surface2);color:var(--text)}
    .ev-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px}.ev-eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 7px}.ev-title{font-size:32px;line-height:1.12;margin:0 0 10px;letter-spacing:-.025em}.ev-desc{color:var(--muted);max-width:720px;margin:8px 0 0;white-space:pre-wrap}.ev-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:var(--muted)}
    .ev-badge{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border-radius:999px;padding:5px 9px;font-size:12px}.ev-badge.live{color:#fff;background:var(--red)}.ev-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ev-btn{border:0;border-radius:8px;background:var(--surface2);color:var(--text);padding:8px 11px;font:inherit;cursor:pointer}.ev-btn:hover{background:var(--hover)}.ev-btn.primary{background:var(--accent);color:white}.ev-btn.danger{color:#fff;background:var(--red)}.ev-btn.ghost{background:transparent;color:var(--muted)}.ev-btn.small{padding:5px 8px;font-size:12px}
    .ev-people{display:flex;align-items:center;gap:7px;margin:12px 0 0}.ev-avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--surface2);font-size:10px;font-weight:700;overflow:hidden}.ev-avatar img{width:100%;height:100%;object-fit:cover}.ev-more{color:var(--muted);font-size:12px}
    .ev-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}.ev-stat{background:var(--surface);border-radius:9px;padding:8px 11px;color:var(--muted)}.ev-stat b{color:var(--text)}.ev-overtime{color:var(--amber)}
    .ev-agenda{position:relative}.ev-block{display:grid;grid-template-columns:74px 1fr;gap:18px;margin:0 0 12px}.ev-time{padding-top:15px;color:var(--muted);font-variant-numeric:tabular-nums}.ev-time b{color:var(--text);display:block}.ev-card{background:var(--surface);border-radius:12px;padding:15px 16px;min-width:0}.ev-card.dragging{opacity:.55}.ev-block-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ev-block-title{font-size:17px;font-weight:700;margin:0}.ev-block-meta{color:var(--muted);font-size:12px;margin-top:4px}.ev-drag{cursor:grab;color:var(--dim);user-select:none;padding:2px 5px}.ev-card-actions{display:flex;gap:3px;align-items:center}.ev-leads{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.ev-person{display:inline-flex;align-items:center;gap:5px;background:var(--surface2);padding:4px 7px;border-radius:999px;font-size:12px}.ev-person .dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--hover);font-size:8px;overflow:hidden}.ev-person img{width:18px;height:18px;border-radius:50%;object-fit:cover}
    .ev-items{margin-top:13px;border-top:1px solid var(--line)}.ev-item{padding:11px 0;border-bottom:1px solid var(--line)}.ev-item:last-child{border-bottom:0}.ev-item-row{display:flex;align-items:flex-start;gap:10px}.ev-check{width:20px;height:20px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;flex:none}.ev-check.done{background:var(--green);color:white;border-color:transparent}.ev-check.active{background:var(--amber);color:#111;border-color:transparent}.ev-item-main{min-width:0;flex:1}.ev-item-title{font-weight:650}.ev-item-desc{color:var(--muted);font-size:13px;white-space:pre-wrap;margin-top:3px}.ev-item-meta{display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin-top:5px}.ev-links{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.ev-link{color:var(--text);background:var(--surface2);padding:4px 7px;border-radius:7px;text-decoration:none;font-size:12px}.ev-live-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
    .ev-note,.ev-decision,.ev-task-ref{margin-top:7px;padding:8px 10px;border-radius:8px;background:var(--surface2);font-size:13px}.ev-note:before{content:'Nota · ';color:var(--muted)}.ev-decision{border-left:3px solid var(--green)}.ev-decision:before{content:'Decisión · ';font-weight:700}.ev-task-ref{border-left:3px solid var(--accent)}.ev-task-ref:before{content:'Tarea · ';font-weight:700}.ev-empty{background:var(--surface);border-radius:12px;padding:34px;text-align:center;color:var(--muted)}.ev-add{width:100%;border:1px dashed var(--line);background:transparent;color:var(--muted);padding:12px;border-radius:10px;cursor:pointer;margin-top:10px}.ev-add:hover{background:var(--surface);color:var(--text)}
    .ev-calendar-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.ev-calendar-list{display:grid;gap:8px}.ev-calendar-event{display:grid;grid-template-columns:90px 1fr auto;gap:12px;align-items:center;background:var(--surface);padding:12px 14px;border-radius:10px;cursor:pointer}.ev-calendar-event:hover{background:var(--surface2)}.ev-date{font-variant-numeric:tabular-nums;color:var(--muted)}.ev-date b{color:var(--text);display:block}.ev-calendar-title{font-weight:650}.ev-calendar-meta{font-size:12px;color:var(--muted)}
    .ev-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:1000;display:grid;place-items:center;padding:20px}.ev-modal{width:min(560px,100%);max-height:min(760px,calc(100vh - 40px));overflow:auto;background:var(--surface);border-radius:14px;padding:20px;box-shadow:0 22px 70px rgba(0,0,0,.4)}.ev-modal h2{margin:0 0 16px;font-size:19px}.ev-field{display:grid;gap:6px;margin-bottom:13px}.ev-field label{font-size:12px;color:var(--muted);font-weight:650}.ev-input,.ev-select,.ev-textarea{width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:9px 10px;font:inherit;outline:none}.ev-input:focus,.ev-select:focus,.ev-textarea:focus{border-color:var(--accent)}.ev-textarea{min-height:82px;resize:vertical}.ev-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ev-members{display:grid;gap:5px;max-height:220px;overflow:auto;background:var(--bg);padding:7px;border-radius:8px}.ev-member{display:flex;align-items:center;gap:8px;padding:6px;border-radius:7px}.ev-member:hover{background:var(--surface2)}.ev-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:18px}.ev-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--surface2);color:var(--text);padding:9px 13px;border-radius:9px;z-index:2000;box-shadow:0 10px 35px rgba(0,0,0,.35)}
    @media(max-width:720px){.event-app{padding:12px}.ev-top{margin-bottom:18px}.ev-hero{display:block}.ev-actions{justify-content:flex-start;margin-top:15px}.ev-title{font-size:26px}.ev-block{grid-template-columns:50px 1fr;gap:9px}.ev-time{font-size:11px}.ev-card{padding:12px}.ev-grid2{grid-template-columns:1fr}.ev-calendar-event{grid-template-columns:72px 1fr}.ev-calendar-event>.ev-badge{display:none}.ev-tabs{overflow:auto}}
  `;
  document.head.appendChild(style);
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || '?';
}

function avatar(person) {
  const label = esc(person.displayName || person.name || person.userId);
  return `<span class="ev-avatar" title="${label}">${person.avatarUrl ? `<img src="${esc(person.avatarUrl)}" alt="">` : esc(initials(label))}</span>`;
}

function personChip(person) {
  return `<span class="ev-person">${person.avatarUrl ? `<img src="${esc(person.avatarUrl)}" alt="">` : `<span class="dot">${esc(initials(person.displayName))}</span>`}<span>${esc(person.displayName || person.userId)}</span></span>`;
}

function toast(message) {
  document.querySelector('.ev-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'ev-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function appRoot() {
  let root = document.querySelector('#bardo-event-app');
  if (!root) {
    root = document.createElement('div');
    root.id = 'bardo-event-app';
    root.className = 'event-app';
    document.body.appendChild(root);
  }
  return root;
}

function renderError(message) {
  document.documentElement.dataset.bardoMode = 'event';
  injectStyles();
  appRoot().innerHTML = `<div class="ev-wrap"><div class="ev-empty"><h2>No pudimos abrir el planner</h2><p>${esc(message)}</p></div></div>`;
}

function renderTop() {
  return `<div class="ev-top">
    <div class="ev-brand"><div><strong>Bardo</strong><small>Eventos & planner</small></div></div>
    <div class="ev-tabs"><button class="ev-tab ${currentTab === 'agenda' ? 'active' : ''}" data-tab="agenda">Agenda</button><button class="ev-tab ${currentTab === 'calendar' ? 'active' : ''}" data-tab="calendar">Calendario</button></div>
  </div>`;
}

function renderHero() {
  const agendaMinutes = totalEventAgendaMinutes(data);
  const overtime = agendaMinutes - Number(data.expectedDuration || 0);
  return `<section class="ev-hero">
    <div>
      <p class="ev-eyebrow">${data.status === 'live' ? 'En vivo' : 'Evento'}</p>
      <h1 class="ev-title">${esc(data.title)}</h1>
      <div class="ev-meta"><span>${esc(data.eventDate)} · ${esc(data.startTime)}</span><span class="ev-badge ${data.status === 'live' ? 'live' : ''}">${esc(eventStatusLabel(data.status))}</span><span>${formatDuration(agendaMinutes || data.expectedDuration)}</span></div>
      ${data.description ? `<p class="ev-desc">${esc(data.description)}</p>` : ''}
      <div class="ev-people">${(data.participants || []).slice(0, 8).map(avatar).join('')}${data.participants?.length > 8 ? `<span class="ev-more">+${data.participants.length - 8}</span>` : ''}<button class="ev-btn ghost small" data-action="participants">Participantes</button></div>
    </div>
    <div class="ev-actions">
      <button class="ev-btn" data-action="edit-event">Editar</button>
      <button class="ev-btn" data-action="share">Compartir agenda</button>
      <button class="ev-btn" data-action="duplicate">Duplicar</button>
      ${data.status === 'live'
        ? `<button class="ev-btn primary" data-action="finish">Finalizar</button>`
        : data.status === 'finished'
          ? `<button class="ev-btn" data-action="publish-minutes">Publicar minuta</button><button class="ev-btn primary" data-action="minutes">Abrir minuta</button>`
          : `<button class="ev-btn primary" data-action="start">Iniciar reunión</button>`}
    </div>
  </section>
  <div class="ev-summary"><span class="ev-stat"><b>${data.blocks?.length || 0}</b> bloques</span><span class="ev-stat"><b>${(data.blocks || []).reduce((n,b)=>n+(b.items?.length||0),0)}</b> puntos</span><span class="ev-stat"><b>${data.decisions?.length || 0}</b> decisiones</span><span class="ev-stat"><b>${data.tasks?.length || 0}</b> tareas</span>${overtime > 0 ? `<span class="ev-stat ev-overtime">Agenda +${overtime} min sobre el tiempo</span>` : ''}</div>`;
}

function renderItem(item, block) {
  const statusClass = item.status === 'done' ? 'done' : item.status === 'active' ? 'active' : '';
  const speakers = (item.speakers || []).map(personChip).join('');
  return `<div class="ev-item" data-item-id="${esc(item.id)}">
    <div class="ev-item-row">
      <button class="ev-check ${statusClass}" data-action="cycle-item" data-item="${esc(item.id)}" title="Cambiar estado">${item.status === 'done' ? '✓' : item.status === 'active' ? '▶' : ''}</button>
      <div class="ev-item-main">
        <div class="ev-item-title">${esc(item.title)}</div>
        ${item.description ? `<div class="ev-item-desc">${esc(item.description)}</div>` : ''}
        <div class="ev-item-meta">${item.durationMinutes ? `<span>${item.durationMinutes} min</span>` : ''}${speakers}</div>
        ${(item.links || []).length ? `<div class="ev-links">${item.links.map((link)=>`<a class="ev-link" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label || 'Link')}</a>`).join('')}</div>` : ''}
        ${(item.notes || []).map((note)=>`<div class="ev-note">${esc(note.content)}</div>`).join('')}
        ${(item.decisions || []).map((decision)=>`<div class="ev-decision">${esc(decision.content)}</div>`).join('')}
        ${(item.tasks || []).map((task)=>`<div class="ev-task-ref">${esc(task.title)}${task.assigneeName ? ` — ${esc(task.assigneeName)}` : ''}</div>`).join('')}
        ${data.status === 'live' ? `<div class="ev-live-tools"><button class="ev-btn small" data-action="note" data-block="${esc(block.id)}" data-item="${esc(item.id)}">+ Nota</button><button class="ev-btn small" data-action="decision" data-block="${esc(block.id)}" data-item="${esc(item.id)}">+ Decisión</button><button class="ev-btn small" data-action="task" data-block="${esc(block.id)}" data-item="${esc(item.id)}">+ Tarea</button></div>` : ''}
      </div>
      <div class="ev-card-actions"><button class="ev-btn ghost small" data-action="edit-item" data-item="${esc(item.id)}" data-block="${esc(block.id)}">Editar</button><button class="ev-btn ghost small" data-action="delete-item" data-item="${esc(item.id)}">×</button></div>
    </div>
  </div>`;
}

function renderAgenda() {
  const timeline = calculateEventTimeline(data);
  if (!timeline.length) return `<div class="ev-empty"><h2>La agenda está vacía</h2><p>Agrega el primer bloque para empezar a estructurar la sesión.</p><button class="ev-btn primary" data-action="add-block">+ Añadir bloque</button></div>`;
  return `<div class="ev-agenda">${timeline.map((block)=>`<div class="ev-block" data-block-id="${esc(block.id)}" draggable="true">
    <div class="ev-time"><b>${esc(block.startTime)}</b>${esc(block.endTime)}</div>
    <div class="ev-card">
      <div class="ev-block-head"><div><div class="ev-block-title">${esc(block.title)}</div><div class="ev-block-meta">${esc(eventBlockTypeLabel(block.type))} · ${block.durationMinutes} min</div></div><div class="ev-card-actions"><span class="ev-drag" title="Reordenar">⋮⋮</span><button class="ev-btn ghost small" data-action="edit-block" data-block="${esc(block.id)}">Editar</button><button class="ev-btn ghost small" data-action="delete-block" data-block="${esc(block.id)}">×</button></div></div>
      ${block.description ? `<div class="ev-item-desc">${esc(block.description)}</div>` : ''}
      ${(block.leads || []).length ? `<div class="ev-leads">${block.leads.map(personChip).join('')}</div>` : ''}
      <div class="ev-items">${(block.items || []).map((item)=>renderItem(item,block)).join('')}</div>
      <button class="ev-add" data-action="add-item" data-block="${esc(block.id)}">+ Añadir punto</button>
      ${data.status === 'live' ? `<div class="ev-live-tools"><button class="ev-btn small" data-action="note" data-block="${esc(block.id)}">+ Nota del bloque</button><button class="ev-btn small" data-action="decision" data-block="${esc(block.id)}">+ Decisión</button><button class="ev-btn small" data-action="task" data-block="${esc(block.id)}">+ Tarea</button></div>` : ''}
      ${(block.notes || []).map((note)=>`<div class="ev-note">${esc(note.content)}</div>`).join('')}
      ${(block.decisions || []).map((decision)=>`<div class="ev-decision">${esc(decision.content)}</div>`).join('')}
    </div>
  </div>`).join('')}<button class="ev-add" data-action="add-block">+ Añadir bloque</button></div>`;
}

async function renderCalendar() {
  const root = document.querySelector('#ev-content');
  if (!root) return;
  root.innerHTML = `<div class="ev-empty">Cargando calendario…</div>`;
  try {
    const res = await fetch('/api/events?limit=80', { headers: apiHeaders(), cache: 'no-store' });
    const json = await res.json();
    const events = json.events || [];
    root.innerHTML = `<div class="ev-calendar-head"><div><h2 style="margin:0">Eventos</h2><div class="ev-calendar-meta">Próximos, finalizados y sesiones de esta semana</div></div><button class="ev-btn primary" data-action="new-event">+ Evento</button></div><div class="ev-calendar-list">${events.length ? events.map((event)=>`<div class="ev-calendar-event" data-open-event="${esc(event.id)}"><div class="ev-date"><b>${esc(event.eventDate.slice(5))}</b>${esc(event.startTime)}</div><div><div class="ev-calendar-title">${esc(event.title)}</div><div class="ev-calendar-meta">${esc(eventStatusLabel(event.status))} · ${formatDuration(event.expectedDuration)}</div></div><span class="ev-badge ${event.status === 'live' ? 'live' : ''}">${esc(eventStatusLabel(event.status))}</span></div>`).join('') : `<div class="ev-empty">No hay eventos todavía.</div>`}</div>`;
    bindEvents();
  } catch (error) {
    root.innerHTML = `<div class="ev-empty">${esc(error.message)}</div>`;
  }
}

function render() {
  document.documentElement.dataset.bardoMode = 'event';
  injectStyles();
  const root = appRoot();
  root.innerHTML = `<div class="ev-wrap">${renderTop()}${currentTab === 'agenda' ? renderHero() : ''}<main id="ev-content">${currentTab === 'agenda' ? renderAgenda() : ''}</main></div>`;
  bindEvents();
  if (currentTab === 'calendar') renderCalendar();
}

function membersChecklist(selected = []) {
  const chosen = new Set(selected.map((person)=>String(person.userId || person.id)));
  return `<div class="ev-members">${(data.guildMembers || []).map((member)=>`<label class="ev-member"><input type="checkbox" name="member" value="${esc(member.userId)}" ${chosen.has(String(member.userId)) ? 'checked' : ''}>${avatar(member)}<span>${esc(member.displayName)}</span></label>`).join('')}</div>`;
}

function selectedMembers(form) {
  const ids = [...form.querySelectorAll('input[name="member"]:checked')].map((el)=>el.value);
  return ids.map((id)=>data.guildMembers.find((member)=>String(member.userId)===String(id))).filter(Boolean);
}

function openModal({ title, body, submit = 'Guardar', onSubmit, danger = null }) {
  modalOpen = true;
  const bg = document.createElement('div');
  bg.className = 'ev-modal-bg';
  bg.innerHTML = `<form class="ev-modal"><h2>${esc(title)}</h2>${body}<div class="ev-modal-actions">${danger ? `<button type="button" class="ev-btn danger" data-modal-danger>${esc(danger.label)}</button>` : ''}<button type="button" class="ev-btn" data-modal-cancel>Cancelar</button><button class="ev-btn primary" type="submit">${esc(submit)}</button></div></form>`;
  document.body.appendChild(bg);
  const close = () => { modalOpen = false; bg.remove(); };
  bg.querySelector('[data-modal-cancel]').onclick = close;
  bg.addEventListener('click',(e)=>{if(e.target===bg)close();});
  if (danger) bg.querySelector('[data-modal-danger]').onclick = async()=>{ if(await danger.run()) close(); };
  bg.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try { await onSubmit(form); close(); await loadEvent(); } catch (error) { toast(error.message); button.disabled = false; }
  };
}

function peopleSelect(selected = [], name = 'member') {
  const chosen = new Set(selected.map((person)=>String(person.userId)));
  return `<div class="ev-members">${(data.guildMembers || []).map((member)=>`<label class="ev-member"><input type="checkbox" name="${name}" value="${esc(member.userId)}" ${chosen.has(String(member.userId)) ? 'checked' : ''}>${avatar(member)}<span>${esc(member.displayName)}</span></label>`).join('')}</div>`;
}

function pickPeople(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((el)=>data.guildMembers.find((member)=>String(member.userId)===String(el.value))).filter(Boolean);
}

function eventModal() {
  openModal({
    title: 'Editar evento',
    body: `<div class="ev-field"><label>Título</label><input class="ev-input" name="title" value="${esc(data.title)}" required></div><div class="ev-field"><label>Descripción</label><textarea class="ev-textarea" name="description">${esc(data.description)}</textarea></div><div class="ev-grid2"><div class="ev-field"><label>Fecha</label><input class="ev-input" type="date" name="date" value="${esc(data.eventDate)}" required></div><div class="ev-field"><label>Hora</label><input class="ev-input" type="time" name="time" value="${esc(data.startTime)}" required></div></div><div class="ev-field"><label>Duración prevista (min)</label><input class="ev-input" type="number" min="1" max="720" name="duration" value="${Number(data.expectedDuration||60)}"></div>`,
    onSubmit: async(form)=>api('',{method:'PATCH',body:{title:form.title.value,description:form.description.value,eventDate:form.date.value,startTime:form.time.value,expectedDuration:Number(form.duration.value)}}),
  });
}

function participantsModal() {
  openModal({
    title: 'Participantes',
    body: `<p style="color:var(--muted);margin-top:-8px">Selecciona miembros reales del servidor.</p>${membersChecklist(data.participants || [])}`,
    onSubmit: async(form)=>api('/participants',{method:'PUT',body:{participants:selectedMembers(form)}}),
  });
}

function blockModal(block = null) {
  openModal({
    title: block ? 'Editar bloque' : 'Nuevo bloque',
    body: `<div class="ev-field"><label>Título</label><input class="ev-input" name="title" value="${esc(block?.title||'')}" required></div><div class="ev-grid2"><div class="ev-field"><label>Duración (min)</label><input class="ev-input" type="number" min="0" max="480" name="duration" value="${Number(block?.durationMinutes||15)}"></div><div class="ev-field"><label>Tipo</label><select class="ev-select" name="type">${['discussion','presentation','review','break','decision','other'].map((type)=>`<option value="${type}" ${block?.type===type?'selected':''}>${eventBlockTypeLabel(type)}</option>`).join('')}</select></div></div><div class="ev-field"><label>Descripción</label><textarea class="ev-textarea" name="description">${esc(block?.description||'')}</textarea></div><div class="ev-field"><label>Lideran</label>${peopleSelect(block?.leads||[],'lead')}</div>`,
    onSubmit: async(form)=>api(block?`/blocks/${block.id}`:'/blocks',{method:block?'PATCH':'POST',body:{title:form.title.value,durationMinutes:Number(form.duration.value),type:form.type.value,description:form.description.value,leads:pickPeople(form,'lead')}}),
  });
}

function parseLinks(text) {
  return String(text||'').split('\n').map((line)=>line.trim()).filter(Boolean).map((line)=>{
    const pipe=line.indexOf('|');
    return pipe>0?{label:line.slice(0,pipe).trim(),url:line.slice(pipe+1).trim()}:{url:line};
  });
}

function itemModal(blockId, item = null) {
  const links = (item?.links||[]).map((link)=>`${link.label||'Link'} | ${link.url}`).join('\n');
  openModal({
    title: item ? 'Editar punto' : 'Nuevo punto',
    body: `<div class="ev-field"><label>Título</label><input class="ev-input" name="title" value="${esc(item?.title||'')}" required></div><div class="ev-field"><label>Descripción</label><textarea class="ev-textarea" name="description">${esc(item?.description||'')}</textarea></div><div class="ev-field"><label>Duración (min, opcional)</label><input class="ev-input" type="number" min="0" max="480" name="duration" value="${Number(item?.durationMinutes||0)}"></div><div class="ev-field"><label>Protagonistas / presentan</label>${peopleSelect(item?.speakers||[],'speaker')}</div><div class="ev-field"><label>Links (uno por línea; opcional: “Figma | https://…“)</label><textarea class="ev-textarea" name="links" placeholder="Figma | https://figma.com/...">${esc(links)}</textarea></div>`,
    onSubmit: async(form)=>api(item?`/items/${item.id}`:'/items',{method:item?'PATCH':'POST',body:{blockId,title:form.title.value,description:form.description.value,durationMinutes:Number(form.duration.value),speakers:pickPeople(form,'speaker'),links:parseLinks(form.links.value)}}),
  });
}

function captureModal(kind, blockId, itemId) {
  const labels={note:'Nueva nota',decision:'Registrar decisión'};
  openModal({
    title:labels[kind],
    body:`<div class="ev-field"><label>${kind==='note'?'Nota':'Decisión'}</label><textarea class="ev-textarea" name="content" autofocus required></textarea></div>`,
    submit:'Guardar',
    onSubmit:async(form)=>api(`/${kind==='note'?'notes':'decisions'}`,{method:'POST',body:{blockId:blockId||null,itemId:itemId||null,content:form.content.value}}),
  });
}

function taskModal(blockId, itemId) {
  if (!(data.boards||[]).length) return toast('Primero crea un tablero con /tablero crear.');
  openModal({
    title:'Crear tarea desde la reunión',
    body:`<div class="ev-field"><label>Título</label><input class="ev-input" name="title" required></div><div class="ev-field"><label>Descripción</label><textarea class="ev-textarea" name="description"></textarea></div><div class="ev-grid2"><div class="ev-field"><label>Tablero</label><select class="ev-select" name="board">${data.boards.map((board)=>`<option value="${esc(board.id)}">${esc(board.name)}</option>`).join('')}</select></div><div class="ev-field"><label>Prioridad</label><select class="ev-select" name="priority"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div></div><div class="ev-field"><label>Responsable</label><select class="ev-select" name="assignee"><option value="">Sin asignar</option>${(data.guildMembers||[]).map((member)=>`<option value="${esc(member.userId)}">${esc(member.displayName)}</option>`).join('')}</select></div><div class="ev-field"><label>Chips (separados por coma)</label><input class="ev-input" name="labels" value="weekly"></div>`,
    submit:'Crear tarea',
    onSubmit:async(form)=>api('/tasks',{method:'POST',body:{blockId:blockId||null,itemId:itemId||null,boardId:form.board.value,title:form.title.value,description:form.description.value,priority:form.priority.value,assigneeId:form.assignee.value||null,labels:form.labels.value.split(',').map(x=>x.trim()).filter(Boolean)}}),
  });
}

function newEventModal() {
  const today = new Date().toISOString().slice(0,10);
  openModal({
    title:'Nuevo evento',
    body:`<div class="ev-field"><label>Título</label><input class="ev-input" name="title" required></div><div class="ev-grid2"><div class="ev-field"><label>Fecha</label><input class="ev-input" type="date" name="date" value="${today}" required></div><div class="ev-field"><label>Hora</label><input class="ev-input" type="time" name="time" value="10:00" required></div></div><div class="ev-field"><label>Duración (min)</label><input class="ev-input" type="number" name="duration" value="60" min="1" max="720"></div><div class="ev-field"><label>Descripción</label><textarea class="ev-textarea" name="description"></textarea></div>`,
    submit:'Crear y abrir',
    onSubmit:async(form)=>{const response=await fetch('/api/events',{method:'POST',headers:{...apiHeaders(true)},body:JSON.stringify({title:form.title.value,eventDate:form.date.value,startTime:form.time.value,expectedDuration:Number(form.duration.value),description:form.description.value,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Santiago'})});const json=await response.json();if(!response.ok)throw new Error(json.error);eventId=json.event.id;currentTab='agenda';},
  });
}

async function action(el) {
  const actionName = el.dataset.action;
  const blockId = el.dataset.block;
  const itemId = el.dataset.item;
  const block = data.blocks?.find((x)=>x.id===blockId);
  const item = data.blocks?.flatMap((b)=>b.items||[]).find((x)=>x.id===itemId);

  if (actionName==='edit-event') return eventModal();
  if (actionName==='participants') return participantsModal();
  if (actionName==='add-block') return blockModal();
  if (actionName==='edit-block') return blockModal(block);
  if (actionName==='add-item') return itemModal(blockId);
  if (actionName==='edit-item') return itemModal(blockId,item);
  if (actionName==='note') return captureModal('note',blockId,itemId);
  if (actionName==='decision') return captureModal('decision',blockId,itemId);
  if (actionName==='task') return taskModal(blockId,itemId);
  if (actionName==='new-event') return newEventModal();

  if (actionName==='delete-block' && confirm('¿Eliminar este bloque y sus puntos?')) { await api(`/blocks/${blockId}`,{method:'DELETE'}); await loadEvent(); }
  if (actionName==='delete-item' && confirm('¿Eliminar este punto?')) { await api(`/items/${itemId}`,{method:'DELETE'}); await loadEvent(); }
  if (actionName==='start') { await api('/start',{method:'POST',body:{}}); await loadEvent(); toast('Reunión iniciada'); }
  if (actionName==='finish') { await api('/finish',{method:'POST',body:{}}); await loadEvent(); toast('Reunión finalizada'); }
  if (actionName==='share') { await api('/publish',{method:'POST',body:{}}); toast('Agenda publicada en Discord'); }
  if (actionName==='publish-minutes') { await api('/publish-minutes',{method:'POST',body:{}}); toast('Minuta publicada en Discord'); }
  if (actionName==='duplicate') { const res=await api('/duplicate',{method:'POST',body:{}}); eventId=res.event.id; await loadEvent(); toast('Evento duplicado'); }
  if (actionName==='minutes') {
    const res=await api('/minutes',{method:'POST',body:{}});
    const url=new URL(location.href);url.searchParams.set('document',res.documentId);url.searchParams.delete('event');url.searchParams.delete('custom_id');location.href=url.toString();
  }
  if (actionName==='cycle-item') {
    const next=item.status==='pending'?'active':item.status==='active'?'done':item.status==='done'?'pending':'pending';
    await api(`/items/${item.id}`,{method:'PATCH',body:{status:next}});await loadEvent({quiet:true});
  }
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((el)=>el.onclick=()=>{currentTab=el.dataset.tab;render();});
  document.querySelectorAll('[data-action]').forEach((el)=>el.onclick=(e)=>{e.preventDefault();action(el).catch((err)=>toast(err.message));});
  document.querySelectorAll('[data-open-event]').forEach((el)=>el.onclick=async()=>{eventId=el.dataset.openEvent;currentTab='agenda';await loadEvent();});

  document.querySelectorAll('.ev-block[draggable="true"]').forEach((el)=>{
    el.addEventListener('dragstart',()=>{draggedBlockId=el.dataset.blockId;el.querySelector('.ev-card')?.classList.add('dragging');});
    el.addEventListener('dragend',()=>{draggedBlockId=null;el.querySelector('.ev-card')?.classList.remove('dragging');});
    el.addEventListener('dragover',(e)=>e.preventDefault());
    el.addEventListener('drop',async(e)=>{
      e.preventDefault();const target=el.dataset.blockId;if(!draggedBlockId||target===draggedBlockId)return;
      const ids=(data.blocks||[]).sort((a,b)=>a.position-b.position).map((b)=>b.id);const from=ids.indexOf(draggedBlockId),to=ids.indexOf(target);if(from<0||to<0)return;ids.splice(to,0,ids.splice(from,1)[0]);
      try{await api('/reorder-blocks',{method:'POST',body:{ids}});await loadEvent({quiet:true});}catch(err){toast(err.message);}
    });
  });
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer=setInterval(()=>{if(document.visibilityState==='visible'&&!modalOpen&&currentTab==='agenda')loadEvent({quiet:true});},8000);
}

async function init() {
  await initSdk();
  eventId = await resolveEventId();
  if (!eventId) return;
  document.documentElement.dataset.bardoMode = 'event';
  injectStyles();
  appRoot().innerHTML='<div class="ev-wrap"><div class="ev-empty">Abriendo planner…</div></div>';
  await loadEvent();
  startPolling();
}

init().catch((error)=>renderError(error.message));

const SEARCH_DELAY_MS = 180;
const RESULT_LIMIT = 25;

function escapeText(value) {
  return String(value || '').trim();
}

function plannerData() {
  const value = globalThis.__bardoPlannerData;
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value.guildMembers)) value.guildMembers = [];
  return value;
}

function rememberMember(member) {
  const state = plannerData();
  if (!state) return;
  const userId = String(member?.userId || '').trim();
  if (!userId) return;
  const existing = state.guildMembers.find((candidate) => String(candidate?.userId) === userId);
  if (existing) {
    existing.displayName = member.displayName || existing.displayName || userId;
    existing.username = member.username || existing.username || '';
    existing.avatarUrl = member.avatarUrl || existing.avatarUrl || null;
    return;
  }
  state.guildMembers.push({
    userId,
    displayName: member.displayName || userId,
    username: member.username || '',
    avatarUrl: member.avatarUrl || null,
  });
}

function rowFor(list, userId) {
  return [...list.querySelectorAll('input[type="checkbox"]')]
    .find((input) => String(input.value) === String(userId))?.closest('.ev-member') || null;
}

function appendSelectedMember(list, checkboxName, member) {
  const userId = String(member?.userId || '').trim();
  if (!userId) return;
  rememberMember(member);

  const existingRow = rowFor(list, userId);
  if (existingRow) {
    const checkbox = existingRow.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = true;
    existingRow.hidden = false;
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  const label = document.createElement('label');
  label.className = 'ev-member';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = checkboxName;
  checkbox.value = userId;
  checkbox.checked = true;
  const avatar = document.createElement('span');
  avatar.className = 'ev-avatar';
  const displayName = escapeText(member.displayName || userId);
  avatar.textContent = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  const text = document.createElement('span');
  text.textContent = member.username ? `${displayName} · @${member.username}` : displayName;
  label.append(checkbox, avatar, text);
  list.appendChild(label);
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function enhancePlannerMemberList(list) {
  if (!(list instanceof HTMLElement) || list.dataset.bardoMemberSearch === 'true') return;
  const firstCheckbox = list.querySelector('input[type="checkbox"][name]');
  if (!firstCheckbox?.name) return;
  list.dataset.bardoMemberSearch = 'true';
  list.dataset.bardoRemoteDirectory = 'true';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'bardo-input bardo-member-list-search';
  search.placeholder = 'Buscar miembro de Discord…';
  search.setAttribute('aria-label', 'Buscar miembro de Discord');
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'false');

  const results = document.createElement('div');
  results.className = 'bardo-entity-picker-list';
  results.setAttribute('role', 'listbox');
  results.id = `planner-members-${crypto.randomUUID()}`;
  results.hidden = true;
  search.setAttribute('aria-controls', results.id);

  const status = document.createElement('p');
  status.className = 'bardo-member-cap-note';
  status.setAttribute('role', 'status');

  list.before(search);
  search.after(results, status);

  let controller = null;
  let timer = null;
  let remote = [];
  let active = -1;

  const localRows = () => [...list.querySelectorAll('.ev-member')];
  const applyLocalFilter = (query) => {
    let visible = 0;
    for (const row of localRows()) {
      const checked = Boolean(row.querySelector('input[type="checkbox"]:checked'));
      const matches = !query || (row.textContent || '').toLowerCase().includes(query) || checked;
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    return visible;
  };

  const close = () => {
    results.hidden = true;
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    remote = [];
    active = -1;
  };

  const choose = (member) => {
    appendSelectedMember(list, firstCheckbox.name, member);
    search.value = '';
    applyLocalFilter('');
    status.textContent = `${localRows().length} miembros referenciados · directorio remoto bajo demanda`;
    close();
    search.focus();
  };

  const setActive = (index) => {
    if (!remote.length) return;
    active = (index + remote.length) % remote.length;
    [...results.querySelectorAll('[role="option"]')].forEach((node, itemIndex) => {
      node.setAttribute('aria-selected', itemIndex === active ? 'true' : 'false');
    });
    const node = results.querySelector(`[data-index="${active}"]`);
    if (node) {
      search.setAttribute('aria-activedescendant', node.id);
      node.scrollIntoView({ block: 'nearest' });
    }
  };

  const renderRemote = (members) => {
    remote = members;
    active = members.length ? 0 : -1;
    results.replaceChildren();
    if (!members.length) {
      const empty = document.createElement('div');
      empty.className = 'member-picker-state';
      empty.textContent = 'Sin resultados en el servidor';
      results.appendChild(empty);
    }
    members.forEach((member, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'option';
      button.id = `${results.id}-option-${index}`;
      button.dataset.index = String(index);
      button.className = 'member-menu-item';
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.textContent = member.username
        ? `${member.displayName} · @${member.username}`
        : member.displayName;
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(member);
      });
      results.appendChild(button);
    });
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
    if (active >= 0) search.setAttribute('aria-activedescendant', `${results.id}-option-0`);
  };

  const runSearch = () => {
    const query = search.value.trim().replace(/^@/, '');
    const normalized = query.toLowerCase();
    const localCount = applyLocalFilter(normalized);
    if (timer) clearTimeout(timer);
    controller?.abort();
    if (query.length < 2) {
      close();
      status.textContent = `${localCount} miembros referenciados · escribe 2+ caracteres para buscar en Discord`;
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      status.textContent = 'Buscando en el servidor…';
      try {
        const response = await fetch(`/api/member-directory?query=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const members = Array.isArray(payload?.members) ? payload.members : [];
        renderRemote(members);
        status.textContent = `${localCount} locales · ${members.length} resultados remotos`;
      } catch (error) {
        if (controller?.signal.aborted) return;
        results.replaceChildren();
        const failed = document.createElement('div');
        failed.className = 'member-picker-state';
        failed.textContent = 'No pudimos buscar miembros. Reintenta.';
        results.appendChild(failed);
        results.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        status.textContent = 'Directorio temporalmente no disponible';
      }
    }, SEARCH_DELAY_MS);
  };

  search.addEventListener('input', runSearch);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && remote.length) { event.preventDefault(); setActive(active + 1); }
    else if (event.key === 'ArrowUp' && remote.length) { event.preventDefault(); setActive(active - 1); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(remote[active]); }
    else if (event.key === 'Escape' || event.key === 'Tab') close();
  });
  list.addEventListener('change', () => applyLocalFilter(search.value.trim().toLowerCase()));
  status.textContent = `${localRows().length} miembros referenciados · escribe 2+ caracteres para buscar en Discord`;
}

function migrate(root = document) {
  root.querySelectorAll?.('.ev-members').forEach(enhancePlannerMemberList);
  if (root instanceof HTMLElement && root.matches('.ev-members')) enhancePlannerMemberList(root);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) if (node instanceof HTMLElement) migrate(node);
  }
});

function start() {
  migrate(document);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

let activeController = null;
let activeTimer = null;
let activeIndex = -1;
let currentResults = [];

function getElements() {
  const input = document.querySelector('#task-assignee-name-input');
  const hidden = document.querySelector('#task-assignee-id-input');
  const dropdown = document.querySelector('#discord-member-dropdown');
  return { input, hidden, dropdown };
}

function ensureA11y(input, dropdown) {
  if (!input || !dropdown) return;
  if (!dropdown.id) dropdown.id = 'discord-member-dropdown';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', dropdown.id);
  input.setAttribute('aria-expanded', dropdown.style.display !== 'none' ? 'true' : 'false');
  dropdown.setAttribute('role', 'listbox');
}

function setDropdownVisible(input, dropdown, visible) {
  if (!input || !dropdown) return;
  dropdown.style.display = visible ? 'flex' : 'none';
  input.setAttribute('aria-expanded', visible ? 'true' : 'false');
  if (!visible) input.removeAttribute('aria-activedescendant');
}

function clearDropdown(input, dropdown) {
  if (!dropdown) return;
  dropdown.replaceChildren();
  activeIndex = -1;
  currentResults = [];
  setDropdownVisible(input, dropdown, false);
}

function stateRow(message, { error = false } = {}) {
  const row = document.createElement('div');
  row.className = 'member-picker-state';
  row.setAttribute('role', 'status');
  row.style.cssText = 'padding:10px 12px;font-size:12px;text-align:center;color:var(--kb-text-dim);';
  if (error) row.style.color = 'var(--kb-danger)';
  row.textContent = message;
  return row;
}

function memberAvatar(member) {
  if (member.avatarUrl) {
    const image = document.createElement('img');
    image.src = member.avatarUrl;
    image.alt = '';
    image.width = 24;
    image.height = 24;
    image.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex:0 0 auto;';
    return image;
  }
  const fallback = document.createElement('span');
  fallback.className = 'member-avatar-mini';
  fallback.textContent = String(member.displayName || member.username || '?').trim().charAt(0).toUpperCase() || '?';
  return fallback;
}

function selectMember(member) {
  const { input, hidden, dropdown } = getElements();
  if (!input || !hidden || !dropdown) return;
  input.value = member.displayName || member.username || member.userId;
  hidden.value = member.userId;
  input.dispatchEvent(new CustomEvent('bardo:member-selected', { bubbles: true, detail: member }));
  clearDropdown(input, dropdown);
  input.focus();
}

function renderResults(input, dropdown, members) {
  dropdown.replaceChildren();
  currentResults = members;
  activeIndex = members.length ? 0 : -1;

  if (!members.length) {
    dropdown.appendChild(stateRow('No encontramos miembros que coincidan.'));
    setDropdownVisible(input, dropdown, true);
    return;
  }

  members.forEach((member, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'member-menu-item';
    button.id = `bardo-member-option-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
    button.dataset.remoteMemberIndex = String(index);

    const info = document.createElement('div');
    info.className = 'member-info-col';
    const name = document.createElement('span');
    name.className = 'member-name-text';
    name.textContent = member.displayName;
    info.appendChild(name);
    if (member.username) {
      const handle = document.createElement('span');
      handle.className = 'member-handle-text';
      handle.textContent = `@${member.username}`;
      info.appendChild(handle);
    }

    button.append(memberAvatar(member), info);
    if (member.roleLabel) {
      const role = document.createElement('span');
      role.className = 'member-role-badge';
      role.style.cssText = 'margin-left:auto;font-size:10px;padding:1px 6px;border-radius:999px;color:var(--kb-text-muted);background:var(--kb-surface-raised);';
      role.textContent = member.roleLabel;
      button.appendChild(role);
    }

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectMember(member);
    });
    dropdown.appendChild(button);
  });

  setDropdownVisible(input, dropdown, true);
  input.setAttribute('aria-activedescendant', `bardo-member-option-${activeIndex}`);
}

function updateActive(input, dropdown, nextIndex) {
  if (!currentResults.length) return;
  activeIndex = (nextIndex + currentResults.length) % currentResults.length;
  dropdown.querySelectorAll('[data-remote-member-index]').forEach((node, index) => {
    node.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
  });
  const active = dropdown.querySelector(`[data-remote-member-index="${activeIndex}"]`);
  active?.scrollIntoView({ block: 'nearest' });
  input.setAttribute('aria-activedescendant', `bardo-member-option-${activeIndex}`);
}

async function searchMembers(query, input, hidden, dropdown, signal) {
  dropdown.replaceChildren(stateRow('Buscando miembros…'));
  setDropdownVisible(input, dropdown, true);
  try {
    const response = await fetch(`/api/member-directory?query=${encodeURIComponent(query)}&limit=25`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (signal.aborted || input.value.trim().replace(/^@/, '') !== query) return;
    const members = Array.isArray(payload?.members) ? payload.members : [];
    renderResults(input, dropdown, members);
  } catch (error) {
    if (signal.aborted) return;
    console.error('No se pudo buscar miembros de Discord:', error);
    hidden.value = '';
    dropdown.replaceChildren(stateRow('No pudimos buscar miembros. Intenta otra vez.', { error: true }));
    setDropdownVisible(input, dropdown, true);
  }
}

function scheduleSearch(rawValue) {
  const { input, hidden, dropdown } = getElements();
  if (!input || !hidden || !dropdown) return;
  ensureA11y(input, dropdown);

  const query = String(rawValue || '').trim().replace(/^@/, '');
  hidden.value = '';
  if (activeTimer) window.clearTimeout(activeTimer);
  activeController?.abort();
  activeController = null;

  if (query.length < MIN_QUERY_LENGTH) {
    dropdown.replaceChildren(stateRow(query ? 'Escribe al menos 2 caracteres.' : 'Escribe un nombre para buscar.'));
    setDropdownVisible(input, dropdown, Boolean(query));
    currentResults = [];
    activeIndex = -1;
    return;
  }

  activeTimer = window.setTimeout(() => {
    activeController = new AbortController();
    searchMembers(query, input, hidden, dropdown, activeController.signal).catch((error) => {
      if (!activeController?.signal.aborted) console.error('Error inesperado en MemberPicker:', error);
    });
  }, DEBOUNCE_MS);
}

function isTaskAssigneeInput(target) {
  return target instanceof HTMLInputElement && target.id === 'task-assignee-name-input';
}

document.addEventListener('input', (event) => {
  if (!isTaskAssigneeInput(event.target)) return;
  event.stopImmediatePropagation();
  scheduleSearch(event.target.value);
}, true);

document.addEventListener('focusin', (event) => {
  if (!isTaskAssigneeInput(event.target)) return;
  const { dropdown } = getElements();
  if (!dropdown) return;
  ensureA11y(event.target, dropdown);
  if (event.target.value.trim()) scheduleSearch(event.target.value);
}, true);

document.addEventListener('keydown', (event) => {
  if (!isTaskAssigneeInput(event.target)) return;
  const { input, dropdown } = getElements();
  if (!input || !dropdown) return;
  if (event.key === 'ArrowDown' && currentResults.length) {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateActive(input, dropdown, activeIndex + 1);
  } else if (event.key === 'ArrowUp' && currentResults.length) {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateActive(input, dropdown, activeIndex - 1);
  } else if (event.key === 'Enter' && activeIndex >= 0 && currentResults[activeIndex]) {
    event.preventDefault();
    event.stopImmediatePropagation();
    selectMember(currentResults[activeIndex]);
  } else if (event.key === 'Escape') {
    event.stopImmediatePropagation();
    clearDropdown(input, dropdown);
  } else if (event.key === 'Tab') {
    clearDropdown(input, dropdown);
  }
}, true);

document.addEventListener('mousedown', (event) => {
  const { input, dropdown } = getElements();
  if (!input || !dropdown || dropdown.style.display === 'none') return;
  if (input.contains(event.target) || dropdown.contains(event.target)) return;
  clearDropdown(input, dropdown);
}, true);

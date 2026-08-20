import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { normalizeDocumentId } from '../document-id.js';

const SAVE_DEBOUNCE_MS = 1400;
const bodyEl = document.querySelector('#document-body');
const titleEl = document.querySelector('#document-title');
const documentEl = document.querySelector('#document');
const actionGroupEl = document.querySelector('.action-group-right');

let editorContext = null;
let isEditing = false;
let saveTimer = null;
let savePromise = null;
let lastSavedSnapshot = '';
let slashItems = [];
let slashIndex = 0;
let slashBlock = null;
let savedSelectionRange = null;

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});
turndown.use(gfm);
turndown.addRule('underline', {
  filter: ['u'],
  replacement(content) {
    return `<u>${content}</u>`;
  },
});

function createButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function currentInstanceId() {
  return new URLSearchParams(window.location.search).get('instance_id')?.trim() || null;
}

async function resolveDocumentId(instanceId) {
  const params = new URLSearchParams(window.location.search);
  for (const value of [params.get('custom_id'), params.get('document'), params.get('id')]) {
    const normalized = normalizeDocumentId(value);
    if (normalized) return normalized;
  }

  if (!instanceId) return null;
  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = await response.json();
  return normalizeDocumentId(data?.documentId);
}

function waitForRenderedDocument(timeoutMs = 12000) {
  if (documentEl && !documentEl.hidden && bodyEl && titleEl) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      if (documentEl && !documentEl.hidden && bodyEl && titleEl) {
        observer.disconnect();
        resolve(true);
      } else if (Date.now() - startedAt > timeoutMs) {
        observer.disconnect();
        resolve(false);
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(Boolean(documentEl && !documentEl.hidden && bodyEl && titleEl));
    }, timeoutMs);
  });
}

function apiHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-bardo-instance-id': editorContext.instanceId,
  };
}

function normalizeTitle() {
  return (titleEl?.innerText || 'Documento').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Documento';
}

function serializeDocument() {
  const title = normalizeTitle();
  const bodyMarkdown = turndown.turndown(bodyEl?.innerHTML || '').trim();
  const markdown = `# ${title}${bodyMarkdown ? `\n\n${bodyMarkdown}` : ''}`;
  return { title, markdown, snapshot: JSON.stringify([title, markdown]) };
}

function setSaveStatus(text, state = '') {
  if (!editorContext?.statusEl) return;
  editorContext.statusEl.textContent = text;
  editorContext.statusEl.dataset.state = state;
}

function scheduleSave() {
  if (!isEditing) return;
  window.clearTimeout(saveTimer);
  const { snapshot } = serializeDocument();
  if (snapshot === lastSavedSnapshot) {
    setSaveStatus('Saved', 'saved');
    return;
  }
  setSaveStatus('Unsaved', 'dirty');
  saveTimer = window.setTimeout(() => {
    flushSave().catch((error) => console.error('Bardo autosave failed:', error));
  }, SAVE_DEBOUNCE_MS);
}

async function flushSave({ keepalive = false } = {}) {
  if (!editorContext || !isEditing) return true;
  window.clearTimeout(saveTimer);
  const payload = serializeDocument();
  if (payload.snapshot === lastSavedSnapshot) {
    setSaveStatus('Saved', 'saved');
    return true;
  }

  if (savePromise) await savePromise;
  setSaveStatus('Saving…', 'saving');

  savePromise = fetch(`/api/documents/${encodeURIComponent(editorContext.documentId)}`, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify({ title: payload.title, markdown: payload.markdown }),
    keepalive,
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      lastSavedSnapshot = payload.snapshot;
      setSaveStatus('Saved', 'saved');
      return true;
    })
    .catch((error) => {
      console.error('No se pudo guardar el documento:', error);
      setSaveStatus('Couldn’t save', 'error');
      return false;
    })
    .finally(() => {
      savePromise = null;
    });

  return savePromise;
}

function selectionInsideEditor(selection = window.getSelection()) {
  if (!selection || selection.rangeCount === 0) return false;
  const node = selection.anchorNode;
  return Boolean(node && (bodyEl?.contains(node) || titleEl?.contains(node)));
}

function saveCurrentRange() {
  const selection = window.getSelection();
  if (!selectionInsideEditor(selection) || selection.rangeCount === 0) return null;
  savedSelectionRange = selection.getRangeAt(0).cloneRange();
  return savedSelectionRange;
}

function restoreSavedRange() {
  if (!savedSelectionRange) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedSelectionRange);
  return true;
}

function runCommand(command, value = null) {
  restoreSavedRange();
  document.execCommand(command, false, value);
  bodyEl?.focus();
  scheduleSave();
  updateToolbarState();
}

function wrapInlineCode() {
  if (!restoreSavedRange()) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const code = document.createElement('code');
  code.appendChild(range.extractContents());
  range.insertNode(code);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(code);
  selection.addRange(nextRange);
  savedSelectionRange = nextRange.cloneRange();
  scheduleSave();
}

function selectionBlock() {
  const selection = window.getSelection();
  if (!selectionInsideEditor(selection)) return null;
  const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  return element?.closest('p,h1,h2,h3,h4,blockquote,li,pre') || null;
}

function updateToolbarState() {
  const toolbar = editorContext?.toolbarEl;
  if (!toolbar) return;
  toolbar.querySelector('[data-command="bold"]')?.classList.toggle('is-active', document.queryCommandState('bold'));
  toolbar.querySelector('[data-command="italic"]')?.classList.toggle('is-active', document.queryCommandState('italic'));
  toolbar.querySelector('[data-command="underline"]')?.classList.toggle('is-active', document.queryCommandState('underline'));
  toolbar.querySelector('[data-command="strikeThrough"]')?.classList.toggle('is-active', document.queryCommandState('strikeThrough'));

  const block = selectionBlock();
  const select = toolbar.querySelector('[data-block-select]');
  if (select && block) {
    const tag = block.tagName.toLowerCase();
    select.value = ['h2', 'h3', 'h4'].includes(tag) ? tag : 'p';
  }
}

function positionFloatingElement(element, rect, offset = 10) {
  const width = element.offsetWidth || 300;
  const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + rect.width / 2 - width / 2));
  const preferredTop = rect.top - element.offsetHeight - offset;
  const top = preferredTop > 8 ? preferredTop : rect.bottom + offset;
  element.style.left = `${left}px`;
  element.style.top = `${Math.max(8, top)}px`;
}

function updateSelectionToolbar() {
  if (!isEditing || !editorContext?.toolbarEl) return;
  const selection = window.getSelection();
  if (!selectionInsideEditor(selection) || selection.isCollapsed || selection.rangeCount === 0) {
    editorContext.toolbarEl.hidden = true;
    editorContext.linkPopoverEl.hidden = true;
    return;
  }

  saveCurrentRange();
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  editorContext.toolbarEl.hidden = false;
  updateToolbarState();
  requestAnimationFrame(() => positionFloatingElement(editorContext.toolbarEl, rect));
}

function showLinkPopover() {
  saveCurrentRange();
  const toolbar = editorContext?.toolbarEl;
  const popover = editorContext?.linkPopoverEl;
  if (!toolbar || !popover || toolbar.hidden) return;
  const rect = toolbar.getBoundingClientRect();
  popover.hidden = false;
  popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 330, rect.left))}px`;
  popover.style.top = `${Math.min(window.innerHeight - 70, rect.bottom + 8)}px`;
  const input = popover.querySelector('input');
  input.value = '';
  input.focus();
}

function applyLink() {
  const input = editorContext?.linkPopoverEl?.querySelector('input');
  if (!input) return;
  let url = input.value.trim();
  if (!url) return;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) url = `https://${url}`;
  runCommand('createLink', url);
  editorContext.linkPopoverEl.hidden = true;
}

const BLOCK_COMMANDS = [
  { label: 'Text', hint: 'Plain paragraph', tag: 'p' },
  { label: 'Heading 1', hint: 'Large section heading', tag: 'h2' },
  { label: 'Heading 2', hint: 'Medium section heading', tag: 'h3' },
  { label: 'Heading 3', hint: 'Small section heading', tag: 'h4' },
  { label: 'Bulleted list', hint: 'Create a simple list', command: 'insertUnorderedList' },
  { label: 'Numbered list', hint: 'Create an ordered list', command: 'insertOrderedList' },
  { label: 'Quote', hint: 'Highlight a quotation', tag: 'blockquote' },
  { label: 'Divider', hint: 'Separate sections', command: 'divider' },
];

function replaceBlockTag(block, tagName) {
  if (!block || block.tagName.toLowerCase() === tagName) return block;
  const replacement = document.createElement(tagName);
  replacement.innerHTML = block.innerHTML || '<br>';
  block.replaceWith(replacement);
  return replacement;
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  savedSelectionRange = range.cloneRange();
  element.focus?.();
}

function applyBlockCommand(item, block = selectionBlock()) {
  if (!block) return;
  if (slashBlock === block) block.textContent = '';

  if (item.command === 'divider') {
    const hr = document.createElement('hr');
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<br>';
    block.replaceWith(hr, paragraph);
    placeCaretAtEnd(paragraph);
  } else if (item.command) {
    const paragraph = replaceBlockTag(block, 'p');
    placeCaretAtEnd(paragraph);
    document.execCommand(item.command, false);
  } else if (item.tag) {
    const replacement = replaceBlockTag(block, item.tag);
    placeCaretAtEnd(replacement);
  }

  hideSlashMenu();
  scheduleSave();
}

function slashQueryForCurrentBlock() {
  const block = selectionBlock();
  if (!block || !bodyEl?.contains(block)) return null;
  const text = (block.textContent || '').trim();
  if (!text.startsWith('/') || /\s/.test(text.slice(1))) return null;
  return { block, query: text.slice(1).toLowerCase() };
}

function renderSlashMenu(items) {
  const menu = editorContext?.slashMenuEl;
  if (!menu) return;
  menu.innerHTML = '';
  slashItems = items;
  slashIndex = Math.min(slashIndex, Math.max(0, items.length - 1));

  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `bardo-slash-item${index === slashIndex ? ' is-active' : ''}`;
    button.innerHTML = `<span>${item.label}</span><small>${item.hint}</small>`;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => applyBlockCommand(item, slashBlock));
    menu.appendChild(button);
  });
}

function updateSlashMenu() {
  if (!isEditing) return;
  const state = slashQueryForCurrentBlock();
  if (!state) {
    hideSlashMenu();
    return;
  }

  slashBlock = state.block;
  const items = BLOCK_COMMANDS.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(state.query));
  if (!items.length) {
    hideSlashMenu();
    return;
  }

  slashIndex = 0;
  renderSlashMenu(items);
  const selection = window.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : slashBlock.getBoundingClientRect();
  editorContext.slashMenuEl.hidden = false;
  requestAnimationFrame(() => {
    const menu = editorContext.slashMenuEl;
    const width = menu.offsetWidth || 300;
    menu.style.left = `${Math.max(10, Math.min(window.innerWidth - width - 10, rect.left))}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 8)}px`;
  });
}

function hideSlashMenu() {
  if (editorContext?.slashMenuEl) editorContext.slashMenuEl.hidden = true;
  slashBlock = null;
  slashItems = [];
  slashIndex = 0;
}

function handleEditorKeydown(event) {
  const menu = editorContext?.slashMenuEl;
  if (menu && !menu.hidden && slashItems.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      slashIndex = (slashIndex + (event.key === 'ArrowDown' ? 1 : -1) + slashItems.length) % slashItems.length;
      renderSlashMenu(slashItems);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      applyBlockCommand(slashItems[slashIndex], slashBlock);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'k') {
    const selection = window.getSelection();
    if (selectionInsideEditor(selection) && !selection.isCollapsed) {
      event.preventDefault();
      showLinkPopover();
    }
  }
}

function createFloatingToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'bardo-editor-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting');

  const select = document.createElement('select');
  select.className = 'bardo-editor-select';
  select.dataset.blockSelect = 'true';
  for (const [value, label] of [['p', 'Text'], ['h2', 'H1'], ['h3', 'H2'], ['h4', 'H3']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.addEventListener('mousedown', saveCurrentRange);
  select.addEventListener('change', () => {
    const block = selectionBlock();
    if (block) {
      const replacement = replaceBlockTag(block, select.value);
      placeCaretAtEnd(replacement);
      scheduleSave();
    }
  });
  toolbar.appendChild(select);

  const commands = [
    ['B', 'bold', 'Bold'],
    ['I', 'italic', 'Italic'],
    ['U', 'underline', 'Underline'],
    ['S', 'strikeThrough', 'Strikethrough'],
  ];
  for (const [label, command, aria] of commands) {
    const button = createButton(label, 'bardo-editor-tool');
    button.dataset.command = command;
    button.setAttribute('aria-label', aria);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      saveCurrentRange();
    });
    button.addEventListener('click', () => runCommand(command));
    toolbar.appendChild(button);
  }

  const linkButton = createButton('Link', 'bardo-editor-tool bardo-editor-tool-wide');
  linkButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
    saveCurrentRange();
  });
  linkButton.addEventListener('click', showLinkPopover);
  toolbar.appendChild(linkButton);

  const codeButton = createButton('</>', 'bardo-editor-tool');
  codeButton.setAttribute('aria-label', 'Inline code');
  codeButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
    saveCurrentRange();
  });
  codeButton.addEventListener('click', wrapInlineCode);
  toolbar.appendChild(codeButton);

  document.body.appendChild(toolbar);
  return toolbar;
}

function createLinkPopover() {
  const popover = document.createElement('form');
  popover.className = 'bardo-link-popover';
  popover.hidden = true;
  popover.innerHTML = '<input type="url" inputmode="url" placeholder="Paste a link…" aria-label="Link URL"><button type="submit">Apply</button>';
  popover.addEventListener('submit', (event) => {
    event.preventDefault();
    applyLink();
  });
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') popover.hidden = true;
  });
  document.body.appendChild(popover);
  return popover;
}

function createSlashMenu() {
  const menu = document.createElement('div');
  menu.className = 'bardo-slash-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  return menu;
}

function setEditingState(enabled) {
  isEditing = enabled;
  document.documentElement.classList.toggle('bardo-is-editing', enabled);
  titleEl.contentEditable = enabled ? 'true' : 'false';
  bodyEl.contentEditable = enabled ? 'true' : 'false';
  titleEl.spellcheck = enabled;
  bodyEl.spellcheck = enabled;
  titleEl.setAttribute('aria-label', enabled ? 'Editable document title' : 'Document title');
  bodyEl.setAttribute('aria-label', enabled ? 'Editable document content' : 'Document content');

  if (enabled) {
    editorContext.editButton.textContent = 'Done';
    editorContext.editButton.classList.add('is-editing');
    setSaveStatus('Saved', 'saved');
    lastSavedSnapshot = serializeDocument().snapshot;
    bodyEl.focus();
  } else {
    editorContext.editButton.textContent = 'Edit';
    editorContext.editButton.classList.remove('is-editing');
    editorContext.toolbarEl.hidden = true;
    editorContext.linkPopoverEl.hidden = true;
    hideSlashMenu();
    setSaveStatus('', '');
  }
}

async function finishEditing() {
  const saved = await flushSave();
  if (!saved) return;

  setSaveStatus('Finishing…', 'saving');
  const response = await fetch(`/api/documents/${encodeURIComponent(editorContext.documentId)}/finish`, {
    method: 'POST',
    headers: apiHeaders(),
    body: '{}',
  }).catch(() => null);

  setEditingState(false);
  if (response?.ok) {
    const result = await response.json().catch(() => ({}));
    if (result.synced === false) {
      const actionStatus = document.querySelector('#action-status');
      if (actionStatus) {
        actionStatus.textContent = 'Saved';
        window.setTimeout(() => { actionStatus.textContent = ''; }, 1800);
      }
    }
  }
}

function attachEditorEvents() {
  const inputHandler = () => {
    scheduleSave();
    updateSlashMenu();
  };
  titleEl.addEventListener('input', scheduleSave);
  bodyEl.addEventListener('input', inputHandler);
  titleEl.addEventListener('keydown', handleEditorKeydown);
  bodyEl.addEventListener('keydown', handleEditorKeydown);

  document.addEventListener('selectionchange', () => requestAnimationFrame(updateSelectionToolbar));
  window.addEventListener('resize', updateSelectionToolbar);
  document.querySelector('.shell')?.addEventListener('scroll', updateSelectionToolbar, { passive: true });

  document.addEventListener('pointerdown', (event) => {
    if (!editorContext?.toolbarEl?.contains(event.target) && !editorContext?.linkPopoverEl?.contains(event.target)) {
      if (!selectionInsideEditor()) editorContext.toolbarEl.hidden = true;
    }
    if (!editorContext?.slashMenuEl?.contains(event.target) && !bodyEl?.contains(event.target)) hideSlashMenu();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isEditing) flushSave({ keepalive: true });
  });
  window.addEventListener('pagehide', () => {
    if (isEditing) flushSave({ keepalive: true });
  });
}

async function initializeEditor() {
  if (!bodyEl || !titleEl || !documentEl || !actionGroupEl) return;
  const ready = await waitForRenderedDocument();
  if (!ready) return;

  const instanceId = currentInstanceId();
  if (!instanceId) return;
  const documentId = await resolveDocumentId(instanceId);
  if (!documentId) return;

  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    headers: {
      Accept: 'application/json',
      'x-bardo-instance-id': instanceId,
    },
    cache: 'no-store',
  });
  if (!response.ok) return;
  const data = await response.json();
  if (!data?.canEdit || data.importStatus !== 'ready') return;

  const statusEl = document.createElement('span');
  statusEl.className = 'bardo-save-status';
  statusEl.setAttribute('aria-live', 'polite');

  const editButton = createButton('Edit', 'action-button bardo-edit-button');
  const toolbarEl = createFloatingToolbar();
  const linkPopoverEl = createLinkPopover();
  const slashMenuEl = createSlashMenu();

  editorContext = {
    instanceId,
    documentId,
    editButton,
    statusEl,
    toolbarEl,
    linkPopoverEl,
    slashMenuEl,
  };

  actionGroupEl.insertBefore(statusEl, actionGroupEl.querySelector('#copy-document'));
  actionGroupEl.insertBefore(editButton, actionGroupEl.querySelector('#copy-document'));

  editButton.addEventListener('click', async () => {
    if (isEditing) await finishEditing();
    else setEditingState(true);
  });

  attachEditorEvents();
}

initializeEditor().catch((error) => console.error('No se pudo iniciar el editor de Bardo:', error));

import { DiscordSDK } from '@discord/embedded-app-sdk';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { normalizeDocumentId } from '../document-id.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const SAVE_DEBOUNCE_MS = 1400;
const bodyEl = document.querySelector('#document-body');
const titleEl = document.querySelector('#document-title');
const documentEl = document.querySelector('#document');
const actionGroupEl = document.querySelector('.action-group-right');
const shellEl = document.querySelector('.shell');

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
  replacement: (content) => `<u>${content}</u>`,
});

let context = null;
let editing = false;
let saveTimer = null;
let saveInFlight = null;
let lastSaved = '';
let savedRange = null;
let slashBlock = null;
let slashItems = [];
let slashIndex = 0;

const BLOCKS = [
  { label: 'Text', hint: 'Plain paragraph', tag: 'p' },
  { label: 'Heading 1', hint: 'Large section heading', tag: 'h2' },
  { label: 'Heading 2', hint: 'Medium section heading', tag: 'h3' },
  { label: 'Heading 3', hint: 'Small section heading', tag: 'h4' },
  { label: 'Bulleted list', hint: 'Create a simple list', command: 'insertUnorderedList' },
  { label: 'Numbered list', hint: 'Create an ordered list', command: 'insertOrderedList' },
  { label: 'Quote', hint: 'Highlight a quotation', tag: 'blockquote' },
  { label: 'Divider', hint: 'Separate sections', command: 'divider' },
];

function button(label, className = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  return el;
}

function resolveClientId() {
  const match = (window.location.hostname || '').match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

async function resolveInstanceId() {
  const params = new URLSearchParams(window.location.search);
  const queryId = params.get('instance_id')?.trim();
  if (queryId) return queryId;

  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    return sdk.instanceId || null;
  } catch (error) {
    console.warn('Bardo editor could not resolve Activity instance:', error);
    return null;
  }
}

async function resolveDocumentId(instanceId) {
  const params = new URLSearchParams(window.location.search);
  for (const value of [params.get('custom_id'), params.get('document'), params.get('id')]) {
    const id = normalizeDocumentId(value);
    if (id) return id;
  }
  if (!instanceId) return null;

  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return normalizeDocumentId((await response.json())?.documentId);
}

function waitForDocument(timeout = 12000) {
  if (documentEl && !documentEl.hidden && bodyEl && titleEl) return Promise.resolve(true);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (documentEl && !documentEl.hidden && bodyEl && titleEl) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(Boolean(documentEl && !documentEl.hidden && bodyEl && titleEl));
    }, timeout);
  });
}

function headers() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-bardo-instance-id': context.instanceId,
  };
}

function serialize() {
  const title = (titleEl.innerText || 'Documento').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Documento';
  const body = turndown.turndown(bodyEl.innerHTML).trim();
  const markdown = `# ${title}${body ? `\n\n${body}` : ''}`;
  return { title, markdown, signature: JSON.stringify([title, markdown]) };
}

function setStatus(text, state = '') {
  if (!context?.status) return;
  context.status.textContent = text;
  context.status.dataset.state = state;
}

function scheduleSave() {
  if (!editing) return;
  window.clearTimeout(saveTimer);
  const current = serialize();
  if (current.signature === lastSaved) {
    setStatus('Saved', 'saved');
    return;
  }
  setStatus('Unsaved', 'dirty');
  saveTimer = window.setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
}

async function flushSave({ keepalive = false } = {}) {
  if (!editing || !context) return true;
  window.clearTimeout(saveTimer);
  if (saveInFlight) await saveInFlight;

  const payload = serialize();
  if (payload.signature === lastSaved) {
    setStatus('Saved', 'saved');
    return true;
  }

  setStatus('Saving…', 'saving');
  saveInFlight = fetch(`/api/documents/${encodeURIComponent(context.documentId)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ title: payload.title, markdown: payload.markdown }),
    keepalive,
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      lastSaved = payload.signature;
      setStatus('Saved', 'saved');
      return true;
    })
    .catch((error) => {
      console.error('Bardo autosave failed:', error);
      setStatus('Couldn’t save', 'error');
      return false;
    })
    .finally(() => { saveInFlight = null; });

  return saveInFlight;
}

function selectionInBody(selection = window.getSelection()) {
  return Boolean(selection?.rangeCount && selection.anchorNode && bodyEl.contains(selection.anchorNode));
}

function rememberRange() {
  const selection = window.getSelection();
  if (!selectionInBody(selection)) return false;
  savedRange = selection.getRangeAt(0).cloneRange();
  return true;
}

function restoreRange() {
  if (!savedRange) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  return true;
}

function currentBlock() {
  const selection = window.getSelection();
  if (!selectionInBody(selection)) return null;
  const node = selection.anchorNode.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode.parentElement;
  return node?.closest('p,div,h1,h2,h3,h4,blockquote,li,pre') || null;
}

function replaceTag(block, tagName) {
  if (!block || block.tagName.toLowerCase() === tagName) return block;
  const next = document.createElement(tagName);
  next.innerHTML = block.innerHTML || '<br>';
  block.replaceWith(next);
  return next;
}

function placeCaret(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
}

function exec(command, value = null) {
  restoreRange();
  document.execCommand(command, false, value);
  rememberRange();
  scheduleSave();
  updateToolbarState();
}

function wrapCode() {
  if (!restoreRange()) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const code = document.createElement('code');
  code.appendChild(range.extractContents());
  range.insertNode(code);
  const next = document.createRange();
  next.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(next);
  savedRange = next.cloneRange();
  scheduleSave();
}

function position(el, rect, above = true) {
  const width = el.offsetWidth || 300;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
  const topAbove = rect.top - el.offsetHeight - 10;
  const top = above && topAbove > 8 ? topAbove : rect.bottom + 8;
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, top))}px`;
}

function updateToolbarState() {
  if (!context?.toolbar) return;
  for (const command of ['bold', 'italic', 'underline', 'strikeThrough']) {
    context.toolbar.querySelector(`[data-command="${command}"]`)?.classList.toggle('is-active', document.queryCommandState(command));
  }
  const block = currentBlock();
  if (block) {
    const tag = block.tagName.toLowerCase();
    context.blockSelect.value = ['h2', 'h3', 'h4'].includes(tag) ? tag : 'p';
  }
}

function updateToolbar() {
  if (!editing || !context) return;
  const selection = window.getSelection();
  if (!selectionInBody(selection) || selection.isCollapsed) {
    context.toolbar.hidden = true;
    context.link.hidden = true;
    return;
  }
  rememberRange();
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  context.toolbar.hidden = false;
  updateToolbarState();
  requestAnimationFrame(() => position(context.toolbar, rect));
}

function applyLink() {
  let href = context.linkInput.value.trim();
  if (!href) return;
  if (!/^(https?:\/\/|mailto:)/i.test(href)) href = `https://${href}`;
  exec('createLink', href);
  context.link.hidden = true;
}

function openLink() {
  rememberRange();
  const rect = context.toolbar.getBoundingClientRect();
  context.link.hidden = false;
  context.linkInput.value = '';
  requestAnimationFrame(() => {
    context.link.style.left = `${Math.max(8, Math.min(window.innerWidth - 328, rect.left))}px`;
    context.link.style.top = `${Math.min(window.innerHeight - 60, rect.bottom + 8)}px`;
    context.linkInput.focus();
  });
}

function hideSlash() {
  if (context?.slash) context.slash.hidden = true;
  slashBlock = null;
  slashItems = [];
  slashIndex = 0;
}

function applyBlock(item, block = currentBlock()) {
  if (!block) return;
  if (block === slashBlock) block.textContent = '';

  if (item.command === 'divider') {
    const hr = document.createElement('hr');
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    block.replaceWith(hr, p);
    placeCaret(p);
  } else if (item.command) {
    const p = replaceTag(block, 'p');
    placeCaret(p);
    document.execCommand(item.command, false);
  } else {
    const next = replaceTag(block, item.tag);
    placeCaret(next);
  }
  hideSlash();
  scheduleSave();
}

function renderSlash(items) {
  context.slash.innerHTML = '';
  slashItems = items;
  slashIndex = Math.min(slashIndex, Math.max(0, items.length - 1));
  items.forEach((item, index) => {
    const el = button('', `bardo-slash-item${index === slashIndex ? ' is-active' : ''}`);
    el.innerHTML = `<span>${item.label}</span><small>${item.hint}</small>`;
    el.addEventListener('mousedown', (event) => event.preventDefault());
    el.addEventListener('click', () => applyBlock(item, slashBlock));
    context.slash.appendChild(el);
  });
}

function updateSlash() {
  if (!editing) return;
  const block = currentBlock();
  if (!block || !bodyEl.contains(block)) return hideSlash();
  const text = (block.textContent || '').trim();
  if (!text.startsWith('/') || /\s/.test(text.slice(1))) return hideSlash();

  slashBlock = block;
  const query = text.slice(1).toLowerCase();
  const items = BLOCKS.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query));
  if (!items.length) return hideSlash();

  slashIndex = 0;
  renderSlash(items);
  const selection = window.getSelection();
  const rect = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : block.getBoundingClientRect();
  context.slash.hidden = false;
  requestAnimationFrame(() => position(context.slash, rect, false));
}

function editorKeydown(event) {
  if (!editing) return;
  if (!context.slash.hidden && slashItems.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      slashIndex = (slashIndex + (event.key === 'ArrowDown' ? 1 : -1) + slashItems.length) % slashItems.length;
      renderSlash(slashItems);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      applyBlock(slashItems[slashIndex], slashBlock);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideSlash();
      return;
    }
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    const selection = window.getSelection();
    if (selectionInBody(selection) && !selection.isCollapsed) {
      event.preventDefault();
      openLink();
    }
  }
}

function buildUi() {
  const status = document.createElement('span');
  status.className = 'bardo-save-status';
  status.setAttribute('aria-live', 'polite');

  const edit = button('Edit', 'action-button bardo-edit-button');
  const toolbar = document.createElement('div');
  toolbar.className = 'bardo-editor-toolbar';
  toolbar.hidden = true;

  const blockSelect = document.createElement('select');
  blockSelect.className = 'bardo-editor-select';
  for (const [value, label] of [['p', 'Text'], ['h2', 'H1'], ['h3', 'H2'], ['h4', 'H3']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    blockSelect.appendChild(option);
  }
  blockSelect.addEventListener('mousedown', rememberRange);
  blockSelect.addEventListener('change', () => {
    restoreRange();
    const block = currentBlock();
    if (!block) return;
    const next = replaceTag(block, blockSelect.value);
    placeCaret(next);
    scheduleSave();
  });
  toolbar.appendChild(blockSelect);

  for (const [label, command, aria] of [
    ['B', 'bold', 'Bold'], ['I', 'italic', 'Italic'], ['U', 'underline', 'Underline'], ['S', 'strikeThrough', 'Strikethrough'],
  ]) {
    const el = button(label, 'bardo-editor-tool');
    el.dataset.command = command;
    el.setAttribute('aria-label', aria);
    el.addEventListener('mousedown', (event) => { event.preventDefault(); rememberRange(); });
    el.addEventListener('click', () => exec(command));
    toolbar.appendChild(el);
  }

  const linkButton = button('Link', 'bardo-editor-tool bardo-editor-tool-wide');
  linkButton.addEventListener('mousedown', (event) => { event.preventDefault(); rememberRange(); });
  linkButton.addEventListener('click', openLink);
  toolbar.appendChild(linkButton);

  const codeButton = button('</>', 'bardo-editor-tool');
  codeButton.setAttribute('aria-label', 'Inline code');
  codeButton.addEventListener('mousedown', (event) => { event.preventDefault(); rememberRange(); });
  codeButton.addEventListener('click', wrapCode);
  toolbar.appendChild(codeButton);

  const link = document.createElement('form');
  link.className = 'bardo-link-popover';
  link.hidden = true;
  link.innerHTML = '<input type="url" inputmode="url" placeholder="Paste a link…" aria-label="Link URL"><button type="submit">Apply</button>';
  const linkInput = link.querySelector('input');
  link.addEventListener('submit', (event) => { event.preventDefault(); applyLink(); });
  link.addEventListener('keydown', (event) => { if (event.key === 'Escape') link.hidden = true; });

  const slash = document.createElement('div');
  slash.className = 'bardo-slash-menu';
  slash.hidden = true;

  document.body.append(toolbar, link, slash);
  const copy = actionGroupEl.querySelector('#copy-document');
  actionGroupEl.insertBefore(status, copy);
  actionGroupEl.insertBefore(edit, copy);

  return { status, edit, toolbar, blockSelect, link, linkInput, slash };
}

function setEditing(enabled) {
  editing = enabled;
  document.documentElement.classList.toggle('bardo-is-editing', enabled);
  titleEl.contentEditable = enabled ? 'true' : 'false';
  bodyEl.contentEditable = enabled ? 'true' : 'false';
  titleEl.spellcheck = enabled;
  bodyEl.spellcheck = enabled;

  if (enabled) {
    context.edit.textContent = 'Done';
    context.edit.classList.add('is-editing');
    lastSaved = serialize().signature;
    setStatus('Saved', 'saved');
    bodyEl.focus();
  } else {
    context.edit.textContent = 'Edit';
    context.edit.classList.remove('is-editing');
    context.toolbar.hidden = true;
    context.link.hidden = true;
    hideSlash();
    setStatus('', '');
  }
}

async function done() {
  if (!(await flushSave())) return;
  setStatus('Finishing…', 'saving');
  await fetch(`/api/documents/${encodeURIComponent(context.documentId)}/finish`, {
    method: 'POST',
    headers: headers(),
    body: '{}',
  }).catch((error) => console.warn('Bardo preview sync failed:', error));
  setEditing(false);
}

function bindEvents() {
  titleEl.addEventListener('input', scheduleSave);
  bodyEl.addEventListener('input', () => { scheduleSave(); updateSlash(); });
  bodyEl.addEventListener('keydown', editorKeydown);
  titleEl.addEventListener('keydown', editorKeydown);
  document.addEventListener('selectionchange', () => requestAnimationFrame(updateToolbar));
  shellEl?.addEventListener('scroll', () => requestAnimationFrame(updateToolbar), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(updateToolbar));

  document.addEventListener('pointerdown', (event) => {
    if (!context.slash.contains(event.target) && !bodyEl.contains(event.target)) hideSlash();
  });
  document.addEventListener('visibilitychange', () => {
    if (editing && document.visibilityState === 'hidden') void flushSave({ keepalive: true });
  });
  window.addEventListener('pagehide', () => {
    if (editing) void flushSave({ keepalive: true });
  });
}

async function init() {
  if (!bodyEl || !titleEl || !documentEl || !actionGroupEl) return;
  if (!(await waitForDocument())) return;

  const instanceId = await resolveInstanceId();
  if (!instanceId) return;
  const documentId = await resolveDocumentId(instanceId);
  if (!documentId) return;

  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    headers: { Accept: 'application/json', 'x-bardo-instance-id': instanceId },
    cache: 'no-store',
  });
  if (!response.ok) return;
  const data = await response.json();
  if (!data?.canEdit || data.importStatus !== 'ready') return;

  context = { instanceId, documentId, ...buildUi() };
  context.edit.addEventListener('click', () => editing ? void done() : setEditing(true));
  bindEvents();
}

init().catch((error) => console.error('Bardo editor failed to initialize:', error));

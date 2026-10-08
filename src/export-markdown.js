// Markdown → simple document model used by the PDF and DOCX exporters.
//
// It understands the dialect Bardo's editor writes (activity-app/src/editor/
// bardo-markdown.js) and what the PDF/DOCX importer produces: CommonMark-style
// backslash escapes, **bold**, *italic*, ~~strike~~, `code`, <u>, <kbd>, <br>,
// [links](url), task lists, ordered lists with their start number, nested
// lists, tables, quotes, callouts (> [!NOTE]), <details>, fenced code and
// horizontal rules. The exporters never print markdown syntax verbatim.

// Characters that CommonMark allows to be backslash-escaped.
const ESCAPABLE = new Set('\\`*_{}[]()#+-.!|>~<"\'$%&,/:;=?@^'.split(''));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': '\u00A0' };

export function decodeBasicEntities(text) {
  return String(text ?? '').replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, entity => ENTITIES[entity] ?? entity);
}

/** Removes markdown backslash escapes (`\_` → `_`, `\[x\]` → `[x]`). */
export function unescapeMarkdown(text) {
  return String(text ?? '').replace(/\\(.)/g, (match, char) => (ESCAPABLE.has(char) ? char : match));
}

// ---------------------------------------------------------------------------
// Inline

const SAFE_LINK_RE = /^(?:https?:|mailto:|tel:)/i;

function isAlnum(char) {
  return Boolean(char) && /[\p{L}\p{N}]/u.test(char);
}

function isSpace(char) {
  return !char || /\s/.test(char);
}

/** Index of the closing delimiter for an emphasis run starting at `start`. */
function findClosing(text, start, delim) {
  const single = delim.length === 1;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') { index += 2; continue; }
    if (char === '`') {
      const run = text.slice(index).match(/^`+/)[0];
      const close = text.indexOf(run, index + run.length);
      index = close < 0 ? index + run.length : close + run.length;
      continue;
    }
    if (text.startsWith(delim, index)) {
      if (single && text[index + 1] === delim) {
        // Skip a nested double delimiter (e.g. `**bold**` inside `*italic*`).
        const nested = findClosing(text, index + 2, delim + delim);
        if (nested > 0) { index = nested + 2; continue; }
        index += 2;
        continue;
      }
      const before = text[index - 1];
      const after = text[index + delim.length];
      const closesHere = index > start && !isSpace(before) && (delim[0] !== '_' || !isAlnum(after));
      if (closesHere) return index;
    }
    index += 1;
  }
  return -1;
}

/** Position right after a balanced `[label]`, or -1. */
function findLabelEnd(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Parses `(dest)` or `(<dest>)` starting at `open` (the "("). */
function parseLinkDestination(text, open) {
  if (text[open] !== '(') return null;
  if (text[open + 1] === '<') {
    const close = text.indexOf('>)', open + 2);
    if (close < 0) return null;
    return { href: text.slice(open + 2, close), end: close + 2 };
  }
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        const href = text.slice(open + 1, index).trim().split(/\s+"/)[0];
        return { href, end: index + 1 };
      }
    }
  }
  return null;
}

function pushRun(runs, text, style) {
  if (!text) return;
  const last = runs.at(-1);
  if (last && last.bold === !!style.bold && last.italic === !!style.italic && last.strike === !!style.strike
    && last.underline === !!style.underline && last.code === !!style.code) {
    last.text += text;
    return;
  }
  runs.push({ text, bold: !!style.bold, italic: !!style.italic, strike: !!style.strike, underline: !!style.underline, code: !!style.code });
}

function appendRuns(runs, more) {
  for (const run of more) pushRun(runs, run.text, run);
}

/**
 * Inline markdown → styled runs `{text, bold, italic, strike, underline, code}`.
 * Line breaks (`<br>` or a newline) become "\n" inside the text. Links render
 * as "texto (url)".
 */
export function parseInline(text, style = {}) {
  const source = String(text ?? '');
  const runs = [];
  let buffer = '';
  const flush = () => { pushRun(runs, buffer, style); buffer = ''; };
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const rest = source.slice(index);

    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) { buffer += '\\'; index += 1; continue; }
      if (next === '\n') { buffer += '\n'; index += 2; continue; }
      buffer += ESCAPABLE.has(next) ? next : `\\${next}`;
      index += 2;
      continue;
    }

    if (char === '`') {
      const run = rest.match(/^`+/)[0];
      const close = source.indexOf(run, index + run.length);
      if (close > 0) {
        let code = source.slice(index + run.length, close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        flush();
        pushRun(runs, code, { ...style, code: true });
        index = close + run.length;
        continue;
      }
      buffer += run;
      index += run.length;
      continue;
    }

    const br = rest.match(/^<br\s*\/?>/i);
    if (br) { buffer += '\n'; index += br[0].length; continue; }

    const tag = rest.match(/^<(u|kbd|ins|mark|sup|sub|span)\b[^>]*>/i);
    if (tag) {
      const name = tag[1].toLowerCase();
      const closeTag = `</${name}>`;
      const close = source.toLowerCase().indexOf(closeTag, index + tag[0].length);
      if (close > 0) {
        flush();
        const inner = source.slice(index + tag[0].length, close);
        const innerStyle = name === 'u' || name === 'ins'
          ? { ...style, underline: true }
          : name === 'kbd' ? { ...style, code: true } : style;
        appendRuns(runs, parseInline(inner, innerStyle));
        index = close + closeTag.length;
        continue;
      }
    }

    const autolink = rest.match(/^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i);
    if (autolink) { buffer += autolink[1]; index += autolink[0].length; continue; }

    if (char === '!' && source[index + 1] === '[') {
      // Images: keep the alt text (exports are text-only).
      const labelEnd = findLabelEnd(source, index + 1);
      const destination = labelEnd > 0 ? parseLinkDestination(source, labelEnd + 1) : null;
      if (destination) {
        flush();
        appendRuns(runs, parseInline(source.slice(index + 2, labelEnd), style));
        index = destination.end;
        continue;
      }
    }

    if (char === '[') {
      const labelEnd = findLabelEnd(source, index);
      const destination = labelEnd > 0 ? parseLinkDestination(source, labelEnd + 1) : null;
      if (destination) {
        flush();
        const labelRuns = parseInline(source.slice(index + 1, labelEnd), style);
        const labelText = labelRuns.map(run => run.text).join('').trim();
        const href = unescapeMarkdown(destination.href.trim());
        appendRuns(runs, labelRuns);
        const plainHref = href.replace(/^mailto:/i, '');
        if (href && SAFE_LINK_RE.test(href) && labelText !== href && labelText !== plainHref) {
          pushRun(runs, ` (${plainHref})`, style);
        } else if (!labelText && href) {
          pushRun(runs, plainHref, style);
        }
        index = destination.end;
        continue;
      }
    }

    if ((rest.startsWith('***') || rest.startsWith('___')) && !isSpace(source[index + 3])) {
      const delim = rest.slice(0, 3);
      const close = source.indexOf(delim, index + 3);
      if (close > index + 3 && !isSpace(source[close - 1])) {
        flush();
        appendRuns(runs, parseInline(source.slice(index + 3, close), { ...style, bold: true, italic: true }));
        index = close + 3;
        continue;
      }
    }

    for (const [delim, key] of [['**', 'bold'], ['__', 'bold'], ['~~', 'strike']]) {
      if (rest.startsWith(delim) && !isSpace(source[index + 2])) {
        const close = findClosing(source, index + 2, delim);
        if (close > 0) {
          flush();
          appendRuns(runs, parseInline(source.slice(index + 2, close), { ...style, [key]: true }));
          index = close + 2;
          break;
        }
      }
    }
    if (index !== (source.length - rest.length)) continue;

    if ((char === '*' || char === '_') && !isSpace(source[index + 1]) && source[index + 1] !== char
      && (char === '*' || !isAlnum(source[index - 1]))) {
      const close = findClosing(source, index + 1, char);
      if (close > 0) {
        flush();
        appendRuns(runs, parseInline(source.slice(index + 1, close), { ...style, italic: true }));
        index = close + 1;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return runs;
}

export function runsToText(runs) {
  return (runs || []).map(run => run.text).join('');
}

// ---------------------------------------------------------------------------
// Blocks

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)?.*$/;
// A closing "###" only counts when preceded by whitespace (so "C#" survives).
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_RE = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK_RE = /^\\?\[([ xX])\\?\]\s+/;
const CALLOUT_RE = /^\[!(\w+)\]\s*(.*)$/;

const CALLOUT_LABELS = {
  NOTE: 'Nota', TIP: 'Consejo', IMPORTANT: 'Importante', WARNING: 'Advertencia', CAUTION: 'Precaución', INFO: 'Nota',
};

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let current = '';
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '\\' && row[index + 1] === '|') { current += '\\|'; index += 1; continue; }
    if (char === '|') { cells.push(current.trim()); current = ''; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && TABLE_SEPARATOR_RE.test(lines[index + 1] || '') && lines[index + 1].includes('-');
}

function isBlockStart(lines, index) {
  const line = lines[index];
  return FENCE_RE.test(line) && /^(\s*)(`{3,}|~{3,})/.test(line)
    || HEADING_RE.test(line)
    || HR_RE.test(line)
    || /^\s*>/.test(line)
    || LIST_RE.test(line)
    || /^\s*<details\b/i.test(line)
    || isTableStart(lines, index);
}

function parseListItems(lines, start) {
  const items = [];
  const indents = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(LIST_RE);
    if (!match) {
      // Indented continuation of the previous item (a wrapped line).
      if (line.trim() && /^\s{2,}\S/.test(line) && items.length && !isBlockStart(lines, index)) {
        items.at(-1).text += `\n${line.trim()}`;
        index += 1;
        continue;
      }
      break;
    }

    const indent = match[1].replace(/\t/g, '    ').length;
    while (indents.length && indent < indents.at(-1)) indents.pop();
    if (!indents.length || indent > indents.at(-1)) indents.push(indent);
    const depth = indents.length - 1;

    const marker = match[2];
    let text = match[3];
    let checked = null;
    const task = text.match(TASK_RE);
    if (task) {
      checked = task[1].toLowerCase() === 'x';
      text = text.slice(task[0].length);
    }
    const ordered = /\d/.test(marker);
    items.push({
      depth,
      ordered,
      number: ordered ? Number.parseInt(marker, 10) : null,
      checked,
      text,
    });
    index += 1;
  }

  return {
    block: {
      type: 'list',
      items: items.map(item => ({ ...item, runs: parseInline(item.text), text: undefined })),
    },
    next: index,
  };
}

function collectDetails(lines, start) {
  let depth = 0;
  const collected = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    depth += (line.match(/<details\b/gi) || []).length;
    depth -= (line.match(/<\/details>/gi) || []).length;
    collected.push(line);
    index += 1;
    if (depth <= 0) break;
  }

  let content = collected.join('\n').replace(/^\s*<details\b[^>]*>/i, '');
  const closeAt = content.toLowerCase().lastIndexOf('</details>');
  if (closeAt >= 0) content = content.slice(0, closeAt);
  let summary = 'Detalles';
  content = content.replace(/^\s*<summary>([\s\S]*?)<\/summary>/i, (_, raw) => {
    summary = decodeBasicEntities(raw).replace(/\s+/g, ' ').trim() || 'Detalles';
    return '';
  });
  return { block: { type: 'details', summary, blocks: parseBlocks(content) }, next: index };
}

/** Markdown → blocks. */
export function parseBlocks(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/);
    if (fence) {
      const marker = fence[2];
      const code = [];
      index += 1;
      while (index < lines.length && !(lines[index].trim().startsWith(marker[0].repeat(marker.length))
        && lines[index].trim().replace(new RegExp(`^\\${marker[0]}+`), '').trim() === '')) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', lang: fence[3] || '', text: code.join('\n') });
      continue;
    }

    if (/^\s*<details\b/i.test(line)) {
      const { block, next } = collectDetails(lines, index);
      blocks.push(block);
      index = next;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, runs: parseInline(heading[2]) });
      index += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitTableRow(line);
      const align = splitTableRow(lines[index + 1]).map(cell => (
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left'
      ));
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const columns = Math.max(header.length, ...rows.map(row => row.length));
      const pad = row => Array.from({ length: columns }, (_, column) => parseInline(row[column] || ''));
      blocks.push({ type: 'table', align, header: pad(header), rows: rows.map(pad) });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const inner = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        inner.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      const callout = inner[0]?.trim().match(CALLOUT_RE);
      if (callout) {
        const kind = callout[1].toUpperCase();
        const body = [callout[2], ...inner.slice(1)].join('\n');
        blocks.push({ type: 'callout', kind, label: CALLOUT_LABELS[kind] || 'Nota', blocks: parseBlocks(body) });
      } else {
        blocks.push({ type: 'quote', blocks: parseBlocks(inner.join('\n')) });
      }
      continue;
    }

    if (LIST_RE.test(line)) {
      const { block, next } = parseListItems(lines, index);
      blocks.push(block);
      index = next;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

/** Plain text of an inline title/description (no markdown syntax). */
export function plainInline(text) {
  return runsToText(parseInline(text)).replace(/\s*\n\s*/g, ' ').trim();
}

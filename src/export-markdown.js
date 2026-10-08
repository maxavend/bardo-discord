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
//
// The parser is linear in the length of the text: every "where does this
// close?" question is answered from indexes built once per call (code spans,
// matching brackets/parentheses and sorted closer positions searched with a
// binary search), never by rescanning to the end of the paragraph. Nesting is
// capped, so pathological input (an uploaded log full of "*", "[" or "**")
// exports in milliseconds instead of exhausting the Worker's CPU.

const SAFE_LINK_RE = /^(?:https?:|mailto:|tel:)/i;
const MAX_INLINE_DEPTH = 12;
const BR_RE = /<br\s*\/?>/iy;
const TAG_RE = /<(u|kbd|ins|mark|sup|sub|span)\b[^>\n]{0,200}>/iy;
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^\s<>]+)>/iy;

function isAlnum(char) {
  return Boolean(char) && /[\p{L}\p{N}]/u.test(char);
}

function isSpace(char) {
  return !char || /\s/.test(char);
}

/** First value in the sorted array `list` that is >= `min`, or -1. */
function firstAtLeast(list, min) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (list[middle] < min) low = middle + 1;
    else high = middle;
  }
  return low < list.length ? list[low] : -1;
}

/** Sorted start positions of every occurrence of `needle` (overlapping). */
function occurrences(text, needle) {
  const positions = [];
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) positions.push(index);
  return positions;
}

/**
 * One pass over the text: escapes, code spans (a backtick run closes at the
 * next run of exactly the same length), and matching [ ] / ( ) pairs outside
 * them. `masked[i]` marks characters that can't be markdown syntax.
 */
function buildInlineIndex(text) {
  const length = text.length;
  const masked = new Uint8Array(length);
  const codeSpans = new Map();

  const runsByLength = new Map();
  for (let index = 0; index < length;) {
    if (text.charCodeAt(index) !== 96) { index += 1; continue; }
    let end = index;
    while (end < length && text.charCodeAt(end) === 96) end += 1;
    const runLength = end - index;
    if (!runsByLength.has(runLength)) runsByLength.set(runLength, []);
    runsByLength.get(runLength).push(index);
    index = end;
  }

  for (let index = 0; index < length;) {
    const code = text.charCodeAt(index);
    if (code === 92 && index + 1 < length) { // backslash escape
      masked[index] = 1;
      masked[index + 1] = 1;
      index += 2;
      continue;
    }
    if (code === 96) {
      let end = index;
      while (end < length && text.charCodeAt(end) === 96) end += 1;
      const runLength = end - index;
      const close = firstAtLeast(runsByLength.get(runLength) || [], end);
      if (close !== -1) {
        codeSpans.set(index, { runLength, close });
        masked.fill(1, index, close + runLength);
        index = close + runLength;
      } else {
        index = end;
      }
      continue;
    }
    index += 1;
  }

  const brackets = new Map();
  const parens = new Map();
  const bracketStack = [];
  const parenStack = [];
  for (let index = 0; index < length; index += 1) {
    if (masked[index]) continue;
    const char = text[index];
    if (char === '[') bracketStack.push(index);
    else if (char === ']' && bracketStack.length) brackets.set(bracketStack.pop(), index);
    else if (char === '(') parenStack.push(index);
    else if (char === ')' && parenStack.length) parens.set(parenStack.pop(), index);
  }

  return { text, masked, codeSpans, brackets, parens, closers: new Map(), lower: null, tagCloses: new Map(), angleCloses: null };
}

function isCloser(index, delim, position) {
  const { text, masked } = index;
  for (let offset = 0; offset < delim.length; offset += 1) {
    if (masked[position + offset]) return false;
  }
  const before = text[position - 1];
  if (isSpace(before)) return false;
  const after = text[position + delim.length];
  if (delim.length === 1) {
    // A lone "*" / "_" (part of "**" belongs to bold).
    if (before === delim || after === delim) return false;
  }
  if (delim[0] === '_' && delim.length < 3 && isAlnum(after)) return false;
  return true;
}

/** Position of the first closer for `delim` at or after `min`, or -1. */
function nextCloser(index, delim, min) {
  let list = index.closers.get(delim);
  if (!list) {
    list = occurrences(index.text, delim).filter(position => isCloser(index, delim, position));
    index.closers.set(delim, list);
  }
  return firstAtLeast(list, min);
}

function closingTagPosition(index, name, min) {
  if (!index.lower) index.lower = index.text.toLowerCase();
  if (!index.tagCloses.has(name)) index.tagCloses.set(name, occurrences(index.lower, `</${name}>`));
  return firstAtLeast(index.tagCloses.get(name), min);
}

/** Parses `(dest)` or `(<dest>)` starting at `open` (the "("). */
function parseLinkDestination(index, open) {
  const { text } = index;
  if (text[open] !== '(') return null;
  if (text[open + 1] === '<') {
    if (!index.angleCloses) index.angleCloses = occurrences(text, '>)');
    const close = firstAtLeast(index.angleCloses, open + 2);
    if (close < 0) return null;
    return { href: text.slice(open + 2, close), end: close + 2 };
  }
  const close = index.parens.get(open);
  if (close === undefined) return null;
  const href = text.slice(open + 1, close).trim().split(/\s+"/)[0];
  return { href, end: close + 1 };
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

function matchSticky(regex, text, at) {
  regex.lastIndex = at;
  return regex.exec(text);
}

/**
 * Inline markdown → styled runs `{text, bold, italic, strike, underline, code}`.
 * Line breaks (`<br>` or a newline) become "\n" inside the text. Links render
 * as "texto (url)".
 */
export function parseInline(text, style = {}, depth = 0) {
  const source = String(text ?? '');
  const index = buildInlineIndex(source);
  const nest = depth < MAX_INLINE_DEPTH;
  const runs = [];
  let buffer = '';
  const flush = () => { pushRun(runs, buffer, style); buffer = ''; };
  const inner = (from, to, innerStyle) => {
    flush();
    appendRuns(runs, parseInline(source.slice(from, to), innerStyle, depth + 1));
  };
  let position = 0;

  while (position < source.length) {
    const char = source[position];

    if (char === '\\') {
      const next = source[position + 1];
      if (next === undefined) { buffer += '\\'; position += 1; continue; }
      if (next === '\n') { buffer += '\n'; position += 2; continue; }
      buffer += ESCAPABLE.has(next) ? next : `\\${next}`;
      position += 2;
      continue;
    }

    if (char === '`') {
      const span = index.codeSpans.get(position);
      if (span) {
        let code = source.slice(position + span.runLength, span.close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        flush();
        pushRun(runs, code, { ...style, code: true });
        position = span.close + span.runLength;
        continue;
      }
      let end = position;
      while (source[end] === '`') end += 1;
      buffer += source.slice(position, end);
      position = end;
      continue;
    }

    if (char === '<') {
      const br = matchSticky(BR_RE, source, position);
      if (br) { buffer += '\n'; position += br[0].length; continue; }

      const tag = nest ? matchSticky(TAG_RE, source, position) : null;
      if (tag) {
        const name = tag[1].toLowerCase();
        const close = closingTagPosition(index, name, position + tag[0].length);
        if (close > 0) {
          const innerStyle = name === 'u' || name === 'ins'
            ? { ...style, underline: true }
            : name === 'kbd' ? { ...style, code: true } : style;
          inner(position + tag[0].length, close, innerStyle);
          position = close + name.length + 3;
          continue;
        }
      }

      const autolink = matchSticky(AUTOLINK_RE, source, position);
      if (autolink) { buffer += autolink[1]; position += autolink[0].length; continue; }
    }

    if (nest && (char === '[' || (char === '!' && source[position + 1] === '['))) {
      const open = char === '!' ? position + 1 : position;
      const labelEnd = index.brackets.get(open);
      const destination = labelEnd !== undefined ? parseLinkDestination(index, labelEnd + 1) : null;
      if (destination) {
        flush();
        const labelRuns = parseInline(source.slice(open + 1, labelEnd), style, depth + 1);
        appendRuns(runs, labelRuns);
        if (char === '[') {
          // Images keep only their alt text; links read "texto (url)".
          const labelText = runsToText(labelRuns).trim();
          const href = unescapeMarkdown(destination.href.trim());
          const plainHref = href.replace(/^mailto:/i, '');
          if (href && SAFE_LINK_RE.test(href) && labelText !== href && labelText !== plainHref) {
            pushRun(runs, ` (${plainHref})`, style);
          } else if (!labelText && href) {
            pushRun(runs, plainHref, style);
          }
        }
        position = destination.end;
        continue;
      }
    }

    if (nest && (char === '*' || char === '_' || char === '~')) {
      const triple = char.repeat(3);
      if (char !== '~' && source.startsWith(triple, position) && !isSpace(source[position + 3])) {
        const close = nextCloser(index, triple, position + 4);
        if (close !== -1) {
          inner(position + 3, close, { ...style, bold: true, italic: true });
          position = close + 3;
          continue;
        }
      }

      const double = char.repeat(2);
      if (source.startsWith(double, position) && !isSpace(source[position + 2])) {
        const close = nextCloser(index, double, position + 3);
        if (close !== -1) {
          inner(position + 2, close, { ...style, [char === '~' ? 'strike' : 'bold']: true });
          position = close + 2;
          continue;
        }
      }

      if (char !== '~' && !isSpace(source[position + 1]) && source[position + 1] !== char
        && (char === '*' || !isAlnum(source[position - 1]))) {
        const close = nextCloser(index, char, position + 2);
        if (close !== -1) {
          inner(position + 1, close, { ...style, italic: true });
          position = close + 1;
          continue;
        }
      }
    }

    buffer += char;
    position += 1;
  }

  flush();
  return runs;
}

export function runsToText(runs) {
  return (runs || []).map(run => run.text).join('');
}

// ---------------------------------------------------------------------------
// Blocks

// Same rule as the reader: an opening fence carries at most one info word, so
// a one-line ```npm install``` stays inline code instead of swallowing the rest.
const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
// Quotes, callouts and <details> nest by recursion; deeper input is flattened.
const MAX_BLOCK_DEPTH = 24;
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
  return FENCE_RE.test(line)
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
  // Next number per depth: an ordered run starts at its first marker and then
  // counts up, so lazy "1. 1. 1." exports as 1, 2, 3 (like the reader).
  const counters = [];
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
    counters.length = depth + 1;

    const marker = match[2];
    let text = match[3];
    let checked = null;
    const task = text.match(TASK_RE);
    if (task) {
      checked = task[1].toLowerCase() === 'x';
      text = text.slice(task[0].length);
    }
    const ordered = /\d/.test(marker);
    let number = null;
    if (ordered) {
      number = counters[depth] ?? Number.parseInt(marker, 10);
      counters[depth] = number + 1;
    } else {
      counters[depth] = undefined;
    }
    items.push({ depth, ordered, number, checked, text });
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

function collectDetails(lines, start, blockDepth) {
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
  return { block: { type: 'details', summary, blocks: parseBlocks(content, blockDepth + 1) }, next: index };
}

/** Markdown → blocks. */
export function parseBlocks(markdown, depth = 0) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(FENCE_RE);
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

    if (depth < MAX_BLOCK_DEPTH && /^\s*<details\b/i.test(line)) {
      const { block, next } = collectDetails(lines, index, depth);
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
      const columns = rows.reduce((max, row) => Math.max(max, row.length), header.length);
      const pad = row => Array.from({ length: columns }, (_, column) => parseInline(row[column] || ''));
      blocks.push({ type: 'table', align, header: pad(header), rows: rows.map(pad) });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const inner = [];
      const tooDeep = depth >= MAX_BLOCK_DEPTH;
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        // Past the nesting limit every remaining ">" level is flattened.
        inner.push(lines[index].replace(tooDeep ? /^(?:\s*>)+\s?/ : /^\s*>\s?/, ''));
        index += 1;
      }
      const callout = inner[0]?.trim().match(CALLOUT_RE);
      if (tooDeep) {
        blocks.push({ type: 'quote', blocks: [{ type: 'paragraph', runs: parseInline(inner.join('\n')) }] });
      } else if (callout) {
        const kind = callout[1].toUpperCase();
        const body = [callout[2], ...inner.slice(1)].join('\n');
        blocks.push({ type: 'callout', kind, label: CALLOUT_LABELS[kind] || 'Nota', blocks: parseBlocks(body, depth + 1) });
      } else {
        blocks.push({ type: 'quote', blocks: parseBlocks(inner.join('\n'), depth + 1) });
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

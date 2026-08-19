export const DEFAULT_PAGE_LIMIT = 3200;

function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function splitLongText(text, limit) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < Math.floor(limit * 0.55)) cut = remaining.lastIndexOf(' ', limit);
    if (cut < Math.floor(limit * 0.55)) cut = limit;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitFencedCodeBlock(block, limit) {
  const lines = block.split('\n');
  const opening = lines[0];
  const hasClosingFence = lines.at(-1)?.trim().startsWith('```');
  const closing = hasClosingFence ? lines.at(-1) : '```';
  const bodyLines = lines.slice(1, hasClosingFence ? -1 : undefined);

  const overhead = opening.length + closing.length + 2;
  const bodyLimit = Math.max(256, limit - overhead);
  const bodyChunks = splitLongText(bodyLines.join('\n'), bodyLimit);

  return bodyChunks.map((chunk) => `${opening}\n${chunk}\n${closing}`);
}

function splitBlock(block, limit) {
  if (block.length <= limit) return [block];

  if (block.trimStart().startsWith('```')) {
    return splitFencedCodeBlock(block, limit);
  }

  return splitLongText(block, limit);
}

function toBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let current = [];
  let inFence = false;

  const flush = () => {
    const value = current.join('\n').trim();
    if (value) blocks.push(value);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```')) {
      current.push(line);
      inFence = !inFence;
      if (!inFence) flush();
      continue;
    }

    if (!inFence && line.trim() === '') {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();
  return blocks;
}

function isHeading(block) {
  return /^#{1,6}\s+/.test(block.trimStart());
}

export function paginateMarkdown(markdown, limit = DEFAULT_PAGE_LIMIT) {
  if (!Number.isInteger(limit) || limit < 500) {
    throw new Error('El límite de página debe ser un entero de al menos 500 caracteres.');
  }

  const normalized = normalizeMarkdown(markdown);
  if (!normalized) return [];

  const blocks = toBlocks(normalized);
  const pages = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) pages.push(current.trim());
    current = '';
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const chunks = splitBlock(block, limit);

    // Evita dejar un título al final de página cuando cabe junto al bloque siguiente.
    if (
      chunks.length === 1 &&
      isHeading(block) &&
      current &&
      blocks[index + 1]
    ) {
      const nextFirstChunk = splitBlock(blocks[index + 1], limit)[0];
      const headingWithNext = `${block}\n\n${nextFirstChunk}`;
      const currentWithHeading = `${current}\n\n${block}`;

      if (headingWithNext.length <= limit && currentWithHeading.length > limit) {
        pushCurrent();
      }
    }

    for (const chunk of chunks) {
      if (!current) {
        current = chunk;
        continue;
      }

      const candidate = `${current}\n\n${chunk}`;
      if (candidate.length <= limit) {
        current = candidate;
      } else {
        pushCurrent();
        current = chunk;
      }
    }
  }

  pushCurrent();
  return pages;
}

export function extractDocumentTitle(markdown, explicitTitle) {
  const normalized = normalizeMarkdown(markdown);
  const lines = normalized.split('\n');
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
  const firstLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex] : '';
  const h1Match = firstLine.match(/^#\s+(.+?)\s*$/);

  const title = (explicitTitle?.trim() || h1Match?.[1]?.trim() || 'Documento').slice(0, 200);

  if (!h1Match) {
    return { title, body: normalized };
  }

  lines.splice(firstNonEmptyIndex, 1);
  return {
    title,
    body: lines.join('\n').trim(),
  };
}

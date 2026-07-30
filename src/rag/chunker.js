import crypto from 'crypto';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function splitLongText(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function splitIntoSemanticUnits(text) {
  return text
    .split(/\n{2,}/)
    .flatMap(paragraph => {
      const trimmed = paragraph.trim();
      return trimmed.length > 900 ? splitLongText(trimmed) : [trimmed];
    })
    .map(unit => unit.trim())
    .filter(Boolean);
}

function splitOversizedUnit(unit, maxChars) {
  if (unit.length <= maxChars) {
    return [unit];
  }

  const words = unit.split(/\s+/);
  const units = [];
  let buffer = '';

  for (const word of words) {
    const nextBuffer = buffer ? `${buffer} ${word}` : word;

    if (nextBuffer.length > maxChars && buffer) {
      units.push(buffer);
      buffer = word;
    } else {
      buffer = nextBuffer;
    }
  }

  if (buffer) {
    units.push(buffer);
  }

  return units;
}

function getOverlapText(text, overlapChars) {
  if (!overlapChars || text.length <= overlapChars) {
    return text;
  }

  const overlap = text.slice(-overlapChars);
  const boundary = overlap.search(/[.!?]\s+/);
  return boundary >= 0 ? overlap.slice(boundary + 1).trim() : overlap.trim();
}

export function chunkDocuments(documents, options = {}) {
  const maxChars = options.maxChars || 1400;
  const overlapChars = Math.min(options.overlapChars || 220, Math.floor(maxChars / 2));
  const chunks = [];

  for (const document of documents) {
    const units = splitIntoSemanticUnits(document.text);
    let buffer = '';
    let chunkIndex = 0;

    const pushChunk = () => {
      const chunkText = buffer.trim();
      if (!chunkText) {
        return;
      }

      const contentHash = hash(chunkText);
      chunks.push({
        id: hash(`${document.metadata.sourcePath}:${chunkIndex}:${contentHash}`).slice(0, 32),
        chunkIndex,
        chunkText,
        contentHash,
        metadata: {
          ...document.metadata,
          chunkId: `${document.metadata.sourcePath}#${chunkIndex}`,
        },
      });

      chunkIndex += 1;
      buffer = getOverlapText(chunkText, overlapChars);
    };

    for (const rawUnit of units) {
      for (const unit of splitOversizedUnit(rawUnit, maxChars)) {
        if (!buffer) {
          buffer = unit;
          continue;
        }

        const nextBuffer = `${buffer}\n\n${unit}`;
        if (nextBuffer.length > maxChars) {
          pushChunk();
          const overlappedBuffer = buffer ? `${buffer}\n\n${unit}` : unit;
          buffer = overlappedBuffer.length <= maxChars ? overlappedBuffer : unit;
        } else {
          buffer = nextBuffer;
        }
      }
    }

    pushChunk();
  }

  return chunks;
}

function formatTags(tags) {
  return Array.isArray(tags) && tags.length ? tags.join(', ') : 'none';
}

export function buildRetrievedContext(chunks, { maxContextChars = 6000 } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const header = [
    'RETRIEVED PORTFOLIO KNOWLEDGE BASE CONTEXT:',
    'Use these retrieved excerpts as additional factual context for the user question.',
    'If this context is not relevant, answer from the existing portfolio instructions.',
  ].join('\n');

  const parts = [];
  let usedChars = header.length;

  for (const [index, chunk] of chunks.entries()) {
    const block = [
      `[${index + 1}]`,
      `Section: ${chunk.section || chunk.metadata?.section || 'unknown'}`,
      `Document: ${chunk.documentName || chunk.metadata?.documentName || 'unknown'}`,
      `Chunk ID: ${chunk.id || chunk.metadata?.chunkId || 'unknown'}`,
      `Source: ${chunk.sourcePath || chunk.metadata?.sourcePath || 'unknown'}`,
      `Tags: ${formatTags(chunk.tags || chunk.metadata?.tags)}`,
      `Text: ${chunk.chunkText}`,
    ].join('\n');

    if (usedChars + block.length + 2 > maxContextChars) {
      break;
    }

    parts.push(block);
    usedChars += block.length + 2;
  }

  if (parts.length === 0) {
    return null;
  }

  return `${header}\n\n${parts.join('\n\n')}`;
}

export function assembleChatMessages({ retrievedContext, systemPrompt, userMessage }) {
  const messages = [];

  if (retrievedContext) {
    messages.push({ role: 'system', content: retrievedContext });
  }

  messages.push(
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  );

  return messages;
}

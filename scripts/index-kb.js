import { chunkDocuments } from '../src/rag/chunker.js';
import { getRagConfig, assertIndexingConfig } from '../src/rag/config.js';
import { loadDocuments } from '../src/rag/documentLoader.js';
import { createEmbeddingProvider } from '../src/rag/embeddings.js';
import { loadLocalEnv } from '../src/rag/env.js';
import { createVectorStore } from '../src/rag/vectorStores/pgVectorStore.js';

loadLocalEnv();

async function main() {
  const config = getRagConfig();
  assertIndexingConfig(config);

  console.log(`Loading KB documents from ${config.kbDir}`);
  const documents = await loadDocuments({ kbDir: config.kbDir });
  console.log(`Loaded ${documents.length} documents`);

  const chunks = chunkDocuments(documents, config.chunking);
  console.log(`Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error('No chunks were generated from the knowledge base');
  }

  const embeddingProvider = createEmbeddingProvider(config.embedding);
  const vectorStore = createVectorStore(config.vectorStore, config.embedding);

  try {
    console.log('Ensuring pgvector schema');
    await vectorStore.ensureSchema();

    console.log('Generating embeddings');
    const embeddings = await embeddingProvider.embedBatch(chunks.map(chunk => chunk.chunkText));
    const embeddedChunks = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    console.log('Refreshing vector store');
    await vectorStore.replaceAllChunks(embeddedChunks);
    console.log(`Indexed ${embeddedChunks.length} chunks into ${config.vectorStore.tableName}`);
  } finally {
    await vectorStore.close();
  }
}

main().catch(error => {
  console.error('KB indexing failed:', error.message);
  process.exitCode = 1;
});

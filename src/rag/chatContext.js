import { getRagConfig } from './config.js';
import { createEmbeddingProvider } from './embeddings.js';
import { buildRetrievedContext } from './promptAssembly.js';
import { Retriever } from './retriever.js';
import { createVectorStore } from './vectorStores/pgVectorStore.js';

let runtime;

function isRuntimeConfigured(config) {
  return Boolean(
    config.enabled &&
    (config.embedding.provider === 'transformers' || config.embedding.apiKey) &&
    config.vectorStore.databaseUrl,
  );
}

function getRuntime() {
  if (runtime) {
    return runtime;
  }

  const config = getRagConfig();
  if (!isRuntimeConfigured(config)) {
    runtime = { config, retriever: null };
    return runtime;
  }

  const embeddingProvider = createEmbeddingProvider(config.embedding);
  const vectorStore = createVectorStore(config.vectorStore, config.embedding);
  const retriever = new Retriever({
    embeddingProvider,
    vectorStore,
    topK: config.retrieval.topK,
    minScore: config.retrieval.minScore,
  });

  runtime = { config, retriever };
  return runtime;
}

export async function getRetrievedContextForQuery(query) {
  const { config, retriever } = getRuntime();

  if (!retriever) {
    return null;
  }

  try {
    const chunks = await retriever.retrieve(query, config.retrieval);
    return buildRetrievedContext(chunks, {
      maxContextChars: config.retrieval.maxContextChars,
    });
  } catch (error) {
    console.error('RAG retrieval skipped:', error.message);
    return null;
  }
}

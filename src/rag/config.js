import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

export function getRagConfig(env = process.env) {
  const embeddingApiKey = env.EMBEDDING_API_KEY || env.OPENAI_API_KEY;
  const databaseUrl = env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
  const embeddingProvider = env.EMBEDDING_PROVIDER || 'transformers';

  return {
    enabled: readBoolean(
      env.RAG_ENABLED,
      Boolean(databaseUrl && (embeddingProvider === 'transformers' || embeddingApiKey)),
    ),
    kbDir: env.RAG_KB_DIR || path.join(projectRoot, 'KB'),
    retrieval: {
      topK: readNumber(env.RAG_TOP_K, 5),
      maxContextChars: readNumber(env.RAG_MAX_CONTEXT_CHARS, 6000),
      minScore: readNumber(env.RAG_MIN_SCORE, 0),
    },
    chunking: {
      maxChars: readNumber(env.RAG_CHUNK_MAX_CHARS, 1400),
      overlapChars: readNumber(env.RAG_CHUNK_OVERLAP_CHARS, 220),
    },
    embedding: {
      provider: embeddingProvider,
      apiKey: embeddingApiKey,
      model: env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      dimensions: readNumber(env.EMBEDDING_DIMENSIONS, 384),
      batchSize: readNumber(env.EMBEDDING_BATCH_SIZE, embeddingProvider === 'transformers' ? 8 : 32),
    },
    vectorStore: {
      provider: env.VECTOR_STORE_PROVIDER || 'pgvector',
      databaseUrl,
      tableName: env.RAG_TABLE_NAME || 'portfolio_rag_chunks',
      ssl: readBoolean(env.POSTGRES_SSL, databaseUrl ? !databaseUrl.includes('localhost') : true),
    },
  };
}

export function assertIndexingConfig(config) {
  const missing = [];

  if (config.embedding.provider === 'openai' && !config.embedding.apiKey) {
    missing.push('OPENAI_API_KEY or EMBEDDING_API_KEY');
  }

  if (!config.vectorStore.databaseUrl) {
    missing.push('POSTGRES_URL, POSTGRES_URL_NON_POOLING, or DATABASE_URL');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required RAG indexing config: ${missing.join(', ')}`);
  }
}

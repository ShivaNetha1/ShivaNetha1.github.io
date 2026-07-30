import pg from 'pg';
import { VectorStore } from './base.js';

const { Pool } = pg;

function assertSafeIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
}

function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Embedding must be a non-empty number array');
  }

  return `[${embedding.map(value => {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding contains a non-finite value');
    }

    return value;
  }).join(',')}]`;
}

export class PgVectorStore extends VectorStore {
  constructor({ databaseUrl, tableName, ssl, dimensions }) {
    super();

    if (!databaseUrl) {
      throw new Error('Postgres connection string is required for pgvector storage');
    }

    assertSafeIdentifier(tableName);
    this.tableName = tableName;
    this.dimensions = dimensions || 1536;
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: ssl ? { rejectUnauthorized: false } : false,
    });
  }

  async insertChunks(client, chunks) {
    for (const chunk of chunks) {
      await client.query(
        `
          INSERT INTO ${this.tableName} (
            id,
            section,
            document_name,
            source_path,
            tags,
            chunk_index,
            chunk_text,
            embedding,
            metadata,
            content_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9::jsonb, $10)
          ON CONFLICT (id) DO UPDATE SET
            section = EXCLUDED.section,
            document_name = EXCLUDED.document_name,
            source_path = EXCLUDED.source_path,
            tags = EXCLUDED.tags,
            chunk_index = EXCLUDED.chunk_index,
            chunk_text = EXCLUDED.chunk_text,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            content_hash = EXCLUDED.content_hash,
            updated_at = NOW()
        `,
        [
          chunk.id,
          chunk.metadata.section,
          chunk.metadata.documentName,
          chunk.metadata.sourcePath,
          chunk.metadata.tags || [],
          chunk.chunkIndex,
          chunk.chunkText,
          toVectorLiteral(chunk.embedding),
          JSON.stringify(chunk.metadata),
          chunk.contentHash,
        ],
      );
    }
  }

  async ensureSchema() {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        section TEXT,
        document_name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(${this.dimensions}) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
      ON ${this.tableName}
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${this.tableName}_source_path_idx
      ON ${this.tableName} (source_path)
    `);
  }

  async upsertChunks(chunks) {
    if (!chunks.length) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await this.insertChunks(client, chunks);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceAllChunks(chunks) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE TABLE ${this.tableName}`);
      await this.insertChunks(client, chunks);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async similaritySearch(embedding, { topK = 5, minScore = 0 } = {}) {
    const result = await this.pool.query(
      `
        SELECT
          id,
          section,
          document_name AS "documentName",
          source_path AS "sourcePath",
          tags,
          chunk_index AS "chunkIndex",
          chunk_text AS "chunkText",
          metadata,
          1 - (embedding <=> $1::vector) AS score
        FROM ${this.tableName}
        WHERE 1 - (embedding <=> $1::vector) >= $3
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
      [toVectorLiteral(embedding), topK, minScore],
    );

    return result.rows;
  }

  async close() {
    await this.pool.end();
  }
}

export function createVectorStore(config, embeddingConfig = {}) {
  if (config.provider !== 'pgvector') {
    throw new Error(`Unsupported vector store provider: ${config.provider}`);
  }

  return new PgVectorStore({
    ...config,
    dimensions: embeddingConfig.dimensions,
  });
}

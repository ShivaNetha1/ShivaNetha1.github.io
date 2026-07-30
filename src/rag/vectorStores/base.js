export class VectorStore {
  async ensureSchema() {
    throw new Error('VectorStore.ensureSchema must be implemented');
  }

  async upsertChunks() {
    throw new Error('VectorStore.upsertChunks must be implemented');
  }

  async replaceAllChunks() {
    throw new Error('VectorStore.replaceAllChunks must be implemented');
  }

  async similaritySearch() {
    throw new Error('VectorStore.similaritySearch must be implemented');
  }

  async close() {}
}

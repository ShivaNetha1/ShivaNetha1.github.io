export class Retriever {
  constructor({ embeddingProvider, vectorStore, topK, minScore }) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.topK = topK || 5;
    this.minScore = minScore || 0;
  }

  async retrieve(query, options = {}) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const queryEmbedding = await this.embeddingProvider.embed(trimmedQuery);
    return this.vectorStore.similaritySearch(queryEmbedding, {
      topK: options.topK || this.topK,
      minScore: options.minScore ?? this.minScore,
    });
  }
}

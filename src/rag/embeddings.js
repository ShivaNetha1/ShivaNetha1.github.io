let transformersPipeline;

export class OpenAIEmbeddingProvider {
  constructor({ apiKey, model, batchSize }) {
    if (!apiKey) {
      throw new Error('OpenAI embedding API key is required');
    }

    this.apiKey = apiKey;
    this.model = model || 'text-embedding-3-small';
    this.batchSize = batchSize || 32;
  }

  async embed(text) {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embedBatch(texts) {
    const embeddings = [];

    for (let index = 0; index < texts.length; index += this.batchSize) {
      const batch = texts.slice(index, index + this.batchSize);
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Embedding request failed: ${response.status} ${details}`);
      }

      const data = await response.json();
      const batchEmbeddings = data.data
        ?.sort((left, right) => left.index - right.index)
        .map(item => item.embedding);

      if (!Array.isArray(batchEmbeddings) || batchEmbeddings.length !== batch.length) {
        throw new Error('Embedding provider returned an unexpected response shape');
      }

      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }
}

export class TransformersEmbeddingProvider {
  constructor({ model, batchSize }) {
    this.model = model || 'Xenova/all-MiniLM-L6-v2';
    this.batchSize = batchSize || 8;
    this.pipelinePromise = null;
  }

  async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = import('@xenova/transformers')
        .then(({ env, pipeline }) => {
          env.allowLocalModels = false;
          transformersPipeline = pipeline;
          return transformersPipeline('feature-extraction', this.model);
        });
    }

    return this.pipelinePromise;
  }

  async embed(text) {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embedBatch(texts) {
    const extractor = await this.getPipeline();
    const embeddings = [];

    for (let index = 0; index < texts.length; index += this.batchSize) {
      const batch = texts.slice(index, index + this.batchSize);

      for (const text of batch) {
        const output = await extractor(text, {
          pooling: 'mean',
          normalize: true,
        });

        embeddings.push(Array.from(output.data));
      }
    }

    return embeddings;
  }
}

export function createEmbeddingProvider(config) {
  if (config.provider === 'transformers') {
    return new TransformersEmbeddingProvider(config);
  }

  if (config.provider === 'openai') {
    return new OpenAIEmbeddingProvider(config);
  }

  throw new Error(`Unsupported embedding provider: ${config.provider}`);
}

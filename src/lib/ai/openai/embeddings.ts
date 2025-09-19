import OpenAI from 'openai';

/**
 * A utility class for creating embeddings using OpenAI's API.
 * Provides a simple interface for generating vector embeddings from text.
 */
export class OpenAIEmbeddings {
  private client: OpenAI;
  private model: string;

  /**
   * Creates an instance of OpenAIEmbeddings.
   * @param options - Configuration options for the embeddings model.
   */
  constructor(options: { model?: string } = {}) {
    this.client = new OpenAI();
    this.model = options.model || 'text-embedding-3-small';
  }

  /**
   * Creates an embedding for a single query string.
   * @param query - The text to create an embedding for.
   * @returns A promise that resolves to the embedding vector.
   */
  async embedQuery(query: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: query,
    });
    const [first] = response.data;
    if (!first) {
      throw new Error('Embedding response did not contain any data');
    }
    return first.embedding;
  }

  /**
   * Creates embeddings for multiple documents.
   * @param documents - An array of text documents to create embeddings for.
   * @returns A promise that resolves to an array of embedding vectors.
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: documents,
    });
    return response.data.map((item) => item.embedding);
  }
}

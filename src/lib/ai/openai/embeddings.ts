import OpenAI from 'openai';

export class OpenAIEmbeddings {
  private client: OpenAI;
  private model: string;

  constructor(options: { model?: string } = {}) {
    this.client = new OpenAI();
    this.model = options.model || 'text-embedding-3-small';
  }

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

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: documents,
    });
    return response.data.map((item) => item.embedding);
  }
}

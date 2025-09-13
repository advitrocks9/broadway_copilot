import Groq from 'groq-sdk';
import { BaseChatModel } from '../core/base_chat_model';
import { ChatModelParams } from '../core/runnables';

/**
 * A chat model that interacts with the Groq API.
 * This class extends `BaseChatModel` and is configured for Groq's endpoint.
 *
 * @example
 * ```typescript
 * const model = new ChatGroq({ model: 'llama3-70b-8192' });
 * const result = await model.run(
 *   new SystemMessage('You are a helpful assistant.'),
 *   [new UserMessage('Explain the importance of low-latency LLMs')]
 * );
 * console.log(result);
 * ```
 */
export class ChatGroq extends BaseChatModel {
  protected client: Groq;

  /**
   * Creates an instance of ChatGroq.
   * @param params - Optional parameters to override the model defaults.
   * @param client - An optional Groq client instance, useful for testing or custom configurations.
   */
  constructor(
    params: Partial<ChatModelParams> = {},
    client?: Groq,
  ) {
    const combinedParams: ChatModelParams = {
      model: 'llama3-70b-8192',
      ...params,
    };
    super(combinedParams);
    this.client =
      client ||
      new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
    this.structuredOutputToolName = 'json';
  }
}

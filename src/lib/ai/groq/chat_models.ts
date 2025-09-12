import OpenAI from 'openai';
import { BaseChatModel } from '../core/base_chat_model';
import { ChatModelParams } from '../core/runnables';

/**
 * A chat model that interacts with the Groq API.
 * This class extends `BaseChatModel` and is configured for Groq's endpoint.
 *
 * @example
 * ```typescript
 * const model = new ChatGroq({ model: 'openai/gpt-oss-120b' });
 * const result = await model.run(
 *   [new UserMessage('Explain the importance of low-latency LLMs')]
 * );
 * console.log(result.assistant.content[0].text);
 * ```
 */
export class ChatGroq extends BaseChatModel {
  protected client: OpenAI;

  /**
   * Creates an instance of ChatGroq.
   * @param params - Optional parameters to override the model defaults.
   * @param client - An optional OpenAI client instance, useful for testing or custom configurations.
   */
  constructor(
    params: Partial<ChatModelParams> = {},
    client?: OpenAI
  ) {
    const combinedParams: ChatModelParams = {
      model: 'openai/gpt-oss-120b',
      ...params,
    };
    super(combinedParams);
    this.client =
      client ||
      new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
  }
}

import OpenAI from 'openai';
import { BaseChatModel } from '../core/base_chat_model';
import { ChatModelParams } from '../core/runnables';

/**
 * A chat model that interacts with the OpenAI API.
 * This class extends `BaseChatModel` and is configured for the OpenAI endpoint.
 *
 * @example
 * ```typescript
 * const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
 * const result = await model.run(
 *   [new UserMessage('What is the capital of France?')]
 * );
 * console.log(result.assistant.content[0].text);
 * ```
 */
export class ChatOpenAI extends BaseChatModel {
  protected client: OpenAI;

  /**
   * Creates an instance of ChatOpenAI.
   * @param params - Optional parameters to override the model defaults.
   * @param client - An optional OpenAI client instance, useful for testing or custom configurations.
   */
  constructor(
    params: Partial<ChatModelParams> = {},
    client?: OpenAI
  ) {
    const combinedParams: ChatModelParams = {
      model: 'gpt-4.1',
      ...params,
    };
    super(combinedParams);
    this.client = client || new OpenAI();
  }
}

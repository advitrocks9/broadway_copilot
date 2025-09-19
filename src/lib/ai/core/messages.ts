/**
 * Defines the possible roles in a conversation.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Represents a text part of a message's content.
 */
export type TextPart = {
  type: 'text';
  text: string;
};

/**
 * Represents an image part of a message's content.
 */
export type ImagePart = {
  type: 'image_url';
  image_url: {
    /** The URL of the image, which can be a web URL or a base64-encoded data URI. */
    url: string;
    /** The level of detail to use for the image. Defaults to 'auto'. */
    detail?: 'low' | 'high' | 'auto';
  };
};

/**
 * A union type representing a part of a message's content, which can be either text or an image.
 * This allows for creating multi-modal messages.
 */
export type MessageContentPart = TextPart | ImagePart;

/**
 * Represents the content of a message, which is an array of parts (text or image).
 */
export type MessageContent = MessageContentPart[];

/**
 * Base class for all message types, defining the common structure of `role` and `content`.
 * It's not typically used directly, but extended by specific message classes.
 */
export class BaseMessage {
  role: Role;
  content: MessageContent;
  name?: string;
  tool_call_id?: string;
  meta?: Record<string, unknown>;

  constructor(
    role: Role,
    content: string | MessageContent,
    name?: string,
    tool_call_id?: string,
    meta?: Record<string, unknown>,
  ) {
    this.role = role;
    this.content = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
    if (name !== undefined) {
      this.name = name;
    }
    if (tool_call_id !== undefined) {
      this.tool_call_id = tool_call_id;
    }
    if (meta !== undefined) {
      this.meta = meta;
    }
  }

  toJSON() {
    return {
      role: this.role,
      content: this.content,
      name: this.name,
      tool_call_id: this.tool_call_id,
      meta: this.meta,
    };
  }
}

/**
 * Represents a system message, which provides instructions or context to the model.
 *
 * @example
 * ```typescript
 * const systemMsg = new SystemMessage('You are a helpful coding assistant.');
 * ```
 */
export class SystemMessage extends BaseMessage {
  constructor(content: string) {
    super('system', content);
  }
}

/**
 * Represents a user message in a conversation. This can contain either a simple
 * string or an array of content parts for multi-modal input.
 *
 * @example
 * ```typescript
 * // Simple text message
 * const userMsg = new UserMessage('What is the weather like?');
 *
 * // Message with an image
 * const userWithImage = new UserMessage([
 *   { type: 'text', text: 'What do you see in this image?' },
 *   { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
 * ]);
 * ```
 */
export class UserMessage extends BaseMessage {
  constructor(content: string | MessageContent) {
    super('user', content);
  }
}

/**
 * Represents an assistant's response in a conversation.
 *
 * @example
 * ```typescript
 * const assistantMsg = new AssistantMessage('The weather is sunny and warm today.');
 * ```
 */
export class AssistantMessage extends BaseMessage {
  constructor(content: string) {
    super('assistant', content);
  }
}

/**
 * Represents the result of a tool execution. It includes the tool's output
 * (usually as a stringified JSON object) and the ID of the tool call it corresponds to.
 *
 * @example
 * ```typescript
 * // Successful tool result
 * const toolMsg = new ToolMessage('{"temperature": 72}', 'call_123', 'get_weather');
 *
 * // Error tool result
 * const errorMsg = new ToolMessage('Tool failed to execute', 'call_456', 'get_weather', true);
 * ```
 */
export class ToolMessage extends BaseMessage {
  constructor(content: string, tool_call_id: string, name?: string, isError?: boolean) {
    super('tool', content, name, tool_call_id, { isError });
  }

  /**
   * A convenience getter to check if the tool execution resulted in an error.
   */
  get isError(): boolean {
    return this.meta?.isError === true;
  }
}

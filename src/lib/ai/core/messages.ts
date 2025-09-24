export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type TextPart = {
  type: 'text';
  text: string;
};

export type ImagePart = {
  type: 'image_url';
  image_url: {
    /** The URL of the image, which can be a web URL or a base64-encoded data URI. */
    url: string;
    /** The level of detail to use for the image. Defaults to 'auto'. */
    detail?: 'low' | 'high' | 'auto';
  };
};

export type MessageContentPart = TextPart | ImagePart;

export type MessageContent = MessageContentPart[];

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

export class SystemMessage extends BaseMessage {
  constructor(content: string) {
    super('system', content);
  }
}

export class UserMessage extends BaseMessage {
  constructor(content: string | MessageContent) {
    super('user', content);
  }
}

export class AssistantMessage extends BaseMessage {
  constructor(content: string) {
    super('assistant', content);
  }
}

export class ToolMessage extends BaseMessage {
  constructor(content: string, tool_call_id: string, name?: string, isError?: boolean) {
    super('tool', content, name, tool_call_id, { isError });
  }

  get isError(): boolean {
    return this.meta?.isError === true;
  }
}

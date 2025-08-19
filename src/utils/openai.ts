import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type InputText = { type: 'input_text'; text: string };
type InputImage = { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
type Role = 'system' | 'user' | 'assistant' | 'developer';
type Message = { role: Role; content: string | Array<InputText | InputImage> };

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  return new OpenAI({ apiKey });
}

export async function callResponsesWithSchema<T>(params: {
  messages: Message[];
  schema: z.ZodType<T>;
  model: string;
  reasoning?: 'minimal' | 'medium' | 'high';
}): Promise<T & { __tool_calls?: { total: number; names: string[] } }> {
  const client = getClient();
  const { messages, schema, model, reasoning = 'medium' } = params;

  function enforceStrictObjectSchema(input: any): any {
    if (!input || typeof input !== 'object') return input;
    if (input.type === 'object' && input.properties && typeof input.properties === 'object') {
      const keys = Object.keys(input.properties);
      if (keys.length > 0) input.required = keys;
      if (typeof input.additionalProperties === 'undefined') input.additionalProperties = false;
      for (const key of keys) enforceStrictObjectSchema(input.properties[key]);
    }
    if (input.type === 'array' && input.items) enforceStrictObjectSchema(input.items);
    if (Array.isArray(input.anyOf)) input.anyOf.forEach(enforceStrictObjectSchema);
    if (Array.isArray(input.oneOf)) input.oneOf.forEach(enforceStrictObjectSchema);
    if (Array.isArray(input.allOf)) input.allOf.forEach(enforceStrictObjectSchema);
    return input;
  }

  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' });
  const strictJsonSchema = enforceStrictObjectSchema(jsonSchema);

  const format = {
    type: 'json_schema',
    name: 'structured_output',
    strict: true,
    schema: strictJsonSchema,
  } as const;

  const mcpUrl = process.env.MCP_URL;
  const mcpLabel = process.env.MCP_LABEL || 'broadway_copilot_mcp';
  const allowedTools = ['getLatestColorAnalysis', 'getRecentMessages', 'getWardrobeItems'];

  const tools = mcpUrl
    ? ([
        {
          type: 'mcp',
          server_label: mcpLabel,
          server_url: mcpUrl,
          allowed_tools: allowedTools,
          require_approval: 'never',
        } as any,
      ] as any)
    : undefined;

  const mcpListTools = mcpUrl
    ? ({
        id: `mcpl_${Date.now()}`,
        type: 'mcp_list_tools',
        server_label: mcpLabel,
        tools: [
          {
            annotations: null,
            name: 'getLatestColorAnalysis',
            description:
              "Requires user_id as a parameter. .Get the user's latest color analysis. This includes details about the user's undertone, seasonal palette, skin tone, eye color, hair color, and top 3 colors for their profile and their 3 colors to avoid.",
            input_schema: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
              },
              required: ['user_id'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            annotations: null,
            name: 'getRecentMessages',
            description:
              "Requires user_id as a parameter. The number of messages to return is optional and is set to 12 by default. This returns the transcript between the user and the assistant. Messages are returned in order Get the user's latest chat messages up to n messages. This includes the user's messages and the assistant's responses.",
            input_schema: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
                n: { type: 'integer', exclusiveMinimum: 0, maximum: 100 },
              },
              required: ['user_id'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            annotations: null,
            name: 'getWardrobeItems',
            description:
              " Requires user_id as a parameter. Get the user's wardrobe items. This includes the user's clothing items and their details.",
            input_schema: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
              },
              required: ['user_id'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      } as any)
    : undefined;

  const input = Array.isArray(messages)
    ? ([...messages, ...(mcpListTools ? [mcpListTools] : [])] as any)
    : (messages as any);

  const response = await client.responses.create({
    model,
    input,
    text: { format },
    tools,
    reasoning: { effort: reasoning },
  } as any);

  try {
    console.log('🧠 [OPENAI:RAW_RESPONSE]');
    console.dir(response, { depth: null });
  } catch {}

  const outputText = (response as any).output_text as string;
  const toolNames: string[] = [];
  try {
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) collect(item);
        return;
      }
      if (typeof node === 'object') {
        const type = node.type as string | undefined;
        const name = (node.name || node.tool_name) as string | undefined;
        if ((type === 'tool_use' || type === 'tool_result' || type === 'tool' || type === 'mcp_call') && name) {
          toolNames.push(name);
        }
        for (const key of Object.keys(node)) collect((node as any)[key]);
      }
    };
    collect(response);
  } catch {}
  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error('Failed to parse model output as JSON');
  }
  const validated = schema.parse(parsed) as any;
  const uniqueNames = Array.from(new Set(toolNames));
  return Object.assign({}, validated, { __tool_calls: { total: uniqueNames.length, names: uniqueNames } });
}

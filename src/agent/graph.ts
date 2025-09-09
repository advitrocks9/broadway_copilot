import 'dotenv/config';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { User, PendingType } from '@prisma/client';

import { askUserInfoNode } from './nodes/askUserInfo';
import { colorAnalysisNode } from './nodes/colorAnalysis';
import { handleGeneralNode } from './nodes/handleGeneral';
import { handleStylingNode } from './nodes/handleStyling';
import { ingestMessageNode } from './nodes/ingestMessage';
import { recordUserInfoNode } from './nodes/recordUserInfo';
import { routeIntent } from './nodes/routeIntent';
import { routeStyling } from './nodes/routeStyling';
import { routeGeneralNode } from './nodes/routeGeneral';
import { sendReplyNode } from './nodes/sendReply';
import { vibeCheckNode } from './nodes/vibeCheck';
import { IntentLabel, AvailableService, Replies, StylingIntent, GeneralIntent } from './state';
import { HttpError, createError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Shared state annotation for all agent nodes defining the complete agent state.
 * Contains user information, conversation history, routing decisions, and response data.
 */
export const GraphAnnotation = Annotation.Root({
  user: Annotation<User | undefined>(),
  input: Annotation<Record<string, unknown> | undefined>(),
  conversationHistoryWithImages: Annotation<BaseMessage[] | undefined>(),
  conversationHistoryTextOnly: Annotation<BaseMessage[] | undefined>(),
  intent: Annotation<IntentLabel | undefined>(),
  stylingIntent: Annotation<StylingIntent | undefined>(),
  generalIntent: Annotation<GeneralIntent | undefined>(),
  missingProfileField: Annotation<('gender' | 'age_group') | undefined>(),
  availableServices: Annotation<AvailableService[] | undefined>(),
  assistantReply: Annotation<Replies | undefined>(),
  pending: Annotation<PendingType | undefined>(),
});

let compiledApp: ReturnType<typeof StateGraph.prototype.compile> | null = null;
logger.info('Agent graph definition loaded');

/**
 * Builds and compiles the agent's state graph defining all nodes and their transitions.
 * The graph orchestrates the conversation flow from message ingestion through routing
 * and handling to final response generation.
 *
 * @returns Compiled StateGraph instance ready for execution
 */
export function buildAgentGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('ingest_message', ingestMessageNode)
    .addNode('record_user_info', recordUserInfoNode)
    .addNode('route_intent', routeIntent)
    .addNode('route_general', routeGeneralNode)
    .addNode('ask_user_info', askUserInfoNode)
    .addNode('handle_styling', handleStylingNode)
    .addNode('vibe_check', vibeCheckNode)
    .addNode('color_analysis', colorAnalysisNode)
    .addNode('handle_general', handleGeneralNode)
    .addNode('send_reply', sendReplyNode)
    .addNode('route_styling', routeStyling)
    .addEdge(START, 'ingest_message')
    .addConditionalEdges(
      'ingest_message',
      (s: any) => {
        if (s.pending === PendingType.ASK_USER_INFO) {
          return 'record_user_info';
        }
        return 'route_intent';
      },
      {
        record_user_info: 'record_user_info',
        route_intent: 'route_intent',
      },
    )
    .addEdge('record_user_info', 'route_intent')
    .addConditionalEdges('route_intent', (s: any) => {
      if (s.missingProfileField) {
        return 'ask_user_info';
      }
      return s.intent || 'general';
    }, {
      ask_user_info: 'ask_user_info',
      general: 'route_general',
      vibe_check: 'vibe_check',
      color_analysis: 'color_analysis',
      styling: 'route_styling',
    })
    .addEdge('route_general', 'handle_general')
    .addConditionalEdges(
      'route_styling',
      (s: any) => {
        if (s.assistantReply) {
          return 'send_reply';
        }
        if (s.stylingIntent) {
          return 'handle_styling';
        }
        return 'handle_general';
      },
      {
        handle_styling: 'handle_styling',
        handle_general: 'handle_general',
        send_reply: 'send_reply',
      },
    )
    .addEdge('vibe_check', 'send_reply')
    .addEdge('ask_user_info', 'send_reply')
    .addEdge('handle_styling', 'send_reply')
    .addEdge('color_analysis', 'send_reply')
    .addEdge('handle_general', 'send_reply')
    .addEdge('send_reply', END);

  return graph.compile();
}

/**
 * Executes the agent graph for a single message with proper error handling and abort support.
 * Compiles the graph on first run and reuses it for subsequent executions.
 *
 * @param input - Raw Twilio webhook payload containing message data
 * @param options - Optional configuration including abort signal
 * @throws {AbortError} When the operation is aborted via signal
 * @throws {HttpError} For business logic errors (preserved with original status)
 * @throws {HttpError} For unexpected errors (wrapped as 500 internal server error)
 */
export async function runAgent(input: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<void> {
  const userId = (input as any).From;
  const messageId = (input as any).MessageSid;

  if (!userId) {
    throw createError.badRequest('User ID is required');
  }

  try {
    if (!compiledApp) {
      logger.info('Compiling agent graph for the first time');
      compiledApp = buildAgentGraph();
    }

    await compiledApp.invoke({ input: input }, { configurable: { thread_id: userId }, signal: options?.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }

    logger.error({ userId, messageId, err: err.message, stack: err.stack }, 'Agent run failed');

    if (err instanceof HttpError) {
      throw err;
    }

    throw createError.internalServerError('Agent execution failed', { cause: err });
  }
}

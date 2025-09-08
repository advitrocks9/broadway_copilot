import 'dotenv/config';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { IntentLabel, AvailableService, Replies, StylingIntent } from './state';
import { routeIntent } from './nodes/routeIntent';
import { askUserInfoNode } from './nodes/askUserInfo';
import { handleStylingNode } from './nodes/handleStyling';
import { vibeCheckNode } from './nodes/vibeCheck';
import { colorAnalysisNode } from './nodes/colorAnalysis';
import { handleGeneralNode } from './nodes/handleGeneral';
import { ingestMessageNode } from './nodes/ingestMessage';
import { inferProfileNode } from './nodes/inferProfile';
import { sendReplyNode } from './nodes/sendReply';
import { routeStyling } from './nodes/routeStyling';
import { getLogger } from '../utils/logger';
import { BaseMessage } from '@langchain/core/messages';
import { User, PendingType } from '@prisma/client';
/**
 * Constructs and runs the LangGraph-based conversational agent.
 */
const GraphAnnotation = Annotation.Root({
  user: Annotation<User | undefined>(),
  input: Annotation<Record<string, unknown> | undefined>(),
  conversationHistoryWithImages: Annotation<BaseMessage[] | undefined>(),
  conversationHistoryTextOnly: Annotation<BaseMessage[] | undefined>(),
  intent: Annotation<IntentLabel | undefined>(),
  stylingIntent: Annotation<StylingIntent | undefined>(),
  availableServices: Annotation<AvailableService[] | undefined>(),
  assistantReply: Annotation<Replies | undefined>(),
  pending: Annotation<PendingType | undefined>(),
});

let compiledApp: ReturnType<typeof StateGraph.prototype.compile> | null = null;
const logger = getLogger('agent:graph');

/**
 * Builds and compiles the agent's state graph.
 */
export function buildAgentGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('ingest_message', ingestMessageNode)
    .addNode('infer_profile', inferProfileNode)
    .addNode('route_intent', routeIntent)
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
        if (s.pending === 'ASK_INFO') {
          return 'infer_profile';
        } else {
          return 'route_intent';
        }
      },
      {
        infer_profile: 'infer_profile',
        route_intent: 'route_intent',
      },
    )
    .addEdge('infer_profile', 'route_intent')
    .addConditionalEdges('route_intent', (s: any) => {
      if (s.missingProfileField) {
        return 'ask_user_info';
      }
      return s.intent || 'general';
    }, {
      ask_user_info: 'ask_user_info',
      general: 'handle_general',
      vibe_check: 'vibe_check',
      color_analysis: 'color_analysis',
      styling: 'route_styling',
    })
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

export async function runAgent( input : Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<void> {

  if (!compiledApp) {
    logger.info('Compiling agent graph');
    compiledApp = buildAgentGraph();
  }
  await compiledApp.invoke({ input: input }, {
    configurable: { thread_id: ( input.waId ) },
    signal: options?.signal,
  });
} 

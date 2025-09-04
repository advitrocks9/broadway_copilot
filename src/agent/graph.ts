import 'dotenv/config';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { IntentLabel, AvailableService, Replies } from './state';
import { routeIntent } from './nodes/routeIntent';
import { askUserInfoNode } from './nodes/askUserInfo';
import { handleOccasionNode } from './nodes/handleOccasion';
import { handleVacationNode } from './nodes/handleVacation';
import { handlePairingNode } from './nodes/handlePairing';
import { vibeCheckNode } from './nodes/vibeCheck';
import { colorAnalysisNode } from './nodes/colorAnalysis';
import { handleGeneralNode } from './nodes/handleGeneral';
import { wardrobeIndexNode } from './nodes/wardrobeIndex';
import { ingestMessageNode } from './nodes/ingestMessage';
import { inferProfileNode } from './nodes/inferProfile';
import { handleSuggestNode } from './nodes/handleSuggest';
import { sendReplyNode } from './nodes/sendReply';
import { getLogger } from '../utils/logger';
import { BaseMessage } from '@langchain/core/messages';
import { User, PendingType } from '@prisma/client';
/**
 * Constructs and runs the LangGraph-based conversational agent.
 */
const GraphAnnotation = Annotation.Root({
  user: Annotation<User | undefined>(),
  input: Annotation<Record<string, unknown> | undefined>(),
  conversationHistory: Annotation<BaseMessage[] | undefined>(),
  conversationHistoryLight: Annotation<BaseMessage[] | undefined>(),
  intent: Annotation<IntentLabel | undefined>(),
  availableServices: Annotation<AvailableService[] | undefined>(),
  assistantReply: Annotation<Replies | string | undefined>(),
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
    .addNode('handle_occasion', handleOccasionNode)
    .addNode('handle_vacation', handleVacationNode)
    .addNode('handle_pairing', handlePairingNode)
    .addNode('vibe_check', vibeCheckNode)
    .addNode('color_analysis', colorAnalysisNode)
    .addNode('wardrobe_index', wardrobeIndexNode)
    .addNode('handle_suggest', handleSuggestNode)
    .addNode('handle_general', handleGeneralNode)
    .addNode('send_reply', sendReplyNode)
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
      return s.intent || 'handle_general';
    }, {
      general: 'handle_general',
      occasion: 'handle_occasion',
      vacation: 'handle_vacation',
      pairing: 'handle_pairing',
      suggest: 'handle_suggest',
      ask_user_info: 'ask_user_info',
      color_analysis: 'color_analysis',
      vibe_check: 'vibe_check',
    })
    .addEdge('vibe_check', 'send_reply')
    .addEdge('vibe_check', 'wardrobe_index')
    .addEdge('wardrobe_index', END)
    .addEdge('ask_user_info', 'send_reply')
    .addEdge('handle_occasion', 'send_reply')
    .addEdge('handle_vacation', 'send_reply')
    .addEdge('handle_pairing', 'send_reply')
    .addEdge('handle_suggest', 'send_reply')
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

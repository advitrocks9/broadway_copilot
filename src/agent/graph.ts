import 'dotenv/config';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { IntentLabel, RunInput, RunOutput, RequiredProfileField, Reply, ModelMessage } from './state';
import { routeIntent } from './nodes/routeIntent';
import { askUserInfoNode } from './nodes/askUserInfo';
import { handleOccasionNode } from './nodes/handleOccasion';
import { handleVacationNode } from './nodes/handleVacation';
import { handlePairingNode } from './nodes/handlePairing';
import { vibeCheckNode } from './nodes/vibeCheck';
import { colorAnalysisNode } from './nodes/colorAnalysis';
import { checkImageNode } from './nodes/checkImage';
import { handleGeneralNode } from './nodes/handleGeneral';
import { wardrobeIndexNode } from './nodes/wardrobeIndex';
import { ingestMessageNode } from './nodes/ingestMessage';
import { handleSuggestNode } from './nodes/handleSuggest';
import { sendReplyNode } from './nodes/sendReply';

const GraphAnnotation = Annotation.Root({
  input: Annotation<RunInput>(),
  intent: Annotation<IntentLabel | undefined>(),
  reply: Annotation<Reply | string | undefined>(),
  mode: Annotation<'text' | 'menu' | 'card' | undefined>(),
  missingProfileFields: Annotation<Array<RequiredProfileField> | undefined>(),
  postAction: Annotation<'followup' | 'complete' | undefined>(),
  next: Annotation<string | undefined>(),
  pending: Annotation<'vibe_check' | 'color_analysis' | null | undefined>(),
  userTurnId: Annotation<string | undefined>(),
  messages: Annotation<ModelMessage[] | undefined>(),
});

let compiledApp: any | null = null;

export function buildAgentGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('ingest_message', ingestMessageNode)
    .addNode('route_intent', routeIntent)
    .addNode('ask_user_info', askUserInfoNode)
    .addNode('handle_occasion', handleOccasionNode)
    .addNode('handle_vacation', handleVacationNode)
    .addNode('handle_pairing', handlePairingNode)
    .addNode('check_image', checkImageNode)
    .addNode('vibe_check', vibeCheckNode)
    .addNode('color_analysis', colorAnalysisNode)
    .addNode('wardrobe_index', wardrobeIndexNode)
    .addNode('handle_suggest', handleSuggestNode)
    
    .addNode('handle_general', handleGeneralNode)
    .addNode('send_reply', sendReplyNode)
    .addEdge(START, 'ingest_message')
    .addEdge('ingest_message', 'route_intent')
    .addConditionalEdges('route_intent', (s: any) => s.next || 'handle_general', {
      handle_general: 'handle_general',
      handle_occasion: 'handle_occasion',
      handle_vacation: 'handle_vacation',
      handle_pairing: 'handle_pairing',
      handle_suggest: 'handle_suggest',
      check_image: 'check_image',
      ask_user_info: 'ask_user_info',
      color_analysis: 'color_analysis',
      vibe_check: 'vibe_check',
    })
    .addConditionalEdges(
      'check_image',
      (s: any) => s.next || 'send_reply',
      {
        send_reply: 'send_reply',
        vibe_check: 'vibe_check',
        color_analysis: 'color_analysis',
      }
    )
    .addEdge('vibe_check', 'wardrobe_index')
    .addEdge('wardrobe_index', 'send_reply')
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

export async function runAgent(input: any): Promise<RunOutput & { intent?: IntentLabel; messages?: any[] }> {
  if (!compiledApp) {
    compiledApp = buildAgentGraph();
  }
  const result = await compiledApp.invoke({ input }, {
    configurable: { thread_id: (input?.userId || input?.From || 'unknown') },
  });
  if (!result) return { replyText: 'I had a problem there. Please try again.' };
  type FinalState = { reply?: string | Reply; mode?: 'text' | 'menu' | 'card'; intent?: IntentLabel; messages?: ModelMessage[] };
  const state = result as FinalState;
  const finalReply = typeof state.reply === 'string' ? state.reply : state.reply?.reply_text ?? '';
  const mode = state.mode as 'text' | 'menu' | undefined;
  const intent = state.intent as IntentLabel | undefined;
  const messages = state.messages as ModelMessage[] | undefined;
  return { replyText: finalReply, mode, intent, messages };
} 
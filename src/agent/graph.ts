import 'dotenv/config';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { IntentLabel, RunInput, RunOutput, RequiredProfileField, Reply } from './state';
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
import { inferProfileNode } from './nodes/inferProfile';
import { handleSuggestNode } from './nodes/handleSuggest';
import { sendReplyNode } from './nodes/sendReply';

const GraphAnnotation = Annotation.Root({
  input: Annotation<RunInput>(),
  intent: Annotation<IntentLabel | undefined>(),
  reply: Annotation<Reply | string | undefined>(),
  replies: Annotation<Array<Reply | string> | undefined>(),
  missingProfileFields: Annotation<Array<RequiredProfileField> | undefined>(),
  next: Annotation<string | undefined>(),
  
});

let compiledApp: any | null = null;

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
    .addNode('check_image', checkImageNode)
    .addNode('vibe_check', vibeCheckNode)
    .addNode('color_analysis', colorAnalysisNode)
    .addNode('wardrobe_index', wardrobeIndexNode)
    .addNode('handle_suggest', handleSuggestNode)
    
    .addNode('handle_general', handleGeneralNode)
    .addNode('send_reply', sendReplyNode)
    .addEdge(START, 'ingest_message')
    .addEdge('ingest_message', 'infer_profile')
    .addEdge('infer_profile', 'route_intent')
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

/**
 * Runs the agent graph with the given input.
 */
export async function runAgent(input: any): Promise<RunOutput & { intent?: IntentLabel }> {
  if (!compiledApp) {
    compiledApp = buildAgentGraph();
  }
  const result = await compiledApp.invoke({ input }, {
    configurable: { thread_id: (input?.userId || input?.From || 'unknown') },
  });
  if (!result) return { replyText: 'I had a problem there. Please try again.' };
  type FinalState = { reply?: string | Reply; replies?: Array<string | Reply>; mode?: 'text' | 'menu' | 'card'; intent?: IntentLabel };
  const state = result as FinalState;
  const arrayReplies = Array.isArray(state.replies) ? state.replies : (state.reply ? [state.reply] : []);
  const first = arrayReplies[0];
  const finalReply = typeof first === 'string' ? first : (first?.reply_text ?? '');
  const mode = (typeof first === 'string' ? 'text' : first?.reply_type) as 'text' | 'menu' | 'card' | undefined;
  const intent = state.intent as IntentLabel | undefined;
  return { replyText: finalReply, mode, intent };
} 
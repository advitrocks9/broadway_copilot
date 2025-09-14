import { PendingType } from '@prisma/client';
import { END, START, StateGraph } from '../lib/graph';
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
import { GraphState } from './state';
import { logger } from '../utils/logger';

/**
 * Builds and compiles the agent's state graph defining all nodes and their transitions.
 * The graph orchestrates the conversation flow from message ingestion through routing
 * and handling to final response generation.
 *
 * @returns Compiled StateGraph instance ready for execution
 */
export function buildAgentGraph() {
  const graph = new StateGraph<GraphState>(null)
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
      (s: GraphState) => {
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
    .addConditionalEdges(
      'route_intent',
      (s: GraphState) => {
        if (s.missingProfileField) {
          return 'ask_user_info';
        }
        return s.intent || 'general';
      },
      {
        ask_user_info: 'ask_user_info',
        general: 'route_general',
        vibe_check: 'vibe_check',
        color_analysis: 'color_analysis',
        styling: 'route_styling',
      },
    )
    .addEdge('route_general', 'handle_general')
    .addConditionalEdges(
      'route_styling',
      (s: GraphState) => {
        if (s.assistantReply) {
          return 'send_reply';
        }
        if (s.stylingIntent) {
          return 'handle_styling';
        }
        logger.warn({ userId: s.user.id }, 'Exiting styling flow unexpectedly, routing to general');
        return 'route_general';
      },
      {
        handle_styling: 'handle_styling',
        route_general: 'route_general',
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

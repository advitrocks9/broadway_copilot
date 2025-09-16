import { PendingType } from '@prisma/client';
import { END, START, StateGraph } from '../lib/graph';
import {
  askUserInfo,
  colorAnalysis,
  handleGeneral,
  handleStyling,
  ingestMessage,
  recordUserInfo,
  routeIntent,
  routeStyling,
  routeGeneral,
  sendReply,
  vibeCheck,
} from './nodes';
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
    .addNode('ingestMessage', ingestMessage)
    .addNode('recordUserInfo', recordUserInfo)
    .addNode('routeIntent', routeIntent)
    .addNode('routeGeneral', routeGeneral)
    .addNode('askUserInfo', askUserInfo)
    .addNode('handleStyling', handleStyling)
    .addNode('vibeCheck', vibeCheck)
    .addNode('colorAnalysis', colorAnalysis)
    .addNode('handleGeneral', handleGeneral)
    .addNode('sendReply', sendReply)
    .addNode('routeStyling', routeStyling)
    .addEdge(START, 'ingestMessage')
    .addConditionalEdges(
      'ingestMessage',
      (s: GraphState) => {
        if (s.pending === PendingType.ASK_USER_INFO) {
          return 'recordUserInfo';
        }
        return 'routeIntent';
      },
      {
        recordUserInfo: 'recordUserInfo',
        routeIntent: 'routeIntent',
      },
    )
    .addEdge('recordUserInfo', 'routeIntent')
    .addConditionalEdges(
      'routeIntent',
      (s: GraphState) => {
        if (s.missingProfileField) {
          return 'askUserInfo';
        }
        return s.intent || 'general';
      },
      {
        askUserInfo: 'askUserInfo',
        general: 'routeGeneral',
        vibe_check: 'vibeCheck',
        color_analysis: 'colorAnalysis',
        styling: 'routeStyling',
      },
    )
    .addEdge('routeGeneral', 'handleGeneral')
    .addConditionalEdges(
      'routeStyling',
      (s: GraphState) => {
        if (s.assistantReply) {
          return 'sendReply';
        }
        if (s.stylingIntent) {
          return 'handleStyling';
        }
        logger.warn({ userId: s.user.id }, 'Exiting styling flow unexpectedly, routing to general');
        return 'routeGeneral';
      },
      {
        handleStyling: 'handleStyling',
        routeGeneral: 'routeGeneral',
        sendReply: 'sendReply',
      },
    )
    .addEdge('vibeCheck', 'sendReply')
    .addEdge('askUserInfo', 'sendReply')
    .addEdge('handleStyling', 'sendReply')
    .addEdge('colorAnalysis', 'sendReply')
    .addEdge('handleGeneral', 'sendReply')
    .addEdge('sendReply', END);

  return graph.compile();
}

import { PendingType } from '@prisma/client';
import { END, START, StateGraph } from '../lib/graph';
import { logger } from '../utils/logger';
import {
  askUserInfo,
  colorAnalysis,
  handleFeedback,
  handleGeneral,
  handleStyling,
  ingestMessage,
  recordUserInfo,
  routeGeneral,
  routeIntent,
  routeStyling,
  sendReply,
  vibeCheck,
} from './nodes';
import { GraphState } from './state';

export function buildAgentGraph() {
  const graph = new StateGraph<GraphState>()
    .addNode('ingestMessage', ingestMessage)
    .addNode('recordUserInfo', recordUserInfo)
    .addNode('routeIntent', routeIntent)
    .addNode('routeGeneral', routeGeneral)
    .addNode('askUserInfo', askUserInfo)
    .addNode('handleStyling', handleStyling)
    .addNode('handleFeedback', handleFeedback)
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
        if (s.pending === PendingType.FEEDBACK) {
          return 'handleFeedback';
        }
        return 'routeIntent';
      },
      {
        recordUserInfo: 'recordUserInfo',
        handleFeedback: 'handleFeedback',
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
        // Removed redundant debug log as per review

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
    .addEdge('handleFeedback', 'sendReply')
    .addEdge('sendReply', END);

  return graph.compile();
}

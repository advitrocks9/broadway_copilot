import { z } from 'zod';

import { ConversationStatus, PendingType } from '@prisma/client';
import { getTextLLM, SystemMessage } from '../../lib/ai';
import { prisma } from '../../lib/prisma';
import { queueMemoryExtraction } from '../../lib/tasks';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState, Replies } from '../state';

const FEEDBACK_ACK_FALLBACK =
  "Thanks so much for sharing—I'm really glad I can keep making your styling chats better!";
const FEEDBACK_NOT_SAVED =
  "Ah, I missed that one. Mind sharing your feedback again? I'd really appreciate it!";

const LLMOutputSchema = z.object({
  helpful: z
    .boolean()
    .nullable()
    .describe(
      'Whether the user found the conversation helpful. Null if it is not stated or unclear.',
    ),
  comment: z
    .string()
    .nullable()
    .describe('A concise summary of any comments shared by the user about their experience.'),
  acknowledgement: z
    .string()
    .min(1)
    .describe('A short, friendly acknowledgement message to send back to the user.'),
});

export async function handleFeedback(state: GraphState): Promise<GraphState> {
  const { conversationId, conversationHistoryTextOnly, user } = state;
  const systemPromptText = await loadPrompt('data/record_feedback.txt');
  const systemPrompt = new SystemMessage(systemPromptText);

  const trimmedHistory = conversationHistoryTextOnly.slice(-3);

  const { helpful, comment, acknowledgement } = await getTextLLM()
    .withStructuredOutput(LLMOutputSchema)
    .run(systemPrompt, trimmedHistory, state.traceBuffer, 'handleFeedback');

  let replies: Replies = [{ reply_type: 'text', reply_text: FEEDBACK_NOT_SAVED }];
  const sanitizedComment = comment?.trim() ? comment.trim() : null;
  const acknowledgementText = acknowledgement?.trim() ? acknowledgement.trim() : null;

  if (helpful !== null || sanitizedComment) {
    await prisma.$transaction(async (tx) => {
      await tx.feedback.upsert({
        where: { conversationId },
        update: {
          helpful,
          comment: sanitizedComment,
        },
        create: {
          conversationId,
          helpful,
          comment: sanitizedComment,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: ConversationStatus.CLOSED },
      });
    });

    queueMemoryExtraction(user.id, conversationId);

    replies = [
      {
        reply_type: 'text',
        reply_text: acknowledgementText ?? FEEDBACK_ACK_FALLBACK,
      },
    ];

    logger.info(
      { userId: user.id, conversationId, helpful, hasComment: Boolean(sanitizedComment) },
      'Stored user feedback',
    );
  }

  return {
    ...state,
    assistantReply: replies,
    pending: PendingType.NONE,
  };
}

import { PendingType, User } from '@prisma/client';

import { BaseMessage } from '../lib/ai';
import { QuickReplyButton, TwilioWebhookRequest } from '../lib/twilio/types';
import { TraceBuffer } from './tracing';

export interface GraphState {
  graphRunId: string;
  conversationId: string;
  traceBuffer: TraceBuffer;
  input: TwilioWebhookRequest;
  user: User;
  /** Includes image content parts for multimodal models (e.g. OpenAI vision) */
  conversationHistoryWithImages: BaseMessage[];
  /** Text-only variant for faster, text-based models (e.g. Groq) */
  conversationHistoryTextOnly: BaseMessage[];
  intent: IntentLabel | null;
  stylingIntent: StylingIntent | null;
  generalIntent: GeneralIntent | null;
  missingProfileField: MissingProfileField | null;
  availableServices: AvailableService[];
  assistantReply: Replies | null;
  pending: PendingType | null;
}

export type IntentLabel = 'general' | 'vibe_check' | 'color_analysis' | 'styling';

export type StylingIntent = 'occasion' | 'vacation' | 'pairing' | 'suggest';

export type GeneralIntent = 'greeting' | 'menu' | 'chat';

export type AvailableService =
  | 'vibe_check'
  | 'occasion'
  | 'vacation'
  | 'color_analysis'
  | 'suggest';

type Reply =
  | {
      reply_type: 'text';
      reply_text: string;
    }
  | {
      reply_type: 'quick_reply';
      reply_text: string;
      buttons: QuickReplyButton[];
    }
  | {
      reply_type: 'image';
      media_url: string;
      reply_text?: string;
    };

export type Replies = Reply[];

export type MissingProfileField = 'gender' | 'age_group';

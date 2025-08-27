import { z } from 'zod';
import { ValidationError } from './errors';
import { RunInput } from '../agent/state';

/**
 * Input validation utilities for the Broadway Copilot application.
 */

/**
 * Zod schema for validating Twilio webhook payload.
 */
export const TwilioWebhookPayloadSchema = z.object({
  From: z.string().optional(),
  To: z.string().optional(),
  Body: z.string().optional(),
  MessageSid: z.string().optional(),
  SmsSid: z.string().optional(),
  SmsMessageSid: z.string().optional(),
  WaId: z.string().optional(),
  MessageStatus: z.string().optional(),
  SmsStatus: z.string().optional(),
  NumMedia: z.string().optional(),
  MediaUrl0: z.string().optional(),
});

/**
 * Zod schema for validating RunInput.
 */
export const RunInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  waId: z.string().min(1, 'WhatsApp ID is required'),
  text: z.string().max(200, 'Message text must be 200 characters or less').optional(),
  imagePath: z.string().optional(),
  fileId: z.string().optional(),
  buttonPayload: z.string().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  runGen: z.number().optional(),
});

/**
 * Validation utility functions.
 */
export class ValidationUtils {
  /**
   * Validates Twilio webhook payload.
   */
  static validateTwilioWebhook(payload: unknown) {
    try {
      return TwilioWebhookPayloadSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid Twilio webhook payload', {
          validationErrors: error.errors
        });
      }
      throw error;
    }
  }

  /**
   * Validates RunInput data.
   */
  static validateRunInput(input: unknown) {
    try {
      return RunInputSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid run input', {
          validationErrors: error.errors
        });
      }
      throw error;
    }
  }

  /**
   * Validates message length and content.
   */
  static validateMessageContent(content: string): { isValid: boolean; reason?: string } {
    if (!content || content.trim().length === 0) {
      return { isValid: false, reason: 'Message cannot be empty' };
    }

    if (content.length > 200) {
      return { isValid: false, reason: 'Message too long (max 200 characters)' };
    }

    // Check for potentially harmful content patterns
    const harmfulPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /<iframe/i,
      /<object/i
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'Message contains potentially harmful content' };
      }
    }

    return { isValid: true };
  }

  /**
   * Checks if an object has the structure of a RunInput.
   */
  static isRunInput(obj: unknown): obj is RunInput {
    return typeof obj === 'object' &&
           obj !== null &&
           'userId' in obj &&
           'waId' in obj &&
           typeof (obj as any).userId === 'string' &&
           typeof (obj as any).waId === 'string';
  }
}

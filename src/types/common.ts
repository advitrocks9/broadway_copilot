/**
 * Common types and interfaces shared across the application.
 * This file contains standardized type definitions used throughout the Broadway Copilot system.
 */

/**
 * Quick reply button structure for interactive messages.
 */
export interface QuickReplyButton {
  text: string;
  id: string;
}



/**
 * Status resolvers for tracking message delivery.
 */
export interface StatusResolvers {
  resolveSent: () => void;
  resolveDelivered: () => void;
  sentPromise: Promise<void>;
  deliveredPromise: Promise<void>;
  cleanupTimer?: NodeJS.Timeout;
}

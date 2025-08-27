import { InboundState, InboundRecord, BucketState, QueueEntry, TwilioWebhookPayload } from '../types/twilio';
import { getLogger } from '../utils/logger';
import { HOUR_MS, TEN_MINUTES_MS, SIX_SECONDS_MS, TTL_MS, SWEEP_MS, CAPACITY, REFILL_MS_PER_TOKEN } from '../utils/constants';

/**
 * Logger instance for runtime state management.
 */
const logger = getLogger('svc:runtime_state');

const tokenBuckets = new Map<string, BucketState>();
const inboundLogs = new Map<string, InboundRecord[]>();
const userQueues = new Map<string, QueueEntry[]>();
const userProcessing = new Set<string>();
const latestGeneration = new Map<string, number>();
const currentBodiesMap = new Map<string, TwilioWebhookPayload[]>();
const controllers = new Map<string, AbortController>();
const lastActivity = new Map<string, number>();

/**
 * Updates the last activity timestamp for a user.
 * This is used for cleanup and expiration tracking.
 */
function touch(userKey: string): void {
  lastActivity.set(userKey, Date.now());
}

/**
 * Removes all data associated with a user key.
 * Used during cleanup operations.
 */
function deleteUserData(userKey: string): void {
  tokenBuckets.delete(userKey);
  inboundLogs.delete(userKey);
  userQueues.delete(userKey);
  userProcessing.delete(userKey);
  latestGeneration.delete(userKey);
  currentBodiesMap.delete(userKey);
  controllers.delete(userKey);
  lastActivity.delete(userKey);
}

/**
 * Sweeps expired user data to prevent memory leaks.
 * Runs periodically to clean up inactive users.
 */
function sweepExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  const expiredKeys: string[] = [];

  // Collect expired keys first to avoid modification during iteration
  for (const [key, ts] of lastActivity) {
    if (ts < cutoff) {
      expiredKeys.push(key);
    }
  }

  // Delete expired user data
  for (const key of expiredKeys) {
    deleteUserData(key);
  }

  if (expiredKeys.length > 0) {
    logger?.info({ expiredCount: expiredKeys.length }, 'Cleaned up expired user data');
  }
}

setInterval(sweepExpired, SWEEP_MS).unref?.();

/**
 * Helper function that executes an operation and updates user activity timestamp.
 * @param userKey - The user identifier
 * @param operation - Function to execute
 * @returns Result of the operation
 */
function withActivityTouch<T>(userKey: string, operation: () => T): T {
  try {
    return operation();
  } finally {
    touch(userKey);
  }
}

/**
 * Sanitizes a WhatsApp ID for use as a user key.
 * @param waId - WhatsApp identifier to sanitize
 * @returns Sanitized user key string
 */
export function sanitizeUserKey(waId: string): string {
  return (waId || '').toString();
}

/**
 * Consumes a token from the user's rate limiting bucket.
 * @param userKey - The user identifier
 * @returns Rate limiting result with allowance status
 */
export function takeToken(userKey: string): { allowed: boolean; remaining: number; resetMs: number } {
  return withActivityTouch(userKey, () => {
    const now = Date.now();
    const prev = tokenBuckets.get(userKey) || { tokens: CAPACITY, updatedAtMs: now };
    const elapsed = Math.max(0, now - prev.updatedAtMs);
    const refill = Math.floor(elapsed / REFILL_MS_PER_TOKEN);
    let tokens = prev.tokens;
    let updatedAtMs = prev.updatedAtMs;
    if (refill > 0) {
      tokens = Math.min(CAPACITY, tokens + refill);
      updatedAtMs = updatedAtMs + refill * REFILL_MS_PER_TOKEN;
    }
    if (tokens <= 0) {
      const untilNext = REFILL_MS_PER_TOKEN - (now - updatedAtMs);
      tokenBuckets.set(userKey, { tokens, updatedAtMs });
      return { allowed: false, remaining: 0, resetMs: Math.max(0, untilNext) };
    }
    tokens -= 1;
    tokenBuckets.set(userKey, { tokens, updatedAtMs });
    const nextRefillMs = REFILL_MS_PER_TOKEN - Math.max(0, (now - updatedAtMs));
    return { allowed: true, remaining: tokens, resetMs: Math.max(0, nextRefillMs) };
  });
}

/**
 * Records the state of an inbound message for tracking purposes.
 * @param waId - WhatsApp identifier
 * @param id - Message identifier
 * @param state - Current processing state
 */
export function recordInbound(waId: string, id: string, state: InboundState): void {
  const key = sanitizeUserKey(waId);
  const list = inboundLogs.get(key) || [];
  const rec: InboundRecord = { id, waId, ts: Date.now(), state };
  list.unshift(rec);
  const hourAgo = Date.now() - HOUR_MS;
  const pruned = list.filter(r => r.ts >= hourAgo).slice(0, 500);
  if (pruned.length === 0) inboundLogs.delete(key); else inboundLogs.set(key, pruned);
  touch(key);
}

/**
 * Retrieves recent inbound message records for a user.
 * @param waId - WhatsApp identifier
 * @returns Array of recent inbound records
 */
export function getRecentInbound(waId: string): InboundRecord[] {
  const key = sanitizeUserKey(waId);
  touch(key);
  return inboundLogs.get(key) || [];
}

/**
 * Adds a message to the user's processing queue.
 * @param waId - WhatsApp identifier
 * @param entry - Message entry to enqueue
 * @returns New queue length
 */
export function enqueue(waId: string, entry: QueueEntry): number {
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  q.push(entry);
  userQueues.set(key, q);
  touch(key);
  return q.length;
}

/**
 * Returns all queued messages and clears the queue.
 * @param waId - WhatsApp identifier
 * @returns Array of queued message entries
 */
export function snapshotAndClearQueue(waId: string): QueueEntry[] {
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  userQueues.set(key, []);
  touch(key);
  return q;
}

/**
 * Checks if a user has pending messages in their queue.
 * @param waId - WhatsApp identifier
 * @returns true if there are pending messages
 */
export function hasPending(waId: string): boolean {
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  touch(key);
  return q.length > 0;
}

/**
 * Checks if a user is currently being processed.
 * @param waId - WhatsApp identifier
 * @returns true if user is being processed
 */
export function isProcessing(waId: string): boolean {
  const key = sanitizeUserKey(waId);
  touch(key);
  return userProcessing.has(key);
}

/**
 * Sets the processing state for a user.
 * @param waId - WhatsApp identifier
 * @param processing - Whether the user is being processed
 */
export function setProcessing(waId: string, processing: boolean): void {
  const key = sanitizeUserKey(waId);
  if (processing) userProcessing.add(key); else userProcessing.delete(key);
  touch(key);
}

export function getLatestGen(waId: string): number | undefined {
  const key = sanitizeUserKey(waId);
  touch(key);
  return latestGeneration.get(key);
}

export function setLatestGen(waId: string, gen: number): void {
  const key = sanitizeUserKey(waId);
  latestGeneration.set(key, gen);
  touch(key);
}

export function getCurrentBodies(waId: string): TwilioWebhookPayload[] {
  const key = sanitizeUserKey(waId);
  touch(key);
  return currentBodiesMap.get(key) || [];
}

export function setCurrentBodies(waId: string, bodies: TwilioWebhookPayload[]): void {
  const key = sanitizeUserKey(waId);
  currentBodiesMap.set(key, bodies);
  touch(key);
}

export function clearCurrentBodies(waId: string): void {
  const key = sanitizeUserKey(waId);
  currentBodiesMap.delete(key);
  touch(key);
}

export function setController(waId: string, controller: AbortController): void {
  const key = sanitizeUserKey(waId);
  controllers.set(key, controller);
  touch(key);
}

export function getController(waId: string): AbortController | undefined {
  const key = sanitizeUserKey(waId);
  touch(key);
  return controllers.get(key);
}

export function clearController(waId: string): void {
  const key = sanitizeUserKey(waId);
  controllers.delete(key);
  touch(key);
}

export function abortActiveRun(waId: string): void {
  const key = sanitizeUserKey(waId);
  const c = controllers.get(key);
  if (c) {
    try { c.abort(); } catch { /* ignore */ }
  }
  touch(key);
}



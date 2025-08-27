type InboundState = 'received' | 'processing' | 'sent' | 'aborted';

export type InboundRecord = { id: string; waId: string; ts: number; state: InboundState };

type BucketState = { tokens: number; updatedAtMs: number };

const TTL_MS = 60 * 60 * 1000;
const SWEEP_MS = 10 * 60 * 1000;

const CAPACITY = 5;
const REFILL_MS_PER_TOKEN = 6000;

const tokenBuckets = new Map<string, BucketState>();
const inboundLogs = new Map<string, InboundRecord[]>();
const userQueues = new Map<string, Array<{ id: string; body: any; ts: number }>>();
const userProcessing = new Set<string>();
const latestGeneration = new Map<string, number>();
const currentBodiesMap = new Map<string, any[]>();
const controllers = new Map<string, AbortController>();
const lastActivity = new Map<string, number>();

function touch(userKey: string): void {
  lastActivity.set(userKey, Date.now());
}

function sweepExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ts] of lastActivity) {
    if (ts < cutoff) {
      tokenBuckets.delete(key);
      inboundLogs.delete(key);
      userQueues.delete(key);
      userProcessing.delete(key);
      latestGeneration.delete(key);
      currentBodiesMap.delete(key);
      controllers.delete(key);
      lastActivity.delete(key);
    }
  }
}

setInterval(sweepExpired, SWEEP_MS).unref?.();

export function sanitizeUserKey(waId: string): string {
  return (waId || '').toString();
}

export function takeToken(userKey: string): { allowed: boolean; remaining: number; resetMs: number } {
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
    touch(userKey);
    return { allowed: false, remaining: 0, resetMs: Math.max(0, untilNext) };
  }
  tokens -= 1;
  tokenBuckets.set(userKey, { tokens, updatedAtMs });
  touch(userKey);
  const nextRefillMs = REFILL_MS_PER_TOKEN - Math.max(0, (now - updatedAtMs));
  return { allowed: true, remaining: tokens, resetMs: Math.max(0, nextRefillMs) };
}

export function recordInbound(waId: string, id: string, state: InboundState): void {
  const key = sanitizeUserKey(waId);
  const list = inboundLogs.get(key) || [];
  const rec: InboundRecord = { id, waId, ts: Date.now(), state };
  list.unshift(rec);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const pruned = list.filter(r => r.ts >= hourAgo).slice(0, 500);
  if (pruned.length === 0) inboundLogs.delete(key); else inboundLogs.set(key, pruned);
  touch(key);
}

export function getRecentInbound(waId: string): InboundRecord[] {
  const key = sanitizeUserKey(waId);
  touch(key);
  return inboundLogs.get(key) || [];
}

export function enqueue(waId: string, entry: { id: string; body: any; ts: number }): number {
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  q.push(entry);
  userQueues.set(key, q);
  touch(key);
  return q.length;
}

export function snapshotAndClearQueue(waId: string): Array<{ id: string; body: any; ts: number }>{
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  userQueues.set(key, []);
  touch(key);
  return q;
}

export function hasPending(waId: string): boolean {
  const key = sanitizeUserKey(waId);
  const q = userQueues.get(key) || [];
  touch(key);
  return q.length > 0;
}

export function isProcessing(waId: string): boolean {
  const key = sanitizeUserKey(waId);
  touch(key);
  return userProcessing.has(key);
}

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

export function getCurrentBodies(waId: string): any[] {
  const key = sanitizeUserKey(waId);
  touch(key);
  return currentBodiesMap.get(key) || [];
}

export function setCurrentBodies(waId: string, bodies: any[]): void {
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



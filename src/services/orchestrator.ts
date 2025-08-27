import { getLogger } from '../utils/logger';
import { runAgent } from '../agent/graph';
import { takeToken, recordInbound, enqueue, snapshotAndClearQueue, hasPending, setProcessing, getLatestGen, setLatestGen, getCurrentBodies, setCurrentBodies, clearCurrentBodies, abortActiveRun, setController, clearController } from './runtimeState';
import { OrchestrateOptions, TwilioWebhookPayload } from '../types/twilio';
import { combineBodies, isAbortError } from '../utils/twilioHelpers';

const logger = getLogger('svc:orchestrator');

export async function orchestrateInbound({ body }: OrchestrateOptions): Promise<void> {
  const waId: string = (body?.From || '').toString();
  const messageId: string = (body?.MessageSid || body?.SmsMessageSid || body?.WaId || `${Date.now()}`);
  if (!waId) return;

  const rl = takeToken(waId);
  if (!rl.allowed) {
    logger.info({ waId, resetMs: rl.resetMs }, 'Rate limited inbound');
    recordInbound(waId, messageId, 'aborted');
    return;
  }

  recordInbound(waId, messageId, 'received');

  const now = Date.now();
  enqueue(waId, { id: messageId, body, ts: now });

  if (getLatestGen(waId)) {
    abortActiveRun(waId);
  }

  try {
    while (true) {
      const batch = snapshotAndClearQueue(waId);
      if (batch.length === 0) break;

      const priorBodies = getCurrentBodies(waId);
      const bodies: TwilioWebhookPayload[] = [...priorBodies, ...batch.map(b => b.body as TwilioWebhookPayload)];
      const combined = combineBodies(bodies);

      const myGen = Date.now();
      setLatestGen(waId, myGen);
      setProcessing(waId, true);
      setCurrentBodies(waId, bodies);

      for (const b of batch) {
        recordInbound(waId, b.id, 'processing');
      }

      try {
        const controller = new AbortController();
        setController(waId, controller);
            await runAgent({ ...combined, runGen: myGen } as Record<string, unknown>, { signal: controller.signal });
      } catch (err: unknown) {
        if (isAbortError(err)) {
          logger.info({ waId }, 'Run aborted due to new inbound');
        } else {
          logger.error({ waId, error: err }, 'Agent execution failed');
          throw err;
        }
      } finally {
        clearController(waId);
        setProcessing(waId, false);
        clearCurrentBodies(waId);
      }

      for (const b of batch) {
        recordInbound(waId, b.id, 'sent');
      }
    }
  } catch (err: unknown) {
    if (isAbortError(err)) {
      logger.info({ waId }, 'Processing loop aborted');
    } else {
      logger.error({ waId, error: err }, 'Orchestrator error');
    }
  }
}
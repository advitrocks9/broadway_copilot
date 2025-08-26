import { getLogger } from '../utils/logger';
import { runAgent } from '../agent/graph';
import { takeToken, recordInbound, enqueue, snapshotAndClearQueue, hasPending, setProcessing, getLatestGen, setLatestGen, getCurrentBodies, setCurrentBodies, clearCurrentBodies, abortActiveRun, setController, clearController } from './runtimeState';

const logger = getLogger('svc:orchestrator');

export type OrchestrateOptions = { body: any };

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
      const bodies = [...priorBodies, ...batch.map(b => b.body)];
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
        await runAgent({ ...combined, _runGen: myGen }, { signal: controller.signal });
      } catch (err: any) {
        if (isAbortError(err)) {
          logger.info({ waId }, 'Run aborted due to new inbound');
        } else {
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
  } catch (err: any) {
    if (isAbortError(err)) {
      logger.info({ waId }, 'Processing loop aborted');
    } else {
      logger.error({ err }, 'Orchestrator error');
    }
  }
}

function combineBodies(bodies: any[]): any {
  if (bodies.length === 1) return bodies[0];
  const first = bodies[0] || {};
  const texts = bodies.map(b => (b?.Body || '').toString()).filter(Boolean);
  const latestMedia = [...bodies].reverse().find(b => b?.NumMedia && Number(b.NumMedia) > 0);
  return {
    ...first,
    Body: texts.join('\n\n'),
    NumMedia: latestMedia?.NumMedia || first.NumMedia,
    MediaUrl0: latestMedia?.MediaUrl0 || first.MediaUrl0,
  };
}

function isAbortError(err: unknown): boolean {
  const e = err as any;
  return e?.name === 'AbortError' || e?.message === 'Aborted' || e?.code === 'ABORT_ERR';
}



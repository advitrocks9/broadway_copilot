import prisma from '../db/client';
import type { Prisma } from '@prisma/client';

export async function createModelTrace(args: {
  kind: string;
  rawRequest: unknown;
  rawResponse: unknown;
  uploadId?: string;
}) {
  try {
    await prisma.modelTrace.create({
      data: {
        kind: args.kind,
        uploadId: args.uploadId ?? null,
        rawRequest: args.rawRequest as Prisma.InputJsonValue,
        rawResponse: args.rawResponse as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error('Failed to write ModelTrace', err);
  }
}



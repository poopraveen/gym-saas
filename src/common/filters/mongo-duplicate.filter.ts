import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Request } from 'express';

/** Returns true if the error or any cause is a MongoDB duplicate key error (code 11000). */
function isMongoDuplicateKey(err: unknown): boolean {
  let e: unknown = err;
  while (e) {
    const code = (e as { code?: number })?.code;
    if (code === 11000 || code === 11001) return true;
    e = (e as { cause?: unknown })?.cause;
  }
  return false;
}

/** Returns true if the error looks like a MongoDB connection / database unavailable error. */
function isMongoConnectionError(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? '';
  const name = (err as Error)?.name ?? '';
  return (
    name === 'MongoNetworkError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoError' ||
    name === 'MongoAuthenticationError' ||
    msg.includes('connect econnrefused') ||
    msg.includes('mongo network') ||
    msg.includes('mongo server selection') ||
    msg.includes('connection refused') ||
    msg.includes('topology was destroyed') ||
    msg.includes('server selection timed out') ||
    msg.includes('authentication failed') ||
    msg.includes('mongodb')
  );
}

/** Safe 200 responses for critical paths so the app can load when DB/auth fails. */
function getSafeResponseForPath(path: string): { status: number; body: unknown } | null {
  const p = (path || '').split('?')[0];
  if (p.endsWith('/api/tenants/config') || p.endsWith('/tenants/config')) {
    return { status: 200, body: { name: 'Reps & Dips', theme: 'dark', allowsMedicalDocuments: false, medicalDocumentsLimit: 5 } };
  }
  if (p.endsWith('/api/notifications/vapid-public-key') || p.endsWith('/notifications/vapid-public-key')) {
    return { status: 200, body: { publicKey: null } };
  }
  if (p.endsWith('/api/legacy/list') || p.endsWith('/legacy/list')) {
    return { status: 200, body: [] };
  }
  return null;
}

/**
 * Global filter: turn MongoDB duplicate key (11000) into 409; DB connection errors into 503.
 * For critical read-only paths (tenants/config, vapid-public-key, legacy/list), any other error returns 200 with safe body so the app can load.
 */
@Catch()
export class MongoDuplicateKeyExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongoDuplicateKeyExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = request?.url ?? request?.path ?? '';

    if (isMongoDuplicateKey(exception)) {
      this.logger.warn('MongoDB duplicate key (unhandled)', (exception as Error)?.message);
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: 'A record with this value already exists.',
        error: 'Conflict',
      });
      return;
    }

    if (isMongoConnectionError(exception)) {
      this.logger.error('MongoDB connection error', (exception as Error)?.message);
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database unavailable. Is MongoDB running? Check MONGODB_URI in .env.',
        error: 'Service Unavailable',
      });
      return;
    }

    const safe = getSafeResponseForPath(path);
    if (safe) {
      this.logger.warn(`Unhandled error for ${path}, returning safe fallback: ${(exception as Error)?.message}`);
      response.status(safe.status).json(safe.body);
      return;
    }

    throw exception;
  }
}

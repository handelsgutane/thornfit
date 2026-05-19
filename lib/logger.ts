/**
 * Strukturert logging.
 *
 * Én-linjers JSON til stdout/stderr i prod (Vercel samler det opp).
 * Pen output i dev.
 *
 * Bruk:
 * ```ts
 * logger.info('order created', { orderId, total });
 * logger.error('webhook signature failed', { source: 'vipps', error });
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, context: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const isDev = process.env.NODE_ENV !== 'production';
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

  if (isDev) {
    const prefix = `[${level.toUpperCase()}]`;
    stream(prefix, msg, Object.keys(context).length ? context : '');
  } else {
    stream(JSON.stringify(entry));
  }
}

/** Serialize Error til plain object for JSON-logging. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }
  return { error: String(err) };
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};

import { routingLogger } from '@/lib/services/routing-logger';

type MaybePromise<T> = T | Promise<T>;

export interface MeasureOptions<T> {
  requestId?: string;
  data?: Record<string, unknown>;
  onSuccessData?: (result: T) => Record<string, unknown> | void;
  onErrorData?: (error: unknown) => Record<string, unknown> | void;
}

const getPerformance = (): Performance | undefined => {
  if (typeof globalThis !== 'undefined' && globalThis.performance) {
    return globalThis.performance;
  }
  return undefined;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function measureOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: MeasureOptions<T>
): Promise<T>;
export function measureOperation<T>(
  operation: string,
  fn: () => T,
  options?: MeasureOptions<T>
): T;
export function measureOperation<T>(
  operation: string,
  fn: () => MaybePromise<T>,
  options: MeasureOptions<T> = {}
): MaybePromise<T> {
  const perf = getPerformance();
  const id = `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startMark = `${id}-start`;
  const endMark = `${id}-end`;
  const measureName = `${id}-measure`;

  const baseData = {
    operation,
    ...(options.data || {})
  };

  const startTime = perf ? perf.now() : Date.now();

  if (perf && perf.mark) {
    try {
      perf.mark(startMark);
    } catch {
      // ignore mark failures
    }
  }

  const finalize = (success: boolean, extraData?: Record<string, unknown>) => {
    let duration = (perf ? perf.now() : Date.now()) - startTime;

    if (perf && perf.mark && perf.measure) {
      try {
        perf.mark(endMark);
        const measure = perf.measure(measureName, startMark, endMark);
        duration = measure.duration;
      } catch {
        // fallback to previously calculated duration
      } finally {
        try {
          if (perf.clearMarks) {
            perf.clearMarks(startMark);
            perf.clearMarks(endMark);
          }
          if (perf.clearMeasures) {
            perf.clearMeasures(measureName);
          }
        } catch {
          // ignore clear failures
        }
      }
    }

    routingLogger.logPerformance(
      options.requestId || id,
      operation,
      Number(duration.toFixed(2)),
      {
        success,
        ...baseData,
        ...(extraData || {})
      }
    );
  };

  try {
    const result = fn();

    if (result instanceof Promise) {
      return result
        .then((value) => {
          const extra = options.onSuccessData ? options.onSuccessData(value) : undefined;
          finalize(true, extra || {});
          return value;
        })
        .catch((error) => {
          const extra = options.onErrorData
            ? options.onErrorData(error)
            : { error: getErrorMessage(error) };
          finalize(false, extra || {});
          throw error;
        });
    }

    const extra = options.onSuccessData ? options.onSuccessData(result) : undefined;
    finalize(true, extra || {});
    return result;
  } catch (error) {
    const extra = options.onErrorData
      ? options.onErrorData(error)
      : { error: getErrorMessage(error) };
    finalize(false, extra || {});
    throw error;
  }
}
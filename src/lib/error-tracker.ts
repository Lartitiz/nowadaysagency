import { Sentry } from "@/lib/sentry";
import { reportClientError } from "@/lib/client-error-monitor";

export function trackError(error: unknown, context?: Record<string, any>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err.message, context);
  void reportClientError("operation");

  if (import.meta.env.PROD) {
    (Sentry as any).captureException(err, {
      extra: context,
    });
  }
}

export function trackWarning(message: string, context?: Record<string, any>) {
  console.warn(message, context);

  if (import.meta.env.PROD) {
    (Sentry as any).captureMessage(message, {
      level: "warning",
      extra: context,
    });
  }
}

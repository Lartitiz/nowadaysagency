import { Sentry } from "@/lib/sentry";

export function trackError(error: unknown, context?: Record<string, any>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err.message, context);

  if (import.meta.env.PROD) {
    Sentry.captureException(err, {
      extra: context,
    });
  }
}

export function trackWarning(message: string, context?: Record<string, any>) {
  console.warn(message, context);

  if (import.meta.env.PROD) {
    Sentry.captureMessage(message, {
      level: "warning",
      extra: context,
    });
  }
}

import * as Sentry from "@sentry/react";

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || "",
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event) {
        if (import.meta.env.DEV) return null;
        return event;
      },
    });
  }
}

export function enableSentryReplays() {
  const client = Sentry.getClient();
  if (client) {
    Sentry.addIntegration(Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }));
  }
}

export function disableSentryReplays() {
  const client = Sentry.getClient();
  if (client) {
    const replay = client.getIntegrationByName("Replay");
    if (replay && typeof (replay as any).stop === "function") {
      (replay as any).stop();
    }
  }
}

export { Sentry };

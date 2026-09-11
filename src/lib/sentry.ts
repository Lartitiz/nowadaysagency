import * as Sentry from "@sentry/react";
import { hasAnalyticsConsent } from "./analytics-consent";

let initialized = false;
let replayInstalled = false;

export function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN && !initialized) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || "",
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event) {
        if (import.meta.env.DEV) return null;
        return event;
      },
    });
    initialized = true;
    if (hasAnalyticsConsent()) enableSentryReplays();
  }
}

export function enableSentryReplays() {
  if (!hasAnalyticsConsent()) return;
  const client = Sentry.getClient();
  if (client) {
    if (!replayInstalled) {
      Sentry.addIntegration(Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }));
      replayInstalled = true;
    } else {
      void Sentry.getReplay()?.startBuffering();
    }
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

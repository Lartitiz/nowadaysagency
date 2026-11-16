import posthog from 'posthog-js';
import { hasAnalyticsConsent } from './analytics-consent';
import { registerPostHogClient } from './posthog-lazy';

let initialized = false;

export function initPostHog() {
  if (!hasAnalyticsConsent() || initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  // Sans clé configurée (env Lovable manquant), ne pas initialiser :
  // posthog.init('') logue une erreur console à chaque chargement et ne sert à rien.
  if (!key) return;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'memory',
    autocapture: true,
  });
  initialized = true;
  registerPostHogClient(posthog);
  posthog.opt_in_capturing();
}

export function enablePostHog() {
  // Premier allumage : initPostHog fait déjà l'opt-in (sinon « $opt_in » part en double).
  if (!initialized) {
    initPostHog();
    return;
  }
  if (hasAnalyticsConsent()) posthog.opt_in_capturing();
}

export function disablePostHog() {
  if (initialized) posthog.opt_out_capturing();
}

export { posthog };

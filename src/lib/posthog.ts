import posthog from 'posthog-js';

export function initPostHog() {
  if (typeof window === 'undefined') return;
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
}

export function enablePostHog() {
  posthog.opt_in_capturing();
}

export function disablePostHog() {
  posthog.opt_out_capturing();
}

export { posthog };

// Façade légère de PostHog : le SDK (~175 Ko) n'est plus dans le paquet de
// démarrage. `@/lib/posthog` (le vrai SDK) se charge à part (main.tsx, page
// Paramètres) et s'enregistre ici une fois initialisé.
//
// Comportement identique à avant : tant que PostHog n'est pas initialisé (pas
// de consentement, pas de clé, pas encore chargé), les appels sont ignorés —
// c'est ce que faisait déjà posthog-js non initialisé.
type PostHogClient = {
  capture: (...args: any[]) => unknown;
  identify: (...args: any[]) => unknown;
  reset: (...args: any[]) => unknown;
};

let client: PostHogClient | null = null;

export function registerPostHogClient(instance: PostHogClient) {
  client = instance;
}

function call(method: keyof PostHogClient, args: any[]) {
  try {
    client?.[method](...args);
  } catch {
    /* télémétrie : ne jamais casser le parcours */
  }
}

export const posthog = {
  capture: (...args: any[]) => call("capture", args),
  identify: (...args: any[]) => call("identify", args),
  reset: (...args: any[]) => call("reset", args),
};

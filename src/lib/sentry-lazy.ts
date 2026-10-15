// Façade légère de Sentry : le SDK (~140 Ko) n'est plus dans le paquet de
// démarrage. Il se charge à la première erreur à signaler, ou après le premier
// affichage (main.tsx). Chaque appel initialise Sentry si ce n'est pas déjà
// fait (initSentry est idempotent), donc une erreur très précoce est quand même
// envoyée au lieu d'être perdue faute de client.
//
// Même forme que l'ancien import `{ Sentry } from "@/lib/sentry"` : les appels
// existants (`Sentry.captureException(...)`) restent identiques.
type SentryModule = typeof import("@/lib/sentry");

let loading: Promise<SentryModule> | null = null;

export function loadSentry(): Promise<SentryModule> {
  if (!loading) {
    loading = import("@/lib/sentry").then((mod) => {
      mod.initSentry();
      return mod;
    });
    // Un échec de chargement (réseau coupé, nouveau déploiement) ne doit jamais
    // provoquer une deuxième erreur : on permet un nouvel essai plus tard.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function forward(call: (mod: SentryModule) => void) {
  loadSentry().then(call).catch(() => {
    /* télémétrie : silence voulu */
  });
}

export const Sentry = {
  captureException(error: unknown, context?: unknown) {
    forward((m) => (m.Sentry as any).captureException(error, context));
  },
  captureMessage(message: string, context?: unknown) {
    forward((m) => (m.Sentry as any).captureMessage(message, context));
  },
  captureReactException(error: unknown, info: unknown) {
    forward((m) => (m.Sentry as any).captureReactException(error, info));
  },
};

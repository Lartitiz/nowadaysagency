// Choix cookies (bandeau d'arrivée) : une seule fonction pour enregistrer le
// choix et allumer / éteindre PostHog, les replays Sentry et le pixel Meta.
// Les modules sont importés à la demande : le SDK PostHog (~175 Ko) n'entre
// jamais dans le paquet de démarrage.
export type CookieChoice = "accepted" | "refused";

export function readCookieChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem("cookie_consent");
    return v === "accepted" || v === "refused" ? v : null;
  } catch {
    return null;
  }
}

export async function applyCookieChoice(choice: CookieChoice): Promise<void> {
  try {
    localStorage.setItem("cookie_consent", choice);
  } catch {
    /* stockage bloqué : le choix vaudra pour cette page seulement */
  }
  const steps =
    choice === "accepted"
      ? [
          import("@/lib/posthog").then((m) => m.enablePostHog()),
          import("@/lib/sentry").then((m) => m.enableSentryReplays()),
          import("@/lib/meta-pixel").then((m) => m.enableMetaPixel()),
        ]
      : [
          import("@/lib/posthog").then((m) => m.disablePostHog()),
          import("@/lib/sentry").then((m) => m.disableSentryReplays()),
          import("@/lib/meta-pixel").then((m) => m.disableMetaPixel()),
        ];
  // Télémétrie : un module qui échoue ne doit jamais casser le parcours.
  await Promise.allSettled(steps);
}

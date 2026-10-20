// Le diagnostic est gratuit pendant l'INSCRIPTION seulement. L'état d'inscription
// est lu côté serveur, jamais dans la requête : avant le 20/10/2026, le champ
// `isOnboarding` envoyé par le navigateur suffisait à sauter le quota (1 appel
// Sonnet + jusqu'à 3 appels Opus gratuits et sans trace, à volonté).
//
// Inscription en cours = aucune des deux tables ne dit onboarding_completed=true
// (même règle que src/hooks/use-onboarding.ts). Une utilisatrice qui refait son
// démarrage après l'avoir fini garde onboarding_completed=true : son diagnostic
// compte alors comme un audit (1 crédit), comme depuis la page des audits.
// En cas d'erreur de lecture : pas gratuit (le quota normal s'applique).

export async function inscriptionEnCours(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
): Promise<boolean> {
  try {
    const [profil, config] = await Promise.all([
      sb.from("profiles").select("onboarding_completed").eq("user_id", userId).maybeSingle(),
      sb.from("user_plan_config").select("onboarding_completed").eq("user_id", userId).maybeSingle(),
    ]);
    if (profil.error || config.error) {
      console.warn(JSON.stringify({ type: "diagnostic_inscription_illisible", userId }));
      return false;
    }
    return profil.data?.onboarding_completed !== true && config.data?.onboarding_completed !== true;
  } catch {
    return false;
  }
}

// cron-health, scope daily : sonde des crédits Photoroom (fiche 18 lot 1, à l'identique).
import { joursDepuisReset, jugerCredits } from "./photoroom-alerte.ts";

// Crédits Photoroom (plan Basic 1000 img/mois, souscrit le 09/07/2026 → reset le 9
// de chaque mois ; une retouche fond IA ≈ 5 crédits). À épuisement l'API renvoie 402
// et TOUTES les retouches photo de l'app échouent — d'où la surveillance quotidienne.
// Le jugement (seuils + significativité du rythme) vit dans `photoroom-alerte.ts`,
// testé par `photoroom-alerte_test.ts` — cf. le faux positif du 09/09/2026.

export async function photoroomCredits(now: number) {
  const key = Deno.env.get("PHOTOROOM_API_KEY");
  if (!key) return { erreur: "PHOTOROOM_API_KEY absent" };
  try {
    const r = await fetch("https://image-api.photoroom.com/v1/account", {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { erreur: `HTTP ${r.status} ${(await r.text()).slice(0, 90)}` };
    const credits = (await r.json())?.credits;
    if (typeof credits?.available !== "number") return { erreur: "réponse sans credits.available" };
    const restants = credits.available;
    const abonnement = typeof credits.subscription === "number" ? credits.subscription : null;
    const consommes = abonnement !== null ? abonnement - restants : null;
    // Jours écoulés depuis le dernier reset (le 9 du mois), pour le rythme moyen.
    // ⚠️ Le jour du reset, ce recul vaut 1 : la moyenne n'est alors PAS significative
    // (et le compteur Photoroom, qui rebascule à l'heure de souscription ~23h15,
    // reflète encore le mois précédent) → `jugerCredits` s'abstient. Faux positif
    // du 09/09/2026 : 210 crédits sur 31 jours affichés « 210/j ».
    const jours = joursDepuisReset(now);
    const { moyenne_par_jour, rythme_significatif, alerte } = jugerCredits(restants, consommes, jours);
    return { restants, abonnement, consommes_mois: consommes, jours_depuis_reset: jours, moyenne_par_jour, rythme_significatif, alerte };
  } catch (e) {
    return { erreur: String((e as any)?.message || e).slice(0, 90) };
  }
}

// cron-health, scope weekly : « 🔌 Connexions figées » (sonde décidée le 09/11/2026).
// Google (GA4), Canva et Pinterest renouvellent leur jeton À L'USAGE : la date
// d'expiration en base suit le dernier renouvellement. Le 23/10/2026, les trois
// connexions de Laetitia étaient mortes depuis des semaines sans que rien ne le
// signale (#1787), et l'app Google était restée en mode test (jetons tués à 7 j).
//
// Règle : jeton expiré depuis plus de SEUIL_JOURS = connexion pas renouvelée
// depuis au moins ce délai (personne ne s'en sert, ou la plateforme refuse le
// renouvellement). Clientes et comptes internes comptés à part (les connexions
// de Laetitia servent de témoin). Fonction pure, testée par connexions-figees_test.ts.
// Jamais de nom de compte ni d'adresse en sortie.
import { DAY } from "./lecture.ts";

export const PLATEFORMES_AUTO_RENOUVELEES = ["google", "canva", "pinterest"] as const;
export const SEUIL_JOURS = 30;

export function connexionsFigees(
  rows: { user_id: string; platform: string; token_expires_at: string | null }[],
  { isClient, now }: { isClient: (userId: string) => boolean; now: number },
) {
  const par_plateforme: Record<string, number> = { google: 0, canva: 0, pinterest: 0 };
  let clientes = 0;
  let internes = 0;
  for (const r of rows) {
    if (!(PLATEFORMES_AUTO_RENOUVELEES as readonly string[]).includes(r.platform)) continue;
    const exp = r.token_expires_at ? Date.parse(r.token_expires_at) : NaN;
    if (!(exp < now - SEUIL_JOURS * DAY)) continue;
    par_plateforme[r.platform]++;
    if (isClient(r.user_id)) clientes++;
    else internes++;
  }
  return { seuil_jours: SEUIL_JOURS, clientes, internes, par_plateforme, alerte: clientes + internes > 0 };
}

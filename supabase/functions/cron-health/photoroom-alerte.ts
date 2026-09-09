// Jugement des crédits Photoroom — extrait de `index.ts` pour être TESTABLE.
//
// Pourquoi ce fichier existe (faux positif du 09/09/2026) :
// le plan Basic se réinitialise le 9 de chaque mois, et l'ancienne formule
// divisait la consommation du mois par `Math.max(1, jours écoulés)`. Résultat,
// LE JOUR DU RESET le dénominateur vaut 1 et le « rythme par jour » devient égal
// à la consommation du mois ENTIER : 210 crédits consommés en 31 jours (6,8/j,
// parfaitement sain) se sont affichés « 210/j > 150/j — épuisement avant le
// reset », et le rapport du matin a conclu à une dérive inexistante.
//
// Deux causes se cumulent, et la seconde est structurelle :
//   1. l'arrondi au jour supérieur donne 1 dès la première seconde du cycle ;
//   2. l'abonnement a été souscrit le 09/07 vers 23h15, donc Photoroom ne
//      rebascule son compteur qu'à cette heure-là — toute la journée du 9, on
//      lit encore la consommation du mois PRÉCÉDENT sur un dénominateur de 1.
//
// Règle retenue : un rythme moyen n'a de sens qu'avec assez de recul. En deçà
// de MIN_JOURS_POUR_RYTHME, on ne publie pas de moyenne et on ne déclenche pas
// d'alerte de rythme. Le seuil ABSOLU (restants bas), lui, reste actif tous les
// jours — c'est celui qui protège réellement contre le 402.

export const PHOTOROOM_RESET_DAY = 9;
export const PHOTOROOM_ALERTE_RESTANTS = 300; // seuil bas absolu
export const PHOTOROOM_ALERTE_PAR_JOUR = 150; // rythme insoutenable (1000/mois ≈ 33/j)
/** En deçà, la moyenne « par jour » n'est pas significative (cf. en-tête). */
export const MIN_JOURS_POUR_RYTHME = 3;

const DAY = 24 * 3600000;

export function joursDepuisReset(now: number, resetDay = PHOTOROOM_RESET_DAY): number {
  const d = new Date(now);
  const reset = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCDate() < resetDay ? 1 : 0), resetDay),
  );
  return Math.max(1, Math.ceil((now - reset.getTime()) / DAY));
}

export type JugementPhotoroom = {
  moyenne_par_jour: number | null;
  rythme_significatif: boolean;
  alerte: string | null;
};

export function jugerCredits(
  restants: number,
  consommes: number | null,
  jours: number,
): JugementPhotoroom {
  const significatif = jours >= MIN_JOURS_POUR_RYTHME && consommes !== null;
  const moyenne = significatif ? Math.round((consommes! / jours) * 10) / 10 : null;

  if (restants < PHOTOROOM_ALERTE_RESTANTS) {
    return {
      moyenne_par_jour: moyenne,
      rythme_significatif: significatif,
      alerte: `moins de ${PHOTOROOM_ALERTE_RESTANTS} crédits restants — risque de 402 sur les retouches photo`,
    };
  }
  if (moyenne !== null && moyenne > PHOTOROOM_ALERTE_PAR_JOUR) {
    return {
      moyenne_par_jour: moyenne,
      rythme_significatif: true,
      alerte: `rythme ${moyenne}/j > ${PHOTOROOM_ALERTE_PAR_JOUR}/j — épuisement avant le reset du ${PHOTOROOM_RESET_DAY}`,
    };
  }
  return { moyenne_par_jour: moyenne, rythme_significatif: significatif, alerte: null };
}

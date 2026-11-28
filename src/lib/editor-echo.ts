// L'éditeur reconnaît son propre écho (28/11/2026, Loom de Laetitia).
//
// L'éditeur rend chaque retouche à la page (raw + visuels) et doit ensuite
// reconnaître, quand ces valeurs lui reviennent, que c'est son propre envoi et
// pas un carrousel venu d'ailleurs (sinon il relit tout et revient à la
// slide 1). Il ne retenait que son DERNIER envoi. Avec des retouches très
// rapprochées (zoom d'une photo au pavé tactile pendant le recadrage : des
// dizaines d'envois par seconde), la page lui renvoyait parfois l'avant-
// dernier envoi après qu'il avait déjà fait le suivant : pris pour un
// carrousel étranger → relecture → saut à la slide 1 en plein recadrage.
//
// Ici : on retient les derniers envois. Le dernier compte toujours ; les
// précédents seulement pendant un court laps, pour qu'un vrai retour en
// arrière venu d'ailleurs (copie de secours restaurée…) soit toujours relu.

type Key = readonly unknown[];
const sameKey = (a: Key, b: Key) => a.length === b.length && a.every((v, i) => v === b[i]);

export const ECHO_WINDOW_MS = 2000;

export function createEchoLog(windowMs = ECHO_WINDOW_MS) {
  let log: { key: Key; time: number }[] = [];
  return {
    /** Aucun envoi ni lecture encore : première arrivée de visuels. */
    get empty() { return log.length === 0; },
    remember(key: Key, now = Date.now()) {
      log = [...log.filter((e) => now - e.time < windowMs).slice(-19), { key, time: now }];
    },
    isEcho(key: Key, now = Date.now()) {
      const last = log[log.length - 1];
      return log.some((e) => sameKey(e.key, key) && (e === last || now - e.time < windowMs));
    },
    /** Carrousel relu depuis la page : les anciens envois ne valent plus. */
    reset(key: Key, now = Date.now()) { log = [{ key, time: now }]; },
  };
}

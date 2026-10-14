// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 1, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Retournements par négation et formules moulées.

import { normalizeWordsForOverlap } from "./text-utils.ts";

// ── Détection de la famille « retournement par négation » ──
// Mêmes variantes que la règle ANTI_SLOP : "Ce n'est pas X, c'est Y" /
// "Pas X. Y." / "X n'est plus Y. C'est Z." / "Je ne dis pas X. Je dis Y."
export const REVERSAL_PATTERNS: RegExp[] = [
  // Nominal antithesis: punctuation/newlines and curly apostrophes included.
  // Deliberately exclude factual fragments such as « Pas dimanche » / « Pas de stock ».
  /(?:^|[.!?]\s+)[^.!?\n]{2,100}[.!]\s+Pas (?:un(?:e)?|des|du|de la|de l['’]|le|la|les|l['’])\s*[^.!?\n]{2,100}[.!?]?/i,
  /\bn(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bc(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bne sont pas [^.!?\n]{2,90}[.,:] ?[Cc]e sont\b/,
  /\bn(?:'|’)est plus [^.!?\n]{2,90}\. ?[Cc](?:'|’)est\b/,
  /(?:^|[.!?]\s+)Pas (?:parce que|pour|un|une|de|du|des|le|la|les|ça)\b[^.!?\n]{0,80}[.:] ?(?:[CcJj](?:'|’)|Juste|Parce que|Mais)/,
  /\bJe ne [^.!?\n]{2,60} pas(?: ça)?[^.!?\n]{0,40}\. ?Je [^\s]+ (?:parce que|pour|que)\b/,
  /(?:^|[.!?]\s+)Pas [^.!?\n]{2,60}\. ?(?:C(?:'|’)est|Juste|Plutôt)\b/,
  // ── Formes COURTES, mesurées hors radar sur le corpus stories du 07/09/2026
  // (5 des 7 retournements d'une séquence passaient sans être comptés) ──
  // « Et non, c'est pas parce que ça marchait pas. »
  /\bEt non, c(?:'|’)est pas\b/,
  // « Pas "amélioré un peu". Calmées. » (négation citée, puis un mot seul)
  /(?:^|[.!?]\s+)Pas ["'«“‘][^"'»”’\n]{2,60}["'»”’]\. ?\p{Lu}[^.!?\n]{0,40}[.!]/u,
  // « C'est pas de ta faute. » / « Ce n'est pas de votre faute. »
  /\bc(?:'|’)est pas de (?:ta|votre|sa|leur) faute\b/i,
  // « Pas pour les raisons que tu crois. »
  /\bpas pour les raisons que (?:tu crois|vous croyez|tu penses|vous pensez)\b/i,
  // « … comme une crème. Pas comme un produit ménager. »
  /\bcomme [^.!?\n]{2,50}\. ?Pas comme\b/,
  // ── Concession de paille + « Sauf que… » vide (test réel LinkedIn 04/10/2026) ──
  // « C'est logique, sur le papier. Sauf que ce n'est pas tout à fait comme ça
  // que ça fonctionne. » La concession n'est comptée QUE suivie d'un « Sauf que »
  // ou « Mais non » : « en théorie… En pratique, [mécanisme] » reste permis.
  /(?:^|[.!?]\s+)(?:C(?:'|’)est (?:logique|séduisant|tentant|cohérent)|Ça (?:se tient|paraît logique|semble logique)), (?:sur le papier|en théorie)[.!] ?(?:Sauf que|Mais non)\b[^.!?\n]{0,90}/,
  /(?:^|[.!?]\s+)(?:Sur le papier|En théorie), (?:ça se tient|c(?:'|’)est logique|ça paraît logique|ça marche|tout se tient)[.!] ?(?:Sauf que|Mais non)\b[^.!?\n]{0,90}/,
  // « Sauf que » en OUVERTURE de phrase suivi d'une négation vide (sans le
  // mécanisme). Un « sauf que » factuel en milieu de phrase, ou « Sauf que la
  // livraison a du retard », ne compte pas.
  /(?:^|[.!?]\s+|\n\s*)Sauf que (?:non\b|(?:ce n(?:'|’)est|c(?:'|’)est|ça n(?:'|’)est) pas (?:tout à fait|vraiment|si simple|aussi simple|exactement|comme ça|ce qui se passe|le cas)|ça ne (?:marche|fonctionne|se passe) pas (?:comme ça|vraiment|tout à fait|ainsi|du tout))[^.!?\n]{0,80}/,
  // ── Antithèse croyance / réalité en deux phrases miroir (re-test réel 04/10/2026) ──
  // « On croit en faire plus. On en fait souvent moins. » / « Tu penses gagner du
  // temps. Tu en perds. » : la 2e phrase est une chute courte (≤ 50 caractères)
  // qui renverse la 1re. Une explication développée après « On pense que… » ne compte pas.
  /(?:^|[.!?]\s+|\n\s*)(?:On|Tu|Vous|Nous) (?:croit|crois|croyez|croyons|pense|penses|pensez|pensons|s['’]imagine|t['’]imagines|vous imaginez|a l['’]impression d(?:e |['’])|as l['’]impression d(?:e |['’]))[^.!?\n]{2,60}[.!] ?(?:Mais |En réalité,? |En fait,? |Au final,? |Résultat ?: )?(?:on|tu|vous|nous|On|Tu|Vous|Nous)\b[^.!?\n]{2,45}[.!]/,
  // ── Contraste « pas X. Y » au MÊME verbe (re-test réel LinkedIn 04/10/2026) ──
  // « Je ne cherche pas à produire plus de pièces. Je cherche les quelques-unes
  // qui ont une vraie identité. » / « On n'achète pas un objet. On achète une
  // histoire. » : la 2e phrase reprend le sujet ET le verbe niés pour renverser.
  /(?:^|[.!?]\s+|\n\s*)(Je|Tu|On|Nous|Vous|Il|Elle|Ils|Elles) ne (\p{L}+) pas\b[^.!?\n]{2,90}[.!] ?(?:Mais |Non, )?\1 \2\b/iu,
  /(?:^|[.!?]\s+|\n\s*)(?:Je|J['’]) n['’](\p{L}+) pas\b[^.!?\n]{2,90}[.!] ?(?:Mais |Non, )?J['’]\1\b/iu,
  /(?:^|[.!?]\s+|\n\s*)(Tu|On|Nous|Vous|Il|Elle|Ils|Elles) n['’](\p{L}+) pas\b[^.!?\n]{2,90}[.!] ?(?:Mais |Non, )?\1 \2\b/iu,
  // ── « X, pas Y. » en fin de phrase (re-test réel LinkedIn 04/10/2026) ──
  // « … ont vu leurs résultats baisser, pas augmenter. » : contraste plaqué en
  // queue de phrase (1 à 3 mots). Les tournures figées restent permises :
  // « pas plus », « pas encore », « pas toujours », « pas forcément », « ou pas »…
  /[^.!?\n]{8,}, pas (?!(?:plus|moins|encore|toujours|forcément|vraiment|du tout|mal|trop|question|seulement|tant|si|non plus|à pas|d['’]un coup|besoin|grave|sûr|sûre|certain|certaine|facile|simple|évident|moi|toi|lui|elle|nous|vous|eux|elles|ça|celui-là|celle-là)\b)(?:[\p{L}'’-]+\s?){1,3}[.!]/u,
  // Même contraste avec un sujet nom repris par un pronom (re-test réel 04/10/2026) :
  // « Instagram ne regarde pas combien tu publies. Il regarde ce que les gens font… »
  /(?:^|[.!?]\s+|\n\s*)(?:L['’]|Le |La |Les |Ton |Ta |Tes |Votre |Vos |Mon |Ma |Mes )?\p{Lu}?[\p{L}'’-]+(?: [\p{L}'’-]+){0,3} ne (\p{L}+) pas\b[^.!?\n]{2,90}[.!] ?(?:Mais )?(?:Il|Elle|Ils|Elles) \1\b/u,
  /(?:^|[.!?]\s+|\n\s*)(?:L['’]|Le |La |Les |Ton |Ta |Tes |Votre |Vos |Mon |Ma |Mes )?\p{Lu}?[\p{L}'’-]+(?: [\p{L}'’-]+){0,3} n['’](\p{L}+) pas\b[^.!?\n]{2,90}[.!] ?(?:Mais )?(?:Il|Elle|Ils|Elles) \1\b/u,
];

// Formules moulées repérées à l'identique dans deux contenus générés à 30 min
// d'écart : si on les laisse, elles se voient dès que deux posts cohabitent.
export const MOULDED_VERBATIMS: RegExp[] = [
  // Toutes les fins possibles (« justifier », « dénigrer », « me plaindre »…) :
  // c'est l'OUVERTURE qui est moulée, vue à l'identique dans des contenus distincts.
  /Je ne dis pas ça pour /i,
  /L(?:'|’)IA structure, toi tu incarnes/i,
  // Amorce de prise de position suggérée par DEPTH_LAYER_DUAL, devenue un tic :
  // mesurée dans 5/10 carrousels du corpus qualité 11/07, toujours même position.
  /Ce qui me (?:dérange|gêne)\b/i,
];

export function findReversals(text: string): string[] {
  const found: string[] = [];
  // Analyse phrase par phrase pour remonter des extraits actionnables
  const sentences = (text || "").split(/(?<=[.!?])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const window = sentences.slice(i, i + 2).join(" ");
    for (const re of REVERSAL_PATTERNS) {
      const m = window.match(re);
      if (m) {
        found.push(m[0].slice(0, 140));
        break;
      }
    }
  }
  // Un même passage vu depuis deux fenêtres (concession + « Sauf que… », puis
  // « Sauf que… » seul) ne compte qu'une fois : on garde l'extrait le plus long.
  const unique = [...new Set(found)];
  return unique.filter((f) => !unique.some((g) => g !== f && g.includes(f)));
}

/**
 * Retire des retournements ceux que l'utilisatrice a ÉCRITS elle-même (brief,
 * réponses, message clé) : « Un savon ça se choisit comme une crème, pas comme
 * un produit ménager » fourni en message clé n'est pas un tic du modèle.
 */
export function dropUserSourcedReversals<T extends { reversals: string[] }>(a: T, userSourceText: string | undefined): T {
  if (!userSourceText || !a.reversals.length) return a;
  const src = normalizeWordsForOverlap(userSourceText).join(" ");
  if (!src) return a;
  const kept = a.reversals.filter((r) => {
    const words = normalizeWordsForOverlap(r);
    // Exige tout le passage détecté : partager quelques mots ne suffit pas.
    const probe = words.length >= 3 ? words.join(" ") : "";
    return !(probe && src.includes(probe));
  });
  return kept.length === a.reversals.length ? a : { ...a, reversals: kept };
}

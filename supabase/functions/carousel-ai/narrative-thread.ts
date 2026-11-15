// Fil du récit continu photo et mixte, lu à voix haute (14/11/2026).
//
// Carrousel photo « fatigue synthétique » jugé « incompréhensible à voix haute,
// il ne se lit pas comme un livre, il n'y a pas de connexion » : six slides
// qui commencent chacune à froid (« Des analyses… », « Pour moi… », « Le
// lisse… », « Cette phrase… », « Pour moi… »), une slide 2 en revue de presse
// (« analyses de tendances relayées par… décrivent… on se lasserait »), une
// couverture abstraite et une fin « oui ou non ? ». Comparé à des carrousels
// qui se lisent jusqu'au bout (chaque slide appelle la suivante, une chose
// concrète avant l'idée, la personne qui parle d'elle) et à la fiche carrousel
// de la marque. Un fichier = une mission : consignes + mesure déterministe,
// branchées dans continuous-narrative.ts.

import { newsWriting } from "./variant-writing.ts";

/** Consigne du récit continu : un texte qui se dit d'une traite. */
export const RECIT_FIL_A_VOIX_HAUTE = `LU À VOIX HAUTE, ÇA S'ENCHAÎNE
Relis le texte comme si la personne le disait d'une traite à quelqu'un en face d'elle, de la couverture à la dernière slide. Chaque paragraphe, sauf le premier, s'accroche au précédent : il commence par un petit mot de liaison de l'oral (« Et », « Mais », « Alors », « Parce que », « Du coup », « Et pourtant ») ou reprend ce que la slide d'avant vient de poser (« Cette phrase… », « Et c'est là que… »). Jamais le même mot de liaison sur deux paragraphes qui se suivent, ni la même amorce d'opinion (« Pour moi », « Je pense que ») sur deux paragraphes. Un paragraphe qu'on pourrait déplacer ailleurs sans rien casser est mal relié : réécris-le. La couverture peut commencer une phrase que le premier paragraphe continue.
PART DE LA PERSONNE : quand les sources donnent sa réaction, sa position ou ce qu'elle dit à ses client·es, le texte part de là, avec sa voix, avant d'expliquer ; il ne s'ouvre ni sur une description de la vie du lecteur, ni sur une revue de presse.
CONCRET AVANT ABSTRAIT : une idée abstraite (la confiance, l'authenticité, la qualité) se montre d'abord par une chose concrète tirée des sources (une phrase type, un geste, un objet, une situation), puis s'explique. Nomme avec un mot simple l'émotion qui est en jeu dans le sujet (agacement, fatigue, gêne, soulagement) ; n'en prête aucune à la personne qu'elle n'a pas donnée.
COUVERTURE COMPRISE SEULE : lue hors du carrousel, l'accroche dit de quoi on parle et se dit comme une phrase à l'oral (une réaction, une position, une question qu'on poserait à quelqu'un) ; jamais une formule abstraite qu'on ne comprend qu'après avoir lu la suite.`;

/** Actu posée sur des slides : dite simplement, source courte, fin sans sondage. */
export const RECIT_ACTU_SUR_SLIDE = `ACTU DITE SIMPLEMENT : sur les slides, le fait se raconte avec des mots de tous les jours, comme on le dirait à quelqu'un (« Une étude dit que les gens lisent de moins en moins les longues légendes. »), sans tournure de revue de presse (« des analyses relayées par… décrivent… ») ; une seule réserve suffit quand la source la demande, sans empiler les conditionnels. Le nom de la source (média, étude, agence) va dans caption.body, jamais sur les slides.`;

const SONDAGE = "(un chiffre, un oui ou non, un choix entre deux)";

const NEWS_SOURCE_VISIBLE = "conserve le fait déclencheur et sa source comme point d'entrée visible";
const NEWS_ENDING_ANY = /Termine[^.]*\(un chiffre, un oui ou non, un choix entre deux\)[^.]*\./;

/** Consigne d'actu du récit continu : celle des autres parcours, source en
 * légende et question de fin dans caption.cta (relecture du 15/11/2026). */
export function narrativeNewsWriting(body: any): string {
  const news = newsWriting(body).trim()
    .replace(NEWS_SOURCE_VISIBLE, "conserve le fait déclencheur comme point d'entrée visible (sa source se nomme dans caption.body)")
    .replace(NEWS_ENDING_ANY, "Termine sur la position défendue ; la question pour les commentaires (une vraie question qu'on poserait à quelqu'un, jamais un sondage « oui ou non ? » plaqué) va dans caption.cta.");
  return `${news}\n${RECIT_ACTU_SUR_SLIDE}`;
}

/** Relecture du 15/11/2026 avec la méthode carrousel de la marque (création de
 * carrousel, rédaction, accroches) sur le carrousel « fatigue synthétique ». */
export const RECIT_RELECTURE_CARROUSEL = `RELU AVEC LA MÉTHODE CARROUSEL
COUVERTURE SANS LE MOT À LA MODE : quand le sujet part d'un mot nouveau, d'un terme de tendance ou du nom d'une étude, la couverture dit la situation avec des mots de tous les jours, compréhensible sans connaître ce mot ; le mot s'explique sur la slide suivante.
SOURCE EN LÉGENDE : aucun nom de média, d'étude, d'agence ou de rapport sur les slides ; la source se nomme dans caption.body. Seule exception : un chiffre garde collé à lui qui l'a compté (« 15 000 selon les syndicats »).
PAS DE TRIPLET : jamais trois éléments empilés dans une phrase (« les coulisses, les témoignages, la signature ») ; garde le plus parlant.
PAS DE SLOGAN EN CONTRASTE : ni « X, pas Y », ni « ce n'est pas X, c'est Y », ni « Pas X. Juste Y. » ; dis directement ce qui est.
L'EXEMPLE DE LA DEMANDE RESTE : quand la demande donne un exemple concret (une scène, une phrase type, une comparaison, un exercice), il apparaît sur les slides avec ses mots ; c'est lui qui montre l'idée.
UNE SLIDE À GARDER : un paragraphe donne ce qu'on fait autrement, concrètement (une question à se poser, un geste, une phrase réécrite), dit pour qu'on l'enregistre et s'en resserve seul.
AUCUNE ÉMOTION PRÊTÉE : ce que le sujet fait à la personne (agacement, sourire, soulagement) ne s'écrit que si les sources le donnent ; sinon le texte part du fait ou de sa position.
DERNIÈRE SLIDE : elle rassemble, puis ouvre sur un regard plus large de la personne qui parle (au « je » quand la marque parle au « je »), sans morale qui ferme et sans question ; la question pour les commentaires va dans caption.cta. closing_aside : une petite ligne d'humour de 12 mots au plus, posée en petit sous la dernière slide, qui se comprend seule et renvoie au sujet ou à la couverture ; laisse-la vide sur un sujet grave (violences, deuil, mineur·es) ou si rien de juste ne vient.`;

/** Petite ligne d'humour de la dernière slide : gardée seulement courte. */
export function closingAside(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.split(/\s+/).length <= 14 && !t.includes("?") ? t : "";
}

const OPINION_OPENERS = ["pour moi", "je pense que", "selon moi", "à mon avis", "personnellement"];
const LIAISONS = ["et", "mais", "alors", "parce", "du", "donc", "pourtant", "sauf"];

const norm = (s: string) =>
  s.toLowerCase().replace(/[«»"“”'’]/g, " ").replace(/\s+/g, " ").trim();

export interface ThreadDefects {
  /** Amorces d'opinion répétées : [amorce, numéros de paragraphes depuis 1]. */
  repeatedOpeners: { opener: string; paragraphs: number[] }[];
  /** Paragraphes (depuis 1) qui reprennent le mot de liaison du paragraphe précédent. */
  sameLiaison: number[];
  /** Le dernier paragraphe finit sur un sondage « oui ou non ? ». */
  yesNoEnding: boolean;
  /** Le dernier paragraphe finit sur une question (elle va dans caption.cta). */
  questionEnding: boolean;
  /** Paragraphes (depuis 1) avec un slogan « X, pas Y » / « Pas X. Juste Y ». */
  slogans: number[];
  /** Paragraphes (depuis 1) qui empilent trois éléments (triplet). */
  triplets: number[];
  /** Paragraphes (depuis 1) qui citent une source en revue de presse. */
  pressSources: number[];
  /** L'angle choisi cite des exemples entre « » et aucun n'est sur les slides. */
  missingExample: string[];
}

/**
 * Exemples concrets de l'angle choisi : les passages entre « » de 2 à 14 mots
 * (essai réel du 15/11/2026 : « Prenez soin de vous » / « Piqûres de
 * moustiques ? » dans l'angle, absents des slides malgré la consigne).
 */
export function briefExamples(body: any): string[] {
  const angle = typeof body?.editorial_angle === "string" ? body.editorial_angle : "";
  return [...angle.matchAll(/«\s*([^»]+?)\s*»/g)]
    .map((m) => m[1].trim())
    .filter((q) => { const n = q.split(/\s+/).length; return n >= 2 && n <= 14; })
    .slice(0, 8);
}

const longWords = (s: string) => norm(s).split(/[^\p{L}]+/u).filter((w) => w.length >= 5);

/** Un exemple compte comme repris si les deux tiers de ses mots longs sont sur les slides. */
function exampleKept(example: string, text: string): boolean {
  const words = longWords(example);
  if (!words.length) return text.includes(norm(example));
  const hits = words.filter((w) => text.includes(w)).length;
  return hits >= Math.max(1, Math.ceil((words.length * 2) / 3));
}

const SLOGAN = [
  /,\s*(?:et\s+)?pas\s+(?:[^\s,.;:!?]+\s+){0,2}[^\s,.;:!?]+\s*[.!?…]/,
  /\bce n est pas\b[^.!?;]*[,;:]\s*c est\b/,
  /(?:^|[.!?]\s+)pas\s[^.!?]*[.!?]\s*juste\b/,
];
// norm() remplace les apostrophes par des espaces : « l'idée » devient « l idée ».
const ART = "(?:les|des|la|le|l|une|un|vos|nos|ses|leurs|ces)";
const TRIPLET = new RegExp(`\\b${ART}\\s[^,.;:!?]{2,40},\\s*${ART}\\s[^,.;:!?]{2,40},\\s*(?:et\\s+)?${ART}\\s[^\\s,.;:!?]`);
const PRESS = /\b(?:relayée?s? par|publiée? par|d après (?:une|un|le|la|les) (?:étude|analyse|rapport|article|enquête)|selon (?:une|un|le|la|les|l) ?(?:étude|analyse|rapport|article|enquête|média|agence|cabinet))/;

/** Mesure déterministe du fil (aucun appel IA). */
export function narrativeThreadDefects(paragraphs: unknown[], examples: string[] = []): ThreadDefects {
  const texts = paragraphs.map((p) => (typeof p === "string" ? norm(p) : ""));
  const repeatedOpeners = OPINION_OPENERS.flatMap((opener) => {
    const hits = texts.flatMap((t, i) => (t.startsWith(opener) ? [i + 1] : []));
    return hits.length >= 2 ? [{ opener, paragraphs: hits }] : [];
  });
  const firstWord = (t: string) => t.split(/[\s,]/)[0] || "";
  const sameLiaison = texts.flatMap((t, i) => {
    const w = firstWord(t);
    return i > 0 && LIAISONS.includes(w) && firstWord(texts[i - 1]) === w ? [i + 1] : [];
  });
  const last = texts[texts.length - 1] || "";
  const where = (re: RegExp) => texts.flatMap((t, i) => re.test(t) ? [i + 1] : []);
  const slogans = texts.flatMap((t, i) => SLOGAN.some((re) => re.test(t)) ? [i + 1] : []);
  return {
    repeatedOpeners, sameLiaison,
    yesNoEnding: /oui ou non\s*\??\s*$/.test(last),
    questionEnding: /\?\s*$/.test(last),
    slogans, triplets: where(TRIPLET), pressSources: where(PRESS),
    missingExample: examples.length && !examples.some((e) => exampleKept(e, texts.join(" "))) ? examples : [],
  };
}

export const threadDefectCount = (d: ThreadDefects) =>
  d.repeatedOpeners.reduce((n, r) => n + r.paragraphs.length - 1, 0) + d.sameLiaison.length +
  (d.questionEnding || d.yesNoEnding ? 1 : 0) + d.slogans.length + d.triplets.length + d.pressSources.length +
  (d.missingExample.length ? 1 : 0);

/** Consigne de réécriture ; chaîne vide quand le fil n'a pas de défaut mesuré. */
export function narrativeThreadFix(d: ThreadDefects): string {
  const asks = [
    ...d.repeatedOpeners.map((r) => `La même amorce « ${r.opener} » ouvre les paragraphes ${r.paragraphs.join(", ")} : garde-la une fois au plus et relie les autres au paragraphe précédent.`),
    d.sameLiaison.length ? `Le même mot de liaison ouvre deux paragraphes de suite (paragraphes ${d.sameLiaison.join(", ")}) : varie-le.` : "",
    d.yesNoEnding ? "La fin est un sondage « oui ou non ? » : termine sur la position défendue, sans question sur la slide ; une vraie question, sans « oui ou non », va dans caption.cta." : "",
    d.questionEnding && !d.yesNoEnding ? "La dernière slide finit sur une question : termine-la sur un regard plus large de la personne qui parle, et mets la question dans caption.cta." : "",
    d.slogans.length ? `Slogan en contraste (« X, pas Y », « ce n'est pas X, c'est Y », « Pas X. Juste Y. ») dans les paragraphes ${d.slogans.join(", ")} : dis directement ce qui est.` : "",
    d.triplets.length ? `Trois éléments empilés dans une phrase (paragraphes ${d.triplets.join(", ")}) : garde le plus parlant.` : "",
    d.missingExample.length ? `L'exemple concret de l'angle choisi manque sur les slides : reprends-le avec ses mots, c'est lui qui montre l'idée (${d.missingExample.slice(0, 4).map((e) => `« ${e} »`).join(", ")}).` : "",
    d.pressSources.length ? `Source citée en revue de presse sur une slide (paragraphes ${d.pressSources.join(", ")}) : dis le fait simplement et mets la source dans caption.body.` : "",
  ].filter(Boolean);
  return asks.length ? `Fil à voix haute : ${asks.join(" ")}` : "";
}

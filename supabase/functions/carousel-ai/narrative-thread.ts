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
export const RECIT_ACTU_SUR_SLIDE = `ACTU DITE SIMPLEMENT : sur les slides, le fait se raconte avec des mots de tous les jours, comme on le dirait à quelqu'un (« Une étude dit que les gens lisent de moins en moins les longues légendes. »). La source se nomme en quelques mots dans la même phrase ou dans caption.body, jamais en tournure de revue de presse (« des analyses relayées par… décrivent… ») ; une seule réserve suffit quand la source la demande, sans empiler les conditionnels.`;

const SONDAGE = "(un chiffre, un oui ou non, un choix entre deux)";

/** Consigne d'actu du récit continu : celle des autres parcours, sans la fin en sondage. */
export function narrativeNewsWriting(body: any): string {
  return `${newsWriting(body).trim().replace(SONDAGE, "(une vraie question qu'on poserait à quelqu'un, jamais un sondage « oui ou non ? » plaqué)")}\n${RECIT_ACTU_SUR_SLIDE}`;
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
}

/** Mesure déterministe du fil (aucun appel IA). */
export function narrativeThreadDefects(paragraphs: unknown[]): ThreadDefects {
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
  return { repeatedOpeners, sameLiaison, yesNoEnding: /oui ou non\s*\??\s*$/.test(last) };
}

export const threadDefectCount = (d: ThreadDefects) =>
  d.repeatedOpeners.reduce((n, r) => n + r.paragraphs.length - 1, 0) + d.sameLiaison.length + (d.yesNoEnding ? 1 : 0);

/** Consigne de réécriture ; chaîne vide quand le fil n'a pas de défaut mesuré. */
export function narrativeThreadFix(d: ThreadDefects): string {
  const asks = [
    ...d.repeatedOpeners.map((r) => `La même amorce « ${r.opener} » ouvre les paragraphes ${r.paragraphs.join(", ")} : garde-la une fois au plus et relie les autres au paragraphe précédent.`),
    d.sameLiaison.length ? `Le même mot de liaison ouvre deux paragraphes de suite (paragraphes ${d.sameLiaison.join(", ")}) : varie-le.` : "",
    d.yesNoEnding ? "La fin est un sondage « oui ou non ? » : termine sur la position défendue, ouverte par une vraie question ou un geste, sans « oui ou non »." : "",
  ].filter(Boolean);
  return asks.length ? `Fil à voix haute : ${asks.join(" ")}` : "";
}

// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 4, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Consignes de re-passe : les phrases exactes que le correcteur reçoit, figées
// par redac-gate-fix-instructions_snapshot_test.ts.

import { type RedacAnalysis, type TextRedacAnalysis } from "./scoring.ts";

export const UNSOURCED_RESEARCH_FIX = (items: string[]) =>
  `CHIFFRES DE LA RECHERCHE REPRIS SANS LEUR SOURCE : ces chiffres ne viennent que de la matière de recherche, et la phrase qui les reprend ne cite pas leur source :\n${items.map((n) => `- ${n}`).join("\n")}\nPour CHACUN : si la matière de recherche donne la source de ce chiffre, ajoute-la DANS LA MÊME PHRASE (ou dans la phrase juste avant, si elle introduit l'étude), de façon discrète (« (Nom, année) » ou « selon Nom ») ; sinon, remplace le chiffre par une formulation qualitative honnête (« une petite partie de ton réseau », « les premiers jours »). N'invente JAMAIS de source, de nom ou d'année. Ne touche pas au reste du texte.`;

export const INVENTED_EXPERIENCE_FIX = (items: string[]) =>
  `VÉCU PERSONNEL INVENTÉ : ces passages racontent une expérience de l'autrice au passé (« j'ai essayé », « je pensais », « résultat : »), alors que ni le brief, ni les réponses, ni l'actu ne la fournissent :\n${items.map((t) => `- « ${t} »`).join("\n")}\nRéécris CHAQUE passage en opinion au présent (« Je pense que… », « Pour moi… ») ou en constat général (« c'est courant », « souvent, la portée baisse même »). Garde l'idée et la position ; aucun test, essai, résultat ou croyance passée de l'autrice.`;

export const INVENTED_TESTIMONY_FIX = (items: string[]) =>
  `TÉMOIGNAGE INVENTÉ : ces phrases rapportent la parole d'une personne rencontrée (cliente, amie, artisane…) ou une rencontre, alors que ni le brief, ni les réponses, ni l'actu ne la fournissent :\n${items.map((t) => `- « ${t} »`).join("\n")}\nRetire CHAQUE témoignage et garde l'idée qu'il portait, dite comme un constat général au présent ou comme l'opinion de l'autrice. Aucune personne, parole rapportée ou scène de remplacement.`;

/** Construit les instructions ciblées de la re-passe à partir des mesures. */
export function buildFixInstructions(a: RedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 0) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, aucun effet ajouté n’est autorisé (caption comprise). Réécris chaque passage signalé en affirmation directe, en préservant les négations factuelles et verbatims fournis à garder (même sens, sans « pas X, c'est Y »). Une concession suivie de « Sauf que… » disparaît, et une antithèse en deux phrases miroir (« On croit en faire plus. On en fait souvent moins. ») devient une seule phrase qui dit le mécanisme (« Publier trop vite coupe l'élan du post précédent. ») :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  // Length is layout telemetry only: preserve useful prose and transitions.
  if (a.ctaDuplicated) {
    lines.push(
      `CTA DUPLIQUÉ : le "cta" de la caption répète la dernière slide. Réécris le cta de la CAPTION pour qu'il soit COMPLÉMENTAIRE (autre formulation, autre angle d'invitation), pas une copie.`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs semaines », « la plupart », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion. Si un schéma visuel de type stats n'a plus de chiffre à afficher, transforme-le en slide texte.`,
    );
  }
  if (a.unsourcedResearchNumbers?.length) lines.push(UNSOURCED_RESEARCH_FIX(a.unsourcedResearchNumbers));
  if (a.inventedTestimonials?.length) lines.push(INVENTED_TESTIMONY_FIX(a.inventedTestimonials));
  if (a.inventedExperiences?.length) lines.push(INVENTED_EXPERIENCE_FIX(a.inventedExperiences));
  if (a.durationConflicts.length) {
    lines.push(
      `DURÉES QUI SE CONTREDISENT entre les slides et la légende :\n${a.durationConflicts.map((c) => `- ${c}`).join("\n")}\nC'est le MÊME fait raconté deux fois avec deux chiffres différents — devant l'audience, ça décrédibilise tout le contenu. Choisis UNE durée et emploie EXACTEMENT la même des deux côtés (ou retire-la d'un des deux). Ne « fais pas la moyenne » : garde celle du brief si le brief en donne une.`,
    );
  }
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  if (a.hookEchoes.length) {
    lines.push(
      `ACCROCHE DÉJÀ UTILISÉE POUR CE SUJET : cette ouverture redit une accroche déjà écrite pour le même sujet :\n${a.hookEchoes.map((h) => `- « ${h} »`).join("\n")}\nL'audience voit la SÉRIE, pas un contenu isolé : deux publications qui ouvrent pareil donnent l'impression d'un contenu recyclé à la chaîne. Réécris l'accroche avec un angle d'attaque VRAIMENT différent — change ce sur quoi elle ouvre (une scène vécue plutôt qu'un constat, une question plutôt qu'une affirmation, un détail concret plutôt qu'une généralité). Garde le sujet et le fond du contenu, change l'entrée.`,
    );
  }
  if (a.recentEchoes?.length) {
    lines.push(
      `PHRASES DÉJÀ PUBLIÉES DANS UN CONTENU RÉCENT DE LA MARQUE : ces passages reprennent mot pour mot un de ses derniers contenus :\n${a.recentEchoes.map((e) => `- « ${e} »`).join("\n")}\nL'audience suit le compte : la même phrase d'un contenu à l'autre se voit tout de suite. Reformule chaque passage avec des mots neufs, ou remplace-le par un autre fait des sources s'il ne sert pas ce propos. N'ajoute aucun fait.`,
    );
  }
  return lines.join("\n\n");
}

/** Instructions ciblées pour la passe de correction texte ("" si rien à corriger). */
export function buildTextFixInstructions(a: TextRedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 0) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, aucun effet ajouté n’est autorisé. Réécris chaque passage signalé en affirmation directe, en préservant les négations factuelles et verbatims fournis à garder. Une concession suivie de « Sauf que… » (« C'est logique, sur le papier. Sauf que ce n'est pas comme ça que ça marche ») disparaît : pose directement le mécanisme réel, sans concession ni « sauf que ». Une antithèse en deux phrases miroir (« On croit en faire plus. On en fait souvent moins. ») devient une seule phrase qui dit le mécanisme (« Publier trop vite coupe l'élan du post précédent. ») :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs heures », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion.`,
    );
  }
  if (a.unsourcedResearchNumbers?.length) lines.push(UNSOURCED_RESEARCH_FIX(a.unsourcedResearchNumbers));
  if (a.inventedTestimonials?.length) lines.push(INVENTED_TESTIMONY_FIX(a.inventedTestimonials));
  if (a.inventedExperiences?.length) lines.push(INVENTED_EXPERIENCE_FIX(a.inventedExperiences));
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  if (a.hookEchoes.length) {
    lines.push(
      `ACCROCHE DÉJÀ UTILISÉE POUR CE SUJET : cette ouverture redit une accroche déjà écrite pour le même sujet :\n${a.hookEchoes.map((h) => `- « ${h} »`).join("\n")}\nL'audience voit la SÉRIE, pas un contenu isolé : deux publications qui ouvrent pareil donnent l'impression d'un contenu recyclé à la chaîne. Réécris l'accroche avec un angle d'attaque VRAIMENT différent — change ce sur quoi elle ouvre (une scène vécue plutôt qu'un constat, une question plutôt qu'une affirmation, un détail concret plutôt qu'une généralité). Garde le sujet et le fond du contenu, change l'entrée.`,
    );
  }
  return lines.join("\n\n");
}

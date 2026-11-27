/**
 * Le titre d'une idée (« Trouver une idée ») : compris de tous, et la suite ne se devine pas.
 *
 * Pourquoi (Loom du 27/11/2026) : les titres décrivaient l'objet dans les mots du métier
 * (« un plateau d'immeuble devient des lots privatifs ») et
 * donnaient déjà la réponse. Mêmes tests que l'accroche d'un reel (`REEL_PREMIERE_PHRASE`)
 * et que la couverture d'un carrousel (`COVER_WRITING`), appliqués au titre de l'idée.
 * Le titre n'est pas l'accroche finale : celle-ci s'écrit à la création du contenu.
 */
export const IDEA_TITLE_RULE = `TITRE DE L'IDÉE (« subject », pistes comprises) : une seule phrase, qu'on pourrait dire à voix haute, 110 caractères au plus. Deux tests.
1) N'IMPORTE QUI COMPREND CE QUI SE JOUE, même sans rien connaître au métier : ce qu'on gagne, ce qu'on perd, ce qu'on risque, ce qu'on a décidé, ce qui surprend, dans la vie de ce public. Le mot de métier, le sigle et la mesure technique restent dans insight et mechanism, jamais dans le titre : si un mot du titre demanderait une explication à une personne hors du métier, remplace-le par ce qu'il change pour elle. Exemple d'un autre métier, à ne pas reprendre : « Pourquoi je refuse de livrer une table qui a pourtant l'air finie » se comprend ; « Le séchage du vernis polyuréthane : 21 jours de polymérisation » ne parle qu'aux gens qui font des meubles.
2) LA SUITE NE SE DEVINE PAS : le titre dit le fait, la décision ou la situation, et garde le pourquoi ou le comment pour le contenu. Un titre qui donne déjà la réponse (« X : ce n'est pas Y, c'est Z »), qui annonce une leçon ou qui décrit le contenu à produire (« une série de photos de… », « un carrousel sur… ») ne donne pas envie de lire la suite. Pas de deux-points suivis d'une explication.
Le titre reste fidèle : il ne promet rien que l'analyse ne tient pas, n'invente aucun vécu, et n'emploie aucune formule à clic (« la vérité sur », « ce que personne ne te dit », « va te surprendre »). Quand le fait réel manque encore (« ask » rempli), le titre nomme en mots simples la décision ou le moment attendu, sans en inventer le contenu.`;

/** Champ de travail écrit AVANT le titre (jamais affiché : `parseDeepIdea` ne le garde pas). */
export const IDEA_STAKE_FIELD = `"enjeu_pour_tous":"ce qui se joue pour une personne qui ne connaît pas ce métier, en mots de tous les jours, 100 caractères max ; écris-le AVANT le titre, le titre le dit"`;

/** Les enjeux écrits par le modèle, pour la trace seulement. */
export function ideaStakes(parsed: unknown): string[] {
  const ideas = (parsed as { ideas?: unknown })?.ideas;
  return (Array.isArray(ideas) ? ideas : []).map(i => typeof i?.enjeu_pour_tous === "string" ? i.enjeu_pour_tous.slice(0, 120) : "").filter(Boolean);
}

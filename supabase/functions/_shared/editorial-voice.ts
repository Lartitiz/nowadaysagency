/** Shared by generation and editing; qualitative guidance, never an AI detector. */
export const EDITORIAL_VOICE_RULES = `
══ VOIX PERSONNELLE ET FIDÉLITÉ ÉDITORIALE ══
Ces règles priment sur les recettes de style et exemples génériques ci-dessous.
- Suis d'abord la demande actuelle, puis les textes réellement écrits ou validés par la personne, puis son profil de voix. Les exemples servent au rythme et au registre, jamais de réserve de faits à transposer. Préserve ses formulations réussies, ses nuances et son degré de familiarité ; aucune obligation de rendre le texte familier, solennel ou provocateur.
- N'ajoute aucun contraste rhétorique préfabriqué : « X. Pas Y. », « Ce n'est pas X, c'est Y », « Pas X. Juste Y ». Reformule ces effets en une idée précise et directe dès la première occurrence. Conserve les négations factuelles nécessaires, les comparaisons demandées et les verbatims explicitement fournis à garder : interdire une formule ne doit jamais inverser le sens.
- La spontanéité peut venir d'un aparté, d'une hésitation ou d'humour si cela correspond à cette personne et apporte quelque chose au sujet. Aucun quota d'imperfections, de connecteurs, de questions ou de phrases courtes. Ne fabrique ni faute ni confidence pour paraître humain.
- Garde le scénario et le framework choisis comme appuis au raisonnement. Adapte les transitions au propos ; une procédure conserve ses étapes. La profondeur vient des explications, détails et nuances utiles, sans rallonger pour remplir ni réduire systématiquement à des phrases sobres.
- Une conviction de marque éclaire un sujet quand elle est pertinente ; elle n'a pas à figurer dans chaque publication. Ne récite pas la fiche de marque. Une phrase personnelle fournie pour CE contenu peut être conservée telle quelle.
- Les aspirations et problèmes de la cible ne prouvent aucun résultat du produit. Un bénéfice plausible, un multiplicateur écrit en lettres, une fréquence, une origine de fabrication ou un vécu restent des affirmations à étayer. Sans source, retire l'affirmation ; ne la maquille pas en promesse qualitative (« dure bien plus longtemps », « ce que j'entends souvent »).
- Tiens la promesse de l'accroche avec les éléments disponibles. Sans détail indispensable, pose une question utile pendant le brief. Dans le texte publiable, reste dans ce qui est connu : aucune fausse attente (« je ne peux pas encore vous en dire plus »), aucun exemple présenté comme vécu sans source.
- Termine à l'endroit où l'idée aboutit. Ajoute une question, une invitation ou une action quand elle sert le sujet et l'objectif demandé. Une fin concrète peut se suffire ; aucune morale générale ni demande d'engagement ajoutée par réflexe. Ne suppose ni lien en bio, ni disponibilité, ni promotion.
RELECTURE CIBLÉE : repère un défaut précis avant de modifier une phrase. Corrige seulement les passages concernés ; conserve les informations, le point de vue, les bonnes phrases et la structure demandée. Ne transforme pas un TU pédagogique en JE vécu. Aucun chiffre, scène ou résultat des exemples de style ne doit entrer dans le contenu. Si aucun défaut n'est établi, rends le passage intact.
`;

/** Wording supplied for the current piece; deliberately excludes general branding/history. */
export function authoredContentSource(body: Record<string, unknown>): string {
  return [body.context, body.answers, body.followUpAnswers, body.preGenAnswers, body.pre_gen_answers, body.deepening_answers]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value))
    .join("\n");
}

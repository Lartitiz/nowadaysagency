// carousel-ai : les questions d'approfondissement tutoient toujours.
//
// QA du 12/11/2026 (compte de test, LinkedIn → Partir de photos) : malgré la
// consigne de PHOTO_QUESTIONS_CONTRACT, les questions disaient « votre
// méthode ». Le prompt système porte des règles de vouvoiement plus fortes
// (socle.ts, writing-contract.ts) : elles valent pour les slides, adressées à
// l'audience, et doivent rester. Les questions, elles, parlent à
// l'utilisatrice. D'où une consigne placée en DERNIER dans le prompt système
// de l'étape questions, et une relance si une question vouvoie quand même.

export const QUESTIONS_ADDRESS_OVERRIDE = `

══ ADRESSE DES QUESTIONS (PRIORITAIRE SUR TOUTE RÈGLE DE VOUVOIEMENT CI-DESSUS) ══
Les règles de vouvoiement plus haut concernent le texte des slides, adressé à l'audience. Ici tu n'écris pas de slides : tu poses des questions à l'utilisatrice de l'outil. Tutoie-la dans chaque question et chaque exemple de réponse (« ta méthode », « qu'as-tu rénové », jamais « votre » ni « vous »), sur LinkedIn comme sur Instagram.`;

export const QUESTIONS_TUTOIEMENT_RETRY = "Tu as vouvoyé l'utilisatrice. Réécris exactement les mêmes questions en la tutoyant (« ta », « tu », « tes »), sans rien changer d'autre, avec le même format.";

/** Vrai si le texte vouvoie, hors citations entre guillemets (« … » ou "…"). */
export function hasVouvoiement(text: string): boolean {
  const outsideQuotes = String(text || "").replace(/«[^»]*»/g, " ").replace(/"[^"]*"/g, " ").replace(/“[^”]*”/g, " ");
  return /(^|[^\p{L}])(vous|votre|vos)(?![\p{L}])/iu.test(outsideQuotes);
}

/** Vrai si au moins une question ou un exemple de réponse vouvoie. */
export function questionsVouvoient(content: string): boolean {
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return false; }
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return questions.some((q: any) => hasVouvoiement(`${q?.question || ""}\n${q?.placeholder || ""}`));
}

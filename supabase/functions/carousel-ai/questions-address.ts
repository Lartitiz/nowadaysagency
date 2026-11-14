// carousel-ai : les questions d'approfondissement tutoient toujours.
//
// QA du 12/11/2026 (compte de test, LinkedIn → Partir de photos) : malgré la
// consigne de PHOTO_QUESTIONS_CONTRACT, les questions disaient « votre
// méthode ». Le prompt système porte des règles de vouvoiement plus fortes
// (socle.ts, writing-contract.ts) : elles valent pour les slides, adressées à
// l'audience, et doivent rester. Les questions, elles, parlent à
// l'utilisatrice. D'où une consigne placée en DERNIER dans le prompt système
// de l'étape questions, et une relance si une question vouvoie quand même.
//
// 12/11/2026 : même endroit pour la FORME des questions (une phrase courte,
// sans parenthèses, _shared/questions-form.ts), et une seule relance commune
// (`relancerQuestionsSiBesoin`) si une question vouvoie OU reste trop longue,
// pour les questions avec photos comme pour la variante texte.

import { QUESTIONS_FORM_RULES, QUESTIONS_TUTOIEMENT_RETRY, questionsVouvoient, relancerQuestionsSiBesoin, hasVouvoiement } from "../_shared/questions-form.ts";

export { hasVouvoiement };

export const QUESTIONS_ADDRESS_OVERRIDE = `

══ ADRESSE DES QUESTIONS (PRIORITAIRE SUR TOUTE RÈGLE DE VOUVOIEMENT CI-DESSUS) ══
Les règles de vouvoiement plus haut concernent le texte des slides, adressé à l'audience. Ici tu n'écris pas de slides : tu poses des questions à l'utilisatrice de l'outil. Tutoie-la dans chaque question et chaque exemple de réponse (« ta méthode », « qu'as-tu rénové », jamais « votre » ni « vous »), sur LinkedIn comme sur Instagram.` + QUESTIONS_FORM_RULES;

export { QUESTIONS_TUTOIEMENT_RETRY, questionsVouvoient, relancerQuestionsSiBesoin };

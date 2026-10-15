// Prompts du diagnostic (fiche 12, lot 2 : texte sorti d'index.ts à l'identique).
// Fonctions pures, sans réseau : figées par prompts_snapshot_test.ts.

// La ligne « Routes disponibles » ci-dessous doit rester alignée avec DIAGNOSTIC_ROUTES (routes.ts).
export const DIAGNOSTIC_SYSTEM_PROMPT = `Tu es l'assistante com' de L'Assistant Com'. Tu fais un diagnostic de communication personnalisé.

CONTEXTE : cette personne vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être percutant, honnête et donner envie de continuer.

=== RÈGLES ABSOLUES ===

1. SOURCES UNIQUEMENT
Tu peux commenter les réponses de la section PROFIL et des RÉPONSES LIBRES, ainsi que les sources présentes dans les sections "SOURCE:" du message utilisateur. Distingue toujours ce que la personne a déclaré de ce que tu as réellement observé sur son site.
- Pas de section "SOURCE: WEBSITE" → RIEN sur le site web (pas de CTA, pas de SEO, pas de navigation, rien)
- Une capture fournie n'autorise que des constats sur ce qui y est lisible. Renseigne screenshot_readable. Source = instagram_screenshot, linkedin_screenshot ou social_screenshot selon l'interface reconnaissable. Si toutes sont illisibles, mets false et ne crée aucun constat sourcé capture.
- "INSTAGRAM_PUBLIC" = métadonnées publiques seulement, pas lecture du feed.
- "INSTAGRAM_CONNECTÉ" = champs et publications explicitement listés ; les visuels reçus sont les seuls inspectables.
- "INSTAGRAM_STATISTIQUES" et "LINKEDIN_ANALYTICS" = chiffres uniquement quand ils sont fournis avec leur période.
- Une connexion de publication LinkedIn n'autorise pas à lire le profil, les posts ni les statistiques.
- Pas de source LinkedIn lue → aucun constat sur son profil.

2. PREUVES CONCRÈTES OBLIGATOIRES
Chaque force et chaque faiblesse DOIT citer un élément observable (extrait littéral pour le texte, description précise pour une image), et utiliser la source exacte. Une inférence doit être formulée comme hypothèse.
- ✅ BON : "Ton site affiche 'Réserver un coaching découverte' en haut de page : c'est un CTA clair."
- ❌ INTERDIT : "Pas de CTA sur le site" (sans avoir vérifié la section "Signaux de conversion" des données)
- ❌ INTERDIT : "Bio Instagram incomplète" (sans bio lue sur une capture ou via le compte connecté)

3. PAS DE PROBLÈMES "MÉTA-OUTIL"
Ne JAMAIS remonter comme faiblesse le fait qu'un champ n'est pas rempli dans l'outil. L'outil est neuf, c'est normal que tout ne soit pas rempli.
- ❌ INTERDIT : "Ton branding n'est pas renseigné dans l'outil"
- ❌ INTERDIT : "Ta cible n'est pas définie" (si c'est juste que le champ est vide dans l'app)
- ✅ OK : "Tu décris ta cible comme 'tout le monde' — c'est trop large pour créer du contenu qui résonne."

4. SIGNAUX DE CONVERSION DU SITE
Quand tu as une source WEBSITE, lis ATTENTIVEMENT la section "Signaux de conversion" dans les données. Elle liste les formulaires, champs email et boutons CTA détectés sur le site.
- Si des CTAs sont listés → le site A des appels à l'action. Ne dis PAS "pas de CTA".
- Si des formulaires sont détectés → le site A un système de capture. Ne dis PAS "pas de capture email".
- Tu peux critiquer la QUALITÉ ou le PLACEMENT des CTAs, mais pas dire qu'ils n'existent pas quand les données prouvent le contraire.

5. RÉSEAUX SOCIAUX
Si une capture est lisible, produis au moins un constat et une priorité qui reprennent un élément réellement visible, avec un premier geste et un exemple adapté à l'activité. Si le profil ou les publications connectés sont lus, distingue leurs textes des visuels effectivement reçus. Une capture, un lien ou une connexion seule ne prouvent ni fréquence, ni résultats. Si aucune donnée sociale n'est lisible, propose de joindre une capture ou d'ouvrir l'audit dédié sans inventer de défaut.

6. RECOMMANDATIONS CONCRÈTES ET ACTIONNABLES
Chaque faiblesse doit expliquer le PROBLÈME RÉEL et donner une piste concrète.
- ✅ BON : "Ton site parle de 'coaching' mais ne précise pas pour qui ni quel résultat concret. Tes visiteuses ne savent pas si c'est pour elles."
- ❌ MAUVAIS : "Ta stratégie de contenu manque de structure" (générique, non vérifiable)
Pour chacune des 3 priorités, donne une raison liée à une preuve observée, un premier geste faisable en 5 à 20 minutes et un exemple que la personne peut adapter ou un contrôle précis à effectuer. La première priorité doit répondre à son changement souhaité ou à son blocage principal si les sources le permettent. Ne recommande pas un canal absent de ses canaux actuels ou souhaités sans raison explicite. Une visite du site ou un handle Instagram ne prouvent pas la fréquence de publication.
- Pour chaque priorité, remplis source avec l'origine du constat qui motive why. Si c'est seulement une intention déclarée, utilise profile ou about.
- first_step commence par un verbe concret : « Écris… », « Remplace… », « Vérifie… ».
- example utilise des mots réellement fournis, ou des emplacements [à compléter] ; jamais de chiffre, citation client ou résultat inventé.
- Si une source manque, propose une vérification à faire, sans affirmer qu'un problème existe.

7. TON
Écriture inclusive point médian, tutoiement, ton direct et bienveillant. Pas de jargon marketing (pas de ROI, funnel, lead magnet, etc.).

=== FORMAT JSON (pas de markdown, pas de backticks) ===

{
  "summary": "3-4 phrases qui reformulent les mots de la personne. Elle doit se dire 'oui c'est exactement moi'.",
  "screenshot_readable": false,
  "strengths": [{ "title": "titre court", "detail": "élément observable", "source": "website|profile|about|instagram_public|instagram_screenshot|linkedin_screenshot|social_screenshot|instagram_connected|instagram_insights|linkedin|linkedin_analytics" }],
  "weaknesses": [{ "title": "titre court", "detail": "élément observable et limite de l'inférence", "source": "website|profile|about|instagram_public|instagram_screenshot|linkedin_screenshot|social_screenshot|instagram_connected|instagram_insights|linkedin|linkedin_analytics", "fix_hint": "piste concrète" }],
  "scores": { "total": 0, "branding": 0, "instagram": null, "website": null, "linkedin": null },
  "priorities": [{ "title": "action", "why": "raison reliée à un constat", "first_step": "premier geste réalisable tout de suite", "example": "exemple à adapter ou vérification précise", "time": "durée réaliste", "route": "/route", "impact": "high|medium", "source": "origine du constat" }],
  "branding_prefill": { "positioning": null, "mission": null, "target_description": null, "tone_keywords": [], "values": [], "offers": [] }
}

Routes disponibles : /branding, /branding/proposition/recap, /branding/offres, /branding/charter, /instagram/audit, /instagram/profil/bio, /linkedin/profil, /site/audit, /site/accueil, /site/capture, /calendrier, /creer, /idees. Utilise uniquement ces routes.
Scores sur 100 : estimation initiale de la clarté observable, pas de la performance. TOUJOURS null pour les canaux sans profil, publication ou capture lisible ; des statistiques seules ne suffisent pas à juger le contenu.
Max 3-4 forces, 3-4 faiblesses, 3 priorités.`;

/**
 * Prompt utilisateur. `sourcesUsed` est lu AVANT finalizeDiagnosticEvidence :
 * dans le handler, l'ordre reste sources → prompts → phase 2 → diagnostic → provenance.
 * Les sections `=== SOURCE: … ===` suivent l'ordre d'insertion dans `scrapedContent`.
 */
export function buildDiagnosticUserPrompt({
  profile, freeformAnswers, scrapedContent, sourcesUsed, sourcesFailed, instagramScreenshots, instagramHandle, websiteUrl,
}: {
  // deno-lint-ignore no-explicit-any
  profile: any;
  // deno-lint-ignore no-explicit-any
  freeformAnswers: any;
  scrapedContent: Record<string, string>;
  sourcesUsed: string[];
  sourcesFailed: string[];
  instagramScreenshots: unknown[];
  instagramHandle?: string;
  websiteUrl?: string;
}): string {
  // Build user prompt
  const userParts: string[] = [];

  // Context
  userParts.push(`=== CONTEXTE ===
Cette personne utilise L'Assistant Com'. Elle vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être personnalisé, honnête, et lui donner envie de continuer.`);

  // Profile info
  if (profile) {
    const profileLines = [
      `=== PROFIL ===`,
      `Activité : ${profile.activity || "non renseignée"}`,
      // `activityType` et `blocker` sont des CLÉS (comparées plus bas à
      // "invisible" et utilisées en lookup ACTIVITY_INSIGHTS) : telles quelles
      // dans le prompt, le modèle les recopie entre guillemets et l'inscrite
      // lit « tu te sens "invisible" ». Le front envoie exprès un libellé
      // compagnon `*Label` pour le prompt — c'est LUI qu'on interpole ici.
      `Type : ${profile.activityTypeLabel || profile.activityType || "non renseigné"}`,
      `Objectif principal : ${profile.objective || "non renseigné"}`,
      `Blocage principal : ${profile.blockerLabel || profile.blocker || "non renseigné"}`,
      `Temps disponible/semaine : ${profile.weeklyTime || "non renseigné"}`,
    ];
    const channels = profile.channels || freeformAnswers?.canaux;
    if (channels) profileLines.push(`Canaux actuels : ${Array.isArray(channels) ? channels.join(", ") : channels}`);
    const desiredChannels = freeformAnswers?.desired_channels;
    if (desiredChannels) profileLines.push(`Canaux souhaités : ${Array.isArray(desiredChannels) ? desiredChannels.join(", ") : desiredChannels}`);
    userParts.push(profileLines.join("\n"));
  }

  // Freeform answers
  if (freeformAnswers) {
    const freeformParts: string[] = ["=== RÉPONSES LIBRES ==="];
    if (freeformAnswers.change_priority) freeformParts.push(`Priorité de changement : ${freeformAnswers.change_priority}`);
    if (freeformAnswers.product_or_service) freeformParts.push(`Produits ou services : ${freeformAnswers.product_or_service}`);
    if (freeformAnswers.activity_detail) freeformParts.push(`Détail de l'activité : ${freeformAnswers.activity_detail}`);
    if (freeformAnswers.uniqueness) freeformParts.push(`Ce qui te rend unique : ${freeformAnswers.uniqueness}`);
    if (freeformAnswers.positioning) freeformParts.push(`Positionnement : ${freeformAnswers.positioning}`);
    if (freeformAnswers.mission) freeformParts.push(`Mission : ${freeformAnswers.mission}`);
    if (freeformAnswers.target_description) freeformParts.push(`Cible : ${freeformAnswers.target_description}`);
    userParts.push(freeformParts.join("\n"));
  }

  // Scraped content
  for (const [source, text] of Object.entries(scrapedContent)) {
    userParts.push(`=== SOURCE: ${source.toUpperCase()} ===\n${text}`);
  }

  if (sourcesUsed.length === 0 && instagramScreenshots.length === 0) {
    userParts.push("\n⚠️ Aucune source en ligne n'a pu être scrappée. Base ton diagnostic uniquement sur les réponses du profil.");
  }

  // Warn about failed sources
  if (sourcesFailed.length > 0) {
    const failedLabels = sourcesFailed.map(s => {
      if (s === "instagram") return `Instagram (@${instagramHandle})`;
      if (s === "website") return `Site web (${websiteUrl})`;
      if (s === "linkedin") return `LinkedIn`;
      return s;
    });
    userParts.push(`\n⚠️ Sources non analysées (scraping échoué) : ${failedLabels.join(", ")}. NE PAS inventer de score pour ces sources. Mettre leur score à null dans "scores".`);
  }

  // Final instructions
  userParts.push(`=== CONSIGNES FINALES ===
- Le résumé (summary) : 3-4 phrases, reprends les mots exacts de la personne entre guillemets.
- Scores : uniquement pour les sources réellement analysées ; statistiques seules ne suffisent pas.
- RAPPEL : lis la section "Signaux de conversion" AVANT de dire qu'il manque des CTAs sur le site.
- RAPPEL : ne remonte JAMAIS comme problème un champ non rempli dans l'outil. L'outil est neuf.
- RAPPEL : si une capture est lisible, cite au moins un élément visible et donne un conseil qui en découle. Attribue-la au bon réseau si reconnaissable.
- Chaque force/faiblesse a une preuve concrète dans le "detail". Ne transforme pas une hypothèse en observation.
- Chaque priorité a un premier geste et un exemple utile, sans fait inventé.`);
  return userParts.join("\n\n");
}

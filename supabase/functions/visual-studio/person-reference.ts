import type { Reference } from "./media.ts";

/** Product method, not brand data. Kept in both interpreter and image contracts. */
export const PERSON_REFERENCE_METHOD = `COMPÉTENCE : IDENTITÉ VISUELLE RÉUTILISABLE
Active person_reference.mode=sheet pour créer une personne de référence, un mannequin fictif, une égérie ou une planche d'identité. « Photographie mon mannequin dans cette tenue » est une scène : mode=scene, jamais une planche par défaut. Un mannequin de vitrine est un objet : omets person_reference. Si le mot mannequin est réellement ambigu, demande simplement « Une personne fictive ou un mannequin de vitrine ? ».
Réutilise le brief, les réponses, la fiche et les images déjà fournies. Une demande courte appelle une petite question sur l'âge apparent et l'allure souhaitée si inconnus ; une description suffisante appelle directement la reformulation. Ne transforme pas la liste des traits en questionnaire obligatoire. Tu peux proposer les détails manquants dans la reformulation, clairement comme propositions à corriger avant génération. N'invente pas de traits distinctifs comme s'ils avaient été demandés.
Sépare name et stable_traits (âge apparent, peau, yeux, nez, bouche, cheveux de base, silhouette, mains, signes distinctifs et emplacement des bijoux identitaires confirmés) de variable_details (tenue, coiffage ponctuel, expression, pose, décor et lumière). Les champs sont en français et visibles avant confirmation. Une fiche conservée guide l'identité ; la demande ponctuelle change la scène, pas cette fiche. Ne mélange ni personnes ni marques. La fiche d'une autre personne n'est pas un point de départ pour une nouvelle identité.
Réalisme humain, pour la planche comme pour les scènes : une personne crédible qu'on pourrait croiser au quotidien, avec des proportions plausibles, une texture de peau correspondant à l'âge confirmé et les petites asymétries naturelles de son visage. « Vraie personne » peut décrire ce rendu sans demander l'identité d'une personne réelle : conserve le caractère fictif annoncé. Mannequin ou égérie ne signifie pas automatiquement jeune femme mince au visage de publicité beauté. Ne rajeunis, n'amincis, ne lisse et ne symétrise pas automatiquement la personne ; respecte ses traits et sa silhouette validés. Ne compense pas par des rides, boutons, cicatrices ou une laideur imposés. Un maquillage ou une mise en beauté explicitement demandés restent possibles sans remodelage implicite du visage ou du corps. Résume cette intention simplement dans la reformulation (« une personne naturelle et crédible, sans retouche beauté excessive »), sans inventer des caractéristiques. Une image d'exemple ne devient pas un âge, un genre, une morphologie ou une tenue imposés à toutes les créations.
Planche : une seule et même personne photoréaliste, fond clair uni, lumière douce neutre cohérente, tenue simple unie adaptée au brief. Prépare 3 ou 4 vues lisibles du visage (face, trois quarts, profil et sourire si pertinent), pas une grille de petits visages. Pour le corps ou une activité manuelle, propose une seconde planche complémentaire en pied/mains APRÈS validation de la première ; réutilise réellement sa référence visuelle ou la version sélectionnée. Ne lance pas deux planches indépendantes en série. views décrit les vues de cette seule planche. Maquillage discret et poses naturelles sont des défauts modifiables ; ni lin écru, ni âge, ni métier, ni Provence imposés.
image_prompt commence par « photorealistic character reference sheet » pour une planche, puis identité avant prise de vue. Texture et pores crédibles, retouche mesurée ; grain seulement si pertinent et validé. Perspective portrait type 85 mm pour le visage si adaptée, pas appliquée aveuglément au corps et aux mains. Privilégie les formulations positives et termine par une ou deux exclusions courtes, par défaut sans texte ni légendes. La direction artistique peut guider les scènes mais ne transporte pas son décor dans la planche neutre.
Scène : mode=scene, views vide. Joins les références d'identité choisies avec rôle casting (fictif) ou person (réel), distinct des images style/composition. Une référence d'ambiance ne fournit jamais un visage. Les images de mémoire explicitement sélectionnées par ID sont disponibles ; sans image d'identité ou version sélectionnée pertinente, demande de choisir la référence, ne reconstruis pas une personne connue à partir de son nom. Ne copie pas la grille de la planche dans la scène.
La reformulation résume aussi les vues, les traits et les références retenues. Chaque génération possède sa confirmation avec le bouton existant ; la personne peut corriger dans le chat. Pour une nouvelle photographie, la scène reste provisoire jusqu’à son examen et sa validation avant intégration des originaux. Aucun enregistrement permanent implicite : après examen du résultat, « Garder ce mannequin » conserve une fiche distincte dans la mémoire de cette marque. Le texte seul, les signes distinctifs, l'ordre des mots et les angles ne garantissent pas la permanence du visage.`;

export type PersonReference = {
  mode: "sheet" | "scene";
  name: string;
  stable_traits: string;
  variable_details: string;
  views: string[];
};

const HUMAN_REALISM = "HUMAN REALISM — A believable everyday person with individual features, plausible human anatomy and body proportions, natural facial asymmetry and skin texture appropriate to the confirmed apparent age. Preserve the approved face and build. Do not default to an idealized beauty-campaign face, youth, thinness, enlarged eyes or lips, skin smoothing or facial symmetrization. Do not manufacture blemishes, wrinkles, scars or unattractiveness to signal realism. Explicitly requested makeup, grooming and fashion styling may change presentation without implicitly reshaping the face or body.";

export function personReferencePrompt(person?: PersonReference): string {
  if (!person) return "";
  const identity = `IDENTITY — ${person.name}\n${person.stable_traits}`;
  if (person.mode === "scene") return [
    "Photograph the referenced person in the confirmed scene.", identity, HUMAN_REALISM,
    "Use the supplied identity images for the same face, apparent age, build and confirmed distinctive features. Keep each person's identity separate. Style references supply only atmosphere, never facial features. Create a single scene; do not reproduce the reference sheet layout.",
    `SCENE CHOICES\n${person.variable_details}`,
  ].join("\n");
  return [
    "photorealistic character reference sheet — one and the same person, reusable visual identity reference.",
    identity,
    HUMAN_REALISM,
    `CONFIRMED PRESENTATION\n${person.variable_details}`,
    `VIEWS OF THE SAME PERSON\n${person.views.join("; ")}`,
    "Keep the face large and readable in each view, with consistent facial structure, apparent age, skin tone and confirmed distinguishing features. Use a plain light background and soft neutral consistent light. Keep credible skin texture and measured retouching. Use perspective appropriate to each crop. If an identity reference is supplied, anchor every view to that identity. Brand scenery belongs to later scenes, not this neutral sheet.",
  ].join("\n");
}

/** IDs supplied by the interpreter are resolved only against this workspace's catalogue. */
export function resolvePersonMemory(
  ids: string[],
  memory: { id: string; kind: string; name: string; note: string; references: Reference[] }[],
) {
  const selected = ids.map(id => memory.find(item => item.id === id && item.kind === "casting"));
  if (selected.some(item => !item || !item.references.length)) return null;
  return selected.flatMap(item => item!.references.map(ref => ({
    ...ref, role: "casting" as const, memory_id: item!.id,
    name: item!.name, description: item!.note,
  })));
}

import type { Reference } from "./media.ts";

export type SceneWorkflow = {
  phase: "scene" | "integration" | "direct";
  camera_match: string;
  scene_prompt?: string;
  targets?: IntegrationTarget[];
  scene_version_id?: string;
  scene_path?: string;
  approved_scene_id?: string;
  approved_at?: string;
  accepted_changes?: string[];
};

export type IntegrationTarget = {
  role: "person" | "casting" | "product";
  reference_ids: string[];
  location: string;
  instruction: string;
};

/** Only server-resolved references enter this boundary; references used for planning
 * stay out of the scene renderer, including identities and mood images. */
export function sceneInputs(
  phase: SceneWorkflow["phase"] | undefined,
  operation: string,
  references: Reference[],
  sourcePath: string | null,
  selectedPath: string | null,
  usesSelected: boolean,
) {
  const planning = phase === "scene" ? references : [];
  const rendered = references.filter(r => !planning.some(p => p.id === r.id));
  const input = operation === "edit" || operation === "background" ? sourcePath || selectedPath
    : operation === "product" ? sourcePath || (usesSelected ? selectedPath : null) : null;
  const refs = operation === "background" ? [] : rendered.filter(r => r.path !== input);
  if (operation === "product") refs.sort((a, b) => Number(b.role === "product") - Number(a.role === "product"));
  return { input, references: refs, planning, snapshot: rendered };
}

export const SCENE_METHOD = `MÉTHODE PHOTO : SCÈNE PUIS INTÉGRATION
Toute NOUVELLE photographie commence par une scène : operation=create, phase=scene, même si plusieurs produits/personnes sont joints ou si une création directe est demandée. Réserve les originaux ; le générateur de scène reçoit seulement ta description. Ne prépare jamais phase=direct pour une nouvelle photo. Une photo sans sujet exact à intégrer peut être le résultat final. Les affiches/illustrations, planches de référence (sheet), réglages et remplacements de fond gardent leurs compétences. Une photo fournie à conserver est une édition, pas une nouvelle scène : source_reference_id désigne cette image. Distingue bien une référence d'ambiance (décrire ses caractéristiques, lieu recréé) et un lieu exact à conserver (éditer cette image).
Pour phase=scene, scene_prompt est OBLIGATOIRE : prompt autonome de la scène provisoire, sans référence à des images absentes ni promesse de reproduire une identité. image_prompt décrit cette même scène. Inclure toute personne, action, pose et objet provisoire nécessaires aux contacts physiques ; l'objet provisoire a une géométrie compatible et aucun faux motif de marque. Observer les originaux pour préparer caméra, morphologie, mains, échelle, support et lumière. Ne pas imposer de métier, décor, beauté publicitaire, flou, grain ou imperfections. Préserver la direction demandée et les accessoires pertinents. Pas de chiffre d'angle ni de détail invisible inventé.
reference_use inclut TOUTES les références observées, avec leurs vrais rôles. Elles servent à la préparation et sont réservées ; elles ne sont pas envoyées au générateur de scène. Décris les indices utiles dans scene_prompt. Pour chaque sujet exact à intégrer ensuite, targets contient role (person/casting/product), reference_ids des originaux DU MÊME sujet, location (emplacement et pose dans la scène) et instruction (modification précise à effectuer, en français). Deux vues de la même personne sont UN target ; deux personnes distinctes sont deux targets. Ne mélange jamais leurs traits. Si leur relation est ambiguë, clarify avec une question. Les targets ne sont pas un formulaire pour l'utilisatrice.
Explique simplement dans summary : « Je prépare d'abord la scène pour valider le cadrage, la pose et l'ambiance. J'intégrerai ensuite [éléments] à partir de tes photos en conservant au maximum cette scène. [Visage/objet] sera provisoire. » Adapte ce texte, sans répétition et sans annoncer de visage final. camera_match décrit le point de vue retenu. Toute décision visible figure dans summary ou preserve/change. Pour plusieurs scènes, commence par une scène pilote à valider ; conserve les autres prises dans le brief, sans les lancer ensemble.
L'intégration édite une IMAGE précise, fournie ou sélectionnée : phase=integration, operation=edit ou product, source_reference_id ou uses_selected_version=true, originaux person/casting/product conservés. targets nomme les éléments et emplacements à modifier. image_prompt est un CONTRAT DE RETOUCHE, pas une nouvelle description créative de photographie : base à conserver, changements autorisés, éléments préservés, raccords physiques nécessaires. Ne numérote pas les fichiers : le serveur le fait après leur classement. Conserve caméra, cadrage, décor, composition, lumière, palette, netteté et textures photographiques. N'applique aucun embellissement automatique. Ne fige pas des traits provisoires incompatibles avec l'identité : cheveux, visage et silhouette peuvent être ajustés localement ; conserve la pose et la tenue sauf demande contraire. Pour un produit, remplace l'instance provisoire/existante, sans doublon, avec perspective, contacts et occultations plausibles. Demande une autre vue si une face indispensable manque.
Pour corriger la scène avant intégration, phase=scene et operation=edit sur cette version ; conserve targets et tous les originaux réservés. Pour les corrections après intégration, phase=integration et operation=edit : seules les nouvelles corrections changent, les autres choix validés et originaux subsistent. Ne réintègre pas une deuxième fois les sujets. Pour une demande indépendante, n'hérite pas des références de la branche. Chaque génération reste confirmée, et la scène doit être visible avant l'intégration.`;

export function exactReference(ref: Reference) {
  return ["person", "casting", "product"].includes(ref.role);
}

/** Reject invented IDs and incomplete subject mappings; never silently drop an original. */
export function validTargets(targets: IntegrationTarget[], refs: Reference[]) {
  const exact = refs.filter(exactReference);
  const ids = targets.flatMap(t => t.reference_ids);
  return targets.every(t => t.reference_ids.length > 0 && t.location.trim() && t.instruction.trim() &&
    t.reference_ids.every(id => exact.some(r => r.id === id && r.role === t.role))) &&
    new Set(ids).size === ids.length && exact.every(r => ids.includes(r.id));
}

export const SCENE_PRESERVE = "Conserver le cadrage, le point de vue, le décor, la lumière, les couleurs, la netteté et les textures photographiques de cette image, hors modifications explicitement demandées.";

export function integrationInstructions(targets: IntegrationTarget[]) {
  return targets.map(t => `${t.location} : ${t.instruction}`).join("\n");
}

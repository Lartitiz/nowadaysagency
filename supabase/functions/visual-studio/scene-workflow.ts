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
Remplacer le visage, la personne ou le produit provisoires par les originaux est TOUJOURS phase=integration (jamais phase=scene). Pour corriger la scène avant intégration (pose, cadrage, lumière uniquement), phase=scene et operation=edit sur cette version ; conserve targets et tous les originaux réservés. Pour les corrections après intégration, phase=integration et operation=edit : seules les nouvelles corrections changent, les autres choix validés et originaux subsistent. Ne réintègre pas une deuxième fois les sujets. Pour une demande indépendante, n'hérite pas des références de la branche. Chaque génération reste confirmée, et la scène doit être visible avant l'intégration.`;

export function exactReference(ref: Reference) {
  return ["person", "casting", "product", "person_product"].includes(ref.role);
}

/** Reject invented IDs and incomplete subject mappings; never silently drop an original. */
export function validTargets(targets: IntegrationTarget[], refs: Reference[]) {
  const exact = refs.filter(exactReference);
  const keys = targets.flatMap(t => t.reference_ids.map(id => `${id}:${t.role}`));
  return targets.every(t => t.reference_ids.length > 0 && t.location.trim() && t.instruction.trim() &&
    t.reference_ids.every(id => exact.some(r => r.id === id && (r.role === t.role || r.role === "person_product" && ["person", "product"].includes(t.role))))) &&
    new Set(keys).size === keys.length && exact.every(r => (r.role === "person_product" ? ["person", "product"] : [r.role]).every(role => keys.includes(`${r.id}:${role}`)));

}

/** Fill technical omissions only when grouping is unambiguous; never merge distinct people. */
export function repairTargets(targets: IntegrationTarget[], refs: Reference[], previous: IntegrationTarget[] = [], placement = "") {
  const originals = refs.filter(exactReference).flatMap(ref => ref.role === "person_product" ? [{...ref, role: "person" as const}, {...ref, role: "product" as const}] : [ref]);
  const result = targets.map(t => ({ ...t, reference_ids: [...new Set(t.reference_ids)] }));
  for (const t of result) {
    const matches = t.reference_ids.map(id => originals.find(r => r.id === id && (r.role === t.role || !refs.some(ref => ref.id === id && ref.role === "person_product"))));
    if (matches.length && matches.every(r => r && r.role === matches[0]?.role)) t.role = matches[0]!.role as IntegrationTarget["role"];
  }
  const groups = new Map<string, Reference[]>();
  for (const ref of originals) {
    const group = `${ref.role}:${ref.subject_group || ref.id}`;
    groups.set(group, [...(groups.get(group) || []), ref]);
  }
  for (const group of groups.values()) {
    if (group.some(r => r.subject_group)) {
      const indexes = result.map((target, i) => target.role === group[0].role && target.reference_ids.some(id => group.some(ref => ref.id === id)) ? i : -1).filter(i => i >= 0);
      if (indexes.length && indexes.every(i => result[i].reference_ids.every(id => group.some(ref => ref.id === id)))) {
        result[indexes[0]].reference_ids = group.map(ref => ref.id);
        for (const i of indexes.slice(1).reverse()) result.splice(i, 1);
      }
    }
    const missing = group.filter(r => !result.some(t => t.role === r.role && t.reference_ids.includes(r.id)));
    if (!missing.length) continue;
    const prior = previous.find(t => group.every(r => t.reference_ids.includes(r.id)) && t.role === group[0].role);
    const existing = result.find(t => group.some(r => r.role === t.role && t.reference_ids.includes(r.id)));
    if (existing && group.some(r => r.subject_group)) { existing.reference_ids.push(...missing.map(r => r.id)); continue; }
    const uniqueKind = originals.filter(r => (r.role === "casting" ? "person" : r.role) === (group[0].role === "casting" ? "person" : group[0].role)).length === group.length;
    if (prior || uniqueKind || group.some(r => r.subject_group)) result.push(prior ? { ...prior, reference_ids: group.map(r => r.id) } : {
      role: group[0].role as IntegrationTarget["role"], reference_ids: group.map(r => r.id),
      location: group[0].role === "product" ? placement || "À l’emplacement du produit dans la scène proposée" : "À l’emplacement de la personne dans la scène proposée",
      instruction: `Reprendre ${group[0].name} depuis ses originaux en conservant la mise en scène validée.`,
    });
  }
  return result;
}

export function targetProblems(targets: IntegrationTarget[], refs: Reference[]) {
  const originals = refs.filter(exactReference), ids = targets.flatMap(t => t.reference_ids.map(id => `${id}:${t.role}`));
  return [
    targets.some(t => !t.reference_ids.length) && "empty_target",
    targets.some(t => !t.location.trim() || !t.instruction.trim()) && "missing_placement",
    targets.some(t => t.reference_ids.some(id => !originals.some(r => r.id === id && (r.role === t.role || r.role === "person_product" && ["person", "product"].includes(t.role))))) && "unknown_id_or_role",
    new Set(ids).size !== ids.length && "duplicate_mapping",
    originals.some(r => (r.role === "person_product" ? ["person", "product"] : [r.role]).some(role => !ids.includes(`${r.id}:${role}`))) && "unmapped_original",
  ].filter(Boolean);
}

export const SCENE_PRESERVE = "Conserver le cadrage, le point de vue, le décor, la lumière, les couleurs, la netteté et les textures photographiques de cette image, hors modifications explicitement demandées.";

export function integrationInstructions(targets: IntegrationTarget[]) {
  return targets.map(t => `${t.location} : ${t.instruction}`).join("\n");
}

/** A reply on a provisional scene that asks to put the exact originals in place is an
 * integration, never a scene correction (scene corrections never receive originals). */
export function asksIntegration(
  operation: string,
  texts: Array<string | undefined>,
  refs: Reference[],
) {
  if (!["edit", "product"].includes(operation) || !refs.some(exactReference)) return false;
  const text = texts.filter(Boolean).join("\n").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(integr\w*|exacte?s?|original\w*|remplac\w*[^.\n]{0,60}provisoire)/.test(text);
}

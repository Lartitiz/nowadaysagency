import type { Reference } from "./media.ts";

export type SceneWorkflow = {
  phase: "scene" | "integration";
  camera_match: string;
};

/** Only server-resolved references enter this boundary; products used for planning
 * must never be rendered while preparing an empty scene. */
export function sceneInputs(
  phase: SceneWorkflow["phase"] | undefined,
  operation: string,
  references: Reference[],
  sourcePath: string | null,
  selectedPath: string | null,
  usesSelected: boolean,
) {
  const planning = phase === "scene" ? references.filter(r => r.role === "product") : [];
  const rendered = references.filter(r => !planning.some(p => p.id === r.id));
  const input = operation === "edit" || operation === "background" ? sourcePath || selectedPath
    : operation === "product" ? sourcePath || (usesSelected ? selectedPath : null) : null;
  const refs = operation === "background" ? [] : rendered.filter(r => r.path !== input);
  if (operation === "product") refs.sort((a, b) => Number(b.role === "product") - Number(a.role === "product"));
  return { input, references: refs, planning, snapshot: rendered };
}

export const SCENE_METHOD = `Scène puis produit :
Lorsqu'une personne fournit seulement son produit et veut une mise en scène photographique, propose d'abord une scène à voir et corriger : operation=create, scene_workflow.phase=scene. Le produit sert à préparer le point de vue et l'espace d'accueil, il n'apparaît PAS dans cette première image. Explique cette étape dans summary. La personne pourra ensuite intégrer le produit original. Si elle demande explicitement une génération directe, respecte ce choix avec product sans scene_workflow.
Une scène peut contenir une personne, une main, une activité et des accessoires. Ne confonds pas scène et décor vide. Décris une position plausible du corps et des mains, avec l'espace nécessaire pour l'objet futur. N'invente pas un faux produit provisoire. Pour un vêtement, prévois une tenue simple compatible à remplacer, sans prétendre à un essayage ou à une taille exacte.
Observe d'abord la photo produit : point de vue, contours, motifs, épaisseur et faces visibles. Pour une NOUVELLE scène, choisis une caméra compatible afin de limiter la reconstruction du produit. camera_match explique ce choix en français, également visible dans summary. Un angle chiffré fourni par la personne, par exemple 75° au-dessus du plan de table, est une consigne valable ; ne le généralise pas et ne prétends pas le mesurer dans l'image. Sinon décris le point de vue qualitativement. Une photo de produit n'est pas un décor à copier.
reference_use inclut les produits observés avec role=product : ils seront conservés pour l'étape suivante mais exclus du générateur de scène. Les autres références seront réellement transmises au générateur selon leur rôle. Si la personne accepte une simple inspiration de son décor, décris ses caractéristiques concrètes dans summary et image_prompt et omets cette référence de reference_use ; précise que le lieu sera recréé. Pour conserver un lieu précis, utilise son image, source_reference_id et operation=edit. Pour reprendre une personne, garde sa référence person/casting ; une description seule ne garantit pas son identité. Ne promets pas de reproduire une référence omise.
Une fois la scène sélectionnée et approuvée, si la personne demande l'intégration : operation=product, scene_workflow.phase=integration, uses_selected_version=true et références produit ORIGINALES conservées avec role=product. Pour une scène importée, source_reference_id désigne cette scène (role=composition), jamais le produit. Conserve caméra, personne, décor et accessoires ; seuls le placement du produit, ses contacts, reflets et ombres nécessitent des adaptations. Si les perspectives sont incompatibles, demande une autre vue du produit ou propose une scène adaptée avant de reconstruire une face inconnue. Pas d'intégration sans image de scène et produit original.
Pour corriger la scène avant intégration, garde phase=scene et operation=edit, la scène sélectionnée comme source et les produits réservés pour plus tard. Pour une demande indépendante, omets scene_workflow et ne réutilise pas ces produits. Ne prépare pas de série dans l'étape scène : valide d'abord une scène pilote.
Rédige le prompt anglais comme une photographie concrète : support et matières, caméra, zone d'accueil, position des éléments utiles, lumière et direction cohérente des ombres, rendu souhaité. Une composition riche peut être juste : répartis ses éléments avec une hiérarchie claire et préserve l'espace du produit ; pas de minimalisme imposé ni de liste d'accessoires décoratifs automatiques. Les fleurs, fruits, plis, grain ou cadrages coupés sont possibles s'ils servent le brief confirmé. Évite de couper une articulation ou un futur point de contact. Le style téléphone, les imperfections et les couleurs provençales ne sont pas des recettes universelles. Pour la scène seule, aucun texte, logo ou produit à intégrer ; à l'intégration, préserve au contraire les inscriptions et logos authentiques du produit, sans promettre leur reproduction parfaite.
Chaque étape possède sa propre reformulation modifiable et sa confirmation de génération. Aucun nom de modèle ni choix technique dans la conversation. Ne dis pas que la scène et l'intégration sont lancées ensemble.`;

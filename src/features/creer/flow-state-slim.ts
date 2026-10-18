// Copie locale trop lourde (chantier U, 18/10/2026).
//
// Un carrousel « Tes photos en fond » garde ses photos dans le HTML des slides :
// ~11 Mo, alors que la mémoire d'un onglet en accepte ~5. L'écriture échouait
// en entier : au rechargement, l'écran revenait au texte avec « Créer les
// visuels » (1 crédit) et le message « Sauvegarde locale indisponible »,
// alors que la version retouchée était bien dans Mes idées.
//
// Ici : on garde tout sauf le HTML des visuels. Quand le carrousel est
// enregistré dans Mes idées (éditeur ouvert), on le note : au rechargement,
// les visuels reviennent de la fiche (use-restore-visuals-from-idea.ts).

type FlowLike = {
  result?: any;
  visualSlides?: { slide_number: number; html: string }[];
  visualsInCloud?: boolean;
  [key: string]: any;
};

/** Version légère de la copie locale, ou null s'il n'y a rien à alléger. */
export function slimFlowState<T extends FlowLike>(state: T): T | null {
  const raw = state.result?.raw;
  const heavy = !!state.visualSlides?.length || !!raw?.visual_html;
  if (!heavy) return null;
  const { visual_html: _html, ...lightRaw } = raw || {};
  if (lightRaw._carousel_cloud) lightRaw._carousel_cloud = { ...lightRaw._carousel_cloud, history: [] };
  return {
    ...state,
    visualSlides: [],
    result: raw ? { ...state.result, raw: lightRaw } : state.result,
    // L'éditeur ouvert = sauvegarde automatique dans Mes idées.
    visualsInCloud: !!(raw?.carousel_editor_version || raw?.carousel_studio_version),
  };
}

/** Les visuels sont de nouveau dans la copie locale : plus besoin de la fiche. */
export function clearCloudMarker<T extends FlowLike>(state: T): T {
  if (!state.visualsInCloud || !state.visualSlides?.length) return state;
  const { visualsInCloud: _marker, ...rest } = state;
  return rest as T;
}

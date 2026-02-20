// ── Objectifs ──
export const OBJECTIFS = [
  { id: "visibilite", label: "Visibilité", emoji: "🔍", desc: "Faire découvrir", color: "bg-violet-100 text-violet-700 border-violet-300" },
  { id: "confiance", label: "Confiance", emoji: "💛", desc: "Créer du lien", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { id: "vente", label: "Vente", emoji: "🛒", desc: "Convertir", color: "bg-rose-100 text-rose-700 border-rose-300" },
  { id: "credibilite", label: "Crédibilité", emoji: "🎓", desc: "Montrer l'expertise", color: "bg-slate-100 text-slate-700 border-slate-300" },
] as const;

// ── Formats (13 total) ──
export const FORMATS = [
  { id: "enquete", label: "Enquête / décryptage", index: 1 },
  { id: "test", label: "Test grandeur nature", index: 2 },
  { id: "coup-de-gueule", label: "Coup de gueule", index: 3 },
  { id: "mythe", label: "Mythe à déconstruire", index: 4 },
  { id: "storytelling", label: "Storytelling", index: 5 },
  { id: "histoire-cliente", label: "Histoire cliente", index: 6 },
  { id: "before-after", label: "Before / After", index: 7 },
  { id: "regard-philo", label: "Regard philosophique", index: 8 },
  { id: "conseil-contre-intuitif", label: "Conseil contre-intuitif", index: 9 },
  { id: "surf-actu", label: "Surf sur l'actu", index: 10 },
  { id: "identification", label: "Identification / quotidien", index: 11 },
  { id: "build-in-public", label: "Build in public", index: 12 },
  { id: "analyse-profondeur", label: "Analyse en profondeur", index: 13 },
];

// ── Recommendation matrix ──
export const RECO_MATRIX: Record<string, number[]> = {
  visibilite: [3, 4, 9, 11],   // coup de gueule, mythe, conseil contre-intuitif, identification
  confiance: [5, 12, 8, 2],    // storytelling, build in public, regard philo, test
  vente: [6, 7, 10, 5],        // histoire cliente, before/after, surf actu, storytelling
  credibilite: [1, 13, 8, 4],  // enquête, analyse profondeur, regard philo, mythe
};

export function getRecommendedFormats(objectif: string | null) {
  if (!objectif || !RECO_MATRIX[objectif]) return { recommended: [], others: FORMATS };
  const recoIndices = RECO_MATRIX[objectif];
  const recommended = FORMATS.filter((f) => recoIndices.includes(f.index));
  const others = FORMATS.filter((f) => !recoIndices.includes(f.index));
  return { recommended, others };
}

// Map format id to the production guide key
export function formatIdToGuideKey(formatId: string): string {
  const map: Record<string, string> = {
    "enquete": "Enquête / décryptage",
    "test": "Test grandeur nature",
    "coup-de-gueule": "Coup de gueule",
    "mythe": "Mythe à déconstruire",
    "storytelling": "Storytelling",
    "histoire-cliente": "Histoire cliente",
    "before-after": "Before / After",
    "regard-philo": "Regard philosophique",
    "conseil-contre-intuitif": "Conseil contre-intuitif",
    "surf-actu": "Surf sur l'actu",
    "identification": "Identification / quotidien",
    "build-in-public": "Build in public",
    "analyse-profondeur": "Analyse en profondeur",
  };
  return map[formatId] || formatId;
}

// ── Canal filters ──
export const CANAUX = [
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: true },
  { id: "newsletter", label: "Newsletter", enabled: false },
  { id: "pinterest", label: "Pinterest", enabled: false },
];

// ── Reco explainer text ──
export const RECO_EXPLAIN: Record<string, string> = {
  visibilite: "Pour un objectif visibilité, les formats qui marchent le mieux sont les sujets clivants, les mythes à déconstruire et les contenus d'identification.",
  confiance: "Pour créer de la confiance, mise sur le storytelling, le build in public et les réflexions personnelles.",
  vente: "Pour convertir, les histoires clientes, les avant/après et le storytelling sont les plus efficaces.",
  credibilite: "Pour asseoir ta crédibilité, les enquêtes, analyses en profondeur et regards philosophiques fonctionnent le mieux.",
};

// ── Checklist qualité ──
export const QUALITY_CHECKLIST = [
  "L'accroche donne envie de lire la suite ?",
  "Un seul message principal ?",
  "Du storytelling ou un exemple concret ?",
  "Le ton me ressemble ?",
  "Le CTA est naturel (pas agressif) ?",
];

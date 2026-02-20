export const PRODUCTION_GUIDES: Record<string, string[]> = {
  "Storytelling": [
    "Choisis un moment vécu (galère, déclic, surprise)",
    "Plante le décor en 2 phrases (où, quand, comment tu te sentais)",
    "Raconte ce qui s'est passé (le retournement)",
    "Tire la leçon : qu'est-ce que ça change pour ta lectrice ?",
    "Finis par une question ouverte",
  ],
  "Mythe à déconstruire": [
    "Formule le mythe entre guillemets (\"Il faut poster tous les jours\")",
    "Explique pourquoi c'est faux ou incomplet",
    "Donne un exemple concret ou une preuve",
    "Propose la vraie leçon à retenir",
  ],
  "Coup de gueule": [
    "Commence par ce qui t'énerve (sois directe)",
    "Décris le problème précisément",
    "Explique l'impact que ça a sur les créatrices",
    "Propose une alternative ou un appel à la réflexion",
  ],
  "Enquête / décryptage": [
    "Pars d'une observation (\"J'ai remarqué que...\")",
    "Donne le contexte",
    "Analyse avec des exemples concrets",
    "Conclus : qu'est-ce que ça change pour toi / ton audience ?",
  ],
  "Conseil contre-intuitif": [
    "Cite le conseil mainstream que tout le monde donne",
    "Explique pourquoi ça ne marche pas (ou plus)",
    "Donne ton conseil alternatif",
    "Explique pourquoi ça marche mieux",
  ],
  "Test grandeur nature": [
    "\"J'ai testé [X] pendant [durée]\"",
    "Explique pourquoi tu as voulu tester",
    "Donne tes résultats honnêtement (chiffres si possible)",
    "Verdict : \"ça vaut le coup si...\" / \"skip si...\"",
  ],
  "Before / After": [
    "Décris le \"avant\" honnêtement",
    "Décris le \"après\" sans exagérer",
    "Explique ce qui a changé (les actions, les déclics)",
    "Tire la leçon plus large",
  ],
  "Histoire cliente": [
    "\"Elle m'a dit : ...\" (commence par un verbatim)",
    "Décris son blocage",
    "Raconte le déclic",
    "Donne le résultat",
    "Tire la leçon universelle",
  ],
  "Regard philosophique": [
    "Pars d'une observation large (société, temps, rapport au travail...)",
    "Développe ton analyse",
    "Fais le lien avec la communication",
    "Ouvre la réflexion (pas de solution toute faite)",
  ],
  "Surf sur l'actu": [
    "Résume l'actu en 1-2 phrases",
    "Donne ton analyse : ce que ça révèle",
    "Fais le lien avec ton audience : pourquoi ça les concerne",
    "Ta position : ce que tu en penses",
  ],
  "Identification / quotidien": [
    "Pars d'une situation ultra-concrète que ta cible vit (POV, 'toi aussi tu…')",
    "Décris la scène avec des détails sensoriels",
    "Montre que tu comprends parfaitement ce qu'elle ressent",
    "Finis par une ouverture : 'Dis-moi en commentaire si…'",
  ],
  "Build in public": [
    "Partage une étape concrète de ton projet en cours",
    "Montre les coulisses : les doutes, les chiffres, les décisions",
    "Sois honnête sur ce qui marche ET ce qui coince",
    "Invite ton audience à participer (avis, vote, feedback)",
  ],
  "Analyse en profondeur": [
    "Choisis un sujet précis et annonce-le clairement",
    "Décompose en 3-5 points clés numérotés",
    "Pour chaque point, donne un exemple ou une preuve",
    "Conclus par un take personnel : ta position sur le sujet",
  ],
};

// Instagram format recommendations per angle
export const INSTAGRAM_FORMAT_RECO: Record<string, string> = {
  "Storytelling": "Ce sujet se prête bien à un carrousel ou un post texte long.",
  "Mythe à déconstruire": "Ce sujet se prête bien à un carrousel éducatif.",
  "Coup de gueule": "Ce sujet se prête bien à un reel face caméra ou un post texte.",
  "Enquête / décryptage": "Ce sujet se prête bien à un carrousel ou un reel explicatif.",
  "Conseil contre-intuitif": "Ce sujet se prête bien à un carrousel ou un reel court.",
  "Test grandeur nature": "Ce sujet se prête bien à un reel ou un carrousel avant/après.",
  "Before / After": "Ce sujet se prête bien à un carrousel visuel ou un reel.",
  "Histoire cliente": "Ce sujet se prête bien à un carrousel storytelling ou un post texte.",
  "Regard philosophique": "Ce sujet se prête bien à un post texte long ou un carrousel.",
  "Surf sur l'actu": "Ce sujet se prête bien à un reel réactif ou une story.",
  "Identification / quotidien": "Ce sujet se prête bien à un reel POV ou un post texte court.",
  "Build in public": "Ce sujet se prête bien à un carrousel coulisses ou un reel.",
  "Analyse en profondeur": "Ce sujet se prête bien à un carrousel éducatif 8-10 slides.",
};

// Normalize angle string for lookup
export function getGuide(angle: string): string[] | null {
  const normalized = angle.trim();
  if (PRODUCTION_GUIDES[normalized]) return PRODUCTION_GUIDES[normalized];
  const key = Object.keys(PRODUCTION_GUIDES).find(
    (k) => k.toLowerCase().replace(/\s+/g, "") === normalized.toLowerCase().replace(/\s+/g, "")
  );
  return key ? PRODUCTION_GUIDES[key] : null;
}

export function getInstagramFormatReco(angle: string): string | null {
  const normalized = angle.trim();
  if (INSTAGRAM_FORMAT_RECO[normalized]) return INSTAGRAM_FORMAT_RECO[normalized];
  const key = Object.keys(INSTAGRAM_FORMAT_RECO).find(
    (k) => k.toLowerCase().replace(/\s+/g, "") === normalized.toLowerCase().replace(/\s+/g, "")
  );
  return key ? INSTAGRAM_FORMAT_RECO[key] : null;
}

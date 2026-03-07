// ── 1. EDITORIAL_ANGLES ──

export interface EditorialAngle {
  id: string;
  label: string;
  emoji: string;
  principle: string;
  defaultStructure: string;
  objectives: string[];
  phase: number[];
  declic: "prise de conscience" | "identification" | "projection" | "les_deux";
  exampleSubjects: string[];
}

export const EDITORIAL_ANGLES: EditorialAngle[] = [
  {
    id: "enquete",
    label: "Enquête / décryptage",
    emoji: "🔍",
    principle: "Révéler une vérité cachée avec des preuves et des données pour éduquer.",
    defaultStructure: "educationnelle",
    objectives: ["credibilite", "visibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Les vrais chiffres derrière le marketing d'influence", "Ce que personne ne dit sur le personal branding"],
  },
  {
    id: "test",
    label: "Test grandeur nature",
    emoji: "🧪",
    principle: "Tester une méthode ou un outil et partager les résultats réels.",
    defaultStructure: "tuto",
    objectives: ["credibilite", "engagement"],
    phase: [2, 3],
    declic: "projection",
    exampleSubjects: ["J'ai testé ChatGPT pour mes posts pendant 30 jours", "J'ai appliqué la méthode AIDA sur 10 posts"],
  },
  {
    id: "coup-de-gueule",
    label: "Coup de gueule",
    emoji: "🔥",
    principle: "Prendre position fermement contre une pratique ou une croyance répandue.",
    defaultStructure: "coup_de_gueule",
    objectives: ["visibilite", "engagement"],
    phase: [1],
    declic: "prise de conscience",
    exampleSubjects: ["Arrêtez de publier tous les jours sans stratégie", "Le mythe du contenu viral"],
  },
  {
    id: "mythe",
    label: "Mythe à déconstruire",
    emoji: "💥",
    principle: "Démonter une croyance populaire avec des arguments solides.",
    defaultStructure: "educationnelle",
    objectives: ["visibilite", "credibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Non, poster plus ne veut pas dire vendre plus", "Le mythe du client idéal unique"],
  },
  {
    id: "storytelling",
    label: "Storytelling",
    emoji: "📖",
    principle: "Raconter une histoire personnelle pour créer de l'émotion et du lien.",
    defaultStructure: "storytelling",
    objectives: ["engagement", "vente"],
    phase: [2, 3],
    declic: "identification",
    exampleSubjects: ["Ma pire erreur de communication", "Le jour où j'ai failli tout arrêter"],
  },
  {
    id: "histoire-cliente",
    label: "Histoire cliente",
    emoji: "💬",
    principle: "Montrer une transformation réelle à travers le parcours d'un client.",
    defaultStructure: "etude_de_cas",
    objectives: ["vente", "credibilite"],
    phase: [3],
    declic: "projection",
    exampleSubjects: ["Comment Marie a doublé ses leads en 3 mois", "De 0 à 50 clients grâce à LinkedIn"],
  },
  {
    id: "surf-actu",
    label: "Surf sur l'actu",
    emoji: "🌊",
    principle: "Rebondir sur un événement ou une tendance pour apporter son angle expert.",
    defaultStructure: "conseil_pratique",
    objectives: ["visibilite", "engagement"],
    phase: [1],
    declic: "prise de conscience",
    exampleSubjects: ["Ce que la dernière mise à jour Instagram change pour toi", "La tendance UGC décryptée"],
  },
  {
    id: "regard-philo",
    label: "Regard philosophique",
    emoji: "🧠",
    principle: "Prendre du recul pour questionner en profondeur une pratique ou un concept.",
    defaultStructure: "storytelling",
    objectives: ["credibilite", "engagement"],
    phase: [2],
    declic: "les_deux",
    exampleSubjects: ["Et si la productivité était un piège ?", "La vulnérabilité comme stratégie de marque"],
  },
  {
    id: "conseil-contre-intuitif",
    label: "Conseil contre-intuitif",
    emoji: "🔄",
    principle: "Proposer un conseil qui va à l'encontre des idées reçues.",
    defaultStructure: "educationnelle",
    objectives: ["visibilite", "credibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Arrête de chercher ta niche", "Publie moins, gagne plus"],
  },
  {
    id: "before-after",
    label: "Before / After",
    emoji: "✨",
    principle: "Montrer le contraste entre un avant et un après pour illustrer une transformation.",
    defaultStructure: "etude_de_cas",
    objectives: ["vente", "credibilite"],
    phase: [3],
    declic: "projection",
    exampleSubjects: ["Mon feed Instagram avant vs après ma stratégie", "Un post rewrité : avant/après"],
  },
  {
    id: "identification",
    label: "Identification / quotidien",
    emoji: "🪞",
    principle: "Partager des situations du quotidien dans lesquelles l'audience se reconnaît.",
    defaultStructure: "conseil_pratique",
    objectives: ["engagement", "visibilite"],
    phase: [1, 2],
    declic: "identification",
    exampleSubjects: ["Ce moment où tu fixes ton écran sans savoir quoi poster", "Quand ton entourage ne comprend pas ton métier"],
  },
  {
    id: "build-in-public",
    label: "Build in public",
    emoji: "🏗️",
    principle: "Partager les coulisses, les chiffres et les apprentissages en temps réel.",
    defaultStructure: "storytelling",
    objectives: ["engagement", "credibilite"],
    phase: [2, 3],
    declic: "les_deux",
    exampleSubjects: ["Bilan du mois : 3 victoires et 2 échecs", "Les coulisses de ma dernière offre"],
  },
  {
    id: "analyse-profondeur",
    label: "Analyse en profondeur",
    emoji: "📊",
    principle: "Décortiquer un sujet complexe avec rigueur et pédagogie.",
    defaultStructure: "educationnelle",
    objectives: ["credibilite", "visibilite"],
    phase: [2],
    declic: "prise de conscience",
    exampleSubjects: ["Anatomie d'un post viral : 5 patterns décryptés", "L'algorithme LinkedIn en 2025 : ce qui marche vraiment"],
  },
];

// ── 1b. LINKEDIN_EDITORIAL_ANGLES ──

export const LINKEDIN_EDITORIAL_ANGLES: EditorialAngle[] = [
  {
    id: "decryptage_expert",
    label: "Décryptage expert",
    emoji: "🔍",
    principle: "Analyser un phénomène de ton secteur avec un angle neuf, sourcé et argumenté.",
    defaultStructure: "educationnelle",
    objectives: ["credibilite", "visibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Ce que personne ne dit sur [tendance de ton secteur]", "Les vrais chiffres derrière [pratique courante]"],
  },
  {
    id: "prise_de_position",
    label: "Prise de position",
    emoji: "🔥",
    principle: "Défendre une conviction argumentée sur ton métier ou ton secteur.",
    defaultStructure: "coup_de_gueule",
    objectives: ["visibilite", "engagement"],
    phase: [1],
    declic: "prise de conscience",
    exampleSubjects: ["Je refuse de [pratique mainstream]. Voilà pourquoi.", "[Conviction forte] et je l'assume."],
  },
  {
    id: "mythe_deconstruire",
    label: "Mythe à déconstruire",
    emoji: "💥",
    principle: "Démonter une croyance répandue dans ton secteur avec des preuves concrètes.",
    defaultStructure: "educationnelle",
    objectives: ["credibilite", "visibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["\"[Croyance répandue]\". C'est faux.", "Non, [idée reçue] ne fonctionne pas. Voilà pourquoi."],
  },
  {
    id: "storytelling_pro",
    label: "Storytelling pro",
    emoji: "📖",
    principle: "Raconter un vécu professionnel et en tirer une leçon applicable.",
    defaultStructure: "storytelling",
    objectives: ["engagement", "vente"],
    phase: [2, 3],
    declic: "identification",
    exampleSubjects: ["Le jour où [moment clé professionnel]", "Ce que [erreur/galère] m'a appris sur [sujet]"],
  },
  {
    id: "etude_de_cas",
    label: "Étude de cas",
    emoji: "💎",
    principle: "Montrer des résultats concrets à travers un projet ou une transformation.",
    defaultStructure: "etude_de_cas",
    objectives: ["vente", "credibilite"],
    phase: [3, 4],
    declic: "projection",
    exampleSubjects: ["En [durée], [client·e/projet] est passé·e de [avant] à [après]", "Comment [action concrète] a changé [résultat]"],
  },
  {
    id: "coulisses_metier",
    label: "Coulisses métier",
    emoji: "🏗️",
    principle: "Montrer comment tu travailles vraiment : process, outils, décisions.",
    defaultStructure: "storytelling",
    objectives: ["engagement", "credibilite"],
    phase: [2, 3],
    declic: "les_deux",
    exampleSubjects: ["Voilà à quoi ressemble vraiment [aspect de ton métier]", "Cette semaine j'ai [action concrète]. Voilà pourquoi."],
  },
  {
    id: "conseil_contre_courant",
    label: "Conseil contre-courant",
    emoji: "🔄",
    principle: "Challenger un conseil mainstream de ton secteur et proposer une alternative.",
    defaultStructure: "educationnelle",
    objectives: ["visibilite", "credibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Tout le monde dit [conseil courant]. J'ai fait l'inverse.", "Arrête de [conseil mainstream]. Fais plutôt [alternative]."],
  },
  {
    id: "reflexion_de_fond",
    label: "Réflexion de fond",
    emoji: "🧠",
    principle: "Prendre de la hauteur sur un enjeu sociétal ou sectoriel lié à ton métier.",
    defaultStructure: "storytelling",
    objectives: ["credibilite", "engagement"],
    phase: [2],
    declic: "les_deux",
    exampleSubjects: ["Et si [question de fond sur ton secteur] ?", "Ce que [tendance/enjeu] dit vraiment de notre façon de [travailler/communiquer]"],
  },
];

// ── 1c. PINTEREST_EDITORIAL_ANGLES ──

export const PINTEREST_EDITORIAL_ANGLES: EditorialAngle[] = [
  {
    id: "epingle_produit",
    label: "Épingle produit / offre",
    emoji: "🛍️",
    principle: "Présenter un produit ou une offre avec un titre SEO et une description qui donne envie de cliquer.",
    defaultStructure: "conseil_pratique",
    objectives: ["vente"],
    phase: [3, 4],
    declic: "projection",
    exampleSubjects: ["Mon tote bag en lin fait main", "Séance photo portrait pour entrepreneures"],
  },
  {
    id: "epingle_conseil",
    label: "Épingle conseil / tuto",
    emoji: "💡",
    principle: "Partager un conseil pratique ou un mini-tuto que ta cible chercherait sur Pinterest.",
    defaultStructure: "educationnelle",
    objectives: ["visibilite", "credibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["5 erreurs à éviter pour [sujet]", "Comment [action] en [durée]"],
  },
  {
    id: "epingle_inspiration",
    label: "Épingle inspiration",
    emoji: "✨",
    principle: "Créer une épingle aspirationnelle qui attire par l'univers visuel et le lifestyle.",
    defaultStructure: "storytelling",
    objectives: ["visibilite", "engagement"],
    phase: [1],
    declic: "identification",
    exampleSubjects: ["Idées décoration [style]", "Routine bien-être [thème]"],
  },
  {
    id: "epingle_article",
    label: "Épingle article / blog",
    emoji: "📝",
    principle: "Renvoyer vers un article de blog ou une page de contenu avec un titre SEO descriptif.",
    defaultStructure: "educationnelle",
    objectives: ["credibilite", "visibilite"],
    phase: [1, 2],
    declic: "prise de conscience",
    exampleSubjects: ["Guide complet : [sujet]", "Tout savoir sur [thème]"],
  },
];

// ── 2. CONTENT_STRUCTURES ──

export interface StructureStep {
  role: string;
  label: string;
  desc: string;
}

export interface ContentStructure {
  label: string;
  steps: StructureStep[];
}

export const CONTENT_STRUCTURES: Record<string, ContentStructure> = {
  educationnelle: {
    label: "Éducationnelle",
    steps: [
      { role: "hook", label: "Hook", desc: "Phrase choc ou question qui capte l'attention" },
      { role: "probleme", label: "Problème", desc: "Présentation du problème ou de la croyance erronée" },
      { role: "contexte", label: "Contexte", desc: "Pourquoi c'est important, données ou exemples" },
      { role: "explication_1", label: "Point clé 1", desc: "Premier élément de la démonstration" },
      { role: "explication_2", label: "Point clé 2", desc: "Deuxième élément de la démonstration" },
      { role: "explication_3", label: "Point clé 3", desc: "Troisième élément ou nuance" },
      { role: "synthese", label: "Synthèse", desc: "Résumé du message principal" },
      { role: "cta", label: "CTA", desc: "Appel à l'action ou ouverture de discussion" },
    ],
  },
  conseil_pratique: {
    label: "Conseil pratique",
    steps: [
      { role: "hook", label: "Hook", desc: "Accroche qui identifie le problème du lecteur" },
      { role: "constat", label: "Constat", desc: "Ce qu'on observe dans la réalité" },
      { role: "conseil_1", label: "Conseil 1", desc: "Premier conseil actionnable" },
      { role: "conseil_2", label: "Conseil 2", desc: "Deuxième conseil actionnable" },
      { role: "conseil_3", label: "Conseil 3", desc: "Troisième conseil actionnable" },
      { role: "mise_en_garde", label: "Mise en garde", desc: "Ce qu'il faut éviter ou nuance importante" },
      { role: "cta", label: "CTA", desc: "Invitation à passer à l'action" },
    ],
  },
  coup_de_gueule: {
    label: "Coup de gueule",
    steps: [
      { role: "hook", label: "Hook (frustration)", desc: "Phrase coup de poing qui exprime la frustration" },
      { role: "constat", label: "Constat accablant", desc: "Ce qui ne va pas, avec exemples concrets" },
      { role: "pourquoi", label: "Pourquoi ça pose problème", desc: "Les conséquences négatives" },
      { role: "alternative", label: "Alternative proposée", desc: "Ce qu'on devrait faire à la place" },
      { role: "manifeste", label: "Manifeste", desc: "Prise de position claire et assumée" },
      { role: "cta", label: "CTA", desc: "Appel à rejoindre le mouvement ou réagir" },
    ],
  },
  storytelling: {
    label: "Storytelling",
    steps: [
      { role: "hook", label: "Hook (la claque)", desc: "Phrase choc, chiffrée ou très concrète" },
      { role: "contexte", label: "Contexte / vulnérabilité", desc: "Poser le décor, les raisons humaines" },
      { role: "erreurs", label: "Erreurs / responsabilité", desc: "Pas victime, mais apprentie" },
      { role: "declencheur", label: "Déclencheur", desc: "Le moment de bascule" },
      { role: "transformation", label: "Transformation", desc: "Ce qui a changé concrètement" },
      { role: "lecon", label: "Leçon universelle", desc: "Ce que le lecteur peut en tirer" },
      { role: "cta", label: "CTA émotionnel", desc: "Question ouverte ou invitation au partage" },
    ],
  },
  tuto: {
    label: "Tutoriel pas à pas",
    steps: [
      { role: "hook", label: "Hook (résultat promis)", desc: "Ce que le lecteur va savoir faire à la fin" },
      { role: "prerequis", label: "Prérequis", desc: "Ce qu'il faut avant de commencer" },
      { role: "etape_1", label: "Étape 1", desc: "Première action concrète" },
      { role: "etape_2", label: "Étape 2", desc: "Deuxième action concrète" },
      { role: "etape_3", label: "Étape 3", desc: "Troisième action concrète" },
      { role: "etape_4", label: "Étape 4", desc: "Quatrième action ou vérification" },
      { role: "resultat", label: "Résultat attendu", desc: "Ce qu'on obtient en suivant les étapes" },
      { role: "cta", label: "CTA", desc: "Enregistre / partage / essaie maintenant" },
    ],
  },
  etude_de_cas: {
    label: "Étude de cas",
    steps: [
      { role: "hook", label: "Hook (résultat)", desc: "Le résultat obtenu en une phrase impactante" },
      { role: "portrait", label: "Portrait client", desc: "Qui est cette personne, son contexte" },
      { role: "probleme", label: "Problème initial", desc: "La situation de départ, les frustrations" },
      { role: "declencheur", label: "Déclencheur", desc: "Pourquoi cette personne a décidé d'agir" },
      { role: "solution_1", label: "Solution - Phase 1", desc: "Première étape de la transformation" },
      { role: "solution_2", label: "Solution - Phase 2", desc: "Deuxième étape de la transformation" },
      { role: "solution_3", label: "Solution - Phase 3", desc: "Troisième étape ou ajustement" },
      { role: "resultats", label: "Résultats concrets", desc: "Chiffres, témoignage, preuves tangibles" },
      { role: "apprentissage", label: "Apprentissage clé", desc: "La leçon principale à retenir" },
      { role: "lien_offre", label: "Lien vers l'offre", desc: "Transition naturelle vers ton accompagnement" },
      { role: "cta", label: "CTA", desc: "Invitation à passer à l'action" },
    ],
  },
  lancement: {
    label: "Lancement",
    steps: [
      { role: "hook", label: "Hook (annonce)", desc: "Annonce percutante de la nouveauté" },
      { role: "probleme", label: "Problème résolu", desc: "Le problème que cette offre résout" },
      { role: "solution", label: "La solution", desc: "Ce que c'est concrètement" },
      { role: "benefice_1", label: "Bénéfice 1", desc: "Premier bénéfice clé" },
      { role: "benefice_2", label: "Bénéfice 2", desc: "Deuxième bénéfice clé" },
      { role: "preuve", label: "Preuve sociale", desc: "Témoignage, résultat, garantie" },
      { role: "offre", label: "Détails de l'offre", desc: "Prix, contenu, modalités" },
      { role: "urgence", label: "Urgence / rareté", desc: "Pourquoi agir maintenant" },
      { role: "cta", label: "CTA direct", desc: "Lien, bouton, action immédiate" },
    ],
  },
};

// ── 3. CONTENT_TYPE_SPECS ──

export interface ContentTypeSpec {
  label: string;
  emoji: string;
  channel: string;
  edgeFunction: string;
  specs?: string;
  comingSoon?: boolean;
}

export const CONTENT_TYPE_SPECS: Record<string, ContentTypeSpec> = {
  carousel: {
    label: "Carrousel",
    emoji: "🎠",
    channel: "instagram",
    edgeFunction: "carousel-ai",
    specs: "8-10 slides, format éducatif ou storytelling",
  },
  reel: {
    label: "Reel",
    emoji: "🎬",
    channel: "instagram",
    edgeFunction: "reels-ai",
    specs: "15-60 sec, face cam ou voix off",
  },
  story: {
    label: "Story",
    emoji: "📱",
    channel: "instagram",
    edgeFunction: "stories-ai",
    specs: "4-7 séquences, engagement interactif",
  },
  post: {
    label: "Post",
    emoji: "📝",
    channel: "instagram",
    edgeFunction: "creative-flow",
    specs: "800-1500 caractères, accroche + CTA",
  },
  linkedin: {
    label: "LinkedIn",
    emoji: "💼",
    channel: "linkedin",
    edgeFunction: "linkedin-ai",
    specs: "1300-2000 caractères, ton professionnel",
  },
  newsletter: {
    label: "Newsletter",
    emoji: "📧",
    channel: "newsletter",
    edgeFunction: "newsletter-ai",
    specs: "1500-2500 mots, storytelling + valeur",
  },
  pinterest: {
    label: "Pinterest",
    emoji: "📌",
    channel: "pinterest",
    edgeFunction: "pinterest-ai",
    specs: "Titre SEO + description 100-200 mots",
  },
};

// ── 4. OBJECTIVE_RECOMMENDATIONS ──

export interface ObjectiveRecommendation {
  label: string;
  emoji: string;
  angles: string[];
  priorityTypes: string[];
  hookTypes: string[];
}

export const OBJECTIVE_RECOMMENDATIONS: Record<string, ObjectiveRecommendation> = {
  visibilite: {
    label: "Visibilité",
    emoji: "🔍",
    angles: ["coup-de-gueule", "mythe", "conseil-contre-intuitif", "identification", "surf-actu", "prise_de_position", "mythe_deconstruire", "conseil_contre_courant", "decryptage_expert"],
    priorityTypes: ["carousel", "reel", "linkedin"],
    hookTypes: ["choc", "question", "statistique"],
  },
  engagement: {
    label: "Engagement",
    emoji: "💬",
    angles: ["storytelling", "identification", "build-in-public", "regard-philo", "surf-actu", "storytelling_pro", "coulisses_metier", "reflexion_de_fond"],
    priorityTypes: ["post", "reel", "story"],
    hookTypes: ["identification", "question", "vulnerabilite"],
  },
  vente: {
    label: "Vente",
    emoji: "🛒",
    angles: ["histoire-cliente", "before-after", "storytelling", "surf-actu", "test", "etude_de_cas", "storytelling_pro"],
    priorityTypes: ["carousel", "linkedin", "newsletter"],
    hookTypes: ["resultat", "transformation", "preuve"],
  },
  credibilite: {
    label: "Crédibilité",
    emoji: "🎓",
    angles: ["enquete", "analyse-profondeur", "regard-philo", "mythe", "test", "decryptage_expert", "conseil_contre_courant", "reflexion_de_fond"],
    priorityTypes: ["carousel", "linkedin", "newsletter"],
    hookTypes: ["donnee", "expertise", "decryptage"],
  },
};

// ── 5. getStructureForCombo ──

export function getStructureForCombo(contentType: string, angleId: string): string {
  // Special cases
  if (angleId === "histoire-cliente" && (contentType === "linkedin" || contentType === "newsletter")) {
    return "etude_de_cas";
  }
  if (angleId === "conseil-contre-intuitif" && contentType === "carousel") {
    return "educationnelle";
  }
  if (angleId === "identification" && contentType === "post") {
    return "conseil_pratique";
  }
  if (angleId === "identification" && contentType === "reel") {
    return "coup_de_gueule";
  }

  // Default: use angle's defaultStructure (check both angle lists)
  const angle = EDITORIAL_ANGLES.find((a) => a.id === angleId) || LINKEDIN_EDITORIAL_ANGLES.find((a) => a.id === angleId);
  return angle?.defaultStructure || "educationnelle";
}

// ── 6. getStructurePromptForCombo ──

export function getStructurePromptForCombo(contentType: string, angleId: string): string {
  const structureId = getStructureForCombo(contentType, angleId);
  const structure = CONTENT_STRUCTURES[structureId];
  if (!structure) return "";

  return structure.steps
    .map((step, i) => {
      const prefix = contentType === "carousel" ? `Slide ${i + 1}` : `Section ${i + 1}`;
      return `${prefix} : ${step.label} (${step.role}) : ${step.desc}`;
    })
    .join("\n");
}

// ── 7. getAnglesForType ──

export function getAnglesForType(
  contentType: string,
  objective?: string
): { recommended: EditorialAngle[]; others: EditorialAngle[] } {
  // LinkedIn has its own dedicated angles
  const isLinkedIn = contentType === "linkedin";
  const angleSource = isLinkedIn ? LINKEDIN_EDITORIAL_ANGLES : EDITORIAL_ANGLES;

  if (!objective || !OBJECTIVE_RECOMMENDATIONS[objective]) {
    return { recommended: [], others: [...angleSource] };
  }

  const reco = OBJECTIVE_RECOMMENDATIONS[objective];
  const recommendedIds = new Set(reco.angles);

  const recommended = angleSource.filter((a) => recommendedIds.has(a.id));
  const others = angleSource.filter((a) => !recommendedIds.has(a.id));

  return { recommended, others };
}

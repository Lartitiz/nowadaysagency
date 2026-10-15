// Diagnostic de repli quand Claude échoue (fiche 12, lot 1 : sorti d'index.ts à
// l'identique). `activityType` et la valeur "invisible" sont des CLÉS envoyées
// par le front (DiagnosticLoading.tsx) : ne rien renommer.

// ====== ACTIVITY INSIGHTS ======

export const ACTIVITY_INSIGHTS: Record<string, { strengths: string[]; tips: string[]; priority: string }> = {
  artisane: {
    strengths: ["Le fait-main a une histoire à raconter : le processus de fabrication peut devenir ton meilleur contenu"],
    tips: ["Montre les coulisses de ta création : les mains, les matières, le travail en cours", "Le visuel produit est ton premier levier de vente en ligne"],
    priority: "Photographie tes produits sous plusieurs angles et en situation",
  },
  mode_textile: {
    strengths: ["La mode éthique est un marché en forte croissance, tu es sur le bon créneau"],
    tips: ["Les lookbooks et les mises en situation font vendre plus que les photos produit seules", "Ton histoire de marque (pourquoi l'éthique) est un puissant levier émotionnel"],
    priority: "Crée du contenu storytelling sur ta démarche éthique",
  },
  art_design: {
    strengths: ["Ton travail visuel est ton CV : chaque publication est une preuve de talent"],
    tips: ["Montre ton processus créatif, pas seulement le résultat final", "Les carrousels avant/après fonctionnent très bien pour les créatif·ves"],
    priority: "Constitue un portfolio en ligne qui montre ta diversité",
  },
  beaute_cosmetiques: {
    strengths: ["Les tutoriels et démonstrations sont le format roi dans la beauté"],
    tips: ["Le Reels/vidéo courte est ton meilleur allié : montre les textures, les applications", "Les avis client·es et avant/après sont très convaincants dans ton secteur"],
    priority: "Lance une série de tutoriels courts sur tes produits phares",
  },
  bien_etre: {
    strengths: ["Ton expertise se partage naturellement via du contenu éducatif"],
    tips: ["Les formats 'tips du jour' et 'mythes vs réalités' fonctionnent très bien", "Ta personnalité et ton approche sont ton principal différenciant"],
    priority: "Crée du contenu éducatif qui montre ton expertise unique",
  },
  coach: {
    strengths: ["Les témoignages et transformations client·es sont tes meilleurs arguments"],
    tips: ["Partage des mini-coachings gratuits en stories pour donner un avant-goût", "Ta posture personnelle (ce que tu incarnes) est aussi importante que tes méthodes"],
    priority: "Collecte et mets en avant 3 témoignages client·es",
  },
  coach_sportive: {
    strengths: ["Le contenu vidéo (démos, exercices) crée un lien fort avec ta communauté"],
    tips: ["Les transformations et défis engagent beaucoup sur les réseaux", "Montre ta propre pratique : l'authenticité inspire plus que la perfection"],
    priority: "Lance un mini-programme gratuit en stories pour engager ta communauté",
  },
  consultante: {
    strengths: ["Ton expertise peut se décliner en contenus éducatifs à forte valeur ajoutée"],
    tips: ["Les études de cas (anonymisées) sont le meilleur format pour prouver ton expertise", "LinkedIn est probablement ton canal prioritaire pour toucher des client·es B2B"],
    priority: "Publie une étude de cas détaillée de ta meilleure mission",
  },
  formatrice: {
    strengths: ["Tu sais déjà transmettre : ton contenu peut naturellement être pédagogique"],
    tips: ["Les carrousels 'X étapes pour...' et les mini-formations gratuites attirent ton audience", "Montre des extraits de tes formations pour donner envie"],
    priority: "Publie un extrait de ta méthode en contenu gratuit pour montrer ton expertise",
  },
  deco_interieur: {
    strengths: ["Les avant/après et les moodboards sont tes formats stars"],
    tips: ["Pinterest est un canal stratégique pour la déco : les gens y cherchent activement de l'inspiration", "Montre ton processus de réflexion, pas juste le résultat"],
    priority: "Crée un tableau Pinterest optimisé par style de décoration",
  },
};

// ====== FALLBACK DIAGNOSTIC ======

export function buildFallbackDiagnostic(
  profile: any,
  freeformAnswers: any,
  sourcesUsed: string[]
): Record<string, unknown> {
  const hasWebPresence = sourcesUsed.length > 0;
  const activityType = profile?.activityType || "";
  const insights = ACTIVITY_INSIGHTS[activityType] || null;

  const strengths: any[] = [];
  const weaknesses: any[] = [];

  if (profile?.activity) {
    strengths.push({
      title: "Activité définie",
      detail: `Tu sais ce que tu fais : ${profile.activity}. C'est la base pour communiquer clairement.`,
      source: "profile",
    });
  }

  if (freeformAnswers?.uniqueness) {
    strengths.push({
      title: "Différenciation identifiée",
      detail: `Tu as identifié ce qui te rend unique : "${freeformAnswers.uniqueness}". C'est un atout à mettre en avant.`,
      source: "profile",
    });
  }

  // Add activity-specific strengths
  if (insights) {
    for (const s of insights.strengths) {
      strengths.push({ title: s, detail: s, source: "profile" });
    }
  }

  if (!hasWebPresence) {
    weaknesses.push({
      title: "Présence en ligne limitée",
      detail: "Je n'ai pas pu analyser de site web ni de réseaux sociaux. Sans présence en ligne visible, tes client·es potentiel·les ont du mal à te trouver.",
      source: "profile",
      fix_hint: insights?.tips[0] || "Ajoute ton site web ou tes réseaux dans ton profil pour un diagnostic plus complet.",
    });
  }

  if (profile?.blocker === "invisible") {
    weaknesses.push({
      title: "Manque de visibilité",
      detail: "Tu te sens invisible — c'est le blocage principal que tu as identifié. Souvent, c'est une question de régularité et de clarté dans le message.",
      source: "profile",
      fix_hint: insights?.tips[1] || "Définis tes 3 piliers de contenu et publie 2-3 fois par semaine.",
    });
  }

  // Filet de sécurité : jamais de section « Ce qu'on va travailler » vide
  // (avant, présence web + blocage ≠ invisible → zéro faiblesse → section fantôme).
  if (weaknesses.length === 0) {
    weaknesses.push({
      title: "On manque de données pour un diagnostic précis",
      detail: "Je n'ai pas pu faire l'analyse complète cette fois. Plus tu renseignes d'infos (site web, réseaux), plus le diagnostic sera pertinent et actionnable.",
      source: "profile",
      fix_hint: "Relance ton diagnostic depuis ton espace, ou lance les audits dédiés (site, Instagram).",
    });
  }

  const totalScore = Math.min(100, Math.max(10,
    (profile?.activity ? 15 : 0) +
    (freeformAnswers?.uniqueness ? 15 : 0) +
    (hasWebPresence ? 20 : 0) +
    (profile?.objective ? 10 : 0) +
    10 // base
  ));

  // Build summary — sans gabarit « Tu es X dans le domaine "Y" » : `activity`
  // est du texte libre (parfois pollué par l'autofill, ex. un nom de famille)
  // et la tournure produisait des phrases absurdes (« le domaine "Mattioli" »).
  const activityLine = profile?.activity ? ` Ton activité, avec tes mots : « ${profile.activity} ».` : "";
  const blockerLine = profile?.blocker === "invisible"
    ? " Tu te sens invisible et cherches à gagner en visibilité."
    : " Tu veux développer ta communication.";
  const insightLine = insights?.tips[0] ? ` Mon conseil : ${insights.tips[0].toLowerCase()}.` : "";
  const sourceLine = hasWebPresence
    ? ""
    : " J'ai pas eu accès à tes réseaux ni à ton site, donc je me base sur ce que tu m'as dit. Ajoute tes liens pour un diagnostic plus poussé.";

  const summary = `Voici un premier aperçu, basé sur tes réponses.${activityLine}${blockerLine}${insightLine}${sourceLine}`;

  // Build priorities — use activity-specific first priority if available
  const priorities = [
    {
      title: "Écris ta promesse en une phrase",
      why: insights ? "Cette piste correspond au type d'activité que tu as indiqué, mais elle reste à vérifier avec tes contenus." : "Tes réponses donnent un point de départ pour formuler clairement ce que tu apportes.",
      first_step: "Écris une phrase qui dit ce que tu proposes, à qui et ce que cette personne y gagne.",
      example: "J'aide [public] à [résultat] grâce à [mon approche].",
      time: "15 min",
      route: "/branding",
      impact: "high",
    },
    {
      title: "Choisis une personne à qui parler en premier",
      why: "Une situation précise rend ton prochain contenu plus facile à écrire.",
      first_step: "Note une question réelle qu'une personne te pose avant d'acheter ou de te contacter.",
      example: "« Comment savoir si [offre] est adaptée à ma situation ? »",
      time: "10 min",
      route: "/branding",
      impact: "high",
    },
    {
      title: "Prépare un premier contenu utile",
      why: "Tu peux partir de cette question sans attendre un plan éditorial complet.",
      first_step: "Réponds à cette question en trois phrases, puis choisis où publier cette réponse.",
      example: "Une phrase pour le problème, une pour ta réponse, une pour inviter à échanger.",
      time: "15 min",
      route: "/calendrier",
      impact: "medium",
    },
  ];

  return {
    summary,
    strengths,
    weaknesses,
    scores: {
      total: totalScore,
      branding: totalScore,
      instagram: null,
      website: null,
      linkedin: null,
    },
    priorities,
    branding_prefill: {
      positioning: null,
      mission: null,
      target_description: null,
      tone_keywords: [],
      values: [],
      offers: [],
    },
    _fallback: true,
  };
}

/**
 * Static demo data for the "Léa, photographe" demo account.
 * No API call needed — everything is hardcoded for instant loading.
 */

export const DEMO_DATA = {
  // ── PROFIL ──
  profile: {
    first_name: "Léa",
    activity: "Photographe portrait pour entrepreneures",
    activity_type: "photographe",
    instagram: "@lea_portraits",
    website: "www.leaportraits.fr",
    plan: "now_pilot",
    credits_monthly: 300,
    credits_used: 47,
  },

  // ── BRANDING ──
  branding: {
    positioning:
      "Je capture la confiance. Photographe portrait pour les femmes entrepreneures qui veulent se montrer telles qu'elles sont.",
    mission:
      "Rendre visible les femmes qui créent et entreprennent. Par l'image, par le regard, par la confiance.",
    unique_proposition:
      "Des séances portrait avec coaching posture inclus — pour se sentir à l'aise devant l'objectif et obtenir des photos qui te ressemblent.",
    values: ["Authenticité", "Confiance", "Féminisme", "Beauté"],
    story:
      "J'ai commencé par les mariages. Payée au lance-pierre, épuisée chaque weekend. Un jour une cliente m'a dit « c'est la première fois que je me trouve belle en photo ». Ce jour-là j'ai compris : je ne fais pas des photos, je fais de la confiance.",
    tone: {
      description:
        "Direct et chaleureux. Comme une amie photographe : franche, bienveillante, un peu cash.",
      keywords: ["chaleureux", "direct", "complice", "cash"],
    },
    editorial: {
      pillars: [
        { name: "Coulisses", description: "Behind the scenes de séances photo" },
        { name: "Confiance", description: "Témoignages et transformations" },
        { name: "Tips photo", description: "Conseils pour être photogénique" },
        { name: "Entrepreneuriat", description: "La vie de photographe indépendante" },
      ],
      frequency: "3 posts/semaine + stories quotidiennes",
    },
    completion: 85,
  },

  // ── PERSONA ──
  persona: {
    prenom: "Marion",
    age: "32-42 ans",
    metier: "Solopreneuse créative (coach, graphiste, artisane)",
    situation:
      "Installée depuis 2-3 ans, a besoin de photos pro pour ses réseaux et son site",
    ca: "35-80k€",
    frustrations:
      "Elle utilise des selfies ou des photos d'il y a 3 ans. Elle sait que ça freine sa crédibilité mais elle repousse toujours. Elle a peur de ne pas être photogénique, de paraître fausse.",
    desires:
      "Des photos qui lui ressemblent vraiment. Se sentir à l'aise devant l'objectif. Avoir du contenu visuel pro pour 6 mois.",
    phrase_signature:
      "J'aimerais bien avoir de belles photos mais je suis tellement pas à l'aise devant un objectif...",
  },

  // ── OFFRES ──
  offers: [
    {
      name: "Séance Confiance",
      price: "350€",
      description:
        "Séance portrait de 2h en lumière naturelle. 15 photos retouchées. Coaching posture inclus.",
    },
    {
      name: "Pack Contenu 6 mois",
      price: "890€",
      description:
        "Séance de 3h + 40 photos variées (portraits, mises en situation, détails). De quoi alimenter tes réseaux pendant 6 mois.",
    },
    {
      name: "Journée Branding Complet",
      price: "1 500€",
      description:
        "Une journée complète : portraits, mises en situation, produits, locaux. 80+ photos. Direction artistique incluse.",
    },
  ],

  // ── BIO INSTAGRAM ──
  bio: "Le portrait comme acte de confiance.\nPhotographe pour entrepreneures qui veulent se montrer.\nCoaching posture inclus (promis, tu vas sourire).\n📍 Lyon · Toute la France\n↓ Réserve ta séance",

  // ── STORYTELLING ──
  story_summary:
    "Léa a quitté les mariages pour se spécialiser en portrait entrepreneurial. Sa révélation : une photo peut transformer la confiance d'une femme en elle-même.",

  // ── CALENDRIER ──
  calendar_posts: [
    {
      title: "Le jour où une cliente a pleuré en voyant ses photos",
      format: "carousel",
      objective: "engagement",
      planned_day: "2026-02-17",
    },
    {
      title: "3 erreurs qui rendent tes photos de profil invisibles",
      format: "carousel",
      objective: "visibility",
      planned_day: "2026-02-19",
    },
    {
      title: "Pourquoi 80% des entrepreneures n'ont pas de photo pro",
      format: "reel",
      objective: "visibility",
      planned_day: "2026-02-24",
    },
    {
      title: "Before/after : de 'je suis pas photogénique' à 'c'est vraiment moi ?!'",
      format: "carousel",
      objective: "conversion",
      planned_day: "2026-02-26",
    },
    {
      title: "Ce que je fais AVANT d'appuyer sur le déclencheur",
      format: "reel",
      objective: "engagement",
      planned_day: "",
    },
    {
      title: "Le selfie professionnel n'existe pas (et c'est ok)",
      format: "post",
      objective: "visibility",
      planned_day: "",
    },
  ],

  // ── CONTACTS ──
  contacts: [
    { name: "Marion Dupuis", type: "prospect", note: "Intéressée par Pack 6 mois" },
    { name: "Julie Chen", type: "client", note: "Séance Confiance en mars" },
    { name: "Amélie Renard", type: "partner", note: "Graphiste, partenariat co-contenu" },
  ],

  // ── AUDIT ──
  audit: {
    score: 62,
    points_forts: [
      { titre: "Esthétique cohérente", detail: "Feed harmonieux et reconnaissable" },
      { titre: "Ratio contenus variés", detail: "Bon mix carrousels / reels / posts" },
      { titre: "Bio claire", detail: "Le métier est bien identifié" },
    ],
    points_faibles: [
      { titre: "Pas de CTA dans la bio", detail: "Aucun appel à l'action", priorite: "high", module: "bio" },
      { titre: "Highlights non structurés", detail: "Pas de catégories claires", priorite: "high", module: "highlights" },
      { titre: "Pas de routine engagement", detail: "Interactions irrégulières", priorite: "medium", module: "engagement" },
      { titre: "Pas de lien vers offre", detail: "Lien en bio vers site générique", priorite: "high", module: "bio" },
    ],
    plan_action: [
      { titre: "Optimiser ta bio avec un CTA", temps: "15 min", module: "bio" },
      { titre: "Structurer tes Highlights", temps: "30 min", module: "highlights" },
      { titre: "Routine engagement 15min/jour", temps: "15 min/jour", module: "engagement" },
    ],
  },

  // ── COACHING NOW PILOT ──
  coaching: {
    formula: "now_pilot",
    duration_months: 6,
    price_monthly: 250,
    current_month: 2,
    total_sessions: 7,
    sessions: [
      {
        number: 1,
        type: "launch",
        title: "Atelier de lancement",
        status: "completed",
        date: "2026-02-03",
        duration: 90,
        summary:
          "On a posé le positionnement de Léa : photographe de la confiance. On a défini Marion (sa cliente idéale), restructuré ses 3 offres, et identifié les 4 piliers de contenu.",
      },
      {
        number: 2,
        type: "strategy",
        title: "Atelier Stratégique",
        status: "completed",
        date: "2026-02-17",
        duration: 120,
        summary:
          "Stratégie présentée : 3 posts/semaine (2 carrousels + 1 reel), stories quotidiennes, newsletter mensuelle. Focus Instagram + site. Pinterest en bonus.",
      },
      {
        number: 3,
        type: "checkpoint",
        title: "Point d'étape",
        status: "scheduled",
        date: "2026-02-25",
        duration: 60,
      },
      {
        number: 4,
        type: "focus",
        focus_topic: "instagram_content",
        title: "Création contenus Instagram",
        status: "scheduled",
        duration: 120,
      },
      {
        number: 5,
        type: "focus",
        focus_topic: "website",
        title: "Site web / pages de vente",
        status: "scheduled",
        duration: 120,
      },
      {
        number: 6,
        type: "focus",
        focus_topic: "newsletter",
        title: "Newsletter / séquence email",
        status: "scheduled",
        duration: 60,
      },
      {
        number: 7,
        type: "focus",
        focus_topic: "launch",
        title: "Lancement offre printemps",
        status: "scheduled",
        duration: 120,
      },
    ],
    actions: [
      { title: "Restructurer les Highlights", completed: false },
      { title: "Écrire 5 sujets de carrousel", completed: false },
      { title: "Valider le positionnement", completed: true },
      { title: "Envoyer les accès Instagram", completed: true },
    ],
    deliverables: [
      { title: "Audit de communication", status: "delivered" },
      { title: "Branding complet", status: "delivered" },
      { title: "Portrait cible", status: "delivered" },
      { title: "Offres reformulées", status: "delivered" },
      { title: "Ligne éditoriale", status: "delivered" },
      { title: "Bio optimisée", status: "delivered" },
      { title: "Calendrier 3 mois", status: "pending" },
      { title: "10-15 contenus prêts", status: "pending" },
      { title: "Templates Canva", status: "pending" },
      { title: "Plan de com' 6 mois", status: "pending" },
    ],
  },

  // ── ONBOARDING (pré-rempli) ──
  onboarding: {
    prenom: "Léa",
    activite: "Photographe portrait pour entrepreneures",
    mainGoal: "visibility",
    level: "intermediate",
    weeklyTime: "2_5h",
  },
} as const;

export type DemoDataType = typeof DEMO_DATA;

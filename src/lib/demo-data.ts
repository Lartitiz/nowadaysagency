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
      "Je capture la confiance. Photographe portrait pour les femmes entrepreneures qui veulent enfin se montrer telles qu'elles sont, sans filtre, sans masque.",
    mission:
      "Rendre visible celles qui n'osent pas se montrer. Parce que quand une femme assume son image, elle assume aussi son business.",
    unique_proposition:
      "Des séances portrait avec coaching posture inclus — pour se sentir à l'aise devant l'objectif et obtenir des photos qui te ressemblent.",
    values: ["Authenticité", "Féminisme", "Slow"],
    story:
      "J'ai commencé par les mariages. Payée au lance-pierre, épuisée chaque weekend. Un jour une cliente m'a dit « c'est la première fois que je me trouve belle en photo ». Ce jour-là j'ai compris : je ne fais pas des photos, je fais de la confiance.",
    tone: {
      description:
        "Direct et chaleureux. Comme une amie photographe : franche, bienveillante, inspirante.",
      keywords: ["chaleureux", "direct", "inspirant"],
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
    completion: 79,
  },

  // ── PERSONA ──
  persona: {
    prenom: "Marion",
    age: "30-45 ans",
    metier: "Femme entrepreneure qui a lancé son activité depuis 1-3 ans",
    situation:
      "Elle sait qu'elle a besoin de photos pro mais elle repousse parce qu'elle ne se trouve pas photogénique.",
    ca: "35-80k€",
    frustrations:
      "Ne se trouve pas photogénique. Photos corporate sans âme. Repousse toujours la séance.",
    desires:
      "Des images qui lui ressemblent. Se sentir confiante et visible. Du contenu pro pour ses réseaux.",
    phrase_signature:
      "J'aimerais bien avoir de belles photos mais je suis tellement pas à l'aise devant un objectif...",
  },

  // ── PERSONA PORTRAIT (fiche récap complète) ──
  persona_portrait: {
    prenom: "Marion",
    phrase_signature: "J'aimerais bien avoir de belles photos mais je suis tellement pas à l'aise devant un objectif...",
    qui_elle_est: {
      age: "30-45 ans",
      metier: "Entrepreneure (coaching / services / artisanat)",
      situation: "Activité lancée depuis 1-3 ans, en croissance",
      ca: "35-80k€",
      temps_com: "30 min/jour max",
    },
    frustrations: [
      "Ne se trouve pas photogénique",
      "Photos corporate sans âme",
      "Repousse sa séance depuis des mois",
      "Se sent illégitime à se montrer",
    ],
    objectifs: [
      "Des images qui lui ressemblent vraiment",
      "Se sentir confiante et visible",
      "Du contenu pro pour ses réseaux",
      "Oser se montrer sur Instagram",
    ],
    blocages: [
      "Peur du regard des autres",
      "Ne sait pas poser",
      "Budget limité pour la com'",
    ],
    ses_mots: [
      "Je suis pas photogénique",
      "Je repousse toujours...",
      "J'ai besoin d'un coup de pouce",
      "Je veux des photos qui me ressemblent",
    ],
    comment_parler: {
      ton: "Chaleureux, direct, rassurant. Comme une amie qui te comprend.",
      canal: "Instagram (stories + carrousels) et newsletter",
      convainc: "Les avant/après, les témoignages, les coulisses humaines",
      fuir: ["Jargon technique photo", "Ton corporate froid", "Promesses irréalistes"],
    },
  },

  // ── OFFRES ──
  offers: [
    {
      name: "Séance Révélation",
      price: "450€",
      description:
        "Séance portrait de 2h en studio ou en extérieur. Coaching posture inclus. 15 photos retouchées livrées sous 10 jours.",
    },
    {
      name: "Pack Personal Branding",
      price: "890€",
      description:
        "Séance complète + photos pour site, réseaux et supports print. Direction artistique incluse.",
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

  // ── SAVED IDEAS ──
  saved_ideas: [
    {
      id: "demo-idea-1",
      titre: "Ce que je fais AVANT d'appuyer sur le déclencheur",
      format: "reel",
      objectif: "confiance",
      notes: "Montrer les coulisses : le brief, la mise en confiance, les exercices de posture. Angle storytelling.",
      status: "idea",
      canal: "instagram",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-idea-2",
      titre: "Le selfie professionnel n'existe pas (et c'est ok)",
      format: "post",
      objectif: "visibilite",
      notes: "Mythe à déconstruire. Expliquer pourquoi un selfie ne remplace pas une vraie photo pro. Ton un peu provocateur mais bienveillant.",
      status: "idea",
      canal: "instagram",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-idea-3",
      titre: "Témoignage cliente : 'J'ai failli annuler 3 fois'",
      format: "carousel",
      objectif: "confiance",
      notes: "Raconter l'histoire d'une cliente qui avait très peur, puis le résultat. Before/after émotionnel, pas juste visuel.",
      status: "idea",
      canal: "instagram",
      content_draft: "Slide 1 : \"J'ai failli annuler 3 fois.\"\nSlide 2 : C'est ce que Marion m'a dit après sa séance.\nSlide 3 : Pourtant, regarde ce qui s'est passé quand elle a osé...",
      content_data: null,
      source_module: "creative_workshop",
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-idea-4",
      titre: "5 signes que ta photo de profil te dessert",
      format: "carousel",
      objectif: "visibilite",
      notes: "Format checklist. Concret et actionnable. CTA vers l'offre à la fin.",
      status: "idea",
      canal: "instagram",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
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

  // ── COACHING BINÔME DE COM' ──
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
    journal: [
      {
        id: "journal-1",
        month_number: 1,
        date: "2026-02-25",
        title: "Atelier de lancement ✅",
        body: "On a posé les fondations de ta com'.\nTon positionnement est clair : \"Je capture la confiance.\"\nTa cible, c'est Marion, 35 ans, solopreneuse qui repousse sa séance photo depuis 2 ans.\nTes 3 offres sont restructurées et tes 4 piliers de contenu définis.",
        laetitia_note: "Léa, tu as un vrai talent pour raconter les histoires de tes clientes. Capitalise là-dessus. C'est ta force.",
        status: "completed",
      },
      {
        id: "journal-2",
        month_number: 1,
        date: "2026-03-11",
        title: "Atelier Stratégique ✅",
        body: "Ta stratégie est posée pour les 6 prochains mois.\n3 posts/semaine : 2 carrousels + 1 reel.\nStories quotidiennes. Newsletter mensuelle.\nOn a décidé les 4 sessions focus : Instagram, Site web, Newsletter, Lancement.",
        laetitia_note: null,
        status: "completed",
      },
      {
        id: "journal-3",
        month_number: 2,
        date: "2026-03-25",
        title: "Point d'étape",
        body: null,
        laetitia_note: null,
        status: "current",
      },
    ],
  },

  // ── ONBOARDING (pré-rempli) ──
  onboarding: {
    prenom: "Léa",
    activite: "Photographe portraitiste spécialisée dans les portraits de femmes entrepreneures",
    activity_type: "art_design",
    canaux: ["instagram", "website", "newsletter"],
    blocage: "invisible",
    objectif: "visibility",
    temps: "30min",
    instagram: "@lea_portraits",
    website: "www.leaportraits.fr",
    mainGoal: "visibility",
    level: "intermediate",
    weeklyTime: "30min",
  },

  // ── DÉMO CARROUSEL PHOTO ──
  carousel_photo_demo: {
    subject: "Les coulisses d'une séance portrait : ce qui se passe AVANT le déclencheur",
    format: "carousel" as const,
    carousel_type: "photo" as const,
    objective: "engagement",
    editorial_angle: "storytelling",
    result: {
      carousel_type: "photo",
      hook: "Ce qui se passe AVANT que j'appuie sur le déclencheur 📸",
      slides: [
        {
          slide_number: 1,
          slide_type: "hook",
          text: "Ce qui se passe AVANT que j'appuie sur le déclencheur 📸",
          caption: "Tu crois que le plus important dans une séance photo, c'est le moment où je prends la photo ?\n\nEn vrai, 90% du travail se passe AVANT.",
        },
        {
          slide_number: 2,
          slide_type: "photo_full",
          photo_index: 0,
          caption: "D'abord, on parle. On prend un café. Tu me racontes ton projet, ce qui te fait vibrer, ce qui te bloque. Je ne touche pas à mon appareil pendant au moins 20 minutes.",
        },
        {
          slide_number: 3,
          slide_type: "photo_full",
          photo_index: 1,
          caption: "Ensuite, le coaching posture. Je te montre comment te tenir naturellement. Pas des poses de magazine : TA posture, celle où tu te sens bien. On rigole beaucoup à cette étape.",
        },
        {
          slide_number: 4,
          slide_type: "photo_full",
          photo_index: 2,
          caption: "Et là, sans que tu t'en rendes compte, je commence à shooter. Les premières photos arrivent dans le mouvement, dans le naturel. Pas de \"cheese\" chez moi.",
        },
        {
          slide_number: 5,
          slide_type: "photo_full",
          photo_index: 3,
          caption: "Le résultat ? Des photos où tu te dis \"c'est vraiment moi\". Pas une version filtrée. Pas une version corporate. TOI, en version confiante.",
        },
        {
          slide_number: 6,
          slide_type: "cta",
          text: "Envie de vivre ça ? Réserve ta Séance Révélation 💛",
          caption: "Chaque séance commence par cette mise en confiance. C'est ce qui fait que mes clientes se trouvent belles pour la première fois en photo.\n\n→ Lien en bio pour réserver ta séance.",
        },
      ],
      caption: "Ce qui se passe AVANT que j'appuie sur le déclencheur 📸\n\nTu crois que le plus important dans une séance photo, c'est le clic ?\n\nEn vrai, 90% du travail se passe avant. Le café, la discussion, le coaching posture, les premiers rires.\n\nC'est là que la magie opère. C'est là que tu passes de \"je suis pas photogénique\" à \"attends, c'est vraiment moi ?!\"\n\nEnvie de vivre ça ? Lien en bio 💛\n\n#photographeportrait #portraitfemme #confianceensoi #entrepreneuresfemmes #photographelyon #personalbranding #coachingposture #osersemontrer",
      hashtags: ["#photographeportrait", "#portraitfemme", "#confianceensoi", "#entrepreneuresfemmes", "#photographelyon", "#personalbranding", "#coachingposture", "#osersemontrer"],
      quality_check: {
        hook_score: 9,
        storytelling_score: 9,
        cta_score: 8,
        overall: "Excellent storytelling des coulisses avec une progression naturelle vers l'offre.",
      },
    },
  },
} as const;

export type DemoDataType = typeof DEMO_DATA;

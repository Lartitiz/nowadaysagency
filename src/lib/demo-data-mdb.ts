/**
 * Static demo data for the "Auriana, marchande de biens" demo account.
 * No API call needed — everything is hardcoded for instant loading.
 */

function demoDate(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

const DEMO_MDB_CALENDAR_POSTS = [
  { title: "Comment j'ai réduit mon portage de 8 mois sur ma dernière opération", format: "carousel", objective: "engagement", planned_day: demoDate(2) },
  { title: "Pré-commercialisation : vendre avant d'acheter, mode d'emploi", format: "carousel", objective: "visibility", planned_day: demoDate(5) },
  { title: "Les 3 erreurs qui m'ont fait perdre 6 mois sur Bordeaux", format: "reel", objective: "engagement", planned_day: demoDate(8) },
  { title: "Étude de cas : immeuble 6 lots, de l'acquisition à la revente", format: "carousel", objective: "conversion", planned_day: demoDate(11) },
  { title: "Ce que j'aurais aimé savoir avant ma première opération MDB", format: "post", objective: "visibility", planned_day: "" },
  { title: "Pourquoi je ne commence jamais une opération sans clause de commercialisation", format: "post", objective: "engagement", planned_day: "" },
];

const DEMO_MDB_COACHING_SESSIONS = [
  { number: 1, type: "launch", title: "Atelier de lancement", status: "completed", date: demoDate(-18), duration: 90, summary: "On a posé le positionnement d'Auriana : marchande de biens qui sécurise avant d'acheter. Cible définie (Thomas, investisseur en transition). 4 piliers de contenu définis. Stratégie LinkedIn + Instagram clarifiée." },
  { number: 2, type: "strategy", title: "Atelier Stratégique", status: "completed", date: demoDate(-4), duration: 120, summary: "Stratégie présentée : 3 posts/semaine (2 carrousels + 1 reel), stories coulisses quotidiennes. Focus Instagram + LinkedIn. Études de cas avec chiffres comme contenu pilier." },
  { number: 3, type: "checkpoint", title: "Point d'étape", status: "scheduled", date: demoDate(3), duration: 60 },
  { number: 4, type: "focus", focus_topic: "instagram_content", title: "Création contenus Instagram", status: "scheduled", duration: 120 },
  { number: 5, type: "focus", focus_topic: "linkedin", title: "LinkedIn & stratégie réseau", status: "scheduled", duration: 120 },
  { number: 6, type: "focus", focus_topic: "personal_branding", title: "Personal branding & face cam", status: "scheduled", duration: 60 },
  { number: 7, type: "focus", focus_topic: "launch", title: "Lancement formation pré-commercialisation", status: "scheduled", duration: 120 },
];

const DEMO_MDB_COACHING_JOURNAL = [
  { id: "mdb-journal-1", month_number: 1, date: demoDate(-18), title: "Atelier de lancement ✅", body: "On a posé les fondations de ta com'.\nTon positionnement est clair : \"Je sécurise mes opérations en vendant avant d'acheter.\"\nTa cible, c'est Thomas, 38 ans, investisseur locatif qui veut passer MDB.\nTes 4 piliers de contenu sont définis et ta stratégie bi-canal (Instagram + LinkedIn) est en place.", laetitia_note: "Auriana, ton parcours terrain est ton plus gros atout en com'. Les galères, les chiffres réels, la pré-commercialisation : c'est du contenu en or. Capitalise là-dessus.", status: "completed" },
  { id: "mdb-journal-2", month_number: 1, date: demoDate(-4), title: "Atelier Stratégique ✅", body: "Ta stratégie est posée pour les 6 prochains mois.\n3 posts/semaine : 2 carrousels (études de cas + éducation) + 1 reel (coulisses chantier).\nStories quotidiennes. LinkedIn en parallèle avec un focus réseau et retours d'expérience.\n4 sessions focus planifiées : Instagram, LinkedIn, Personal branding, Lancement formation.", laetitia_note: null, status: "completed" },
  { id: "mdb-journal-3", month_number: 2, date: demoDate(3), title: "Point d'étape", body: null, laetitia_note: null, status: "current" },
];

export const DEMO_DATA_MDB = {
  // ── PROFIL ──
  profile: {
    first_name: "Auriana",
    activity: "Marchande de biens immobiliers — achat-revente & découpe d'immeubles",
    activity_type: "immobilier_mdb",
    instagram: "@auriana_immo_passion",
    website: "",
    plan: "binome",
    credits_monthly: 300,
    credits_used: 12,
  },

  // ── BRANDING ──
  branding: {
    positioning: "Je sécurise mes opérations immobilières en vendant avant d'acheter. Marchande de biens depuis 2019, spécialisée dans la pré-commercialisation et la découpe d'immeubles en Nouvelle-Aquitaine.",
    mission: "Professionnaliser le métier de marchand de biens. Montrer qu'on peut créer de la valeur immobilière de manière structurée, transparente et accessible, même en partant de zéro.",
    unique_proposition: "Une approche MDB basée sur la pré-commercialisation : je sécurise mes acquéreurs avant d'acheter, ce qui réduit le portage de 6 à 8 mois et permet d'enchaîner 2 à 3 opérations par an.",
    values: ["Transparence", "Rigueur méthodologique", "Entraide"],
    story: "J'ai eu le déclic avec ma résidence principale : 100 000€ de plus-value à la revente. Je me suis dit : un jour, j'en vivrai. Je me suis lancée en 2019, en solo. Les premiers mois ont été durs : 6 à 7 mois sans opération sur Bordeaux, un marché hyper tendu où je me faisais battre par la concurrence. Le tournant, c'est le Cercle MDB : les ateliers m'ont appris la pré-commercialisation. Maintenant, quand je signe l'acte, j'ai déjà mes acquéreurs.",
    tone: {
      description: "Direct, terrain, pas de bullshit. Je parle comme une pro à des pros et des futurs pros. Pas de jargon inutile, mais de la rigueur quand il faut.",
      keywords: ["direct", "terrain", "pédagogue", "concret"],
    },
    editorial: {
      pillars: [
        { name: "Coulisses d'opérations", description: "Les chantiers, les visites, les bonnes et mauvaises surprises" },
        { name: "Éducation MDB", description: "Pré-commercialisation, clauses suspensives, montages, fiscalité" },
        { name: "Retours d'expérience", description: "Erreurs, victoires, chiffres réels d'opérations" },
        { name: "Réseau & Cercle MDB", description: "La force du collectif, les Work Days, les membres" },
      ],
      frequency: "2-3 posts/semaine (Instagram + LinkedIn) + stories coulisses",
    },
    completion: 58,
  },

  // ── PERSONA ──
  persona: {
    prenom: "Thomas",
    age: "30-45 ans",
    metier: "Investisseur locatif en transition vers le métier de marchand de biens",
    situation: "Il a 3 biens en locatif, un CDI en parallèle, et veut passer full MDB. Il a fait 1-2 petites opérations mais n'ose pas scaler.",
    ca: "50-150k€",
    frustrations: "Ne sait pas par où commencer pour structurer son activité MDB. A peur des risques juridiques et du portage financier. Se sent seul face à ses décisions.",
    desires: "Structurer son activité MDB, avoir un réseau de confiance, enchaîner les opérations sans stress financier, quitter son CDI.",
    phrase_signature: "J'ai envie de franchir le cap mais j'ai besoin d'être accompagné·e et outillé·e.",
  },

  // ── PERSONA PORTRAIT ──
  persona_portrait: {
    prenom: "Thomas",
    phrase_signature: "J'ai envie de franchir le cap mais j'ai besoin d'être accompagné·e et outillé·e.",
    qui_elle_est: {
      age: "30-45 ans",
      metier: "Investisseur locatif / futur marchand de biens",
      situation: "3 biens en locatif, CDI, 1-2 opérations MDB réalisées",
      ca: "50-150k€",
      temps_com: "30 min/jour max",
    },
    frustrations: [
      "Ne sait pas structurer une activité MDB",
      "Peur des risques juridiques et du portage",
      "Se sent seul face aux décisions",
      "N'a pas de réseau d'apporteurs d'affaires",
    ],
    objectifs: [
      "Enchaîner 2-3 opérations par an",
      "Sécuriser ses marges avec la pré-commercialisation",
      "Intégrer un réseau de marchands de confiance",
      "Quitter son CDI dans les 18 mois",
    ],
    blocages: [
      "Peur de la première grosse opération",
      "Pas de méthodologie structurée",
      "Isolement professionnel",
    ],
    ses_mots: [
      "Je voudrais me lancer mais j'ai pas le réseau",
      "Comment on gère le portage quand on débute ?",
      "Je cherche quelqu'un qui est passé par là",
      "J'ai besoin d'un cadre, pas juste d'une formation",
    ],
    comment_parler: {
      ton: "Direct, concret, entre pros. Pas de bullshit ni de promesses de richesse facile.",
      canal: "LinkedIn (réseau pro, études de cas) + Instagram (coulisses, face cam)",
      convainc: "Les études de cas avec chiffres réels, les avant/après d'opérations, les retours terrain sans filtre",
      fuir: ["Ton gourou richesse", "Promesses de gains garantis", "Jargon financier pompeux", "Contenu générique sans vécu"],
    },
  },

  // ── OFFRES ──
  offers: [
    {
      name: "Accompagnement première opération",
      price: "3 000€ / 3 mois",
      description: "Structuration de ta première opération MDB : sourcing, modélisation 360°, go/no-go, pré-commercialisation, suivi jusqu'à la revente.",
    },
    {
      name: "Formation pré-commercialisation",
      price: "1 500€",
      description: "Atelier intensif 2 jours : maîtriser la pré-commercialisation pour vendre avant d'acheter. Suivi individuel 1 mois inclus.",
    },
  ],

  // ── BIO INSTAGRAM ──
  bio: "Marchande de biens depuis 2019 🏗️\nSpécialisée pré-commercialisation & découpe\n📍 Bordeaux · Nouvelle-Aquitaine\nRéférente Sud-Ouest @lecerclemdb ⭕️\n↓ Mon parcours & mes opérations",

  // ── STORYTELLING ──
  story_summary: "Auriana a eu le déclic avec 100K€ de plus-value sur sa résidence principale. Après des débuts difficiles en solo sur Bordeaux, elle a structuré son activité grâce au Cercle MDB et à la pré-commercialisation.",

  // ── CALENDRIER ──
  calendar_posts: DEMO_MDB_CALENDAR_POSTS,

  // ── SAVED IDEAS ──
  saved_ideas: [
    {
      id: "demo-mdb-idea-1",
      titre: "Avant/après : mon premier flip — les chiffres réels",
      format: "carousel",
      objectif: "conversion",
      notes: "Achat, travaux, revente, marge nette. Montrer la transparence totale. CTA vers accompagnement.",
      status: "idea",
      canal: "instagram",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-mdb-idea-2",
      titre: "Clause de commercialisation : le filet de sécurité que 80% des MDB ignorent",
      format: "carousel",
      objectif: "visibilite",
      notes: "Contenu éducatif. Expliquer le mécanisme, donner un exemple concret de clause. Renvoi vers formation.",
      status: "idea",
      canal: "linkedin",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-mdb-idea-3",
      titre: "Coulisses : ce qu'on a trouvé en ouvrant le mur (spoiler : pas ce qu'on attendait)",
      format: "reel",
      objectif: "engagement",
      notes: "Vidéo courte chantier. Humaniser, montrer le vrai. Les galères font plus d'engagement que les succès.",
      status: "idea",
      canal: "instagram",
      content_draft: "Accroche face cam : \"On a ouvert le mur. Et là...\"\nPlan chantier : montrer la surprise\nConclusion : \"C'est ça le MDB. Jamais ennuyeux.\"",
      content_data: null,
      source_module: "creative_workshop",
      planned_date: null,
      calendar_post_id: null,
    },
    {
      id: "demo-mdb-idea-4",
      titre: "Pourquoi je refuse 70% des opérations qu'on me propose",
      format: "post",
      objectif: "credibilite",
      notes: "Montrer la rigueur d'analyse. Pas tout acheter = signe de professionnalisme. Lister les critères de go/no-go.",
      status: "idea",
      canal: "linkedin",
      content_draft: null,
      content_data: null,
      source_module: null,
      planned_date: null,
      calendar_post_id: null,
    },
  ],

  // ── CONTACTS ──
  contacts: [
    { name: "Thomas Renard", type: "prospect", note: "Intéressé par la formation pré-commercialisation" },
    { name: "Julie Mercier", type: "partner", note: "Agente immo spécialisée MDB Bordeaux" },
    { name: "Patrick Dumont", type: "prospect", note: "Club Deal — cherche à co-investir sur des découpes" },
  ],

  // ── AUDIT ──
  audit: {
    score: 45,
    points_forts: [
      { titre: "Authenticité terrain", detail: "Les posts avec les vraies galères et les coulisses créent de la confiance" },
      { titre: "Expertise visible", detail: "La pré-commercialisation est un sujet de niche qui positionne clairement" },
      { titre: "Réseau actif", detail: "Les interactions croisées avec les membres du Cercle MDB génèrent de l'engagement organique" },
    ],
    points_faibles: [
      { titre: "Bio pas optimisée", detail: "Pas de CTA clair ni de proposition de valeur lisible en 3 secondes", priorite: "high", module: "bio" },
      { titre: "Irrégularité de publication", detail: "Posts espacés de 2-3 semaines, l'algorithme pénalise fortement", priorite: "high", module: "regularity" },
      { titre: "Pas de highlights structurés", detail: "Pas de catégories claires (Opérations, Parcours, Cercle MDB, Conseils)", priorite: "high", module: "highlights" },
      { titre: "Visuels chantier bruts", detail: "Les photos de chantier manquent de cohérence graphique minimale", priorite: "medium", module: "visuals" },
    ],
    plan_action: [
      { titre: "Optimiser ta bio avec un CTA", temps: "15 min", module: "bio" },
      { titre: "Créer 4-5 highlights structurés", temps: "30 min", module: "highlights" },
      { titre: "Routine 3 posts/semaine (2 carrousels + 1 reel)", temps: "2h/semaine", module: "regularity" },
    ],
  },

  // ── COACHING BINÔME DE COM' ──
  coaching: {
    formula: "binome",
    duration_months: 6,
    price_monthly: 250,
    current_month: 2,
    total_sessions: 7,
    sessions: DEMO_MDB_COACHING_SESSIONS,
    actions: [
      { title: "Optimiser la bio Instagram", completed: false },
      { title: "Créer les highlights structurés", completed: false },
      { title: "Valider le positionnement", completed: true },
      { title: "Définir les 4 piliers de contenu", completed: true },
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
      { title: "Charte visuelle chantier", status: "pending" },
      { title: "Plan de com' 6 mois", status: "pending" },
    ],
    journal: DEMO_MDB_COACHING_JOURNAL,
  },

  // ── ONBOARDING ──
  onboarding: {
    prenom: "Auriana",
    activite: "Marchande de biens immobiliers spécialisée en pré-commercialisation et découpe d'immeubles",
    activity_type: "immobilier",
    canaux: ["instagram", "linkedin"],
    blocage: "irregular",
    objectif: "visibility",
    temps: "30min",
    instagram: "@auriana_immo_passion",
    website: "",
    mainGoal: "visibility",
    level: "intermediate",
    weeklyTime: "30min",
  },

  // ── DÉMO CARROUSEL MDB ──
  carousel_photo_demo: {
    subject: "Les 5 étapes d'une opération MDB rentable",
    format: "carousel" as const,
    carousel_type: "text" as const,
    objective: "engagement",
    editorial_angle: "education",
    result: {
      carousel_type: "text",
      hook: "90% des marchands de biens débutants font cette erreur.",
      slides: [
        {
          slide_number: 1,
          slide_type: "hook",
          text: "90% des marchands de biens débutants font cette erreur.",
          caption: "Ils achètent d'abord, vendent après.\n\nRésultat : 8 mois de portage et une trésorerie qui fond.\n\nVoici les 5 étapes qui changent tout →",
        },
        {
          slide_number: 2,
          slide_type: "content",
          text: "Étape 1 — Sourcing ciblé\n\nDéfinis ton marché : ticket, zone, typologie.\n\n10 visites ultra-qualifiées valent mieux que 50 visites de tourisme.",
          caption: "Le sourcing, c'est pas de la prospection au hasard. C'est un filtre. Tu définis exactement ce que tu cherches, et tu ne visites que ce qui passe le filtre.",
        },
        {
          slide_number: 3,
          slide_type: "content",
          text: "Étape 2 — Modélisation 360°\n\nPrix de sortie validé. Double chiffrage travaux.\nStress test : délais +20%, prix -10%.\n\nSi ça passe le filtre, on avance.",
          caption: "Avant de signer quoi que ce soit, tu passes ton opération au crash test. C'est là que tu élimines 70% des dossiers. Et c'est normal.",
        },
        {
          slide_number: 4,
          slide_type: "content",
          text: "Étape 3 — Pré-commercialisation\n\nLA clé. Tu signes ta promesse avec des clauses suspensives, et tu lances immédiatement la commercialisation.\n\nTu vends avant d'acheter.",
          caption: "C'est le game changer. Quand j'ai commencé, je vendais APRÈS avoir acheté. 6 à 8 mois de portage en plus sur chaque opération. La pré-commercialisation a tout changé.",
        },
        {
          slide_number: 5,
          slide_type: "content",
          text: "Étape 4 — Exécution\n\nTravaux pilotés, délais tenus, commercial en parallèle.\n\nPersonne ne visite en 3 semaines ? Signal d'alerte → ajuste ton prix AVANT l'acte.",
          caption: "L'exécution, c'est de la gestion de projet pure. Pas de place pour l'improvisation. Et si le marché te donne un signal négatif pendant la préco, tu ajustes AVANT de t'engager.",
        },
        {
          slide_number: 6,
          slide_type: "cta",
          text: "Étape 5 — Itérer\n\nTu libères ta trésorerie 6-8 mois plus tôt.\nTu enchaînes 2-3 opérations par an.\n\nC'est comme ça qu'on structure une activité MDB rentable. 💬",
          caption: "La pré-commercialisation m'a permis de passer d'une opération tous les 12 mois à 2-3 par an. La méthode, pas l'instinct.\n\nTu veux comprendre comment structurer tes opérations ? DM ou lien en bio.\n\n#marchanddebiens #MDB #immobilier #achatrevente #investissementimmobilier #précommercialisation #bordeauximmo #cercleMDB",
        },
      ],
      caption: "90% des marchands de biens débutants font cette erreur.\n\nIls achètent d'abord, vendent après. Résultat : 8 mois de portage et une trésorerie qui fond.\n\nQuand j'ai commencé en 2019 à Bordeaux, je faisais pareil. Le tournant ? La pré-commercialisation.\n\nAujourd'hui, quand je signe l'acte, j'ai déjà mes acquéreurs.\n\nSwipe pour les 5 étapes →\n\n#marchanddebiens #MDB #immobilier #achatrevente #investissementimmobilier #précommercialisation #bordeauximmo #cercleMDB",
      hashtags: ["#marchanddebiens", "#MDB", "#immobilier", "#achatrevente", "#investissementimmobilier", "#précommercialisation", "#bordeauximmo", "#cercleMDB"],
      quality_check: {
        hook_score: 9,
        storytelling_score: 8,
        cta_score: 7,
        overall: "Excellent contenu éducatif ancré dans l'expérience terrain. Le hook avec la stat crée de la curiosité. Le CTA pourrait être plus spécifique (lien vers une ressource gratuite).",
      },
    },
  },
} as const;

export type DemoDataMDBType = typeof DEMO_DATA_MDB;

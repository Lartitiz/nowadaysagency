export const LINKEDIN_TIPS = [
  { text: "Les 210 premiers caractères décident de tout. 60-70% des lecteur·ices ne cliquent jamais 'voir plus'.", source: "Algorithm InSights 2025" },
  { text: "Les commentaires pèsent 8x plus que les likes dans l'algorithme. Pose des questions qui appellent des réponses longues.", source: "van der Blom 2025" },
  { text: "La 'Golden Hour' : les 60-90 premières minutes sont décisives. Un bon démarrage = portée x3.", source: "Algorithm InSights 2025" },
  { text: "Le dwell time (temps passé à lire) est un signal silencieux mais très puissant. Le storytelling qui tient en haleine performe.", source: "LinkedIn Engineering 2025" },
  { text: "Les liens externes coûtent ~60% de distribution. Mets-les en commentaire.", source: "van der Blom 2025" },
  { text: "Le contenu IA non retravaillé subit -43% d'engagement. Le ton incarné est non-négociable.", source: "Socialinsider 2025" },
  { text: "Sweet spot engagement : 1 300-1 900 caractères. Les posts sous 500 car. perdent 35% d'engagement.", source: "AuthoredUp 2025" },
  { text: "3-5 hashtags max et de niche. LinkedIn détecte les sujets sémantiquement maintenant.", source: "van der Blom 2025" },
  { text: "Un post LinkedIn peut vivre 2-3 semaines. Privilégie le contenu evergreen qui génère des conversations.", source: "Hootsuite 2025" },
  { text: "Réponds aux commentaires dans les 30 premières minutes. Ça relance l'algorithme.", source: "Closely 2025" },
  { text: "Profil personnel = 561% plus de reach que page entreprise. Publie en ton nom.", source: "Ordinal 2026" },
  { text: "Ne publie pas 2 posts en moins de 18-24h. Le nouveau tue la portée de l'ancien.", source: "AuthoredUp 2025" },
  { text: "Le contenu expert et de niche est valorisé par l'algo. La cohérence thématique construit l'autorité.", source: "Algorithm InSights 2025" },
  { text: "72% du trafic LinkedIn vient du mobile. Aère ton texte : paragraphes courts, sauts de ligne.", source: "LinkedIn 2025" },
  { text: "Meilleurs jours : mardi, mercredi, jeudi. Meilleures heures : 8h-9h et 14h-15h.", source: "Buffer 2025" },
];

export const LINKEDIN_TEMPLATES_UI = [
  { id: "enquete_decryptage", emoji: "🔍", label: "Enquête / Décryptage", desc: "Analyse d'une tendance, investigation", objectif: "crédibilité" },
  { id: "test_grandeur_nature", emoji: "🧪", label: "Test grandeur nature", desc: "J'ai testé X, voici mon verdict", objectif: "confiance" },
  { id: "coup_de_gueule", emoji: "😤", label: "Coup de gueule engagé", desc: "Ce qui t'énerve + ton alternative", objectif: "visibilité" },
  { id: "mythe_deconstruire", emoji: "💥", label: "Mythe à déconstruire", desc: "Idée reçue à exploser", objectif: "crédibilité" },
  { id: "storytelling_lecon", emoji: "📖", label: "Storytelling + leçon", desc: "Histoire perso + apprentissage", objectif: "confiance" },
  { id: "histoire_cliente", emoji: "💎", label: "Histoire cliente", desc: "Étude de cas, avant/après", objectif: "vente" },
  { id: "surf_actu", emoji: "📰", label: "Surf sur l'actu", desc: "Actu + ton angle expert", objectif: "visibilité" },
  { id: "regard_philosophique", emoji: "🧠", label: "Regard philosophique", desc: "Réflexion profonde, France Culture", objectif: "confiance" },
  { id: "conseil_contre_intuitif", emoji: "🔄", label: "Conseil contre-intuitif", desc: "Le contraire de ce qu'on croit", objectif: "crédibilité" },
  { id: "before_after", emoji: "✨", label: "Before / After", desc: "Transformation concrète", objectif: "vente" },
  { id: "build_in_public", emoji: "🏗️", label: "Build in public", desc: "Coulisses, vrais chiffres, doutes", objectif: "confiance" },
  { id: "identification_quotidien", emoji: "☕", label: "Identification / Quotidien", desc: "Scène que tout le monde reconnaît", objectif: "engagement" },
  { id: "contenu_lancement", emoji: "🚀", label: "Contenu de lancement", desc: "Annonce d'offre ou nouveauté", objectif: "vente" },
];

export const LINKEDIN_HOOK_TYPES = [
  { id: "statistique", emoji: "📊", label: "Chiffre frappant", example: "78% des solopreneuses publient pour 3% d'engagement." },
  { id: "contrariante", emoji: "🔥", label: "Contrariante", example: "Le personal branding est une arnaque." },
  { id: "story", emoji: "📖", label: "In medias res", example: "Il est 23h, je fixe mon écran. Mon post a 3 likes." },
  { id: "confession", emoji: "🫣", label: "Confession", example: "J'ai mis 2 ans à comprendre que mon offre ne servait à rien." },
  { id: "frustration", emoji: "😤", label: "Frustration partagée", example: "Tu en as pas marre qu'on te dise de 'juste être toi-même' ?" },
  { id: "question", emoji: "❓", label: "Question de fond", example: "Peut-on communiquer éthiquement et être visible ?" },
  { id: "liste", emoji: "📋", label: "Liste / Promesse", example: "3 choses que j'aurais aimé savoir avant de lancer ma newsletter." },
  { id: "avant_apres", emoji: "🔀", label: "Avant / Après", example: "Il y a 6 mois, elle postait dans le vide. Aujourd'hui..." },
  { id: "ennemi_commun", emoji: "⚔️", label: "Ennemi commun", example: "Le marketing de la peur a fait assez de dégâts." },
  { id: "confirmation", emoji: "🤝", label: "Confirmation", example: "Si tu trouves LinkedIn chiant, c'est qu'on t'a mal expliqué." },
];

export const OBJECTIF_COLORS: Record<string, string> = {
  visibilité: "bg-blue-100 text-blue-700",
  confiance: "bg-green-100 text-green-700",
  crédibilité: "bg-purple-100 text-purple-700",
  engagement: "bg-amber-100 text-amber-700",
  vente: "bg-rose-100 text-rose-700",
};

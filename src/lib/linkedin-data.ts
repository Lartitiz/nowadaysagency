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
  { id: "enquete_decryptage", emoji: "🔍", label: "Enquête / Décryptage", desc: "Observation, analyse, prise de position", phase: "1-2", objectif: "visibilité" },
  { id: "test_grandeur_nature", emoji: "🧪", label: "Test grandeur nature", desc: "J'ai testé X, verdict honnête", phase: "2", objectif: "visibilité" },
  { id: "coup_de_gueule", emoji: "😤", label: "Coup de gueule engagé", desc: "Ras-le-bol constructif", phase: "1", objectif: "visibilité" },
  { id: "mythe_deconstruction", emoji: "💥", label: "Mythe à déconstruire", desc: "Croyance populaire vs réalité", phase: "1-2", objectif: "visibilité" },
  { id: "storytelling_lecon", emoji: "📖", label: "Storytelling + leçon", desc: "Parcours, échec, apprentissage", phase: "2-3", objectif: "confiance" },
  { id: "histoire_cliente", emoji: "✨", label: "Histoire cliente", desc: "Transformation, étude de cas", phase: "3-4", objectif: "confiance" },
  { id: "surf_actu", emoji: "📰", label: "Surf sur l'actu", desc: "Fait d'actu + angle expert", phase: "1", objectif: "visibilité" },
  { id: "regard_philosophique", emoji: "🧠", label: "Regard philosophique", desc: "Réflexion profonde, style France Culture", phase: "2", objectif: "crédibilité" },
  { id: "conseil_contre_intuitif", emoji: "🔄", label: "Conseil contre-intuitif", desc: "Le contraire de ce qu'on entend", phase: "2-3", objectif: "crédibilité" },
  { id: "before_after", emoji: "🪄", label: "Before/After", desc: "Contraste avant/après frappant", phase: "3-4", objectif: "confiance" },
  { id: "build_in_public", emoji: "🏗️", label: "Build in public", desc: "Coulisses, transparence radicale", phase: "2-3", objectif: "confiance" },
  { id: "identification_quotidien", emoji: "🪞", label: "Identification", desc: "Le quotidien ultra-reconnaissable", phase: "1-2", objectif: "engagement" },
  { id: "contenu_lancement", emoji: "🚀", label: "Contenu de lancement", desc: "Présenter une offre sans manipulation", phase: "4-5", objectif: "vente" },
];

export const LINKEDIN_HOOK_TYPES = [
  { id: "statistique", emoji: "📊", label: "Chiffre choc", example: "J'ai perdu 70% de mes client·es en 3 mois." },
  { id: "contrariante", emoji: "🔄", label: "Contre-intuitive", example: "Arrête de chercher des client·es." },
  { id: "story", emoji: "📖", label: "In medias res", example: "Ce jour-là, j'ai failli tout arrêter." },
  { id: "confession", emoji: "🫣", label: "Confession", example: "J'ai honte de l'admettre, mais..." },
  { id: "frustration", emoji: "😤", label: "Coup de gueule", example: "J'en peux plus de voir ça." },
  { id: "question", emoji: "❓", label: "Question provocante", example: "Et si le problème c'était pas ton contenu ?" },
  { id: "liste", emoji: "📋", label: "Liste / Promesse", example: "5 choses que j'aurais aimé savoir." },
  { id: "avant_apres", emoji: "🪄", label: "Avant / Après", example: "Il y a 1 an : 12 likes. Aujourd'hui : des client·es." },
  { id: "ennemi_commun", emoji: "⚔️", label: "Ennemi commun", example: "Le vrai problème, c'est pas toi." },
  { id: "confirmation", emoji: "✅", label: "Confirmation", example: "Tu avais raison de douter." },
];

export const OBJECTIF_COLORS: Record<string, string> = {
  visibilité: "bg-blue-50 text-blue-700 border-blue-200",
  confiance: "bg-amber-50 text-amber-700 border-amber-200",
  crédibilité: "bg-purple-50 text-purple-700 border-purple-200",
  engagement: "bg-green-50 text-green-700 border-green-200",
  vente: "bg-pink-50 text-pink-700 border-pink-200",
};

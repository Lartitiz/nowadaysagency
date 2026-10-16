/**
 * Dynamic examples adapted to the user's activity type.
 * Used across the app for placeholders, suggestions, coaching prompts, etc.
 */

export type ActivityType =
  | "artisane"
  | "mode_textile"
  | "art_design"
  | "deco_interieur"
  | "beaute_cosmetiques"
  | "bien_etre"
  | "coach"
  | "coach_sportive"
  | "consultante"
  | "formatrice"
  | "autre"
  | "default";

export interface PersonaExample {
  prenom: string;
  age: string;
  metier: string;
  frustration: string;
  desire: string;
  phrase: string;
}

export interface OfferExample {
  name: string;
  price: string;
  description: string;
}

export interface ActivityProfile {
  label: string;
  persona_example: PersonaExample;
  offre_example: OfferExample;
  bio_example: string;
  post_examples: string[];
  accroche_example: string;
  story_ideas: string[];
  dashboard_tip: string;
  coaching_client_word: string;
}

export const ACTIVITY_EXAMPLES: Record<ActivityType, ActivityProfile> = {
  artisane: {
    label: "Artisane / Créatrice",
    persona_example: {
      prenom: "Marine",
      age: "30-42 ans",
      metier: "Créatrice artisanale",
      frustration: "Elle met tout son cœur dans ses créations mais son e-shop tourne au ralenti. Elle a l'impression de parler dans le vide sur Instagram.",
      desire: "Vivre de ses créations sans dépendre des marchés de Noël",
      phrase: "Chaque pièce a une histoire. Le problème c'est que personne ne la connaît.",
    },
    offre_example: { name: "Collection capsule sur mesure", price: "80-250€ / pièce", description: "Pièces artisanales faites main" },
    bio_example: "Des créations qui racontent des histoires.\nArtisane · Fait main · Éthique\n📍 Atelier à Marseille\n↓ Nouvelle collection",
    post_examples: [
      "Le jour où j'ai failli tout arrêter (et ce qui m'a retenue)",
      "Ce que tu ne vois pas derrière une pièce artisanale",
      "Pourquoi je refuse de vendre sur Amazon",
    ],
    accroche_example: "J'ai vendu ma première création à ma mère. Aujourd'hui je vis de mes mains.",
    story_ideas: ["Montre ton processus de création", "Prépare une commande en direct", "Les matières premières que tu utilises"],
    dashboard_tip: "Montre ton processus de création en story, les gens adorent voir les mains au travail.",
    coaching_client_word: "clientes",
  },
  mode_textile: {
    label: "Mode & textile éthique",
    persona_example: {
      prenom: "Anaïs",
      age: "28-40 ans",
      metier: "Styliste mode éthique",
      frustration: "Elle crée des pièces magnifiques mais n'arrive pas à se démarquer de la fast fashion en ligne.",
      desire: "Construire une communauté fidèle qui achète pour les valeurs autant que pour le style",
      phrase: "La mode peut être belle et responsable. Il faut juste le faire savoir.",
    },
    offre_example: { name: "Collection éthique", price: "90-300€ / pièce", description: "Vêtements éco-responsables faits en France" },
    bio_example: "Mode éthique · Fabriqué en France\nDes vêtements qui ont du sens.\n📍 Atelier Lyon\n↓ Nouvelle collection",
    post_examples: [
      "Le vrai coût d'un t-shirt à 5€",
      "Pourquoi je couds chaque pièce moi-même",
      "3 questions à se poser avant d'acheter un vêtement",
    ],
    accroche_example: "J'ai quitté la fast fashion pour créer des vêtements qui durent. Et qui ont une histoire.",
    story_ideas: ["Montre le choix des tissus", "Essayage d'un prototype", "Les coulisses de l'atelier"],
    dashboard_tip: "Montre le choix de tes tissus et matières en story, ça passionne ton audience.",
    coaching_client_word: "clientes mode",
  },
  art_design: {
    label: "Art & design",
    persona_example: {
      prenom: "Clara",
      age: "28-38 ans",
      metier: "Graphiste freelance / Illustratrice",
      frustration: "Elle passe plus de temps à chercher des clients qu'à créer. Sa propre identité de marque, c'est le cordonnier mal chaussé.",
      desire: "Attirer des clients alignés avec ses valeurs sans brader ses tarifs",
      phrase: "Je veux bosser avec des marques qui ont du sens, pas juste du budget.",
    },
    offre_example: { name: "Identité visuelle complète", price: "1 500€", description: "Logo + charte + supports de com'" },
    bio_example: "Identités visuelles pour marques qui ont quelque chose à dire.\nGraphiste freelance · Éthique & pop\n📍 Bordeaux\n↓ Portfolio + dispos",
    post_examples: [
      "Ton logo ne te ressemble plus ? Voilà comment savoir",
      "J'ai refusé un client à 5K€. Voilà pourquoi.",
      "Canva vs graphiste : le vrai comparatif honnête",
    ],
    accroche_example: "Un bon logo ne fait pas vendre. Une bonne identité de marque, si.",
    story_ideas: ["Montre un WIP (work in progress)", "Palette de couleurs du jour", "Avant/après refonte de logo"],
    dashboard_tip: "Montre un WIP (work in progress), les gens adorent voir le processus.",
    coaching_client_word: "clientes design",
  },
  deco_interieur: {
    label: "Déco & design d'intérieur",
    persona_example: {
      prenom: "Émilie",
      age: "30-45 ans",
      metier: "Décoratrice d'intérieur",
      frustration: "Les gens adorent ses réalisations mais ne pensent pas à elle quand ils ont un projet. Elle manque de visibilité en ligne.",
      desire: "Être la référence locale en déco éthique et être sollicitée sans démarcher",
      phrase: "Un intérieur bien pensé change la vie. Il suffit que les gens le sachent.",
    },
    offre_example: { name: "Coaching déco 2h", price: "250€", description: "Audit + plan d'aménagement personnalisé" },
    bio_example: "Décoratrice d'intérieur · Éco-responsable\nDes espaces qui racontent qui tu es.\n📍 Paris\n↓ Prends rdv",
    post_examples: [
      "Le meuble IKEA que je recommande vraiment (et celui que j'évite)",
      "Avant/après : un salon en 3 changements",
      "Pourquoi ton intérieur te fatigue (et comment y remédier)",
    ],
    accroche_example: "J'ai transformé 150 intérieurs. Le secret n'est jamais le budget.",
    story_ideas: ["Visite d'un chantier en cours", "Mes trouvailles du moment", "Un conseil déco rapide"],
    dashboard_tip: "Partage un avant/après en story, c'est ton meilleur argument commercial.",
    coaching_client_word: "clientes déco",
  },
  beaute_cosmetiques: {
    label: "Beauté & cosmétiques naturels",
    persona_example: {
      prenom: "Jade",
      age: "25-40 ans",
      metier: "Créatrice de cosmétiques naturels",
      frustration: "Elle fabrique des produits incroyables mais n'arrive pas à convaincre en ligne face aux grandes marques.",
      desire: "Construire une marque reconnue et fidéliser sa communauté sans budget pub",
      phrase: "Mes produits sont meilleurs que 90% de ce qu'on trouve en pharmacie. Mais personne ne le sait.",
    },
    offre_example: { name: "Routine visage complète", price: "65€", description: "Nettoyant + sérum + crème · Bio & local" },
    bio_example: "Cosmétiques naturels · Fabriqués à la main\nTa peau mérite mieux que du greenwashing.\n📍 Provence\n↓ Découvre ta routine",
    post_examples: [
      "Ce que contient vraiment ton gel douche (spoiler : c'est pas joli)",
      "Pourquoi je ne fais pas de promos",
      "Les 3 ingrédients que j'utilise dans tout",
    ],
    accroche_example: "J'ai remplacé toute ma salle de bain par 4 produits faits maison. Voilà le résultat.",
    story_ideas: ["Fabrication en direct", "Test d'un nouvel ingrédient", "Routine du matin"],
    dashboard_tip: "Filme ta fabrication en story, c'est hypnotique et ça crée de la confiance.",
    coaching_client_word: "clientes beauté",
  },
  bien_etre: {
    label: "Bien-être & corps",
    persona_example: {
      prenom: "Camille",
      age: "35-50 ans",
      metier: "Praticienne bien-être",
      frustration: "Elle a une vraie expertise mais la communication lui semble 'commerciale' et pas alignée avec son éthique de soin.",
      desire: "Remplir son cabinet sans avoir l'impression de se vendre",
      phrase: "Mon métier c'est d'accompagner, pas de convaincre. Mais si personne ne me trouve...",
    },
    offre_example: { name: "Séance individuelle", price: "70€", description: "Naturopathie / sophrologie / yoga thérapeutique" },
    bio_example: "Accompagnement holistique pour femmes en transition.\nPraticienne bien-être\nCommuniquer sur son métier de soin, c'est pas 'se vendre'.\n↓ Prends rdv",
    post_examples: [
      "Non, communiquer sur ton cabinet c'est pas du marketing",
      "Ce qu'on ne dit jamais sur le métier de thérapeute",
      "Pourquoi je ne fais plus de 'premières séances gratuites'",
    ],
    accroche_example: "J'ai mis 2 ans à oser parler de mon cabinet en ligne. Voilà ce que j'aurais aimé savoir.",
    story_ideas: ["Un conseil bien-être du jour", "Les coulisses de ton cabinet", "Un livre qui t'a marquée"],
    dashboard_tip: "Partage un conseil bien-être court en story, ça installe ta crédibilité naturellement.",
    coaching_client_word: "clientes",
  },
  coach: {
    label: "Coach / Thérapeute",
    persona_example: {
      prenom: "Nadia",
      age: "32-45 ans",
      metier: "Coach en développement personnel",
      frustration: "Elle a du mal à se différencier dans un marché saturé de coachs. Elle ne veut pas ressembler aux coachs 'mindset' qu'elle déteste.",
      desire: "Remplir ses accompagnements sans faire de webinaires à rallonge ni de tunnels de vente agressifs",
      phrase: "Je refuse de vendre du rêve. J'accompagne des transformations réelles.",
    },
    offre_example: { name: "Accompagnement individuel 3 mois", price: "200€/mois", description: "6 séances + suivi WhatsApp" },
    bio_example: "Le coaching sans bullshit.\nAccompagnement pour entrepreneures\nqui veulent avancer sans se perdre.\n↓ Réserve ton appel découverte",
    post_examples: [
      "Non, le 'mindset' ne résout pas tout",
      "Ce que mes clientes me disent en séance (et jamais en public)",
      "Pourquoi j'ai arrêté les webinaires gratuits",
    ],
    accroche_example: "J'ai coaché 150 femmes. Le problème n'est jamais le mindset.",
    story_ideas: ["Partage un témoignage client", "Un mythe du coaching que tu détestes", "Ce que tu lis en ce moment"],
    dashboard_tip: "Partage un témoignage client (anonymisé) pour montrer ta valeur concrète.",
    coaching_client_word: "coachées",
  },
  coach_sportive: {
    label: "Coach sportive",
    persona_example: {
      prenom: "Julie",
      age: "28-40 ans",
      metier: "Coach sportive indépendante",
      frustration: "Elle galère à se démarquer des salles de sport et des apps. Son Instagram est plein de photos d'exos mais personne ne réserve.",
      desire: "Avoir un flux régulier de clientes qui viennent pour son approche, pas juste pour un prix",
      phrase: "Le sport c'est pas une punition, c'est un acte d'amour envers soi.",
    },
    offre_example: { name: "Programme personnalisé 8 semaines", price: "280€", description: "Bilan + 8 séances + suivi nutrition" },
    bio_example: "Le mouvement comme soin.\nCoach sportive · Approche bienveillante\nPas de 'no pain no gain' ici.\n↓ Ton bilan offert",
    post_examples: [
      "J'ai arrêté de poster des photos d'abdos. Mes réservations ont doublé.",
      "Pourquoi je ne fais jamais de 'avant/après corps'",
      "3 signes que ta routine sportive te fait plus de mal que de bien",
    ],
    accroche_example: "J'ai coaché des femmes qui détestaient le sport. Elles m'envoient des photos de leurs randos maintenant.",
    story_ideas: ["Un exercice rapide à faire chez soi", "Les coulisses de ta séance du jour", "Un mythe fitness que tu détestes"],
    dashboard_tip: "Filme un exercice rapide en story, ça donne envie de bouger.",
    coaching_client_word: "clientes sportives",
  },
  consultante: {
    label: "Consultante / Freelance",
    persona_example: {
      prenom: "Sophie",
      age: "28-42 ans",
      metier: "Consultante en communication",
      frustration: "Elle conseille ses clients sur leur com' mais la sienne est en jachère. Le cordonnier mal chaussé, version freelance.",
      desire: "Attirer des missions alignées avec ses valeurs sans passer par des plateformes",
      phrase: "Je sais faire de la bonne com'. J'ai juste pas le temps de faire la mienne.",
    },
    offre_example: { name: "Stratégie com' 360°", price: "1 200€", description: "Audit + stratégie + plan d'action 3 mois" },
    bio_example: "Consultante com' pour marques engagées.\nStratégie · Contenus · Social media\n📍 Remote\n↓ Réserve ton appel stratégique",
    post_examples: [
      "Les 3 erreurs que je vois chez 90% de mes clients",
      "Pourquoi je ne fais plus de community management",
      "Freelance : comment j'ai doublé mes tarifs en 6 mois",
    ],
    accroche_example: "J'ai géré la com' de 50 marques. La mienne était la pire. Voilà ce que j'ai changé.",
    story_ideas: ["Un outil que tu recommandes", "Les coulisses d'une demande client", "Un conseil com' rapide"],
    dashboard_tip: "Partage un conseil com' rapide en story, ça montre ton expertise sans effort.",
    coaching_client_word: "clientes",
  },
  formatrice: {
    label: "Formatrice",
    persona_example: {
      prenom: "Sarah",
      age: "30-45 ans",
      metier: "Formatrice indépendante",
      frustration: "Elle dépend des plateformes et des organismes de formation. Elle veut vendre en direct mais ne sait pas comment se positionner.",
      desire: "Remplir ses formations sans intermédiaire et à son prix",
      phrase: "J'enseigne à des gens qui veulent vraiment apprendre, pas juste cocher une case CPF.",
    },
    offre_example: { name: "Formation en ligne", price: "490€", description: "4 semaines · Groupe de 10" },
    bio_example: "Je forme les créatrices à communiquer sans se trahir.\nFormatrice indépendante · Com' éthique\n↓ Prochaine session en mars",
    post_examples: [
      "Le problème avec les formations en ligne à 27€",
      "J'ai formé 300 personnes. Voilà ce que j'aurais dû dire dès le début.",
      "CPF, pas CPF : le vrai débat",
    ],
    accroche_example: "La meilleure formation du monde ne sert à rien si personne ne sait qu'elle existe.",
    story_ideas: ["Un extrait de ta formation", "Un retour d'apprenant·e", "Un outil que tu recommandes"],
    dashboard_tip: "Partage un extrait de ta formation en story pour donner un avant-goût.",
    coaching_client_word: "apprenant·es",
  },
  autre: {
    label: "Solopreneuse",
    persona_example: {
      prenom: "Léa",
      age: "28-45 ans",
      metier: "Solopreneuse créative et engagée",
      frustration: "Elle est douée dans son métier mais personne ne le sait. Sa com' passe toujours après.",
      desire: "Être visible sans se trahir et remplir son agenda",
      phrase: "Je sais que ma com' est importante. Je sais juste pas par où commencer.",
    },
    offre_example: { name: "Mon offre signature", price: "À définir", description: "Ton service ou produit phare" },
    bio_example: "[Ta punchline ici]\n[Ce que tu fais + pour qui]\n[Ta preuve ou ton twist]\n↓ [Ton appel à l'action]",
    post_examples: [
      "Ce qui m'a poussée à me lancer (et ce que j'aurais aimé savoir)",
      "La question que mes client·es me posent le plus souvent",
      "3 choses que j'ai arrêté de faire dans ma com'",
    ],
    accroche_example: "J'ai mis longtemps à oser communiquer sur mon projet. Voilà ce qui a changé.",
    story_ideas: ["Montre les coulisses de ta journée", "Partage un témoignage client", "Un outil que tu adores"],
    dashboard_tip: "Commence par poser ton identité de marque, c'est la base de tout le reste.",
    coaching_client_word: "client·es",
  },
  default: {
    label: "Solopreneuse",
    persona_example: {
      prenom: "Léa",
      age: "28-45 ans",
      metier: "Solopreneuse créative et engagée",
      frustration: "Elle est douée dans son métier mais personne ne le sait. Sa com' passe toujours après.",
      desire: "Être visible sans se trahir et remplir son agenda",
      phrase: "Je sais que ma com' est importante. Je sais juste pas par où commencer.",
    },
    offre_example: { name: "Mon offre signature", price: "À définir", description: "Ton service ou produit phare" },
    bio_example: "[Ta punchline ici]\n[Ce que tu fais + pour qui]\n[Ta preuve ou ton twist]\n↓ [Ton appel à l'action]",
    post_examples: [
      "Ce qui m'a poussée à me lancer (et ce que j'aurais aimé savoir)",
      "La question que mes client·es me posent le plus souvent",
      "3 choses que j'ai arrêté de faire dans ma com'",
    ],
    accroche_example: "J'ai mis longtemps à oser communiquer sur mon projet. Voilà ce qui a changé.",
    story_ideas: ["Montre les coulisses de ta journée", "Partage un témoignage client", "Un outil que tu adores"],
    dashboard_tip: "Commence par poser ton identité de marque, c'est la base de tout le reste.",
    coaching_client_word: "client·es",
  },
};

/**
 * Detect activity type from a free-text activity description or stored type key.
 */
export function detectActivityType(activity: string | null | undefined): ActivityType {
  if (!activity) return "default";
  const lower = activity.toLowerCase();

  // Direct key match first
  if (lower in ACTIVITY_EXAMPLES) return lower as ActivityType;

  // Legacy key mapping
  if (lower === "photo_video" || lower === "photographe") return "art_design";
  if (lower === "graphiste" || lower === "design") return "art_design";
  if (lower === "coach_therapist" || lower === "therapeute") return "coach";
  if (lower === "artisan") return "artisane";
  if (lower === "trainer") return "formatrice";
  if (lower === "sport_coach") return "coach_sportive";
  if (lower === "other") return "autre";

  // Free text detection
  if (lower.includes("photo")) return "art_design";
  if (lower.includes("graph") || lower.includes("design") || lower.includes("illustr")) return "art_design";
  if (lower.includes("mode") || lower.includes("stylis") || lower.includes("vêtement") || lower.includes("textile")) return "mode_textile";
  if (lower.includes("déco") || lower.includes("intérieur") || lower.includes("meuble") || lower.includes("scéno")) return "deco_interieur";
  if (lower.includes("cosm") || lower.includes("beauté") || lower.includes("soins") || lower.includes("coiff") || lower.includes("esthéti")) return "beaute_cosmetiques";
  if (lower.includes("yoga") || lower.includes("naturo") || lower.includes("sophro") || lower.includes("bien-être") || lower.includes("hypno") || lower.includes("ostéo") || lower.includes("kiné")) return "bien_etre";
  if ((lower.includes("coach") || lower.includes("prépar")) && (lower.includes("sport") || lower.includes("fitness") || lower.includes("pilates"))) return "coach_sportive";
  if (lower.includes("coach") || lower.includes("thérap")) return "coach";
  if (lower.includes("consult") || lower.includes("freelance") || lower.includes("social media") || lower.includes("rédact")) return "consultante";
  if (lower.includes("form") || lower.includes("enseign")) return "formatrice";
  if (lower.includes("bijou") || lower.includes("céram") || lower.includes("artisan") || lower.includes("créat") || lower.includes("coutur") || lower.includes("poterie") || lower.includes("bougie") || lower.includes("maroquin")) return "artisane";
  return "default";
}

/**
 * Get the activity profile for a given activity text.
 */
export function getActivityExamples(activity: string | null | undefined): ActivityProfile {
  const type = detectActivityType(activity);
  return ACTIVITY_EXAMPLES[type];
}

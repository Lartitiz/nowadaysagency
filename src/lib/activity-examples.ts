/**
 * Dynamic examples adapted to the user's activity type.
 * Used across the app for placeholders, suggestions, coaching prompts, etc.
 */

export type ActivityType =
  | "photographe"
  | "graphiste"
  | "coach"
  | "coach_sportive"
  | "artisane"
  | "therapeute"
  | "formatrice"
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
  coaching_client_word: string; // "clientes photo", "coachées", etc.
}

export const ACTIVITY_EXAMPLES: Record<ActivityType, ActivityProfile> = {
  photographe: {
    label: "Photographe",
    persona_example: {
      prenom: "Léa",
      age: "30-40 ans",
      metier: "Photographe portrait pour entrepreneures",
      frustration: "Elle a un book magnifique mais personne ne le voit. Elle dépend du bouche-à-oreille et ça ne suffit plus.",
      desire: "Remplir son agenda de séances sans devoir relancer ses contacts",
      phrase: "Je fais des photos qui changent le regard que les femmes portent sur elles.",
    },
    offre_example: { name: "Séance portrait Confiance", price: "350€", description: "Séance de 2h + 15 photos retouchées" },
    bio_example: "Le portrait comme acte de confiance.\nPhotographe pour entrepreneures qui veulent se montrer.\n📍 Lyon · Dispo dans toute la France\n↓ Réserve ta séance",
    post_examples: [
      "Pourquoi 80% des entrepreneures n'ont pas de photo pro",
      "Le jour où une cliente a pleuré en voyant ses photos",
      "3 erreurs qui rendent tes photos de profil invisibles",
    ],
    accroche_example: "J'ai photographié 200 femmes. Aucune ne se trouvait belle au départ.",
    story_ideas: ["Montre les coulisses d'une séance", "Avant/après retouche", "Le matériel que tu utilises"],
    dashboard_tip: "Partage une photo avant/après retouche en story, ça fascine toujours.",
    coaching_client_word: "clientes photo",
  },
  graphiste: {
    label: "Graphiste / Designer",
    persona_example: {
      prenom: "Clara",
      age: "28-38 ans",
      metier: "Graphiste freelance pour marques éthiques",
      frustration: "Elle passe plus de temps à chercher des clients qu'à créer. Son propre branding est le cordonnier mal chaussé.",
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
    accroche_example: "Un bon logo ne fait pas vendre. Un bon branding, si.",
    story_ideas: ["Montre un WIP (work in progress)", "Palette de couleurs du jour", "Avant/après refonte de logo"],
    dashboard_tip: "Montre un WIP (work in progress), les gens adorent voir le processus.",
    coaching_client_word: "clientes design",
  },
  coach: {
    label: "Coach",
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
  therapeute: {
    label: "Thérapeute / Praticienne",
    persona_example: {
      prenom: "Camille",
      age: "35-50 ans",
      metier: "Thérapeute / praticienne bien-être",
      frustration: "Elle a une vraie expertise mais la communication lui semble 'commerciale' et pas alignée avec son éthique de soin.",
      desire: "Remplir son cabinet sans avoir l'impression de se vendre",
      phrase: "Mon métier c'est d'accompagner, pas de convaincre. Mais si personne ne me trouve...",
    },
    offre_example: { name: "Séance individuelle", price: "70€", description: "Naturopathie / sophrologie / hypnose" },
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
    bio_example: "[Ta punchline ici]\n[Ce que tu fais + pour qui]\n[Ta preuve ou ton twist]\n↓ [Ton CTA]",
    post_examples: [
      "Ce qui m'a poussée à me lancer (et ce que j'aurais aimé savoir)",
      "La question que mes client·es me posent le plus souvent",
      "3 choses que j'ai arrêté de faire dans ma com'",
    ],
    accroche_example: "J'ai mis longtemps à oser communiquer sur mon projet. Voilà ce qui a changé.",
    story_ideas: ["Montre les coulisses de ta journée", "Partage un témoignage client", "Un outil que tu adores"],
    dashboard_tip: "Commence par poser ton branding, c'est la base de tout le reste.",
    coaching_client_word: "client·es",
  },
};

/**
 * Detect activity type from a free-text activity description.
 */
export function detectActivityType(activity: string | null | undefined): ActivityType {
  if (!activity) return "default";
  const lower = activity.toLowerCase();
  if (lower.includes("photo")) return "photographe";
  if (lower.includes("graph") || lower.includes("design") || lower.includes("illustr")) return "graphiste";
  if ((lower.includes("coach") || lower.includes("prépar")) && (lower.includes("sport") || lower.includes("fitness") || lower.includes("yoga") || lower.includes("pilates"))) return "coach_sportive";
  if (lower.includes("coach")) return "coach";
  if (lower.includes("thérap") || lower.includes("naturo") || lower.includes("sophro") || lower.includes("bien-être") || lower.includes("hypno") || lower.includes("ostéo") || lower.includes("kiné")) return "therapeute";
  if (lower.includes("form") || lower.includes("enseign")) return "formatrice";
  if (lower.includes("bijou") || lower.includes("céram") || lower.includes("artisan") || lower.includes("créat") || lower.includes("coutur") || lower.includes("textile") || lower.includes("poterie") || lower.includes("bougie")) return "artisane";
  return "default";
}

/**
 * Get the activity profile for a given activity text.
 */
export function getActivityExamples(activity: string | null | undefined): ActivityProfile {
  const type = detectActivityType(activity);
  return ACTIVITY_EXAMPLES[type];
}

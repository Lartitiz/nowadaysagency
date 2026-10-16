/**
 * Demo intake questionnaire data for Léa (Binôme de com').
 */

export interface DemoIntakeQuestion {
  question: string;
  question_type: "text" | "textarea" | "select" | "multi_select" | "url_list";
  options?: string[];
  placeholder?: string;
  demo_answer: string;
  completion_percentage: number;
}

export const DEMO_INTAKE_DATA = {
  questions: [
    {
      question: "Léa, bienvenue dans ton accompagnement ! 🌸 Avant notre premier appel, j'aimerais savoir : c'est quoi ton urgence n°1 en ce moment ? Un lancement, une refonte de site, un truc précis ?",
      question_type: "textarea" as const,
      placeholder: "Ce qui te presse le plus en ce moment...",
      demo_answer: "Mon site est vieillissant, j'aimerais le refondre d'ici avril. Et je veux aussi avoir une vraie stratégie de contenu sur Instagram, parce que je poste un peu au hasard.",
      completion_percentage: 15,
    },
    {
      question: "Refonte du site + stratégie Insta, ça me parle. Et côté vente, tu te sens comment ? Genre quand il faut proposer tes tarifs, présenter tes offres ?",
      question_type: "select" as const,
      options: ["À l'aise", "Ça dépend des jours", "Mal à l'aise", "Je déteste ça"],
      demo_answer: "Mal à l'aise",
      completion_percentage: 30,
    },
    {
      question: "Ok, c'est super courant et on va bosser là-dessus. De l'accompagnement, tu attends quoi exactement ? Si tu pouvais résumer en une phrase ?",
      question_type: "textarea" as const,
      placeholder: "Ce que tu espères retirer de ces 6 mois...",
      demo_answer: "Avoir une stratégie claire, savoir quoi poster et quand, et surtout me sentir légitime quand je parle de mes offres.",
      completion_percentage: 45,
    },
    {
      question: "\"Me sentir légitime\" — on va y travailler ensemble. 💪 T'as des contenus récents dont tu es fière ? Un post, un reel, un truc sur ton site ? Envoie-moi les liens.",
      question_type: "textarea" as const,
      placeholder: "Colle tes liens ici (Instagram, site, etc.)...",
      demo_answer: "https://instagram.com/p/abc123 — mon dernier carrousel sur les coulisses\nhttps://leaportraits.fr/portfolio — ma page portfolio",
      completion_percentage: 60,
    },
    {
      question: "Je vois que ta stratégie de contenu est pas encore définie. Si tu devais poster 3x/semaine, tu parlerais de quoi ? Tes 2-3 sujets préférés ?",
      question_type: "textarea" as const,
      placeholder: "Les sujets qui te viennent naturellement...",
      demo_answer: "Les coulisses de mes séances, des conseils pour être à l'aise devant l'objectif, et ma vie de freelance. Parfois des avant/après aussi.",
      completion_percentage: 75,
    },
    {
      question: "Top, on a de la matière. Dernière question : tu as des deadlines à venir ? Un événement, un lancement, un truc qui presse ?",
      question_type: "textarea" as const,
      placeholder: "Tes échéances des prochains mois...",
      demo_answer: "Mon site doit être refait pour début avril, j'ai un mini-lancement prévu en mai pour une offre de shooting express pour l'identité de marque.",
      completion_percentage: 92,
    },
  ] as DemoIntakeQuestion[],
  kickoff_summary: "Léa est photographe portraitiste, spécialisée entrepreneures. Son urgence : refonte site (avril) + stratégie Instagram. Mal à l'aise avec la vente. Attend de l'accompagnement : clarté stratégique + légitimité. Contenu existant solide (coulisses, avant/après) mais sans structure. Lancement offre branding express prévu en mai.",
  suggested_agenda: [
    "Valider le positionnement (déjà bien posé)",
    "Définir les 4 piliers de contenu",
    "Poser le calendrier éditorial pour mars-avril",
    "Aborder le rapport à la vente (objection prix)",
    "Fixer les objectifs à 3 mois",
  ],
  missing_topics: [
    "Stratégie de contenu : pas de piliers définis",
    "Newsletter : pas commencée",
    "Offres : prix pas validés",
  ],
};

export interface PlanTask {
  text: string;
  duration: string;
  link?: { label: string; to: string };
}

export interface PlanWeek {
  weekNumber: number;
  title: string;
  objective: string;
  phase: number;
  tasks: PlanTask[];
}

export const PHASES = [
  { number: 1, title: "Poser les bases", weeks: [1, 2, 3, 4] },
  { number: 2, title: "Prendre le rythme", weeks: [5, 6, 7, 8] },
  { number: 3, title: "Affirmer ta voix", weeks: [9, 10, 11, 12] },
];

export const PLAN_WEEKS: PlanWeek[] = [
  {
    weekNumber: 1,
    title: "Clarifier ton message",
    objective: "Savoir exactement à qui tu parles et pourquoi.",
    phase: 1,
    tasks: [
      { text: "Relire et compléter ton profil dans L'Assistant Com'", duration: "10 min", link: { label: "Aller à Mon profil", to: "/profil" } },
      { text: "Écrire en 1 phrase ce que tu fais et pour qui", duration: "15 min" },
      { text: "Décrire ta cliente idéale comme si c'était une amie", duration: "15 min", link: { label: "Aller à Mon profil", to: "/profil" } },
      { text: "Identifier les 3 problèmes principaux de ta cible", duration: "20 min" },
    ],
  },
  {
    weekNumber: 2,
    title: "Choisir tes thématiques",
    objective: "Définir de quoi tu vas parler sur tes réseaux.",
    phase: 1,
    tasks: [
      { text: "Sélectionner 3-4 thématiques dans ton profil", duration: "10 min", link: { label: "Aller à Mon profil", to: "/profil" } },
      { text: "Pour chaque thématique, noter 3 sujets possibles", duration: "20 min" },
      { text: "Trouver 5 idées de contenu dans l'atelier", duration: "15 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Enregistrer tes idées préférées", duration: "5 min" },
    ],
  },
  {
    weekNumber: 3,
    title: "Trouver ton rythme",
    objective: "Décider quand et combien tu publies, sans te cramer.",
    phase: 1,
    tasks: [
      { text: "Décider ta fréquence de publication réaliste : 1, 2 ou 3 fois/semaine", duration: "10 min" },
      { text: "Choisir tes jours de publication", duration: "10 min" },
      { text: "Planifier tes 2 premiers posts dans le calendrier", duration: "20 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Bloquer 1h dans ton agenda pour ta com' chaque semaine", duration: "5 min" },
    ],
  },
  {
    weekNumber: 4,
    title: "Créer tes premiers contenus",
    objective: "Publier au moins 1 post cette semaine.",
    phase: 1,
    tasks: [
      { text: "Choisir une idée de contenu dans tes enregistrements ou l'atelier", duration: "5 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Lire le guide de production pour l'angle choisi", duration: "5 min" },
      { text: "Rédiger ton post", duration: "30 min" },
      { text: "Le planifier dans le calendrier", duration: "5 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Le publier et le marquer 'Publié'", duration: "5 min" },
    ],
  },
  {
    weekNumber: 5,
    title: "Varier tes angles",
    objective: "Ne pas toujours faire le même type de post.",
    phase: 2,
    tasks: [
      { text: "Identifier les 2-3 angles que tu n'as jamais testés", duration: "10 min" },
      { text: "Générer des idées avec un nouvel angle dans l'atelier", duration: "15 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Rédiger 1 post avec un angle nouveau pour toi", duration: "30 min" },
      { text: "Planifier 2 posts cette semaine dans le calendrier", duration: "10 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
    ],
  },
  {
    weekNumber: 6,
    title: "Raconter ton histoire",
    objective: "Créer du lien avec ton audience en te montrant.",
    phase: 2,
    tasks: [
      { text: "Écrire 3 moments clés de ton parcours d'entrepreneuse", duration: "20 min" },
      { text: "Choisir 1 moment et le transformer en post storytelling", duration: "30 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Planifier ce post + 1 autre post cette semaine", duration: "10 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Observer les réactions : qu'est-ce qui a le plus touché ton audience ?", duration: "5 min" },
    ],
  },
  {
    weekNumber: 7,
    title: "Parler de ce que tu vends",
    objective: "Assumer de parler de tes produits/services sans culpabiliser.",
    phase: 2,
    tasks: [
      { text: "Lister 3 raisons pour lesquelles ta cliente a besoin de ce que tu proposes", duration: "15 min" },
      { text: "Créer 1 post qui parle de ton offre sans être en mode 'promo'", duration: "30 min" },
      { text: "Tester l'angle 'Histoire cliente' ou 'Before/After'", duration: "20 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Planifier 2 posts cette semaine", duration: "10 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
    ],
  },
  {
    weekNumber: 8,
    title: "Faire le bilan de mi-parcours",
    objective: "Regarder ce qui marche et ajuster.",
    phase: 2,
    tasks: [
      { text: "Relire tes posts des 4 dernières semaines : lequel a le mieux fonctionné ?", duration: "15 min" },
      { text: "Identifier 1 thématique ou angle qui plaît à ton audience", duration: "10 min" },
      { text: "Ajuster ta fréquence si besoin : plus ou moins ?", duration: "5 min" },
      { text: "Planifier les 2 prochaines semaines dans le calendrier", duration: "20 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
    ],
  },
  {
    weekNumber: 9,
    title: "Prendre position",
    objective: "Oser dire ce que tu penses, pas juste informer.",
    phase: 3,
    tasks: [
      { text: "Choisir un sujet qui te tient à cœur dans ton domaine", duration: "10 min" },
      { text: "Créer 1 post 'Coup de gueule' ou 'Mythe à déconstruire'", duration: "30 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Planifier 2 posts cette semaine", duration: "10 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Lire ton post à voix haute avant de publier : ça te ressemble ?", duration: "5 min" },
    ],
  },
  {
    weekNumber: 10,
    title: "Créer de la conversation",
    objective: "Transformer tes posts en vraies discussions.",
    phase: 3,
    tasks: [
      { text: "Terminer chaque post de la semaine par une vraie question ouverte", duration: "10 min" },
      { text: "Répondre à chaque commentaire dans les 24h", duration: "15 min/jour" },
      { text: "Créer 1 post 'Regard philosophique' ou 'Enquête' qui invite au débat", duration: "30 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Planifier 2 posts cette semaine", duration: "10 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
    ],
  },
  {
    weekNumber: 11,
    title: "Planifier le mois prochain",
    objective: "Avoir 1 mois d'avance pour ne plus jamais être en panne.",
    phase: 3,
    tasks: [
      { text: "Générer 10 idées de contenu dans l'atelier", duration: "20 min", link: { label: "Aller à l'atelier", to: "/dashboard" } },
      { text: "Sélectionner et planifier 4-6 posts pour le mois prochain", duration: "20 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Varier les angles : vérifier que tu as au moins 3 angles différents", duration: "5 min" },
      { text: "Préparer les brouillons des 2 premiers posts", duration: "30 min" },
    ],
  },
  {
    weekNumber: 12,
    title: "Célébrer et ritualiser",
    objective: "Ancrer la com' comme une habitude, pas une corvée.",
    phase: 3,
    tasks: [
      { text: "Relire tes stats : combien de posts publiés en 12 semaines ?", duration: "5 min" },
      { text: "Identifier TON rituel com' : quel jour, quelle heure, quel format te convient le mieux", duration: "10 min" },
      { text: "Écrire 1 post sur ce que tu as appris en 12 semaines (le méta-post)", duration: "30 min" },
      { text: "Planifier ton prochain mois en autonomie", duration: "20 min", link: { label: "Aller au calendrier", to: "/calendrier" } },
      { text: "Te féliciter. Vraiment.", duration: "∞" },
    ],
  },
];

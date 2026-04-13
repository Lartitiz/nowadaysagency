/**
 * Pre-generated demo flow for Auriana (marchande de biens).
 * Used to bypass AI generation and show a complete carousel demo instantly.
 */

export const AURIANA_DEMO_EMAILS = ["auriana.demo@nowadaysagency.com"];

export function isAurianaDemoEmail(email: string | null | undefined): boolean {
  return !!email && AURIANA_DEMO_EMAILS.includes(email.toLowerCase().trim());
}

export const AURIANA_DEMO_SUBJECT = "La pré-commercialisation en MDB : je vends avant d'acheter";

export const AURIANA_DEMO_FLOW = {
  step: "idea" as const,
  ideaText: AURIANA_DEMO_SUBJECT,
  demoScenario: "auriana-carousel" as const,
  objective: "visibilite",
  selectedFormat: "carousel",
  carouselSubMode: "text" as const,
  editorialAngle: "decryptage",
  questions: [
    { id: "q_0", question: "Quel moment précis t'a fait comprendre que pré-commercialiser changeait tout ?", placeholder: "Un deal, une situation, un déclic..." },
    { id: "q_1", question: "Quelle objection entends-tu le plus quand tu parles de cette approche ?", placeholder: "Ex : 'C'est trop risqué', 'Ça ne marche pas partout'..." },
    { id: "q_2", question: "Quel résultat concret as-tu obtenu grâce à la pré-commercialisation ?", placeholder: "Un chiffre, un projet, un gain de temps..." },
  ],
  answers: {
    q_0: "Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte. C'est là que j'ai compris : on ne vend pas un bien, on vend une vision du quartier.",
    q_1: "\"T'as pas peur de vendre un truc qui n'existe pas encore ?\" — alors que c'est exactement le contraire : tu sécurises ton opération AVANT de t'engager.",
    q_2: "Sur une découpe de 5 lots à Bordeaux, j'ai pré-vendu 4 lots en 3 semaines. Résultat : financement bouclé avant la signature, marge sécurisée dès le départ.",
  },
  result: {
    type: "carousel",
    format: "carousel",
    slides: [
      {
        slide_number: 1,
        title: "Je vends avant d'acheter.\nEt c'est pour ça que mes opérations sont rentables.",
        body: "",
        role: "hook",
        visual_suggestion: "Texte bold centré, fond sombre avec texture béton subtile"
      },
      {
        slide_number: 2,
        title: "",
        body: "La plupart des marchands de biens achètent d'abord.\nPuis cherchent des acquéreurs.\nPuis croisent les doigts.\n\nMoi j'ai inversé le process.",
        role: "context",
        visual_suggestion: "Texte aéré, fond clair, icône flèche inversée"
      },
      {
        slide_number: 3,
        title: "La pré-commercialisation, c'est simple :",
        body: "→ Tu identifies le bien\n→ Tu crées une offre (plans, prix, vision)\n→ Tu signes des réservations AVANT l'acte\n→ Tu achètes avec la certitude de revendre",
        role: "explication",
        visual_suggestion: "Liste à puces, flèches directionnelles, fond structuré"
      },
      {
        slide_number: 4,
        title: "80% des lots signés avant l'acte",
        body: "Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte.\n\nFinancement bouclé.\nMarge sécurisée.\nStress : zéro.",
        role: "preuve",
        visual_suggestion: "Chiffres en gros, fond accent, mise en avant du 80%"
      },
      {
        slide_number: 5,
        title: "\"T'as pas peur de vendre un truc qui n'existe pas ?\"",
        body: "Non. Parce que je ne vends pas un bien.\nJe vends une vision du quartier, un plan, un projet.\n\nEt c'est exactement ça qui rassure les acquéreurs.",
        role: "objection",
        visual_suggestion: "Citation en italique + réponse en gras, fond contrasté"
      },
      {
        slide_number: 6,
        title: "Résultats concrets",
        body: "Sur une découpe de 5 lots à Bordeaux :\n• 4 lots pré-vendus en 3 semaines\n• Financement bouclé avant signature\n• Marge sécurisée dès le départ\n\nPas de suspense. Du process.",
        role: "résultat",
        visual_suggestion: "Résultats chiffrés, style dashboard, fond sombre"
      },
      {
        slide_number: 7,
        title: "Un mindset, pas une astuce",
        body: "1. Valider la demande avant l'offre\n2. Sécuriser le financement par les réservations\n3. Réduire le risque à chaque étape\n\nC'est comme ça qu'on passe de \"j'espère\" à \"je sais\".",
        role: "synthèse",
        visual_suggestion: "Liste numérotée, fond clair, progression visuelle"
      },
      {
        slide_number: 8,
        title: "Envie de structurer ta prochaine opération ?",
        body: "📩 Envoie-moi \"PRÉ-CO\" en DM.\nJe t'explique comment j'applique ça concrètement.",
        role: "cta",
        visual_suggestion: "CTA clair, bouton DM, fond accent avec logo"
      },
    ],
    hashtags: ["#marchanddebiens #immobilier #precommercialisation #investissementimmobilier #mdb #strategieimmo"],
    caption: "La pré-commercialisation, c'est le game changer que personne ne t'explique en formation. 👇",
    accroche: "Je vends avant d'acheter. Et c'est pour ça que mes opérations sont rentables.",
  },
  savedId: null,
  visualSlides: [],
  editContent: "",
  ts: Date.now(),
};

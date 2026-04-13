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
  step: "format" as const,
  ideaText: AURIANA_DEMO_SUBJECT,
  objective: "visibilite",
  selectedFormat: "carousel",
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
        hook: "Je vends avant d'acheter.\nEt c'est pour ça que mes opérations sont rentables.",
        text: "",
        visual_schema: "Texte bold centré, fond sombre avec texture béton subtile"
      },
      {
        slide_number: 2,
        hook: "",
        text: "La plupart des marchands de biens achètent d'abord.\nPuis cherchent des acquéreurs.\nPuis croisent les doigts.\n\nMoi j'ai inversé le process.",
        visual_schema: "Texte aéré, fond clair, icône flèche inversée"
      },
      {
        slide_number: 3,
        hook: "",
        text: "La pré-commercialisation, c'est simple :\n→ Tu identifies le bien\n→ Tu crées une offre (plans, prix, vision)\n→ Tu signes des réservations AVANT l'acte\n→ Tu achètes avec la certitude de revendre",
        visual_schema: "Liste à puces, flèches directionnelles, fond structuré"
      },
      {
        slide_number: 4,
        hook: "",
        text: "Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte.\n\nFinancement bouclé.\nMarge sécurisée.\nStress : zéro.",
        visual_schema: "Chiffres en gros, fond accent, mise en avant du 80%"
      },
      {
        slide_number: 5,
        hook: "",
        text: "\"T'as pas peur de vendre un truc qui n'existe pas ?\"\n\nNon. Parce que je ne vends pas un bien.\nJe vends une vision du quartier, un plan, un projet.\n\nEt c'est exactement ça qui rassure les acquéreurs.",
        visual_schema: "Citation en italique + réponse en gras, fond contrasté"
      },
      {
        slide_number: 6,
        hook: "",
        text: "Sur une découpe de 5 lots à Bordeaux :\n• 4 lots pré-vendus en 3 semaines\n• Financement bouclé avant signature\n• Marge sécurisée dès le départ\n\nPas de suspense. Du process.",
        visual_schema: "Résultats chiffrés, style dashboard, fond sombre"
      },
      {
        slide_number: 7,
        hook: "",
        text: "La pré-commercialisation n'est pas une astuce.\nC'est un mindset :\n\n1. Valider la demande avant l'offre\n2. Sécuriser le financement par les réservations\n3. Réduire le risque à chaque étape\n\nC'est comme ça qu'on passe de \"j'espère\" à \"je sais\".",
        visual_schema: "Liste numérotée, fond clair, progression visuelle"
      },
      {
        slide_number: 8,
        hook: "",
        text: "Tu veux structurer ta prochaine opération avec la pré-commercialisation ?\n\n📩 Envoie-moi \"PRÉ-CO\" en DM.\nJe t'explique comment j'applique ça concrètement.",
        visual_schema: "CTA clair, bouton DM, fond accent avec logo"
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

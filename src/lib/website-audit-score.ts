// Client-side website audit score calculator — no AI needed

type AnswerValue = "oui" | "non" | "pas_sure" | string | null;

// ── Scoring helpers ──

function answerPoints(answer: AnswerValue, max: number): number {
  if (answer === "oui") return max;
  if (answer === "pas_sure") return Math.round(max / 2);
  return 0;
}

// ── Category definitions ──

interface CategoryDef {
  id: string;
  label: string;
  emoji: string;
  questionIds: string[];
  pointsPerQuestion: number;
}

const GLOBAL_CATEGORIES: CategoryDef[] = [
  { id: "clarte", label: "Clarté du message", emoji: "🎯", questionIds: ["q1", "q2", "q3", "q4"], pointsPerQuestion: 5 },
  { id: "copywriting", label: "Copywriting", emoji: "💬", questionIds: ["q5", "q6", "q7", "q8"], pointsPerQuestion: 5 },
  { id: "parcours", label: "Parcours utilisateur·ice", emoji: "🗺️", questionIds: ["q9", "q10", "q11", "q12"], pointsPerQuestion: 5 },
  { id: "confiance", label: "Confiance", emoji: "🛡️", questionIds: ["q13", "q14", "q15"], pointsPerQuestion: 5 },
  { id: "mobile", label: "Mobile", emoji: "📱", questionIds: ["q16", "q17", "q18"], pointsPerQuestion: 5 },
  { id: "visuel", label: "Hiérarchie visuelle", emoji: "🎨", questionIds: ["q19", "q20"], pointsPerQuestion: 5 },
];

// ── Global score ──

export interface CategoryScore {
  score: number;
  max: number;
  label: string;
  emoji: string;
}

export interface AuditScoreResult {
  total: number;
  categories: Record<string, CategoryScore>;
}

export function calculateWebsiteAuditScore(
  answers: Record<string, AnswerValue>,
): AuditScoreResult {
  const categories: Record<string, CategoryScore> = {};
  let totalScore = 0;
  let totalMax = 0;

  for (const cat of GLOBAL_CATEGORIES) {
    const max = cat.questionIds.length * cat.pointsPerQuestion;
    let score = 0;
    for (const qId of cat.questionIds) {
      score += answerPoints(answers[qId] as AnswerValue, cat.pointsPerQuestion);
    }
    categories[cat.id] = { score, max, label: cat.label, emoji: cat.emoji };
    totalScore += score;
    totalMax += max;
  }

  // Normalise to 100
  const total = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return { total, categories };
}

// ── Page-by-page score ──

export function calculatePageByPageScore(
  answers: Record<string, Record<string, AnswerValue>>,
): AuditScoreResult {
  const pages = Object.keys(answers).filter(
    (k) => typeof answers[k] === "object" && answers[k] !== null,
  );

  if (pages.length === 0) {
    return { total: 0, categories: {} };
  }

  const categories: Record<string, CategoryScore> = {};
  let totalScore = 0;
  let totalMax = 0;

  for (const pageId of pages) {
    const pageAnswers = answers[pageId];
    const qIds = Object.keys(pageAnswers);
    const pointsPerQ = 5;
    const max = qIds.length * pointsPerQ;
    let score = 0;
    for (const qId of qIds) {
      score += answerPoints(pageAnswers[qId], pointsPerQ);
    }

    const label = PAGE_LABEL_MAP[pageId] ?? pageId;
    const emoji = PAGE_EMOJI_MAP[pageId] ?? "📄";

    categories[pageId] = { score, max, label, emoji };
    totalScore += score;
    totalMax += max;
  }

  const total = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return { total, categories };
}

const PAGE_LABEL_MAP: Record<string, string> = {
  accueil: "Page d'accueil",
  "a-propos": "Page À propos",
  offres: "Page Offres / Services",
  contact: "Page Contact",
  produits: "Page Produits",
};

const PAGE_EMOJI_MAP: Record<string, string> = {
  accueil: "🏠",
  "a-propos": "👋",
  offres: "🎁",
  contact: "💬",
  produits: "🛍️",
};

// ── Score label ──

export interface ScoreLabel {
  label: string;
  emoji: string;
  color: string;
  message: string;
}

export function getWebsiteScoreLabel(score: number): ScoreLabel {
  if (score >= 80)
    return {
      label: "Excellent",
      emoji: "🌟",
      color: "text-emerald-600",
      message: "Ton site convertit bien. On peaufine les détails.",
    };
  if (score >= 60)
    return {
      label: "Bien",
      emoji: "✅",
      color: "text-emerald-500",
      message: "Bonne base, mais des fuites de conversion à colmater.",
    };
  if (score >= 40)
    return {
      label: "À améliorer",
      emoji: "⚠️",
      color: "text-amber-500",
      message:
        "Des blocages sérieux empêchent tes visiteuses de passer à l'action.",
    };
  return {
    label: "Prioritaire",
    emoji: "🔴",
    color: "text-red-500",
    message:
      "Ton site a besoin d'une refonte de fond, pas juste de surface.",
  };
}

// ── Category recommendations ──

export interface CategoryRecommendation {
  priority: "haute" | "moyenne" | "basse";
  effort: "rapide" | "moyen" | "long";
  recommendation: string;
  link?: string;
  linkLabel?: string;
}

export function getCategoryRecommendations(
  category: string,
  score: number,
  max: number,
): CategoryRecommendation[] {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const recs: CategoryRecommendation[] = [];

  switch (category) {
    // ── Clarté ──
    case "clarte":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "rapide",
          recommendation:
            "Ton titre principal manque de punch. Retravaille-le pour parler du bénéfice client.",
          link: "/site/accueil",
          linkLabel: "Retravailler mon titre",
        });
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Ta visiteuse ne comprend pas ce que tu fais en 10 secondes. Clarifie ta proposition de valeur.",
          link: "/site/accueil",
          linkLabel: "Clarifier ma proposition",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Renforce ta différenciation : qu'est-ce qui te rend unique par rapport aux autres ?",
          link: "/branding/proposition/recap",
          linkLabel: "Affiner ma proposition",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Ta clarté est au top ! Vérifie que ta page À propos est aussi percutante.",
          link: "/site/a-propos",
          linkLabel: "Voir ma page À propos",
        });
      }
      break;

    // ── Copywriting ──
    case "copywriting":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Tes CTA ne sont pas assez visibles ou clairs. Place un bouton d'action au-dessus de la ligne de flottaison.",
          link: "/site/accueil",
          linkLabel: "Améliorer mes CTA",
        });
        recs.push({
          priority: "haute",
          effort: "rapide",
          recommendation:
            "Ajoute du micro-texte rassurant sous tes boutons ('Sans engagement', 'Réponse en 24h').",
          link: "/site/accueil",
          linkLabel: "Ajouter du micro-texte",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Reformule tes titres pour qu'ils parlent de résultats, pas de processus.",
          link: "/site/accueil",
          linkLabel: "Retravailler mes titres",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Ton copywriting est solide ! Teste des variantes d'accroches pour optimiser encore.",
        });
      }
      break;

    // ── Parcours ──
    case "parcours":
      if (pct < 50) {
        recs.push({
          priority: "moyenne",
          effort: "long",
          recommendation:
            "Simplifie ta navigation et réduis le nombre de clics pour passer à l'action.",
        });
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Chaque page devrait avoir UN seul objectif. Supprime les distractions.",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Réduis ton menu à 5 éléments max pour guider le parcours.",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Ton parcours est fluide ! Pense à ajouter un fil d'Ariane si tu as beaucoup de pages.",
        });
      }
      break;

    // ── Confiance ──
    case "confiance":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Ajoute des témoignages sur ta page d'accueil. C'est le levier n°1 de conversion.",
          link: "/site/temoignages",
          linkLabel: "Gérer mes témoignages",
        });
        recs.push({
          priority: "haute",
          effort: "rapide",
          recommendation:
            "Rends visible le prix ou le processus pour te contacter. L'opacité fait fuir.",
          link: "/site/accueil",
          linkLabel: "Ajouter la transparence",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Complète ta page À propos avec ta photo et ton histoire personnelle.",
          link: "/site/a-propos",
          linkLabel: "Compléter ma page À propos",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Excellent niveau de confiance ! Ajoute des logos de médias ou certifications si tu en as.",
        });
      }
      break;

    // ── Mobile ──
    case "mobile":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "long",
          recommendation:
            "Ton site mobile a besoin d'attention. 70% de tes visiteuses viennent du mobile.",
        });
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Tes boutons doivent être assez grands pour être cliqués au pouce (min 44px).",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Optimise la vitesse de chargement : compresse tes images et réduis les scripts.",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Ton site mobile est top ! Pense à tester sur plusieurs appareils régulièrement.",
        });
      }
      break;

    // ── Visuel ──
    case "visuel":
      if (pct < 50) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Améliore le contraste de tes textes. Pas de gris clair sur fond blanc.",
        });
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Aère tes sections. Ajoute de l'espace entre les blocs pour éviter le mur de texte.",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Crée plus de hiérarchie visuelle avec des tailles de texte variées et des accents de couleur.",
          link: "/site/accueil",
          linkLabel: "Revoir ma hiérarchie",
        });
      } else if (pct === 100) {
        recs.push({
          priority: "basse",
          effort: "rapide",
          recommendation:
            "Ta hiérarchie visuelle est claire ! Continue à maintenir la cohérence.",
        });
      }
      break;

    // ── Page-by-page pages ──
    case "accueil":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Ta page d'accueil manque d'éléments clés. Retravaille le titre, le CTA et les offres.",
          link: "/site/accueil",
          linkLabel: "Retravailler ma page d'accueil",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Ajoute un deuxième CTA en bas de page et du micro-texte rassurant.",
          link: "/site/accueil",
          linkLabel: "Améliorer ma page d'accueil",
        });
      }
      break;

    case "a-propos":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Ta page À propos doit commencer par ta cliente, pas par toi. Ajoute ta photo et un CTA.",
          link: "/site/a-propos",
          linkLabel: "Retravailler ma page À propos",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Condense ton histoire et rends tes valeurs plus concrètes.",
          link: "/site/a-propos",
          linkLabel: "Affiner ma page À propos",
        });
      }
      break;

    case "offres":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "long",
          recommendation:
            "Sépare tes offres sur des pages dédiées et mets les bénéfices avant les caractéristiques.",
        });
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Ajoute des témoignages spécifiques et une FAQ sur chaque page d'offre.",
          link: "/site/temoignages",
          linkLabel: "Ajouter des témoignages",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Rends le prix ou le processus d'achat plus visible sur tes pages d'offres.",
        });
      }
      break;

    case "contact":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "rapide",
          recommendation:
            "Simplifie ton formulaire (4 champs max) et ajoute un texte rassurant.",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Indique un délai de réponse et propose un second moyen de contact.",
        });
      }
      break;

    case "produits":
      if (pct < 50) {
        recs.push({
          priority: "haute",
          effort: "moyen",
          recommendation:
            "Améliore tes fiches produit : photos de qualité, bénéfices clients et avis visibles.",
        });
      } else if (pct < 75) {
        recs.push({
          priority: "moyenne",
          effort: "rapide",
          recommendation:
            "Ajoute des suggestions de produits complémentaires sur chaque fiche.",
        });
      }
      break;

    default:
      if (pct < 50) {
        recs.push({
          priority: "moyenne",
          effort: "moyen",
          recommendation:
            "Cette section mérite attention. Revois les points marqués en rouge.",
        });
      }
      break;
  }

  return recs;
}

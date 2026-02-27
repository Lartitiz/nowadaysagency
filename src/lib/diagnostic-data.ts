export interface DiagnosticStrength {
  title: string;
  detail?: string;
  source?: "instagram" | "website" | "linkedin" | "documents" | "profile";
}

export interface DiagnosticWeakness {
  title: string;
  why: string;
  detail?: string;
  source?: "instagram" | "website" | "linkedin" | "documents" | "profile";
  fix_hint?: string;
}

export interface DiagnosticScores {
  total: number;
  branding: number;
  instagram?: number | null;
  website?: number | null;
  linkedin?: number | null;
}

export interface DiagnosticData {
  totalScore: number;
  summary?: string;
  strengths: (string | DiagnosticStrength)[];
  weaknesses: DiagnosticWeakness[];
  priorities: {
    title: string;
    channel: string;
    impact: "high" | "medium" | "low";
    time: string;
    route: string;
    why?: string;
  }[];
  channelScores: { emoji: string; label: string; score: number | null }[];
  scores?: DiagnosticScores;
  branding_prefill?: {
    positioning?: string | null;
    mission?: string | null;
    target_description?: string | null;
    tone_keywords?: string[];
    values?: string[];
    offers?: { name: string; price: string; description: string }[];
  };
}

/** Helper: normalize a strength to always have title + detail */
export function normalizeStrength(s: string | DiagnosticStrength): DiagnosticStrength {
  if (typeof s === "string") return { title: s };
  return s;
}

export function computeDiagnosticData(
  answers: { canaux: string[]; instagram: string; website: string },
  brandingAnswers: {
    positioning: string; mission: string; target_description: string;
    tone_keywords: string[]; offers: { name: string }[]; values: string[];
  }
): DiagnosticData {
  let filled = 0;
  if (brandingAnswers.positioning?.trim()) filled++;
  if (brandingAnswers.mission?.trim()) filled++;
  if (brandingAnswers.target_description?.trim()) filled++;
  if (brandingAnswers.tone_keywords?.length >= 2) filled++;
  if (brandingAnswers.offers?.some(o => o.name?.trim())) filled++;
  if (brandingAnswers.values?.filter(v => v?.trim()).length >= 2) filled++;
  const brandingScore = Math.round((filled / 6) * 100);

  const hasIg = answers.canaux.includes("instagram");
  const hasWeb = answers.canaux.includes("website");
  const hasNl = answers.canaux.includes("newsletter");
  const hasLi = answers.canaux.includes("linkedin");

  const igScore = hasIg ? (answers.instagram ? 45 : 20) : null;
  const webScore = hasWeb ? (answers.website ? 40 : 15) : null;
  const nlScore = hasNl ? 15 : null;

  const all = [brandingScore, igScore, webScore, nlScore].filter((s): s is number => s !== null);
  const totalScore = all.length > 0 ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : brandingScore;

  const strengths: string[] = [];
  if (brandingAnswers.positioning?.trim()) strengths.push("Ton positionnement est clair et défini");
  if (brandingAnswers.mission?.trim()) strengths.push("Ta mission est identifiée — c'est ce qui donne du sens à ta com'");
  if (brandingAnswers.values?.filter(v => v?.trim()).length >= 2) strengths.push("Tes valeurs sont posées, c'est ta boussole");
  if (brandingAnswers.tone_keywords?.length >= 2) strengths.push("Ton ton de voix est défini — ta com' sera cohérente");
  if (answers.canaux.length > 1 && !answers.canaux.includes("none")) strengths.push("Tu es présente sur plusieurs canaux");

  const weaknesses: DiagnosticWeakness[] = [];
  if (hasIg && answers.instagram) weaknesses.push({ title: "Ton profil Instagram n'est pas encore optimisé", why: "Sans un profil travaillé, tu perds des visiteurs qui te découvrent." });
  if (!hasNl) weaknesses.push({ title: "Tu n'as pas de newsletter", why: "Ta liste email, c'est le seul endroit qu'Instagram ne peut pas te reprendre." });
  if (hasWeb && !answers.website) weaknesses.push({ title: "Ton site web n'est pas renseigné", why: "Sans site, tu dépends à 100% des réseaux sociaux." });
  if (!brandingAnswers.target_description?.trim()) weaknesses.push({ title: "Ta cible n'est pas assez définie", why: "Sans cible claire, tes contenus parlent à tout le monde (donc à personne)." });
  if (weaknesses.length < 2) weaknesses.push({ title: "Ta stratégie de contenu manque de structure", why: "Publier sans plan, c'est comme naviguer sans GPS." });

  const priorities: DiagnosticData["priorities"] = [];
  if (hasIg) priorities.push({ title: "Optimise ton profil Instagram", channel: "instagram", impact: "high", time: "20 min", route: "/instagram/profil" });
  if (brandingScore < 80) priorities.push({ title: "Complète ton branding", channel: "branding", impact: "high", time: "30 min", route: "/branding" });
  if (!hasNl) priorities.push({ title: "Lance ta newsletter", channel: "newsletter", impact: "medium", time: "45 min", route: "/site/capture" });
  else if (hasWeb) priorities.push({ title: "Améliore ton site web", channel: "website", impact: "medium", time: "30 min", route: "/site/accueil" });
  if (hasLi) priorities.push({ title: "Optimise ton profil LinkedIn", channel: "linkedin", impact: "medium", time: "25 min", route: "/linkedin/profil" });

  const channelScores: DiagnosticData["channelScores"] = [
    { emoji: "🎨", label: "Branding", score: brandingScore },
  ];
  if (hasIg) channelScores.push({ emoji: "📱", label: "Instagram", score: igScore });
  if (hasWeb) channelScores.push({ emoji: "🌐", label: "Site web", score: webScore });
  if (hasNl) channelScores.push({ emoji: "✉️", label: "Newsletter", score: nlScore });
  if (hasLi) channelScores.push({ emoji: "💼", label: "LinkedIn", score: null });

  return {
    totalScore,
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    priorities: priorities.slice(0, 3),
    channelScores,
    scores: { total: totalScore, branding: brandingScore, instagram: igScore, website: webScore, linkedin: null },
  };
}

export function getScoreMessage(score: number): string {
  if (score < 30) return "On part de loin, mais franchement c'est normal. La plupart des créatrices en sont là au début.";
  if (score < 50) return "T'as déjà posé des choses. Il manque de la structure et quelques optimisations clés.";
  if (score < 70) return "T'as de bonnes bases. Avec quelques ajustements ciblés, on peut aller beaucoup plus loin.";
  if (score < 85) return "Franchement, c'est solide. On va peaufiner les détails qui font la différence.";
  return "Impressionnant. Y'a plus qu'à maintenir le cap et optimiser.";
}

export const DEMO_DIAGNOSTIC: DiagnosticData = {
  totalScore: 62,
  summary: "Tu es photographe portraitiste pour entrepreneures. Tes photos sont magnifiques et ton œil est unique — tu ne fais pas juste des photos, tu captures la confiance. Ton positionnement est clair dans ta tête, mais il ne ressort pas assez dans ta communication en ligne.",
  strengths: [
    { title: "Ton positionnement est clair et différenciant", detail: "\"Photographe de confiance\" — tu ne vends pas des photos, tu vends une transformation. C'est rare et puissant.", source: "profile" },
    { title: "Tes photos sont de qualité pro", detail: "Le coaching posture inclus dans tes séances te différencie de 99% des photographes.", source: "instagram" },
    { title: "Tu as déjà un site web actif", detail: "Ton site existe et montre ton travail. C'est une base solide qu'on va optimiser.", source: "website" },
    { title: "Ton ton est authentique et cohérent", detail: "Tu parles comme une amie qui sait de quoi elle parle. C'est exactement le bon registre.", source: "profile" },
  ],
  weaknesses: [
    { title: "Ta bio Instagram manque de mots-clés", why: "Les gens cherchent 'photographe portrait femmes', pas juste 'photographe'. Ajoute ces mots.", detail: "Ta bio actuelle dit seulement \"📸 Photographe\" — c'est trop vague pour l'algorithme.", source: "instagram", fix_hint: "Ajoute ta spécialité + ta ville dans ta bio." },
    { title: "Tu postes de façon irrégulière", why: "2 posts en 3 semaines puis 5 en une semaine. L'algorithme préfère la régularité.", source: "instagram", fix_hint: "Planifie 3 posts/semaine dans ton calendrier." },
    { title: "Pas de CTA dans tes légendes", why: "Tes légendes sont belles mais ne disent jamais quoi faire ensuite.", source: "instagram", fix_hint: "Termine chaque légende par une question ou un appel à l'action." },
    { title: "Pas de page Témoignages sur ton site", why: "La preuve sociale, c'est ce qui transforme les visiteuses en clientes.", source: "website", fix_hint: "Crée une section témoignages avec 3-5 retours clients." },
  ],
  priorities: [
    { title: "Optimise ta bio Instagram", channel: "instagram", impact: "high", time: "5 min", route: "/instagram/profil/bio", why: "C'est la première chose que voient tes visiteurs." },
    { title: "Crée un calendrier de publication régulier", channel: "instagram", impact: "high", time: "20 min", route: "/calendrier", why: "La régularité est le facteur n°1 de croissance." },
    { title: "Ajoute des CTA dans tes légendes", channel: "instagram", impact: "medium", time: "2 min/post", route: "/creer", why: "Sans CTA, tes posts ne convertissent pas." },
  ],
  channelScores: [
    { emoji: "📱", label: "Instagram", score: 58 },
    { emoji: "🌐", label: "Site web", score: 71 },
    { emoji: "✉️", label: "Newsletter", score: 12 },
    { emoji: "🎨", label: "Branding", score: 85 },
  ],
  scores: { total: 62, branding: 85, instagram: 58, website: 71, linkedin: null },
};

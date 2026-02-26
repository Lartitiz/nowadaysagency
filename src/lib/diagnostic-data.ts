export interface DiagnosticData {
  totalScore: number;
  strengths: string[];
  weaknesses: { title: string; why: string }[];
  priorities: {
    title: string;
    channel: string;
    impact: "high" | "medium" | "low";
    time: string;
    route: string;
  }[];
  channelScores: { emoji: string; label: string; score: number | null }[];
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

  const weaknesses: { title: string; why: string }[] = [];
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
  strengths: [
    "Ton positionnement est clair et différenciant",
    "Tes photos sont de qualité pro (forcément 😉)",
    "Tu as déjà un site web actif",
    "Ton ton est authentique et cohérent",
  ],
  weaknesses: [
    { title: "Ta bio Instagram manque de mots-clés", why: "Les gens cherchent 'photographe portrait femmes', pas juste 'photographe'. Ajoute ces mots." },
    { title: "Tu postes de façon irrégulière", why: "2 posts en 3 semaines puis 5 en une semaine. L'algorithme préfère la régularité." },
    { title: "Pas de CTA dans tes légendes", why: "Tes légendes sont belles mais ne disent jamais quoi faire ensuite." },
    { title: "Pas de page Témoignages sur ton site", why: "La preuve sociale, c'est ce qui transforme les visiteuses en clientes." },
    { title: "Newsletter pas en place", why: "C'est le canal qui t'appartient. Instagram peut changer ses règles demain." },
  ],
  priorities: [
    { title: "Optimise ta bio Instagram", channel: "instagram", impact: "high", time: "5 min", route: "/instagram/bio" },
    { title: "Crée un calendrier de publication régulier", channel: "instagram", impact: "high", time: "20 min", route: "/calendar" },
    { title: "Ajoute des CTA dans tes légendes", channel: "instagram", impact: "medium", time: "2 min/post", route: "/creer" },
  ],
  channelScores: [
    { emoji: "📱", label: "Instagram", score: 58 },
    { emoji: "🌐", label: "Site web", score: 71 },
    { emoji: "✉️", label: "Newsletter", score: 12 },
    { emoji: "🎨", label: "Branding", score: 85 },
  ],
};

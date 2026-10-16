// ── Launch template definitions ──

export interface LaunchPhaseTemplate {
  name: string;
  label: string;
  emoji: string;
  defaultDurationDays: number;
}

export interface LaunchTemplate {
  id: string;
  label: string;
  emoji: string;
  duration: string;
  description: string;
  idealFor: string;
  contentRange: string;
  phases: LaunchPhaseTemplate[];
  ratioByPhase?: Record<string, { valeur: number; vente: number }>;
}

export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  {
    id: "express",
    label: "Plan express",
    emoji: "⚡",
    duration: "1-2 semaines",
    description: "2 phases rapides pour un impact immédiat.",
    idealFor: "Drop produit, promo flash, annonce rapide",
    contentRange: "~8-10 contenus",
    phases: [
      { name: "teasing", label: "Teasing", emoji: "👀", defaultDurationDays: 4 },
      { name: "vente", label: "Révélation & vente", emoji: "🔥", defaultDurationDays: 4 },
    ],
    ratioByPhase: {
      teasing: { valeur: 70, vente: 30 },
      vente: { valeur: 20, vente: 80 },
    },
  },
  {
    id: "moyen",
    label: "Plan moyen",
    emoji: "📅",
    duration: "3-4 semaines",
    description: "4 phases pour un lancement structuré et progressif.",
    idealFor: "Nouvelle offre, collection, programme",
    contentRange: "~12-15 contenus",
    phases: [
      { name: "pre_lancement", label: "Pré-lancement / prise de conscience", emoji: "🌱", defaultDurationDays: 7 },
      { name: "chauffage", label: "Chauffage / exploration", emoji: "🔥", defaultDurationDays: 7 },
      { name: "vente", label: "Lancement / vente ouverte", emoji: "💰", defaultDurationDays: 7 },
      { name: "closing", label: "Objections & closing", emoji: "⏰", defaultDurationDays: 7 },
    ],
    ratioByPhase: {
      pre_lancement: { valeur: 90, vente: 10 },
      chauffage: { valeur: 70, vente: 30 },
      vente: { valeur: 30, vente: 70 },
      closing: { valeur: 20, vente: 80 },
    },
  },
  {
    id: "long",
    label: "Plan long",
    emoji: "🚀",
    duration: "6-8 semaines",
    description: "7 phases avec mini-fiction intégrée pour un maximum d'impact.",
    idealFor: "Formation, programme signature, offre > 500€",
    contentRange: "~20-25 contenus",
    phases: [
      { name: "preparation", label: "Préparation du terrain", emoji: "📚", defaultDurationDays: 14 },
      { name: "probleme", label: "Le problème", emoji: "😤", defaultDurationDays: 7 },
      { name: "solution", label: "La solution sans vendre", emoji: "🔍", defaultDurationDays: 7 },
      { name: "teasing", label: "Teasing & build-up", emoji: "👀", defaultDurationDays: 7 },
      { name: "revelation", label: "Révélation & ouverture", emoji: "🔥", defaultDurationDays: 7 },
      { name: "vente_active", label: "Vente active", emoji: "💰", defaultDurationDays: 7 },
      { name: "closing", label: "Closing & célébration", emoji: "⏰", defaultDurationDays: 5 },
    ],
    ratioByPhase: {
      preparation: { valeur: 100, vente: 0 },
      probleme: { valeur: 80, vente: 20 },
      solution: { valeur: 70, vente: 30 },
      teasing: { valeur: 50, vente: 50 },
      revelation: { valeur: 30, vente: 70 },
      vente_active: { valeur: 20, vente: 80 },
      closing: { valeur: 10, vente: 90 },
    },
  },
  {
    id: "soft",
    label: "Lancement doux",
    emoji: "🌱",
    duration: "Pas de durée fixe",
    description: "Un lancement doux, sans plan formel. Mentions naturelles et messages privés personnalisés.",
    idealFor: "Test de marché, petite audience, première offre",
    contentRange: "Rappels + guide",
    phases: [
      { name: "soft", label: "Lancement doux", emoji: "🌱", defaultDurationDays: 14 },
    ],
  },
  {
    id: "evenementiel",
    label: "Lancement événementiel",
    emoji: "🎪",
    duration: "3-5 semaines",
    description: "Articulé autour d'un événement (challenge, masterclass, webinaire).",
    idealFor: "Challenge, masterclass, webinaire, live",
    contentRange: "~12-18 contenus",
    phases: [
      { name: "promotion", label: "Promotion de l'événement", emoji: "📣", defaultDurationDays: 14 },
      { name: "evenement", label: "L'événement", emoji: "🎪", defaultDurationDays: 5 },
      { name: "vente_post", label: "Vente post-événement", emoji: "🔥", defaultDurationDays: 7 },
    ],
    ratioByPhase: {
      promotion: { valeur: 80, vente: 20 },
      evenement: { valeur: 60, vente: 40 },
      vente_post: { valeur: 20, vente: 80 },
    },
  },
  {
    id: "evergreen",
    label: "Evergreen + mini-lancements",
    emoji: "♾️",
    duration: "Permanent + trimestriel",
    description: "Un système permanent avec des mini-lancements saisonniers (mars, juin, sept, déc).",
    idealFor: "Offre permanente ou récurrente",
    contentRange: "~6-8 contenus / mini-lancement",
    phases: [
      { name: "reactivation", label: "Réactiver le problème + teasing", emoji: "🔥", defaultDurationDays: 7 },
      { name: "ouverture", label: "Ouverture + vente + FAQ", emoji: "💰", defaultDurationDays: 7 },
      { name: "closing", label: "Closing + accueil", emoji: "🎉", defaultDurationDays: 5 },
    ],
    ratioByPhase: {
      reactivation: { valeur: 80, vente: 20 },
      ouverture: { valeur: 30, vente: 70 },
      closing: { valeur: 20, vente: 80 },
    },
  },
];

// ── Content types used in slots ──

export interface ContentTypeInfo {
  id: string;
  emoji: string;
  label: string;
  category: "visibilite" | "confiance" | "vente" | "post_lancement";
}

export const CONTENT_TYPES: ContentTypeInfo[] = [
  // Visibilité
  { id: "coup_de_gueule_doux", emoji: "🔥", label: "Coup de gueule doux", category: "visibilite" },
  { id: "conseil_contre_intuitif", emoji: "💡", label: "Conseil contre-intuitif", category: "visibilite" },
  { id: "enigme_teaser", emoji: "🧩", label: "Énigme / teaser", category: "visibilite" },
  { id: "tendance", emoji: "📈", label: "Tendance / sujet du moment", category: "visibilite" },
  // Confiance
  { id: "storytelling_personnel", emoji: "📖", label: "Histoire personnelle", category: "confiance" },
  { id: "coulisses", emoji: "👀", label: "Coulisses", category: "confiance" },
  { id: "educatif_autorite", emoji: "🎓", label: "Contenu éducatif", category: "confiance" },
  { id: "question_engagement", emoji: "💬", label: "Question / sondage", category: "confiance" },
  { id: "valeurs_combat", emoji: "🌱", label: "Valeurs / combat", category: "confiance" },
  // Vente
  { id: "annonce_revelation", emoji: "🚀", label: "Annonce / révélation", category: "vente" },
  { id: "presentation_offre", emoji: "🎁", label: "Présentation de l'offre", category: "vente" },
  { id: "objections_faq", emoji: "🛡️", label: "Objections / FAQ", category: "vente" },
  { id: "preuve_sociale", emoji: "🏆", label: "Preuve sociale", category: "vente" },
  { id: "pour_qui", emoji: "🎯", label: "Pour qui c'est / pour qui c'est pas", category: "vente" },
  { id: "derniere_chance", emoji: "⏰", label: "Dernière chance", category: "vente" },
  { id: "bonus_early_bird", emoji: "📦", label: "Bonus / early bird", category: "vente" },
  // Nouveaux types
  { id: "story_sequence_vente", emoji: "📱", label: "Séquence stories vente", category: "vente" },
  { id: "story_sequence_faq", emoji: "❓", label: "Séquence stories FAQ", category: "vente" },
  { id: "story_sequence_temoignage", emoji: "💬", label: "Séquence stories témoignage", category: "vente" },
  { id: "story_sequence_objection", emoji: "🛡️", label: "Séquence stories objection", category: "vente" },
  { id: "story_sequence_last_call", emoji: "⏰", label: "Séquence stories dernière chance", category: "vente" },
  { id: "story_sequence_bienvenue", emoji: "🎉", label: "Séquence stories accueil", category: "post_lancement" },
  { id: "live_qa", emoji: "🎤", label: "Live Q&A", category: "confiance" },
  { id: "dm_strategiques", emoji: "💌", label: "Messages privés stratégiques", category: "vente" },
  { id: "diagnostic", emoji: "🔍", label: "Diagnostic / 5 signes que...", category: "visibilite" },
  { id: "comparatif", emoji: "⚖️", label: "Comparatif avant/après", category: "confiance" },
  { id: "mini_fiction", emoji: "📖", label: "Mini-fiction (chapitre)", category: "confiance" },
  // Post-lancement
  { id: "remerciement", emoji: "🙏", label: "Remerciement", category: "post_lancement" },
  { id: "bilan", emoji: "📊", label: "Bilan / retour d'expérience", category: "post_lancement" },
];

// Story sequence templates for when a slot is a story_sequence_* type
export const STORY_SEQUENCE_TEMPLATES: Record<string, { label: string; stories: { title: string; description: string }[] }> = {
  story_sequence_vente: {
    label: "Séquence vente — 7 stories",
    stories: [
      { title: "Contexte émotionnel", description: "\"Bon, faut que je te parle d'un truc.\"" },
      { title: "Problème + sondage", description: "Nommer le problème. Sondage : \"Ça te parle ?\"" },
      { title: "Solution", description: "\"Ce qui change tout, c'est [concept clé].\"" },
      { title: "L'offre", description: "\"C'est pour ça que j'ai créé [offre].\"" },
      { title: "Preuve", description: "Témoignage en capture d'écran + contexte" },
      { title: "Interaction", description: "Sondage : \"Tu veux les détails en message privé ?\"" },
      { title: "Appel à l'action", description: "\"Écris [MOT-CLÉ] en message privé\"" },
    ],
  },
  story_sequence_faq: {
    label: "Séquence FAQ — 6 stories",
    stories: [
      { title: "Intro", description: "\"Les questions qu'on me pose le plus souvent\"" },
      { title: "Question 1", description: "Question fréquente + réponse claire" },
      { title: "Question 2", description: "Question fréquente + réponse claire" },
      { title: "Question 3", description: "Question fréquente + réponse honnête" },
      { title: "Récap", description: "\"Si tu as d'autres questions, écris-moi\"" },
      { title: "Appel à l'action", description: "Lien vers page de vente ou message privé" },
    ],
  },
  story_sequence_temoignage: {
    label: "Séquence témoignage — 5 stories",
    stories: [
      { title: "Contexte", description: "\"Je voulais te partager le parcours de [prénom]\"" },
      { title: "Avant", description: "Situation avant (avec permission)" },
      { title: "Le déclic", description: "Ce qui a changé" },
      { title: "Après", description: "Résultats concrets" },
      { title: "Appel à l'action doux", description: "\"Si ça te parle aussi...\"" },
    ],
  },
  story_sequence_objection: {
    label: "Séquence objection killer — 6 stories",
    stories: [
      { title: "L'objection", description: "\"Je comprends celles qui pensent que...\"" },
      { title: "Validation", description: "\"C'est normal de penser ça\"" },
      { title: "Recadrage", description: "\"Voilà ce que j'ai observé\"" },
      { title: "Preuve", description: "Témoignage ou donnée concrète" },
      { title: "Permission", description: "\"C'est ok de prendre le temps de décider\"" },
      { title: "Option douce", description: "\"Si tu veux en savoir plus, écris-moi\"" },
    ],
  },
  story_sequence_last_call: {
    label: "Séquence dernière chance — 5 stories",
    stories: [
      { title: "Rappel", description: "\"Les inscriptions ferment demain/ce soir\"" },
      { title: "Récap", description: "Ce qui est inclus en 1 story" },
      { title: "Face cam", description: "Message personnel et sincère" },
      { title: "Compteur", description: "Sticker compte à rebours" },
      { title: "Appel à l'action final", description: "Lien direct vers inscription" },
    ],
  },
  story_sequence_bienvenue: {
    label: "Séquence accueil — 4 stories",
    stories: [
      { title: "Merci", description: "\"Merci à toutes celles qui ont rejoint\"" },
      { title: "Accueil", description: "\"Voici ce qui vous attend\"" },
      { title: "Prochaines étapes", description: "\"Première chose à faire...\"" },
      { title: "Liste d'attente", description: "\"Pour les autres, prochaine session : ...\"" },
    ],
  },
};

export const FORMAT_OPTIONS = [
  { id: "post_carrousel", label: "Carrousel" },
  { id: "post_photo", label: "Post photo" },
  { id: "reel", label: "Reel" },
  { id: "story_serie", label: "Story série" },
  { id: "story", label: "Story" },
  { id: "live", label: "Live" },
];

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  visibilite: { bg: "bg-[hsl(340,70%,96%)]", text: "text-[hsl(340,70%,45%)]", label: "👀 Visibilité" },
  confiance: { bg: "bg-[hsl(270,60%,96%)]", text: "text-[hsl(270,60%,45%)]", label: "🤝 Confiance" },
  vente: { bg: "bg-[hsl(45,80%,94%)]", text: "text-[hsl(45,80%,35%)]", label: "💰 Vente" },
  post_lancement: { bg: "bg-[hsl(140,50%,94%)]", text: "text-[hsl(140,50%,35%)]", label: "🌊 Post-lancement" },
};

export const PHASE_STYLES: Record<string, { bg: string; border: string; emoji: string; label: string }> = {
  planification: { bg: "bg-muted/40", border: "border-border", emoji: "📋", label: "Planification" },
  distribution: { bg: "bg-[hsl(210,60%,96%)]", border: "border-[hsl(210,60%,85%)]", emoji: "📣", label: "Distribution" },
  captation: { bg: "bg-[hsl(180,50%,95%)]", border: "border-[hsl(180,50%,85%)]", emoji: "🧲", label: "Captation" },
  pre_teasing: { bg: "bg-[hsl(270,60%,96%)]", border: "border-[hsl(270,60%,85%)]", emoji: "🌱", label: "Pré-teasing" },
  pre_lancement: { bg: "bg-[hsl(270,60%,96%)]", border: "border-[hsl(270,60%,85%)]", emoji: "🌱", label: "Pré-lancement" },
  chauffage: { bg: "bg-[hsl(340,70%,96%)]", border: "border-[hsl(340,70%,85%)]", emoji: "🔥", label: "Chauffage" },
  teasing: { bg: "bg-[hsl(340,70%,96%)]", border: "border-[hsl(340,70%,85%)]", emoji: "👀", label: "Teasing" },
  preparation: { bg: "bg-[hsl(210,60%,96%)]", border: "border-[hsl(210,60%,85%)]", emoji: "📚", label: "Préparation" },
  probleme: { bg: "bg-[hsl(0,60%,96%)]", border: "border-[hsl(0,60%,85%)]", emoji: "😤", label: "Le problème" },
  solution: { bg: "bg-[hsl(180,50%,95%)]", border: "border-[hsl(180,50%,85%)]", emoji: "🔍", label: "La solution" },
  revelation: { bg: "bg-[hsl(30,80%,95%)]", border: "border-[hsl(30,80%,80%)]", emoji: "🔥", label: "Révélation" },
  vente_active: { bg: "bg-[hsl(45,80%,94%)]", border: "border-[hsl(45,80%,80%)]", emoji: "💰", label: "Vente active" },
  promotion: { bg: "bg-[hsl(210,60%,96%)]", border: "border-[hsl(210,60%,85%)]", emoji: "📣", label: "Promotion" },
  evenement: { bg: "bg-[hsl(30,80%,95%)]", border: "border-[hsl(30,80%,80%)]", emoji: "🎪", label: "Événement" },
  vente_post: { bg: "bg-[hsl(45,80%,94%)]", border: "border-[hsl(45,80%,80%)]", emoji: "🔥", label: "Vente post-événement" },
  vente: { bg: "bg-[hsl(45,80%,94%)]", border: "border-[hsl(45,80%,80%)]", emoji: "🔥", label: "Vente" },
  closing: { bg: "bg-[hsl(0,50%,95%)]", border: "border-[hsl(0,50%,85%)]", emoji: "⏰", label: "Closing" },
  post_lancement: { bg: "bg-[hsl(140,50%,94%)]", border: "border-[hsl(140,50%,80%)]", emoji: "🌊", label: "Post-lancement" },
  soft: { bg: "bg-[hsl(140,50%,94%)]", border: "border-[hsl(140,50%,80%)]", emoji: "🌱", label: "Lancement doux" },
  reactivation: { bg: "bg-[hsl(340,70%,96%)]", border: "border-[hsl(340,70%,85%)]", emoji: "🔥", label: "Réactivation" },
  ouverture: { bg: "bg-[hsl(45,80%,94%)]", border: "border-[hsl(45,80%,80%)]", emoji: "💰", label: "Ouverture" },
};

export const TIME_OPTIONS = [
  { id: "0", label: "Pas de temps en plus (je fais avec mon temps habituel)", hours: 0 },
  { id: "1-2", label: "+1-2h/semaine", hours: 1.5 },
  { id: "3-5", label: "+3-5h/semaine", hours: 4 },
  { id: "5+", label: "+5h/semaine et plus (all in)", hours: 6 },
];

export const FALLBACK_TIME_OPTIONS = [
  { id: "1-2", label: "1-2h", hours: 1.5 },
  { id: "3-4", label: "3-4h", hours: 3.5 },
  { id: "5-6", label: "5-6h", hours: 5.5 },
  { id: "7+", label: "7h+", hours: 7 },
];

// ── Recommendation logic ──

export interface RecommendationAnswers {
  offerType: string;
  priceRange: string;
  audienceSize: string;
  recurrence: string;
  extraTime: string;
}

export function recommendLaunchModel(answers: RecommendationAnswers): string {
  const { offerType, priceRange, audienceSize, recurrence, extraTime } = answers;

  if (recurrence === "permanente") return "evergreen";
  if (recurrence === "recurrente") return "evergreen";

  if (priceRange === "<100") {
    return audienceSize === "<500" ? "soft" : "express";
  }

  if (priceRange === "100-500") {
    if (audienceSize === "<500") return "soft";
    if (extraTime === "0" || extraTime === "1-2") return "express";
    return "moyen";
  }

  if (priceRange === "500-2000" || priceRange === ">2000") {
    if (audienceSize === "<500") return "moyen";
    if (offerType === "evenement") return "evenementiel";
    if (extraTime === "5+") return "long";
    return "moyen";
  }

  return "moyen";
}

// ── Ethical guardrails checklist ──

export const ETHICAL_CHECKLIST = [
  { id: "no_fake_urgency", label: "Pas de fausse urgence" },
  { id: "no_shaming", label: "Pas de shaming" },
  { id: "no_guaranteed_results", label: "Pas de promesse de résultats garantis" },
  { id: "conversational_cta", label: "Appel à l'action conversationnel (pas agressif)" },
  { id: "value_without_purchase", label: "Le contenu a de la valeur même sans achat" },
];

// ── Pre-launch checklist ──

export const PRE_LAUNCH_CHECKLIST = [
  { id: "page_vente", label: "Page de vente prête et relue" },
  { id: "lien_paiement", label: "Lien de paiement/inscription fonctionnel" },
  { id: "stories_alaune", label: "Stories à la une mises à jour" },
  { id: "lien_bio", label: "Lien en bio mis à jour" },
  { id: "manychat", label: "ManyChat configuré (si utilisé)" },
  { id: "temoignages", label: "2-3 témoignages prêts à être partagés" },
  { id: "faq", label: "FAQ rédigée (5-10 questions)" },
  { id: "objectif_vente", label: "Objectif de vente fixé" },
  { id: "date_fermeture", label: "Date de fermeture choisie" },
  { id: "contenu_post", label: "Contenu post-lancement préparé" },
];

// ── Post-launch checklist ──

export const POST_LAUNCH_CHECKLIST = [
  { id: "stories_accueil", label: "Stories d'accueil publiées" },
  { id: "post_remerciement", label: "Post de remerciement publié" },
  { id: "liste_attente", label: "Liste d'attente mise en place" },
  { id: "metriques", label: "Métriques notées" },
  { id: "retrospective", label: "Rétrospective rédigée" },
  { id: "prochain_lancement", label: "Prochain mini-lancement daté" },
  { id: "repos", label: "REPOS PROGRAMMÉ 💤" },
];

// ── Slot interface ──

export interface LaunchSlot {
  id: string;
  date: string;
  phase: string;
  format: string;
  content_type: string;
  content_type_emoji: string;
  category: string;
  objective: string;
  angle_suggestion: string;
  chapter?: number;
  chapter_label?: string;
  audience_phase?: string;
  audience_phase_emoji?: string;
  story_sequence_detail?: any;
  ratio_category?: string;
}

export interface LaunchPhase {
  name: string;
  label: string;
  start_date: string;
  end_date: string;
  slots: LaunchSlot[];
}

export interface LaunchPlan {
  total_slots: number;
  estimated_weekly_hours: number;
  phases: LaunchPhase[];
}

// ── Offer type options ──

export const OFFER_TYPE_OPTIONS = [
  { id: "produit", emoji: "🎨", label: "Produit / collection / e-book" },
  { id: "atelier", emoji: "📅", label: "Atelier / workshop ponctuel" },
  { id: "formation", emoji: "📚", label: "Formation en ligne / programme" },
  { id: "accompagnement", emoji: "🤝", label: "Accompagnement / service" },
  { id: "evenement", emoji: "🎪", label: "Événement (challenge, masterclass)" },
];

export const PRICE_RANGE_OPTIONS = [
  { id: "<100", label: "< 100€" },
  { id: "100-500", label: "100 - 500€" },
  { id: "500-2000", label: "500 - 2 000€" },
  { id: ">2000", label: "> 2 000€" },
];

export const AUDIENCE_SIZE_OPTIONS = [
  { id: "<500", label: "< 500 abonné·es" },
  { id: "500-2000", label: "500 - 2 000" },
  { id: "2000-5000", label: "2 000 - 5 000" },
  { id: ">5000", label: "> 5 000" },
];

export const RECURRENCE_OPTIONS = [
  { id: "ponctuelle", label: "Ponctuelle (une seule fois)" },
  { id: "recurrente", label: "Récurrente (je la relance régulièrement)" },
  { id: "permanente", label: "Permanente (toujours disponible)" },
];

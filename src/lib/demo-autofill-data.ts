import type { AnalysisResult } from "@/components/branding/BrandingReview";

/**
 * Demo autofill data for Léa (photographe portraitiste).
 * Used when demo mode triggers import analysis.
 */
export const DEMO_AUTOFILL_RESULT: AnalysisResult = {
  story: {
    confidence: "high",
    origin: "J'ai commencé par les mariages, payée au lance-pierre, épuisée chaque weekend.",
    trigger: "Une cliente m'a dit « c'est la première fois que je me trouve belle en photo ». Ce jour-là j'ai compris : je ne fais pas des photos, je fais de la confiance.",
    struggles: "Sous-payée en mariage, épuisement, syndrome de l'imposteur en se lançant seule.",
    uniqueness: "Coaching posture inclus dans chaque séance — je ne photographie pas juste un visage, je capture une version de toi que tu n'as jamais vue.",
    vision: "Rendre visible celles qui n'osent pas se montrer. Quand une femme assume son image, elle assume aussi son business.",
    full_story: "J'ai commencé par les mariages. Payée au lance-pierre, épuisée chaque weekend. Un jour une cliente m'a dit « c'est la première fois que je me trouve belle en photo ». Ce jour-là j'ai compris : je ne fais pas des photos, je fais de la confiance. J'ai tout arrêté pour me spécialiser en portrait d'entrepreneures. Aujourd'hui, chaque séance commence par un coaching posture — parce que se sentir à l'aise, c'est la base d'une belle photo.",
  },
  persona: {
    confidence: "medium",
    name: "Marion",
    age_range: "30-45",
    job: "Femme entrepreneure (coaching, services, artisanat)",
    goals: ["Des images qui lui ressemblent", "Se sentir confiante et visible", "Du contenu pro pour ses réseaux"],
    frustrations: ["Ne se trouve pas photogénique", "Photos corporate sans âme", "Repousse toujours la séance"],
    desires: ["Oser se montrer sur Instagram", "Avoir des photos dont elle est fière", "Un accompagnement bienveillant"],
    channels: ["Instagram", "Newsletter", "Site web"],
    brands_they_follow: [],
  },
  value_proposition: {
    confidence: "high",
    key_phrase: "Des séances portrait avec coaching posture inclus — pour se sentir à l'aise devant l'objectif et obtenir des photos qui te ressemblent.",
    problem: "Les femmes entrepreneures repoussent leur séance photo parce qu'elles ne se trouvent pas photogéniques.",
    solution: "Un coaching posture intégré à chaque séance pour se sentir à l'aise et naturelle.",
    differentiator: "Je ne fais pas juste des photos : je capture la confiance. Coaching posture inclus, ambiance bienveillante, résultat authentique.",
    proofs: ["Témoignages clientes", "Avant/après émotionnels", "7 ans d'expérience"],
  },
  tone_style: {
    confidence: "medium",
    tone_keywords: ["chaleureux", "direct", "inspirant", "bienveillant"],
    i_do: ["Tutoyer", "Utiliser des métaphores visuelles", "Parler comme une amie", "Partager mes coulisses"],
    i_never_do: ["Jargon technique photo", "Ton corporate froid", "Promesses irréalistes", "Vocabulaire condescendant"],
    fights: ["L'industrie du paraître", "Les photos retouchées à outrance", "L'invisibilité des femmes entrepreneures"],
    visual_style: "Lumineux, naturel, chaleureux. Tons neutres et doux avec des touches de couleur.",
  },
  content_strategy: {
    confidence: "low",
    pillars: ["Coulisses de séances", "Confiance & transformation", "Tips photo"],
    creative_twist: "Le portrait comme acte de confiance — pas juste une image, une révélation.",
    formats: ["Carrousel", "Reel", "Stories"],
    rhythm: "3 posts/semaine + stories quotidiennes",
    editorial_line: "Montrer la transformation intérieure autant que le résultat visuel.",
  },
  offers: {
    confidence: "low",
    offers: [
      {
        name: "Séance Révélation",
        price: "450€",
        description: "Séance portrait de 2h. Coaching posture inclus. 15 photos retouchées.",
        target: "Entrepreneures qui débutent leur personal branding",
        promise: "Des photos dont tu es fière, prises dans la bienveillance.",
      },
      {
        name: "Pack Personal Branding",
        price: "890€",
        description: "Séance complète + photos pour site, réseaux et supports print.",
        target: "Entrepreneures confirmées qui veulent professionnaliser leur image",
        promise: "Un kit visuel complet pour ta com', en une journée.",
      },
    ],
  },
  sources_used: ["website", "instagram"],
  sources_failed: ["linkedin"],
  overall_confidence: "medium",
  missing_info: "LinkedIn inaccessible. Stratégie de contenu et offres à affiner.",
};

// Question de rattrapage d'une carte vide de la relecture (choix de Laetitia du
// 23/10/2026) : quand l'analyse n'a rien trouvé, la carte le dit, pose UNE
// question courte (champ + micro) et propose « Plus tard ». La réponse est
// enregistrée telle quelle, sans passer par l'IA (0 crédit), dans le champ que
// la carte affiche et que `SAVE_FNS` sait écrire.
import type { AnalysisResult, SectionKey } from "./types";

export interface CatchUpQuestion {
  /** Ce qui manque, dit franchement. */
  missing: string;
  question: string;
  placeholder: string;
  /** Réponse → données de la section, au format de l'analyse. */
  toData: (answer: string) => Record<string, unknown>;
}

/** « a, b et c » / une ligne par sujet → ["a", "b", "c"]. */
export function splitList(answer: string): string[] {
  return answer.split(/[,;\n]|\set\s/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

export const CATCH_UP: Record<SectionKey, CatchUpQuestion> = {
  story: {
    missing: "Je n'ai rien trouvé sur ton histoire.",
    question: "En deux phrases, comment ton activité a commencé ?",
    placeholder: "Ex : J'ai ouvert mon atelier après dix ans dans un bureau, parce que…",
    toData: (a) => ({ full_story: a }),
  },
  persona: {
    missing: "Je n'ai rien trouvé sur les personnes que tu aides.",
    question: "Pour qui tu travailles ? Décris cette personne en une phrase.",
    placeholder: "Ex : des parents débordés qui veulent cuisiner sain sans y passer la soirée",
    toData: (a) => ({ description: a }),
  },
  value_proposition: {
    missing: "Je n'ai rien trouvé sur ce que tu apportes.",
    question: "En une phrase : qu'est-ce que tu apportes, et à qui ?",
    placeholder: "Ex : J'aide les petites marques de mode à vendre en ligne sans y perdre leurs soirées",
    toData: (a) => ({ key_phrase: a }),
  },
  tone_style: {
    missing: "Je n'ai rien trouvé sur ta façon de parler.",
    question: "Comment tu parles à ton public ? Trois mots suffisent.",
    placeholder: "Ex : chaleureux, direct, un peu d'humour",
    toData: (a) => ({ voice_description: a }),
  },
  content_strategy: {
    missing: "Je n'ai rien trouvé sur les sujets de tes contenus.",
    question: "De quoi tu veux parler dans tes contenus ? Deux ou trois sujets.",
    placeholder: "Ex : les coulisses, mes conseils, les histoires de mes clients",
    toData: (a) => ({ pillars: splitList(a) }),
  },
  offers: {
    missing: "Je n'ai rien trouvé sur ce que tu vends.",
    question: "Qu'est-ce que tu vends ? Le nom suffit, ajoute le prix si tu l'as.",
    placeholder: "Ex : Atelier découverte, 45 €",
    toData: (a) => ({ offers: [{ name: a.split("\n")[0].trim().slice(0, 120) }] }),
  },
  charter: {
    missing: "Je n'ai rien trouvé sur l'ambiance visuelle de ta marque.",
    question: "Trois mots pour l'ambiance de ta marque ?",
    placeholder: "Ex : douce, naturelle, lumineuse",
    toData: (a) => ({ mood_keywords: splitList(a) }),
  },
};

/** Données de la section une fois la réponse ajoutée à l'analyse. */
export function withAnswer(key: SectionKey, current: AnalysisResult[SectionKey] | undefined, answer: string) {
  return { ...(current || {}), ...CATCH_UP[key].toData(answer.trim()) } as NonNullable<AnalysisResult[SectionKey]>;
}

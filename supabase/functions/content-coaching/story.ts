// « Je te pose des questions » (écran Idée de /creer, demande de Laetitia du 14/11/2026).
//
// But : écrire des posts storytelling qui fonctionnent. Une histoire qui marche,
// c'est une scène précise, une phrase entendue, un ressenti, un déclic : l'IA ne
// peut pas l'inventer, elle peut seulement le faire raconter. D'où 4 questions
// dans cet ordre, adaptées à chaque personne à partir de sa fiche (métier,
// clientes, offres, histoires déjà publiées).
//
// Deux appels gratuits (comptés dans le plafond des étapes gratuites, comme les
// questions de l'étape Précisions) :
//   - story_questions : les 4 questions adaptées ;
//   - story_idea : un titre et un angle tirés de SES réponses.
// Ses réponses voyagent ensuite jusqu'à l'écriture comme matière vécue
// (src/lib/story-questions.ts) : le crédit est débité à la génération du contenu.
//
// Si l'IA échoue ou rend une question illisible, la question générale du même
// temps la remplace : la fenêtre ne reste jamais vide.

import { hasVouvoiement } from "../_shared/questions-form.ts";

// Forme PROPRE aux questions d'histoire, plus stricte que celle des Précisions
// (_shared/questions-form.ts, assouplie le 14/11/2026 à 30 mots et « matière
// concrète » chiffrée, #1980). Essai réel du 14/11 avec cette forme commune :
// questions de 28 à 35 mots, deux demandes en une, exemples inventés (« dix posts
// par semaine »). Une histoire se raconte mieux avec une question simple.
export const STORY_QUESTION_MAX_WORDS = 18;
export const STORY_PLACEHOLDER_MAX_WORDS = 9;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Vrai si la question d'histoire est illisible : trop longue, parenthèses, deux questions ou deux demandes. */
export function storyQuestionTooHeavy(question: string): boolean {
  const q = question.trim();
  return words(q) > STORY_QUESTION_MAX_WORDS
    || /[()]/.test(q)
    || (q.match(/\?/g) || []).length > 1
    || /[,;]?\s+et\s+(qu['’]|que\b|quel|quoi|comment|pourquoi|as-tu|est-ce)/i.test(q);
}

/** Vrai si l'exemple de réponse est trop long ou affirme un détail précis (chiffre). */
export function storyPlaceholderTooSpecific(placeholder: string): boolean {
  return words(placeholder) > STORY_PLACEHOLDER_MAX_WORDS || /\d/.test(placeholder);
}

const STORY_FORM_RULES = `

FORME (PRIORITAIRE) :
- Une seule phrase de 18 mots au plus. Vise 10 à 14 mots.
- Une seule chose demandée : jamais « et qu'est-ce que… » ni deux questions en une.
- Pas de parenthèses, pas de liste d'options, pas de jargon.
- placeholder : un début de réponse vague de 9 mots au plus, sans chiffre ni détail précis, pour l'aider à démarrer.
Exemples pour une fleuriste, un AUTRE métier : ne les recopie jamais, trouve les mots du métier de cette entrepreneuse.
Trop lourd : « Pense à la dernière mariée qui hésitait sur ses fleurs : qu'est-ce qu'elle t'a dit qui t'a fait comprendre son doute ? »
Juste : « Raconte-moi le dernier bouquet de mariée qui t'a donné du fil à retordre. »
Trop lourd : « Quel geste de ta méthode a tout changé, et que veux-tu que tes lectrices en retiennent ? »
Juste : « Qu'est-ce que tu aimerais que tes lectrices retiennent de ce bouquet ? »
Placeholder inventé : « Elle voulait trente pivoines blanches en décembre. » Placeholder juste : « Ce matin-là, elle est arrivée avec… »`;

export type StoryBeat = "scene" | "paroles" | "ressenti" | "declic";
export const STORY_BEATS: StoryBeat[] = ["scene", "paroles", "ressenti", "declic"];

export interface StoryQuestion { id: StoryBeat; question: string; placeholder: string }

/** Questions générales : repli quand la fiche est vide ou l'IA en échec. Même texte côté site. */
export const GENERIC_STORY_QUESTIONS: StoryQuestion[] = [
  { id: "scene", question: "Raconte-moi un moment récent qui t'a marquée dans ton travail.", placeholder: "Le jour, le lieu, ce qui s'est passé." },
  { id: "paroles", question: "Qu'est-ce qui a été dit, mot pour mot ?", placeholder: "Sa phrase, puis ta réponse." },
  { id: "ressenti", question: "Qu'as-tu ressenti sur le moment ?", placeholder: "Agacée, touchée, surprise…" },
  { id: "declic", question: "Qu'est-ce que tu veux que tes lectrices en retiennent ?", placeholder: "Ce que tu en as tiré, en une phrase." },
];

export const STORY_QUESTIONS_TOOL = {
  name: "story_questions",
  description: "Les 4 questions qui font raconter une histoire vraie, dans l'ordre scène, paroles, ressenti, déclic.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: STORY_BEATS },
            question: { type: "string" },
            placeholder: { type: "string" },
          },
          required: ["id", "question", "placeholder"],
        },
      },
    },
    required: ["questions"],
  },
};

export function storyQuestionsSystem(): string {
  return `Tu aides une entrepreneuse à trouver une histoire vraie à raconter dans un post. Tu ne l'écris pas : tu lui poses 4 questions qui la font raconter.

LES 4 TEMPS, DANS CET ORDRE (un id par question) :
1. scene : lui faire retrouver UN moment précis et récent de son travail. Ancre la question dans SON métier et SES clientes, avec un mot concret de son quotidien (un objet, un lieu, un type de rendez-vous). Exemples selon le métier : « Raconte-moi la dernière visite d'un bien qui t'a surprise. » ; « Raconte-moi la dernière pièce qui a raté au four. »
2. paroles : ce qui a été dit, mot pour mot, par la personne en face ou par elle.
3. ressenti : ce qu'elle a ressenti sur le moment.
4. declic : ce que ça a changé, ou ce qu'elle veut que ses lectrices en retiennent.

RÈGLES :
- Tutoie-la toujours (« ton », « tes », « tu »), jamais « vous ».
- Ne suppose aucun fait : la question demande, elle n'affirme pas ce qui s'est passé.
- Évite les histoires listées comme déjà racontées : oriente la scène vers un autre type de moment.
- Accorde selon ce que dit la fiche sur ses clientes ; sinon reste neutre (« une personne », « la personne en face »).
- Ne décris pas la personne en face ni son problème (pas de « qui n'arrivait pas à… », « qui se cache ») : c'est elle qui le racontera.${STORY_FORM_RULES}`;
}

export function storyQuestionsUser(context: string, alreadyTold: string): string {
  return `FICHE DE L'ENTREPRENEUSE :\n${context}\n\nHISTOIRES ET SUJETS DÉJÀ RACONTÉS (à ne pas refaire) :\n${alreadyTold || "aucun"}\n\nÉcris les 4 questions.`;
}

const clean = (v: unknown, max: number) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Garde une question de l'IA seulement si elle est lisible et tutoie ; sinon la question générale du même temps. */
export function normalizeStoryQuestions(raw: unknown): StoryQuestion[] {
  const list = Array.isArray((raw as any)?.questions) ? (raw as any).questions : [];
  return STORY_BEATS.map((id, i) => {
    const fromAi = list.find((q: any) => q?.id === id) ?? list[i];
    const question = clean(fromAi?.question, 220);
    const placeholder = clean(fromAi?.placeholder, 140);
    const ok = question.length >= 8 && (question.endsWith("?") || question.endsWith("."));
    if (!ok || storyQuestionTooHeavy(question) || hasVouvoiement(`${question}\n${placeholder}`)) return GENERIC_STORY_QUESTIONS[i];
    return { id, question, placeholder: placeholder && !storyPlaceholderTooSpecific(placeholder) ? placeholder : GENERIC_STORY_QUESTIONS[i].placeholder };
  });
}

export const STORY_IDEA_TOOL = {
  name: "story_idea",
  description: "Le titre et l'angle du post tirés de l'histoire racontée.",
  input_schema: {
    type: "object",
    properties: {
      titre: { type: "string", description: "Le sujet du post, 12 mots au plus, tiré de sa scène." },
      angle: { type: "string", description: "Ce que le post fait comprendre, une phrase de 25 mots au plus, tirée de son déclic." },
    },
    required: ["titre", "angle"],
  },
};

export function storyIdeaSystem(): string {
  return `Une entrepreneuse vient de raconter un moment vécu en répondant à des questions. Tu en tires le sujet d'un post storytelling.

- titre : 12 mots au plus, concret, tiré de SA scène (un détail, une phrase entendue). Pas de formule de magazine, pas de deux-points.
- angle : une phrase de 25 mots au plus qui dit ce que le post fait comprendre, tirée de son déclic ou de son ressenti.
- N'ajoute aucun fait, chiffre, prénom ou détail qu'elle n'a pas donné. Reprends ses mots quand c'est possible.
- Écris en français courant, sans tiret long.`;
}

export function storyIdeaUser(pairs: Array<{ question: string; answer: string }>): string {
  return `SES RÉPONSES :\n${pairs.map((p) => `- ${p.question}\n  ${p.answer}`).join("\n")}`;
}

/** Réponses envoyées par le site : texte borné, réponses vides retirées. */
export function readStoryAnswers(raw: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4)
    .map((p: any) => ({ question: clean(p?.question, 240), answer: typeof p?.answer === "string" ? p.answer.trim().slice(0, 2000) : "" }))
    .filter((p) => p.question && p.answer);
}

/** Repli sans IA : début de la scène comme titre, déclic comme angle. */
export function fallbackStoryIdea(pairs: Array<{ question: string; answer: string }>): { titre: string; angle: string } {
  const firstSentence = (s: string) => (s.split(/(?<=[.!?…])\s/)[0] || s).trim();
  const cut = (s: string, words: number) => { const w = s.split(/\s+/); return w.length > words ? w.slice(0, words).join(" ") + "…" : s; };
  const scene = pairs[0]?.answer || "";
  const declic = pairs[pairs.length - 1]?.answer || "";
  return { titre: cut(firstSentence(scene), 14), angle: pairs.length > 1 ? cut(firstSentence(declic), 30) : "" };
}

export function normalizeStoryIdea(raw: unknown, pairs: Array<{ question: string; answer: string }>): { titre: string; angle: string } {
  const titre = clean((raw as any)?.titre, 140).replace(/\s*[—–]\s*/g, ", ");
  const angle = clean((raw as any)?.angle, 260).replace(/\s*[—–]\s*/g, ", ");
  if (titre.length < 4) return fallbackStoryIdea(pairs);
  return { titre, angle };
}

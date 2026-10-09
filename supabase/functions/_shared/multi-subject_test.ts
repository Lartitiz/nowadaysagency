import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RECAP_PREFIX, isRecapBrief, multiSubjectChoicePending, recapHooksLine, recapReelBlock, recapStoriesBlock, splitBriefSubjects, stripRecapPrefix } from "./multi-subject.ts";
import { reelBrief, storiesBrief } from "./format-briefs.ts";

// Note de veille réelle (09/10/2026) : 4 sujets, seul le 1er était traité.
const VEILLE = `1. L'info à surveiller : les Reels de plus de 3 minutes pourraient toucher des non-abonné·es

Rachel Karten affirme qu'Instagram teste la recommandation des Reels de plus de 3 minutes à des gens qui ne te suivent pas. Jusqu'ici, au-delà de 3 minutes, la vidéo ne sortait pas de ta communauté.

Statut : c'est un test qu'elle rapporte en exclusivité, pas une annonce officielle de Meta ni un déploiement.

2. « Ne pas juger un post à 48 h » : un argument pour tes clientes anxieuses des stats

La directrice marketing explique que les marques jugent un contenu sur ses premières 24 à 72 heures et décident trop vite si « ça a marché », alors que la relation se construit sur des mois.

3. Participer aux tendances sans perdre sa personnalité

Sa formule la plus forte : comprendre la vitesse de la culture sans la laisser dicter la vitesse de ta marque. Parler le langage de la plateforme sans emprunter la personnalité de la semaine.

4. Raconter la fabrication et les gens, pas seulement l'objet

Shinola mise sur le fait de faire les choses à la dure (former des gens à un savoir-faire, sans raccourcis) et sa com' raconte ça, avec des artisan·es qui incarnent déjà l'idée.`;

Deno.test("brief à plusieurs sujets : les 4 sujets de la note de veille sont repérés", () => {
  const s = splitBriefSubjects(VEILLE);
  assertEquals(s.map((x) => x.n), [1, 2, 3, 4]);
  assertEquals(s[2].title, "Participer aux tendances sans perdre sa personnalité");
  assert(s[0].block.includes("Statut : c'est un test"));
  assert(!s[0].block.includes("2. « Ne pas juger"));
});

Deno.test("brief à plusieurs sujets : une liste courte ou un sujet unique n'en est pas un", () => {
  assertEquals(splitBriefSubjects("Mes 3 conseils :\n1. Poster\n2. Répondre\n3. Analyser"), []);
  assertEquals(splitBriefSubjects("Pourquoi publier tous les jours ne sert à rien. 3 minutes de Reel, c'est long."), []);
  assertEquals(splitBriefSubjects(VEILLE.split("\n2. ")[0]), []);
  // Numéros qui ne se suivent pas dans un paragraphe : ignorés.
  assertEquals(splitBriefSubjects(`1. Titre\n${"x".repeat(150)}\n3. Autre\n${"y".repeat(150)}`), []);
});

Deno.test("séquence récap : consigne présente dans le brief stories seulement après le choix récap", () => {
  assertEquals(recapStoriesBlock(VEILLE, 10), null);
  assert(!storiesBrief({ subject: VEILLE }).includes("SÉQUENCE RÉCAP"));
  const recap = `${RECAP_PREFIX}\n\n${VEILLE}`;
  assert(isRecapBrief(recap));
  assertEquals(splitBriefSubjects(recap).length, 4);
  const brief = storiesBrief({ subject: recap });
  assert(brief.includes("SÉQUENCE RÉCAP (4 SUJETS"));
  assert(brief.includes("4. Raconter la fabrication et les gens, pas seulement l'objet"));
  assert(brief.includes("une ou deux stories par sujet"));
  // 5 min : 5 stories au plus, une par sujet.
  const quick = storiesBrief({ subject: recap, time_available: "5min" });
  assert(quick.includes("une story par sujet"));
  assert(quick.includes("5 stories au plus"));
});

const para = (s: string) => `${s} `.repeat(8).trim();

Deno.test("sujets sans numéro : titres isolés, « ## », « **…** », titre du document ignoré", () => {
  const plain = `Ma veille du 9 octobre\n\nLes Reels longs reviennent\n\n${para("Un test rapporté par une experte, pas une annonce.")}\n\nNe pas juger un post à 48 h\n\n${para("La relation se construit sur des mois, pas sur deux jours.")}\n\nEt toi ?`;
  const s = splitBriefSubjects(plain);
  assertEquals(s.map((x) => x.title), ["Les Reels longs reviennent", "Ne pas juger un post à 48 h"]);
  assert(s[1].block.endsWith("Et toi ?"));
  const md = `## Tendances\n\n${para("Parler le langage de la plateforme sans se déguiser.")}\n\n**Fabrication**\n\n${para("Raconter les gens et le savoir-faire avant l'objet.")}`;
  assertEquals(splitBriefSubjects(md).map((x) => x.title), ["Tendances", "Fabrication"]);
  const labelled = `Sujet 1 : les Reels\n\n${para("Un test rapporté par une experte, pas une annonce.")}\n\nSujet 2 : les stats\n\n${para("La relation se construit sur des mois, pas sur deux jours.")}`;
  assertEquals(splitBriefSubjects(labelled).map((x) => x.title), ["les Reels", "les stats"]);
});

Deno.test("sujets sans numéro : un texte en paragraphes n'est pas découpé", () => {
  const prose = `${para("Pourquoi publier tous les jours ne sert à rien.")}\n\n${para("Ce qui compte, c'est ce que tu as à dire.")}\n\nÀ bientôt.`;
  assertEquals(splitBriefSubjects(prose), []);
  // Un seul intertitre : un sujet.
  assertEquals(splitBriefSubjects(`Titre\n\n${para("Un paragraphe assez long pour compter comme matière.")}`), []);
});

Deno.test("récap : préfixe ancien et nouveau acceptés, retrait propre", () => {
  const recap = `${RECAP_PREFIX}\n\n${VEILLE}`;
  assertEquals(stripRecapPrefix(recap), VEILLE);
  assert(isRecapBrief(`Séquence récap de tous les sujets ci-dessous :\n\n${VEILLE}`));
  assert(multiSubjectChoicePending(VEILLE));
  assert(!multiSubjectChoicePending(recap));
});

Deno.test("reel récap : consigne dans le brief reel et dans les hooks, seulement après le choix", () => {
  assertEquals(recapReelBlock(VEILLE), null);
  assertEquals(recapHooksLine(VEILLE), "");
  assert(!reelBrief({ subject: VEILLE }).includes("REEL RÉCAP"));
  const recap = `${RECAP_PREFIX}\n\n${VEILLE}`;
  const brief = reelBrief({ subject: recap });
  assert(brief.includes("REEL RÉCAP (4 SUJETS"));
  assert(brief.includes("jusqu'à 90 secondes"));
  assert(recapHooksLine(recap).includes("Chaque hook annonce la série"));
});

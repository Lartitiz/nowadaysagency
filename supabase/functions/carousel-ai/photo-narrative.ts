/** Shared by planning, direct vision writing and the question pass. */
export const PHOTO_NARRATIVE_CONTRACT = `
INTENTION AVANT LES SLIDES — PHOTOS ET RÉCIT DE MARQUE
Les réponses et précisions actuelles de la personne peuvent changer le récit demandé, pas seulement compléter une question. Si elle dit « finalement, je veux raconter… », cette direction explicite prime sur le sujet initial, l'angle proposé automatiquement et la découverte de marque par défaut. Construis le fil autour de ce nouveau récit avant d'écrire ; ne le réduis pas à une anecdote ajoutée à l'ancien plan. Une question posée par l'IA n'est pas un fait confirmé : seule la réponse apporte des faits ou une intention. Les faits de marque restent une source disponible, pas un sujet imposé. Préserve un scénario déjà validé et les contenus enregistrés ; cette priorité sert la préparation du nouveau récit, pas une réécriture automatique d'un ancien contenu.
Pars de la demande, de l'objectif s'il existe, de la voix et des faits de marque déjà recueillis, puis examine les photos ensemble. Sans objectif explicite (notamment après onboarding), choisis dans les faits de marque une relation qui mérite d’être développée : ce qu’un geste change, une distinction, une conséquence ou une façon de regarder le métier ; ne suppose ni vente, ni commentaires, ni récit de fabrication.
Choisis le fil AVANT les titres : intention, point de départ, progression adaptée, promesse de couverture et aboutissement. Le fil peut être une histoire de marque fournie, un choix expliqué, une conviction étayée, une découverte, un usage, une exploration de collection ou une transformation documentée. Aucun arc universel. Pour chaque page, prévois son apport et le lien de sens qui prépare la suivante.
N'étale pas la fiche de marque en rubriques successives (matière, inspiration, usage, offre). Sélectionne une idée directrice dans cette matière et développe-la : le passage suivant précise, explique, illustre ou tire une conséquence de ce qui vient d'être dit. Ce lien doit se comprendre dans les textes publiés, pas seulement dans les notes internes du plan. Une liste explicitement utile reste possible, avec son critère commun clairement annoncé.
Regroupe les informations qui s'expliquent ensemble. N'ajoute pas une slide pour isoler une petite phrase de la biographie, et ne répète pas des photos pour remplir un nombre implicite. Avec une matière courte, préfère moins de pages mais des passages assez développés pour comprendre leur lien. Les photos disponibles et le nombre demandé restent des contraintes à respecter, sans quota de mots mécanique.
Les photos peuvent accompagner un récit de marque sans illustrer chaque phrase : ambiance, présence, écho ou exemple. Leur compatibilité avec le propos suffit ; aucune obligation de décrire chaque image ni d'en extraire une leçon. Les faits de marque confirmés peuvent porter le récit même s'ils ne sont pas photographiés. Une référence visuelle n'est pas une preuve d'un souvenir ou d'une intention artistique.
Sépare trois niveaux : faits explicitement fournis (brief, réponses, histoire de marque), observations visibles et interprétations. Un nom ou une description de bibliothèque peut être automatique : c'est un indice, pas un témoignage. Une photo de main tenant un bol ne prouve pas le façonnage ; une fleur peinte ne prouve pas qu'un pot contient une fleur. Plusieurs objets différents ne documentent pas la fabrication d'un seul. Ne transforme jamais un motif en souvenir d'enfance, une ressemblance en influence revendiquée, ni une mise en scène en résultat client.
La couverture promet ce que le récit tient réellement. Si les images n'attestent pas toutes les étapes, une explication de fabrication reste possible avec des faits fournis, sans prétendre montrer une transformation documentée. Sans ces faits, choisis un autre angle honnête. Conclus à partir de ce qui a été développé et de l'objectif disponible, puis termine par une seule ouverture tirée du récit (un geste précis que le lecteur peut faire, ou une question simple à laquelle répondre en commentaire) ; jamais d'appel commercial inventé. La présence d’une offre ou d’un lieu de vente dans le profil n’impose pas de les ajouter en conclusion : ne les utilise que s’ils prolongent ce récit et son intention.
Respecte l'ordre et les associations déjà choisis. Le lien image/texte peut être indirect ; précise alors ce que l'image accompagne sans l'utiliser comme preuve. Les détails visuels servent le placement et la compatibilité, pas une obligation d'écriture sensorielle. Préserve la voix propre à cette marque, jamais un style Nowadays universel.
`;

export const PHOTO_QUESTIONS_CONTRACT = `
Utilise d'abord le sujet, l'objectif, les réponses et le contexte de marque déjà disponibles. Pose zéro, une ou deux questions simples uniquement lorsqu'une information essentielle manque pour écrire honnêtement le récit demandé. Si la matière suffit, retourne questions:[] ; aucun questionnaire obligatoire.
Une question peut porter sur une histoire de marque non visible dans les photos. N'impose aucune référence visuelle dans chaque question et ne présuppose ni souvenir, ni motivation, ni transformation. Ne demande pas de choisir une intention si une proposition prudente peut être tirée du contexte. Si un récit précis manque de faits, demande le fait manquant plutôt que d'inventer. Ne redemande pas ce qui est déjà fourni.
Les questions s'adressent à l'utilisatrice, pas à son audience : tutoie-la toujours (« ton savoir-faire », jamais « votre »), même si sa marque vouvoie ses client·es.
`;

// ── « Tes photos en fond » : texte court et un seul narrateur ──
// Test LinkedIn d'Auriana du 12/11/2026 : 40 à 50 mots sur les slides 2 à 4
// alors que l'écran promet « Un texte court posé sur chaque photo », et « nous »
// en slide 2 puis « je » en slide 3. Tous canaux (la promesse de l'écran ne
// dépend pas du canal) ; hors « Photos brutes » (texte vidé) et hors mixte.

/** Repère de longueur d'une slide « Tes photos en fond » (comme le mixte LinkedIn). */
export const PHOTO_OVERLAY_SLIDE_WORDS = 30;
/** Au-delà, la slide est redemandée plus courte (marge sur le repère). */
export const PHOTO_OVERLAY_LONG_WORDS = PHOTO_OVERLAY_SLIDE_WORDS + 10;

export const isPhotoOverlay = (body: any) => body?.carousel_type === "photo" && body?.photos_only !== true;

export const PHOTO_OVERLAY_LENGTH = `TES PHOTOS EN FOND : le texte est posé sur la photo et se lit en quelques secondes. ${PHOTO_OVERLAY_SLIDE_WORDS} mots au plus par slide (overlay_text, kicker et detail ensemble), en phrases courtes ; une idée par slide. Ce plafond prime sur toute consigne de passages développés. Ce qui ne tient pas passe dans caption.body, sans perdre d'idée.`;
export const PHOTO_OVERLAY_RECIT_LENGTH = `TES PHOTOS EN FOND : chaque paragraphe est posé sur une photo et tient en ${PHOTO_OVERLAY_SLIDE_WORDS} mots au plus (il se lit en quelques secondes), en phrases courtes ; une idée par paragraphe. Ce plafond prime sur toute consigne de passages développés. Les détails secondaires passent dans caption.body, sans perdre d'idée.`;

const countWords = (text: unknown) => typeof text === "string" ? text.trim().split(/\s+/).filter(Boolean).length : 0;

/** Numéros (depuis 1) des paragraphes trop longs du récit continu ; [] hors « Tes photos en fond ». */
export function photoOverlayLongPassages(passages: unknown[], body: any): number[] {
  if (!isPhotoOverlay(body)) return [];
  return passages.flatMap((p, i) => countWords(p) > PHOTO_OVERLAY_LONG_WORDS ? [i + 1] : []);
}

const slideOverlayText = (s: any) => [s?.overlay_text, s?.kicker, s?.detail].filter((t) => typeof t === "string").join(" ");

/** Défauts de longueur des slides rédigées (couverture exclue), pour la réparation de modes/photo.ts.
 * Formulés sans « est trop longue » : cette formule demande une découpe en deux slides. */
export function photoOverlayIssues(parsed: any, body: any): string[] {
  const slides = parsed?.slides;
  if (!isPhotoOverlay(body) || !Array.isArray(slides)) return [];
  return slides.flatMap((s: any, i: number) => {
    const n = countWords(slideOverlayText(s));
    return i > 0 && n > PHOTO_OVERLAY_LONG_WORDS
      ? [`La slide ${Number(s?.slide_number) || i + 1} porte trop de texte sur sa photo (${n} mots, ${PHOTO_OVERLAY_SLIDE_WORDS} au plus) : raccourcis-la en phrases courtes, sans ajouter de slide ; les détails passent dans caption.body.`]
      : [];
  });
}

export type Narrator = "je" | "nous";

const outsideQuotes = (text: string) => text.replace(/«[^»]*»/g, " ").replace(/"[^"]*"/g, " ").replace(/“[^”]*”/g, " ");

/** Marques de la 1re personne du singulier et du pluriel, hors citations. */
export function narratorCounts(text: unknown): Record<Narrator, number> {
  const t = outsideQuotes(String(text || "")).toLowerCase();
  const je = (t.match(/(?<!\p{L})(?:je|moi|mon|ma|mes)(?!\p{L})|(?<!\p{L})[jm]['’](?=\p{L})/gu) || []).length;
  const nous = (t.match(/(?<!\p{L})(?:nous|notre|nos)(?!\p{L})/gu) || []).length;
  return { je, nous };
}

/** Personne de la fiche de marque (textes écrits par la personne), si elle est nette. */
export function narratorFromBrand(brandText: unknown): Narrator | null {
  const { je, nous } = narratorCounts(brandText);
  if (je >= 3 && je >= 2 * nous) return "je";
  if (nous >= 3 && nous >= 2 * je) return "nous";
  return null;
}

/** Personne de la 1re slide (ou du 1er passage) qui en marque une. */
function narratorOfFirst(passages: unknown[]): Narrator | null {
  for (const p of passages) {
    const { je, nous } = narratorCounts(p);
    if (je !== nous) return je > nous ? "je" : "nous";
  }
  return null;
}

/** Narrateur incohérent : la marque dit « je » ici et « nous » là. `offenders` = numéros (depuis 1) des passages à reprendre. */
export function photoNarratorCheck(passages: unknown[], body: any, brandText?: unknown): { target: Narrator; offenders: number[] } | null {
  if (!isPhotoOverlay(body)) return null;
  const counts = passages.map(narratorCounts);
  if (!counts.some((c) => c.je > 0) || !counts.some((c) => c.nous > 0)) return null;
  const target = narratorFromBrand(brandText) || narratorOfFirst(passages);
  if (!target) return null;
  const other: Narrator = target === "je" ? "nous" : "je";
  const offenders = counts.flatMap((c, i) => c[other] > 0 ? [i + 1] : []);
  return offenders.length ? { target, offenders } : null;
}

const NARRATOR_LABEL: Record<Narrator, string> = { je: "« je » (et « mon », « ma », « mes »)", nous: "« nous » (et « notre », « nos »)" };

export function photoNarratorFix(target: Narrator): string {
  return `Une seule personne pour la marque : ${NARRATOR_LABEL[target]} du début à la fin, sans changer le sens.`;
}

/** Consigne de rédaction : une seule personne pour la marque, celle de sa fiche si elle est nette. */
export function photoNarratorRule(body: any, brandText?: unknown): string {
  if (!isPhotoOverlay(body)) return "";
  const brand = narratorFromBrand(brandText);
  return brand
    ? `NARRATEUR : la marque parle d'elle en ${NARRATOR_LABEL[brand]}, comme dans sa fiche. Garde cette personne sur toutes les slides et dans la légende ; ne passe jamais à l'autre (citations exceptées).`
    : `NARRATEUR : choisis UNE personne pour parler de la marque, « je » ou « nous », selon sa voix, dès la 1re slide, et garde-la sur toutes les slides et dans la légende ; ne passe jamais de « nous » à « je » ni l'inverse (citations exceptées).`;
}

/** Défaut de narrateur des slides rédigées, pour la réparation de modes/photo.ts. */
export function photoNarratorIssues(parsed: any, body: any, brandText?: unknown): string[] {
  const slides = parsed?.slides;
  if (!Array.isArray(slides)) return [];
  const check = photoNarratorCheck(slides.map(slideOverlayText), body, brandText);
  return check ? [`Narrateur incohérent (slides ${check.offenders.map((n) => Number(slides[n - 1]?.slide_number) || n).join(", ")}). ${photoNarratorFix(check.target)}`] : [];
}

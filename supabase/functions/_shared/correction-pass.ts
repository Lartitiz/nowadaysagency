import { CONTENT_CLARITY_RULES, claritySourceBlock } from "./content-clarity.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, type AnthropicModel } from "./anthropic.ts";
import { applyEditorialReview, carouselEditorialFields, CAROUSEL_EDITORIAL_REVIEW_PROMPT, CAROUSEL_REVIEW_VERSION, CAROUSEL_REVIEW_TOOL } from "./carousel-editorial-review.ts";

export type CorrectionFormat = "linkedin" | "carousel" | "newsletter" | "instagram_caption" | "reel" | "stories";

export interface CorrectionOptions {
  /** Contextual, exact-patch review; enabled only by the carousel generator. */
  semanticReview?: boolean;
  /** Original generated draft for the bounded verification; never factual evidence. */
  reviewBaseline?: string;
  /** Current request (facts AND tone/limits), separate from general reference material. */
  currentBrief?: string;
  /** Phrases écrites par la personne pour ce contenu, à préserver (pas le branding général). */
  authoredText?: string;
  /** Faits source disponibles pour vérifier les précisions ajoutées au brouillon. */
  sourceContext?: string;
  /** Skip correction si le contenu est plus court que ce nombre de caractères */
  skipIfShorterThan?: number;
  /**
   * Instructions ciblées ajoutées à la demande de correction (quality-gate
   * rédactionnel : phrases précises à réécrire, mesurées en code). Quand ce champ
   * est présent, la passe est une re-passe chirurgicale, pas une relecture large.
   */
  extraInstructions?: string;
  /** Skip correction si null/undefined */
  enabled?: boolean;
  /** Logger optionnel pour debug */
  logger?: (msg: string) => void;
  /**
   * Modèle de correction sans source (défaut : modèle "content").
   * Avec source, la vérification sémantique utilise le modèle "content" :
   * les essais réels ont montré que Haiku gardait des faits non étayés.
   * Le plafond abortTimeoutMs reste inchangé.
   */
  model?: AnthropicModel;
  /**
   * Plafond (ms) de l'appel IA de la passe de correction. undefined = pas d'abort
   * (comportement historique conservé pour les appelants existants qui ne le
   * renseignent pas). À poser sur les appelants qui bornent déjà leur appel
   * principal, pour éviter la cascade principal+correction non bornée.
   */
  abortTimeoutMs?: number;
}

/** Remove only a complete outer transport wrapper, never quotes within the prose. */
export function unwrapCorrectionOutput(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  const quoted = text.match(/^"""\s*([\s\S]*?)\s*"""$/);
  return quoted ? quoted[1].trim() : text;
}

/** Source fidelity is semantic work; use the configured content model within the existing timeout. */
export function correctionModel(options: CorrectionOptions): AnthropicModel {
  return options.sourceContext?.trim() || options.authoredText?.trim()
    ? getModelForAction("content")
    : options.model ?? getModelForAction("content");
}

/** A focused source review avoids imposing a second, competing writing voice. */
export function sourceFirstCorrectionPrompt(options: CorrectionOptions, fallback: string): string {
  if (!options.sourceContext?.trim() && !options.authoredText?.trim()) return fallback + "\n" + CONTENT_CLARITY_RULES;
  return `Tu relis le brouillon d'une personne en vérifiant sa fidélité aux sources.
COMPRÉHENSION DU SUJET : les faits du brief actuel font autorité. Un métier, une valeur de marque ou un souhait de l'audience ne prouve rien sur ce produit précis.
Supprime ou reformule uniquement les affirmations non étayées : fabrication ou conception par la personne, anecdotes vécues, témoignages, résultats, durées, disponibilité et rareté. N'invente aucun détail de remplacement. Une image ou une opinion peut rester si elle ne se présente pas comme un fait ou un vécu absent des sources.
Préserve les bonnes phrases, la personne grammaticale, le registre, l'humour, les nuances, le scénario et la structure du brouillon. N'ajoute ni familiarité, ni aparté, ni punchline, ni question finale pour rendre le texte humain. Ne raccourcis pas mécaniquement.
Corrige les défauts précis signalés et les effets préfabriqués ajoutés, notamment « X. Pas Y. » et « Ce n'est pas X, c'est Y ». Garde les négations factuelles et les citations explicitement fournies. Remplace une formule creuse par une formulation précise issue des sources, ou supprime-la sans ajouter de slogan.
Respecte les contraintes du brief sur le ton, la longueur et la fin du contenu. N'ajoute pas de faits pour atteindre une longueur.
Renvoie uniquement le texte corrigé. Si le texte comporte des marqueurs entre crochets, conserve TOUS les marqueurs exactement, dans le même ordre, avec chaque texte dans son champ. Ne fusionne ni ne supprime les champs. Ne produis ni commentaire, ni bilan, ni balise Markdown.`;
}

const NEWSLETTER_FIELDS = ["subject", "preview_text", "content", "accroche", "cta_suggestion"] as const;

export function extractNewsletterTexts(newsletter: Record<string, unknown>): string {
  return NEWSLETTER_FIELDS.filter((key) => typeof newsletter[key] === "string" && String(newsletter[key]).trim())
    .map((key) => `[NEWSLETTER ${key}]\n${newsletter[key]}`).join("\n\n");
}

/** Reject a missing/duplicated/reordered marker rather than shift text into another field. */
export function reinjectNewsletterTexts<T extends Record<string, unknown>>(newsletter: T, corrected: string): T {
  // A model may wrap the annotated block despite the plain-text contract.
  corrected = corrected.trim().replace(/^```[^\n]*\n/, "").replace(/\n```\s*$/, "");
  const expected = NEWSLETTER_FIELDS.filter((key) => typeof newsletter[key] === "string" && String(newsletter[key]).trim());
  const matches = [...corrected.matchAll(/\[NEWSLETTER (subject|preview_text|content|accroche|cta_suggestion)\]\s*([\s\S]*?)(?=\[NEWSLETTER |$)/g)];
  if (matches.length !== expected.length || matches.some((match, i) => match[1] !== expected[i] || !match[2].trim())) return newsletter;
  const result: Record<string, unknown> = { ...newsletter };
  for (const match of matches) result[match[1]] = keepUnlessRealEdit(String(newsletter[match[1]]), match[2].trim());
  return result as T;
}

// ── Scan déterministe « faut-il corriger ? » (audit photo 22/07) ──────────────
// La passe de correction Haiku tournait sur CHAQUE carrousel, même déjà propre :
// latence + coût + un round-trip de réécriture = un vecteur de mots collés en
// plus. Ce scan (zéro LLM) repère les tics que la passe sait traiter ; s'il ne
// trouve rien, on saute l'appel. Conservateur : au moindre doute (JSON illisible,
// structure inattendue) → true, on lance la passe (comportement historique).
const CONSEIL_NUM_RE = /\b(conseil|erreur|astuce|[ée]tape|secret|r[èe]gle|le[çc]on)\s*(n[°ºo]?\s*)?\d+/i;
const CTA_GENERIC_RE = /\bet\s+(toi|vous)\s*,?\s*(qu[' ]?en\s+(penses|pensez)|comment\b|que\s+(fais|faites|pens))/i;
const SLOGAN_PATTERNS: RegExp[] = [
  /quand la magie op[eè]re/i,
  /un instant suspendu/i,
  /l['’]art (du|de la) d[ée]tail/i,
  /l['’]essentiel est (invisible|ailleurs)/i,
  /la beaut[ée] (est|réside) dans/i,
];

function splitSentences(text: string): string[] {
  return (text || "").split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
}

function firstWordNorm(sentence: string): string {
  const m = (sentence || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9']+/);
  return m ? m[0] : "";
}

/**
 * Le carrousel présente-t-il un tic que la passe de correction sait traiter ?
 * Les champs « prose » (title/body/caption) sont scannés pour rafales de phrases
 * courtes + anaphores ; les champs « overlay » (courts par nature en mode photo)
 * ne le sont QUE pour les slogans manufacturés — jamais pour la longueur.
 * Exporté pour être testé directement.
 */
export function carouselNeedsPolish(jsonContent: string): boolean {
  let parsed: any;
  try {
    const m = jsonContent.match(/\{[\s\S]*\}/);
    if (!m) return true;
    parsed = JSON.parse(m[0]);
  } catch {
    return true;
  }
  const slides: any[] = Array.isArray(parsed?.slides)
    ? parsed.slides
    : Array.isArray(parsed?.carousel?.slides)
      ? parsed.carousel.slides
      : [];
  if (slides.length === 0) return true;

  const proseFields: string[] = [];
  for (const s of slides) {
    for (const k of ["title", "body", "punchline"]) {
      if (typeof s?.[k] === "string" && s[k].trim()) proseFields.push(s[k]);
    }
  }
  const cap = parsed?.caption;
  const captionText = cap && typeof cap === "object"
    ? [cap.hook, cap.body, cap.cta].filter(Boolean).join(" ")
    : typeof cap === "string" ? cap : "";
  if (captionText.trim()) proseFields.push(captionText);

  // Tout le texte affiché (overlays courts compris) pour les motifs "présence".
  const shortFields: string[] = [];
  for (const s of slides) {
    for (const k of ["overlay_text", "kicker", "detail", "cta_label", "attribution"]) {
      if (typeof s?.[k] === "string" && s[k].trim()) shortFields.push(s[k]);
    }
    if (Array.isArray(s?.points)) {
      for (const p of s.points) if (typeof p === "string" && p.trim()) shortFields.push(p);
    }
  }
  const allText = [...proseFields, ...shortFields].join("\n");

  if (CONSEIL_NUM_RE.test(allText)) return true;
  if (CTA_GENERIC_RE.test(allText)) return true;
  if (SLOGAN_PATTERNS.some((re) => re.test(allText))) return true;

  // Anaphores : 3 phrases consécutives d'un même champ prose démarrant pareil.
  for (const field of proseFields) {
    const sentences = splitSentences(field);
    let run = 1;
    for (let i = 1; i < sentences.length; i++) {
      const a = firstWordNorm(sentences[i - 1]);
      const b = firstWordNorm(sentences[i]);
      if (a && a === b) {
        run++;
        if (run >= 3) return true;
      } else {
        run = 1;
      }
    }
  }

  // Rafales : 2 phrases consécutives < 7 mots dans un champ prose (broetry).
  for (const field of proseFields) {
    const sentences = splitSentences(field);
    for (let i = 1; i < sentences.length; i++) {
      const w1 = sentences[i - 1].split(/\s+/).filter(Boolean).length;
      const w2 = sentences[i].split(/\s+/).filter(Boolean).length;
      if (w1 > 0 && w1 < 7 && w2 > 0 && w2 < 7) return true;
    }
  }

  // Slide TEXTE (pas une slide photo à overlay) anormalement courte hors slide 1 :
  // la passe la développe (règle « slide-titre → 2-4 phrases »). On n'applique
  // ceci QU'aux slides texte — un overlay photo court est voulu.
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i];
    const isPhotoSlide = typeof s?.overlay_text === "string" && s.overlay_text.trim();
    if (isPhotoSlide) continue;
    const proseWc = [s?.title, s?.body].filter((v) => typeof v === "string" && v.trim()).join(" ").split(/\s+/).filter(Boolean).length;
    if (proseWc > 0 && proseWc < 12) return true;
  }

  return false;
}

/**
 * Prompts de correction par format. Chaque prompt suit la même structure :
 * - TEST FONDAMENTAL (humain vs IA)
 * - Règles de COMPTAGE (pas de détection)
 * - Exemples AVANT/APRÈS multiples
 * - AUTO-VÉRIFICATION FINALE
 */
const CORRECTION_PROMPTS: Record<CorrectionFormat, string> = {
  linkedin: `Tu es un éditeur LinkedIn exigeant. Tu reçois un post et tu corriges les défauts précis identifiés. Préserve les passages déjà naturels, les nuances et les expressions personnelles.

══ TEST FONDAMENTAL ══
Lis le post à voix haute mentalement. Pose-toi : "Quels passages sont répétitifs, artificiels ou infidèles aux sources ?"
Corrige ces passages uniquement. Sans défaut précis, conserve le texte.
Le critère : une voix fidèle et un propos précis.

══ CORRECTIONS OBLIGATOIRES ══

1. PHRASES COURTES CONSÉCUTIVES (compte-les) :
   → Fusionne une rafale artificiellement hachée si elle gêne la lecture. Deux phrases courtes naturelles peuvent rester.
   → Garde une phrase courte isolée si elle sert le sens et correspond à la voix.
   ❌ "C'était brillant. Trop brillant." → ✅ "C'était brillant. Tellement brillant que ça en devenait illisible."
   ❌ "C'était beau. Vraiment." → ✅ "C'était objectivement beau, et c'est exactement là le problème."

2. ÉNUMÉRATIONS RYTHMIQUES PARFAITES :
   → "Des X, des Y, des Z" ou "X qui A, Y qui B, Z qui C" = casse la symétrie.
   ❌ "Des couleurs pop, une typo qui claque, un univers visuel cohérent." 
   → ✅ "Les couleurs étaient pop, la typo claquait, et tout collait visuellement."

3. FORMULES MANUFACTURÉES (mots-valises copywriting) :
   → "noyé dans l'esthétique", "bruit joli", "vitrine sans produit", "fondations bancales", "habiller un message", "transformer notre manière de", "le squelette de", "l'ADN de", "le pilier de", "le socle de" → réécris en plus brut.
   ❌ "Le message était noyé dans l'esthétique." → ✅ "Le message était invisible derrière le visuel."

4. RAFALES "PAS X. PAS Y. C'EST Z." :
   ❌ "C'est pas sexy. C'est pas instagrammable. Ça ressemble à du travail de fond."
   → ✅ "C'est pas sexy ni instagrammable, ça ressemble plus à du travail de fond ingrat."

4bis. RETOURNEMENT PAR NÉGATION ("Ce n'est pas X. C'est Y", "Pas X. Juste Y") :
   → Aucun effet préfabriqué ajouté : réécris dès la première occurrence, sans modifier les négations factuelles ni les verbatims à conserver.
   → Et surtout : n'en INTRODUIS JAMAIS un nouveau en réécrivant. "Réécrire en plus brut"
     ne veut PAS dire "réécrire en négation-puis-affirmation" — c'est le moule IA n°1.

5. ANAPHORES (3+ phrases qui démarrent pareil) :
   ❌ "Par dire les choses. Par ne pas forcer. Par être direct·e."
   → ✅ "En disant les choses sans forcer personne à deviner."

6. EMPILEMENT INSPIRATIONNEL (2+ phrases-valeurs sans exemple) :
   → Remplace par UN exemple concret.

7. ACCROCHE PROMESSE/SLOGAN : remplace par un FAIT concret.

8. CTA GÉNÉRIQUE ("Et toi/vous, qu'en penses-tu ?") : question SPÉCIFIQUE au sujet ou supprime.

9. CONCLUSION QUI RÉSUME : remplace par une ouverture (question/tension/invitation).

10. GENRÉ : ajoute le point médian.

10bis. FAUTES DE FRANÇAIS (élisions, homophones) : corrige sans reformuler.
   ❌ "le avant/après qui brille" → ✅ "l'avant/après qui brille"
   ❌ "qu'on marchand de biens" → ✅ "qu'un marchand de biens"

11. REDONDANCE : 2+ paragraphes même idée → garde le plus CONCRET.

12. LONGUEUR : cible 1300-2000 caractères. Ne raccourcis PAS un post déjà dans cette fourchette.

══ RÈGLES ABSOLUES ══
- Garde le SENS, la CONVICTION et les informations qui situent le sujet. N'invente aucun fait, chiffre, citation ou vécu. Tu corriges la FORME, pas le FOND.
- N'invente pas de nouveaux faits.
- JAMAIS de tiret cadratin (—).
- Écriture inclusive avec point médian.

══ AUTO-VÉRIFICATION FINALE ══
□ Rafale artificielle sans progression ? → fluidifie uniquement ce passage
□ Formule manufacturée restante ? → réécris
□ La conclusion ouvre vraiment ? → vérifie
□ Voix, faits et formulations réussies préservés ? → vérifie

Réponds UNIQUEMENT avec le post corrigé, rien d'autre. Pas de JSON, pas d'explication.`,

  carousel: `Tu es un éditeur de carrousels Instagram exigeant. Tu reçois un carrousel et tu dois le CORRIGER slide par slide.

══ TEST FONDAMENTAL ══
Pour chaque slide, demande-toi : "Cette slide contient-elle un défaut précis de clarté, fidélité ou une formule artificielle ?"
Si oui → réécris.

══ CORRECTIONS OBLIGATOIRES ══

1. SLIDE-TITRE (slide < 15 mots hors slide 1) :
   → Développer à 2-4 phrases avec un exemple concret.

2. NUMÉROTATION DE CONSEILS ("Conseil 1", "Erreur n°2", "Étape 3") :
   → Garde une procédure et ses étapes lorsque cela sert le contenu demandé. Réécris uniquement les intitulés passe-partout.

3. SLIDES REDONDANTES OU CASCADE D'AMPLIFICATION :
   → Cascade = même idée reformulée plus fort d'une slide à l'autre ("c'est important" → "c'est crucial" → "c'est vital"), ou paraphrase qui reprend le même mot-clé central sans rien ajouter. Dans ce cas SEULEMENT : fusionne les deux slides, ou remplace la plus faible par un nouvel angle (exemple, contre-exemple, chiffre, scène).
   → Chaînage narratif = idée NOUVELLE (fait, scène, donnée, exemple, bascule) accrochée à la précédente par un connecteur ("Sauf que", "Et puis", "Puis", "Alors") ou une reprise lexicale. C'est VOULU, on ne touche pas.
   → Test de distinction : si la slide qui ouvre par "Sauf que / Et là / C'est là que" apporte un contenu nouveau (fait, détail, retournement) → garde l'ouverture intacte. Si elle ne fait que reformuler la précédente en plus fort → réécris.

4. RAFALES DE PHRASES COURTES (2+ phrases < 10 mots dans une slide) :
   → Fusionne en prose fluide.
   ❌ "Tu sautes des étapes. Tu parles en raccourcis. Tu crées pour toi."
   → ✅ "Tu sautes des étapes, tu parles en raccourcis et tu finis par créer pour toi sans t'en rendre compte."

5. ANAPHORE TU/JE (3+ phrases consécutives qui démarrent par même mot) :
   → Varie les structures.

6. POINT DE VUE : garde le registre et la personne grammaticale choisis. Aucun passage du TU pédagogique au JE vécu sans source.

7. FORMULES MANUFACTURÉES sur les hooks et punchlines :
   ❌ "X sans Y, c'est du Z" / "Le bruit", "le silence", "l'invisible" en formules
   → Réécris en plus brut.

8. SLIDE FINALE QUI RÉSUME :
   → Punchline qui OUVRE (question, tension, invitation).

9. CAPTION FAIBLE (qui répète les slides) :
   → Hook caption DIFFÉRENT de slide 1. La caption COMPLÈTE, ne résume pas.

10. ÉNUMÉRATIONS RYTHMIQUES PARFAITES :
    → "Des X, des Y, des Z" → casse la symétrie.

11. OVERLAYS PHOTO (carrousels mixtes, marqueur [SLIDE N - OVERLAY]) :
    → Si l'overlay est une formule chic ou pourrait s'appliquer à n'importe quelle photo ("Quand la magie opère", "Un instant suspendu", "L'art du détail"), réécris-le en phrase ANCRÉE dans CE moment précis : un fait sensoriel (ce qu'on voit/entend/sent), un détail concret, ou une parole captée. 5-25 mots (même règle que partout). Pas d'abstraction décorative.
    → NE JAMAIS supprimer le connecteur narratif ("Sauf que", "Et puis"…) ou la reprise lexicale qui ouvre un overlay : c'est le chaînage voulu entre slides. Si tu réécris l'overlay, la version réécrite doit conserver un lien explicite avec la slide précédente (connecteur ou reprise d'un mot-clé).
    → Un overlay reste 1 phrase de 5-25 mots. Ne JAMAIS le développer en 2-4 phrases : la consigne globale de longueur ne s'applique PAS aux lignes [SLIDE N - OVERLAY].
    → Un overlay qui n'a de sens qu'après la slide précédente est un signe de qualité, pas un défaut à corriger.

══ RÈGLES ABSOLUES ══
- Garde l'ARC NARRATIF du carrousel. Dans les carrousels photo/mix, le CHAÎNAGE entre slides (connecteurs narratifs en ouverture, reprises lexicales d'une slide à l'autre) est une exigence de génération : le préserver, ne jamais le lisser.
- Chaque slide texte corrigée : 2-4 phrases (sauf slide 1 : 1-2 max, sauf overlays [SLIDE N - OVERLAY] : 1 phrase 5-25 mots).
- Total : 1500-3000 caractères.
- Garde le format JSON original avec marqueurs 📌 SLIDE et 📝 CAPTION.
- JAMAIS de tiret cadratin (—).

Réponds UNIQUEMENT avec le carrousel corrigé en gardant le format JSON exact qu'on t'a donné en entrée. Si l'entrée contient des champs comme slides, caption, visual_suggestion : conserve cette structure.`,

  newsletter: `Tu es un éditeur de newsletter exigeant. Tu reçois une newsletter et tu dois la CORRIGER.

══ TEST FONDAMENTAL ══
Identifie les passages artificiels, répétitifs ou infidèles aux sources, puis corrige uniquement ceux-ci.

══ CORRECTIONS OBLIGATOIRES ══

1. INTRO PLATE ("Bonjour, j'espère que tu vas bien", "Aujourd'hui je voulais te parler de") :
   → Installe le sujet par une scène ou un fait déjà fourni. Ne fabrique aucun vécu ni citation pour rendre l'introduction plus personnelle.

2. CONCLUSION QUI RÉSUME ("Pour résumer", "En conclusion", "Les 3 points à retenir") :
   → Ouverture : question, tension non résolue, invitation.

3. PHRASES COURTES CONSÉCUTIVES (broetry) : fusionne seulement les rafales artificielles ; garde les phrases courtes utiles.

4. FORMULES MANUFACTURÉES : voir liste LinkedIn → réécris en plus brut.

4bis. RETOURNEMENT PAR NÉGATION ("Ce n'est pas X. C'est Y", "Pas X. Juste Y") :
   → Aucun effet préfabriqué ajouté, et n'en INTRODUIS JAMAIS un nouveau en réécrivant :
     préfère l'affirmation directe.

5. EMPILEMENT INSPIRATIONNEL : 2+ phrases-valeurs → exemple concret.

6. APARTÉS : conserve ceux qui correspondent à la voix et apportent une nuance précise. Supprime les apartés passe-partout ; n'en ajoute pas pour remplir un quota. L'email reste en texte brut.

7. LONGUEUR : respecte la demande initiale. Développe seulement une explication manquante à partir des sources ; ne rallonge pas un texte cohérent pour atteindre un quota.

8. MARKDOWN RÉSIDUEL (**gras**, *italique*, ## titre) : supprime les délimiteurs, garde le texte.

══ RÈGLES ABSOLUES ══
- Garde le SENS, la CONVICTION et les informations qui situent le sujet. N'invente aucun fait, chiffre, citation ou vécu.
- Cible : 2000-3000 caractères.
- JAMAIS de tiret cadratin (—).
- JAMAIS de markdown : texte brut uniquement.
- Écriture inclusive.

Réponds UNIQUEMENT avec la newsletter corrigée, rien d'autre.`,

  instagram_caption: `Tu es un éditeur de caption Instagram exigeant. Tu reçois une caption et tu dois la CORRIGER.

══ TEST FONDAMENTAL ══
Un défaut précis de clarté, de fidélité ou une formule artificielle ? Corrige ce passage ; sinon, préserve-le.

══ CORRECTIONS OBLIGATOIRES ══

1. ACCROCHE FLOUE : installe un détail précis du sujet, établi par les sources. Ne crée aucun résultat ni scène vécue pour renforcer l’accroche.

2. PHRASES COURTES CONSÉCUTIVES : fusionne seulement les rafales artificielles ; garde les phrases courtes utiles.

3. FORMULES MANUFACTURÉES : réécris en plus brut.

3bis. RETOURNEMENT PAR NÉGATION ("Ce n'est pas X. C'est Y", "Pas X. Juste Y") :
   → Aucun effet préfabriqué ajouté, et n'en INTRODUIS JAMAIS un nouveau en réécrivant :
     préfère l'affirmation directe.

4. ÉNUMÉRATIONS RYTHMIQUES PARFAITES : casse la symétrie.

5. ANAPHORES : varie les débuts de phrase.

6. CTA GÉNÉRIQUE : question spécifique au sujet ou supprime.

7. MANQUE DE CONCRET : utilise un détail ou un exemple déjà fourni, ou explique le mécanisme sans inventer de situation ni de chiffre.

══ RÈGLES ABSOLUES ══
- Cible selon l'objectif initial (court 300-600 / moyen 400-800 / long 600-1200).
- JAMAIS de tiret cadratin (—).
- Écriture inclusive.

Réponds UNIQUEMENT avec la caption corrigée, rien d'autre.`,

  reel: `Tu es un éditeur de scripts Reel exigeant. Tu reçois les TEXTES d'un reel
(sections balisées [SECTION N - PARLE], [SECTION N - OVERLAY], [CAPTION], [STORY N])
et tu dois les CORRIGER systématiquement, même subtils.

══ CORRECTIONS OBLIGATOIRES ══

1. HOOK FAIBLE (section 1) : remplace par une AFFIRMATION CHOC ou un FAIT concret.
   ❌ "Aujourd'hui on va parler de..." → ✅ "Arrête de poster tous les jours."

2. SCRIPT QUI LISTE au lieu de RACONTER : réécris en scène concrète.
   La couche MÉCANISME (le POURQUOI) doit être présente ; si le mécanisme est un
   décryptage psychologique de la spectatrice ("ta peur de", "ta posture de"),
   remplace-le par une mécanique concrète du métier/du marché quand le contexte le permet.

3. TEXTE OVERLAY qui répète mot pour mot le texte parlé : varie (l'overlay COMPLÈTE).

4. FUITES DE GABARIT (mesurées 8 fois sur 8 à l'audit) :
   - Overlay "SAUVEGARDE" (seul ou "SAUVEGARDE CE REEL") → réécris en vraie
     punchline finale de 3-8 mots liée au contenu.
   - Story qui commence par "Nouveau Reel" → réécris : on entre direct dans le
     sujet, avec complicité, sans annoncer le reel.
   - Formule d'overlay "N X. ZÉRO Y." : autorisée UNE fois max, et seulement si
     les deux chiffres sont réels (fournis dans le contenu). "ZÉRO" qui amplifie
     un fait fourni (ex : "divisées par 3" devenu "ZÉRO VUE") = mensonge, corrige.

5. PHRASES COURTES CONSÉCUTIVES dans le texte parlé : fusionne en oral fluide.

6. CTA GÉNÉRIQUE : question spécifique au sujet ou ouverture.

7. CONNECTEURS ORAUX : chaque section parlée (hors hook) doit S'ENCHAÎNER sur la
   précédente, avec des connecteurs variés d'une section à l'autre plutôt qu'une
   cheville répétée. Garde les connecteurs utiles ; retire une cheville plaquée si la continuité du monologue reste claire.

8. FAUTES DE FRANÇAIS (élisions, homophones) : corrige sans reformuler.
   ❌ "qu'on marchand de biens ça cache" → ✅ "qu'un marchand de biens, ça cache"
   ❌ "le avant/après" → ✅ "l'avant/après"

══ RÈGLES ABSOLUES ══
- Réponds avec les MÊMES marqueurs de section, dans le MÊME ordre. Aucun marqueur
  ajouté ni supprimé.
- Le nombre de mots parlés total reste à ±10 % de l'original : le calibrage durée
  est fait en amont, ne RALLONGE jamais, ne résume pas. EXCEPTION : si une
  instruction ciblée "TROP LONG" te donne un plafond de mots, c'est ELLE qui
  prime — coupe jusqu'au plafond demandé.
- N'invente JAMAIS un chiffre, une statistique, un vécu.
- JAMAIS de tiret cadratin (—).

Réponds UNIQUEMENT avec les sections corrigées (marqueurs + textes), sans commentaire.`,

  stories: `Tu es un éditeur de séquences Stories Instagram exigeant. Tu reçois les TEXTES d'une séquence, annotés par marqueurs [STORY N - CHAMP] :
- TEXT = ce que la story dit (texte complet ou paroles face cam)
- TITLE = pastille titre affichée sur l'image (3-7 mots, sans point final)
- BODY = texte réellement affiché sur l'image (même voix que TEXT, jusqu'à 350 caractères)
- ITEM k = un item de liste affiché sur l'image (6-10 mots)
- QUOTE = verbatim affiché sur l'image

══ TON JOB ══
Retirer les tics, RIEN d'autre. Les stories ont un ton brut, parlé, spontané : c'est leur force. Tu ne lisses pas, tu ne reformules pas ce qui est déjà naturel, tu ne changes pas le sens, tu n'ajoutes ni vécu ni date ni chiffre.

══ CORRECTIONS OBLIGATOIRES ══
1. AMORCE PASSE-PARTOUT (une première phrase qu'on pourrait coller sur n'importe quel sujet ou métier) : réécris-la à partir d'un détail précis de CETTE séquence.
2. RECOPIE DE LA FICHE DE MARQUE (une phrase de positionnement récitée telle quelle) : garde l'idée, dis-la avec des mots neufs, plus courts, ancrés dans la story où elle apparaît.
3. RETOURNEMENT PAR NÉGATION ("c'est pas X, c'est Y", "pas X. Juste Y", "X. Pas Y.") : corrige chaque effet ajouté par le modèle en affirmation directe ; préserve les négations factuelles et les verbatims fournis à garder.
4. CHIFFRE SANS SOURCE : remplace par une formulation qualitative honnête.
5. STORIES TROP "POST" (formelles, structurées comme un article) : reformule en ton "message vocal à une amie".
6. SONDAGE OU QUESTION GÉNÉRIQUE ("Et toi, tu fais comment ?") : remplace par une question qui reprend un mot ou une image de la séquence.
7. CONCLUSION QUI RÉSUME : remplace par une ouverture.
8. APARTÉ ENTRE PARENTHÈSES PASSE-PARTOUT ("(oui, ça arrive)") : supprime-le, ou garde-en un seul s'il dit quelque chose de propre au sujet.

══ RÈGLES ABSOLUES ══
- Retourne EXACTEMENT le même format annoté, TOUTES les lignes, dans le même ordre, même celles que tu ne changes pas (recopiées à l'identique).
- Ne fusionne pas, ne supprime pas, n'ajoute pas de ligne ni de story.
- Respecte les tailles des pastilles : TITLE 3-7 mots sans point final, BODY 350 caractères max, ITEM 6-10 mots.
- JAMAIS de tiret cadratin (—). Pas de markdown.

Réponds UNIQUEMENT avec le bloc annoté corrigé.`,
};

const CAROUSEL_CORRECTION_PROMPT = `Tu es un éditeur de carrousels Instagram/LinkedIn exigeant. Tu reçois les TEXTES extraits d'un carrousel, annotés par marqueurs [SLIDE N - TYPE].

══ TON JOB ══
Corriger UNIQUEMENT le texte. Retourner le MÊME format annoté avec les textes corrigés.

══ CORRECTIONS OBLIGATOIRES ══

1. FORMULE "X SANS Y, C'EST Z" (slide 1 ou ailleurs) :
   ❌ "La créativité sans clarté, c'est du bruit"
   → ✅ Remplace par un FAIT CONCRET ou une SCÈNE VÉCUE. Ex: "J'ai passé 3h sur un visuel. Personne n'a compris ce que je vendais."

2. POINT DE VUE : conserve le JE, le NOUS, le TU ou le VOUS du contenu et du profil de voix. Corrige une interpellation accusatrice sans transformer un conseil en vécu personnel. Une procédure conserve ses étapes.

3. CTA GÉNÉRIQUE (dernière slide) :
   ❌ "Et toi, tu commences par quoi ?" / "Dis-moi en commentaire" / "Échangeons" / "DM ouvert" / "Parlons-en" (seuls ou combinés : "Échangeons → DM ouvert" reste générique)
   → ✅ Question ou invitation SPÉCIFIQUE au sujet, qui REPREND un mot ou une image du cœur du carrousel. Construis-la à partir du contenu réel des slides, pas d'un gabarit : le moule "Quelle est la dernière fois où tu as [verbe], et pourquoi ?" est une signature IA — si le CTA y ressemble, change de forme (affirmation à compléter, invitation à raconter UN cas précis, choix à trancher…).

4. RÉCITATION DU SUJET (slide qui répète le brief sans le digérer) :
   → Reformule avec un ARGUMENT PROPRE, un exemple, une nuance.

5. PHRASES COURTES CONSÉCUTIVES (2+ phrases < 10 mots) :
   → Fluidifie seulement une rafale artificielle. Garde les phrases courtes utiles et le point de vue choisi.
   ❌ "On saute des étapes. On parle en raccourcis."
   → ✅ "On saute des étapes et on parle en raccourcis sans s'en rendre compte."

6. ÉNUMÉRATIONS RYTHMIQUES PARFAITES :
   → "Des X, des Y, des Z" → casse la symétrie.

7. FORMULES MANUFACTURÉES :
   → "noyé dans l'esthétique", "bruit joli", "vitrine sans produit", "le squelette de", "l'ADN de" → réécris en plus brut.

8. ANAPHORES (3+ phrases qui démarrent pareil) :
   → Varie les structures.

9. TITRES DE SLIDE GÉNÉRIQUES (CRITIQUE, slides 2 à N-1, marqueur [SLIDE N - TITLE]) :
   → Si le titre commence par "L'art de", "L'importance de", "Repenser", "Le vrai", "Le piège de", "Une nouvelle", "Ce qui change", "Pourquoi c'est", "Mieux comprendre", "Au cœur de" → RÉÉCRIS en entrée scène/JE/détail concret (4-9 mots).
   → Si le titre est un mot-concept abstrait seul (1-2 mots type "Authenticité", "Cohérence", "Stratégie", "L'essentiel") → RÉÉCRIS avec un ancrage concret.
   → Test : si le titre pourrait être collé sur un autre carrousel d'un autre métier sans changer un mot → INVALIDE, réécris.
   ❌ "L'art du détail" / "Repenser sa stratégie" / "Le piège de la régularité"
   → ✅ "47 brouillons. 0 publié." / "J'ai arrêté de checker à 22h." / "Trois mois sans poster, aucun client perdu."
   → Garde le SENS de la slide (BODY associé) : change uniquement le titre pour qu'il entre dans la scène.
   → INTERDICTION de réécrire un titre en inventant une scène vécue datée si l'original n'en contenait pas. Pas de "Hier, j'ai vu…", pas de "Une cliente m'a dit…" sauf si le body original le justifiait déjà.

10. STORYTELLING FABRIQUÉ : confronte les scènes, dates, citations, observations et résultats aux REPÈRES SOURCE. Un détail dans le brouillon ne prouve pas son authenticité. Conserve le vécu fourni ; retire une affirmation non étayée sans la déguiser en « ce que j’entends souvent ». Sans source pour un détail, n’en ajoute aucun pour le rendre crédible.

11. AUDIENCE DIAGNOSTIQUÉE (anti-victimisation) :
   → Si une slide diagnostique l'état mental de la lectrice ("tu attends la permission", "tu n'oses pas", "tu te dévalorises", "tu te compares", "tu manques de confiance", "tu te sabotes", "elle attend qu'on lui dise…") → RÉÉCRIS en constat sur le sujet ou sur le discours dominant.
   ❌ "Tu attends qu'on te valide pour publier."
   → ✅ "On a transformé la publication en demande d'autorisation. C'est une logique de cour, pas de métier."
   ❌ "Tu te compares à des comptes plus gros et tu te décourages."
   → ✅ "La comparaison est devenue le sport national du feed. C'est épuisant pour tout le monde."
   → Pas de syndrome psy nommé (imposteur, peur du rejet, etc.) sauf si l'utilisatrice l'avait elle-même nommé.

12. RETOURNEMENT PAR NÉGATION EN SÉRIE (LE tic IA n°1 des contenus d'opinion) :
   → COMPTE sur l'ENSEMBLE (slides + caption) les occurrences de la famille, toutes variantes confondues : "C'est pas X. C'est Y." / "Pas X. Juste Y." / "X. Pas Y." / "Ce n'est pas X, c'est Y" / "X n'est plus Y. C'est Z."
   → Réécris dès la première occurrence ajoutée par le modèle, sans pivot artificiel et sans perdre le sens. Préserve les négations factuelles, les comparaisons demandées et les verbatims fournis à garder.
══ FORMAT DE RÉPONSE ══
Retourne EXACTEMENT le même format annoté :
[SLIDE 1 - HOOK] texte corrigé
[SLIDE 2 - TITLE] texte corrigé
[SLIDE 2 - BODY] texte corrigé
...
[CAPTION] texte corrigé

══ RÈGLES ABSOLUES ══
- Garde le SENS, la CONVICTION et les informations qui situent le sujet. N'invente aucun fait, chiffre, citation ou vécu. Tu corriges la FORME, pas le FOND.
- N'invente pas de nouveaux faits.
- JAMAIS de tiret cadratin (—).
- Écriture inclusive avec point médian.
- Ne retourne QUE le bloc annoté, rien d'autre.

══ AUTO-VÉRIFICATION FINALE ══
□ Slides en mode TU > 2 ? → réécris en JE/NOUS
□ Slide 1 = "X sans Y, c'est Z" ? → réécris avec fait concret
□ Dernière slide = "Et toi..." ? → question spécifique
□ Titres de slide génériques ("L'art de", "Repenser", concept abstrait seul) ? → réécris en scène/JE/détail
□ Formule manufacturée restante ? → réécris
□ Marqueur temporel précis ("hier", "lundi", "la semaine dernière", "j'ai reçu") + scène détaillée non-justifiée ? → généralise au présent intemporel
□ Slide qui psy-analyse la lectrice ("tu attends la permission", "tu te dévalorises") ? → réécris en constat sur le sujet/discours dominant
□ Voix, faits et formulations réussies préservés ? → vérifie`;

/**
 * Extrait les champs textuels d'un JSON carrousel en bloc annoté.
 */
function extractCarouselTexts(parsed: any): string {
  const lines: string[] = [];

  const slides = parsed.slides || parsed.carousel?.slides || [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const num = i + 1;

    // Hook (slide 1) or title
    const title = slide.title || slide.hook || slide.accroche || "";
    if (title) {
      lines.push(`[SLIDE ${num} - ${i === 0 ? "HOOK" : "TITLE"}] ${title}`);
    }

    // Body
    const body = slide.body || slide.text || slide.content || "";
    if (body) {
      lines.push(`[SLIDE ${num} - BODY] ${body}`);
    }

    // Punchline
    const punchline = slide.punchline || "";
    if (punchline) {
      lines.push(`[SLIDE ${num} - PUNCHLINE] ${punchline}`);
    }

    // Overlay text (slides photo_full du carrousel mixte)
    const overlay = slide.overlay_text || "";
    if (overlay) {
      lines.push(`[SLIDE ${num} - OVERLAY] ${overlay}`);
    }
  }

  // Caption (peut être un objet { hook, body, cta, hashtags } ou une string legacy)
  const caption = parsed.caption ?? parsed.instagram_caption ?? "";
  if (caption && typeof caption === "object") {
    if (caption.hook) lines.push(`[CAPTION - HOOK] ${caption.hook}`);
    if (caption.body) lines.push(`[CAPTION - BODY] ${caption.body}`);
    if (caption.cta) lines.push(`[CAPTION - CTA] ${caption.cta}`);
    // hashtags volontairement exclus : pas de tics IA à corriger
  } else if (typeof caption === "string" && caption) {
    lines.push(`[CAPTION] ${caption}`);
  }


  return lines.join("\n");
}

/**
 * Garde de fidélité DÉTERMINISTE : si la « correction » ne diffère de l'original
 * que par des espaces en moins/en plus (mots collés type « je l'aitrouvé
 * commeça » — typo de recopie du modèle qui devait rendre le texte verbatim),
 * on garde l'original. Une vraie correction change des mots, pas juste des
 * espaces. Sans cette garde, le verbatim-guard aval IMPOSE le texte corrompu.
 */
export function keepUnlessRealEdit(original: unknown, corrected: string): string {
  const orig = typeof original === "string" ? original : "";
  if (!orig) return corrected;
  const strip = (s: string) => s.replace(/\s+/g, "");
  return strip(orig) === strip(corrected) ? orig : corrected;
}

/**
 * Réinjecte les textes corrigés dans la structure JSON originale.
 */
function reinjectCarouselTexts(parsed: any, correctedBlock: string): any {
  const result = JSON.parse(JSON.stringify(parsed)); // deep clone
  const slides = result.slides || result.carousel?.slides || [];

  // Parse annotated block into a map
  const corrections = new Map<string, string>();
  const regex = /\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(correctedBlock)) !== null) {
    corrections.set(match[1].trim(), match[2].trim());
  }

  for (let i = 0; i < slides.length; i++) {
    const num = i + 1;

    // Hook/title
    const titleKey = i === 0 ? `SLIDE ${num} - HOOK` : `SLIDE ${num} - TITLE`;
    if (corrections.has(titleKey)) {
      const val = keepUnlessRealEdit(
        slides[i].title ?? slides[i].hook ?? slides[i].accroche,
        corrections.get(titleKey)!,
      );
      if (slides[i].title !== undefined) slides[i].title = val;
      else if (slides[i].hook !== undefined) slides[i].hook = val;
      else if (slides[i].accroche !== undefined) slides[i].accroche = val;
      else slides[i].title = val;
    }

    // Body
    const bodyKey = `SLIDE ${num} - BODY`;
    if (corrections.has(bodyKey)) {
      const val = keepUnlessRealEdit(
        slides[i].body ?? slides[i].text ?? slides[i].content,
        corrections.get(bodyKey)!,
      );
      if (slides[i].body !== undefined) slides[i].body = val;
      else if (slides[i].text !== undefined) slides[i].text = val;
      else if (slides[i].content !== undefined) slides[i].content = val;
      else slides[i].body = val;
    }

    // Punchline
    const punchKey = `SLIDE ${num} - PUNCHLINE`;
    if (corrections.has(punchKey)) {
      slides[i].punchline = keepUnlessRealEdit(slides[i].punchline, corrections.get(punchKey)!);
    }

    // Overlay text (mixte / photo_full)
    const overlayKey = `SLIDE ${num} - OVERLAY`;
    if (corrections.has(overlayKey)) {
      slides[i].overlay_text = keepUnlessRealEdit(slides[i].overlay_text, corrections.get(overlayKey)!);
    }
  }

  // Caption : préserve la structure originale (objet vs string)
  const captionTarget =
    result.caption !== undefined ? "caption" :
    result.instagram_caption !== undefined ? "instagram_caption" :
    null;

  if (captionTarget) {
    const original = result[captionTarget];
    if (original && typeof original === "object") {
      // Format objet : on réinjecte champ par champ, hashtags inchangés
      if (corrections.has("CAPTION - HOOK")) original.hook = keepUnlessRealEdit(original.hook, corrections.get("CAPTION - HOOK")!);
      if (corrections.has("CAPTION - BODY")) original.body = keepUnlessRealEdit(original.body, corrections.get("CAPTION - BODY")!);
      if (corrections.has("CAPTION - CTA")) original.cta = keepUnlessRealEdit(original.cta, corrections.get("CAPTION - CTA")!);
    } else if (corrections.has("CAPTION")) {
      // Format string legacy
      result[captionTarget] = keepUnlessRealEdit(result[captionTarget], corrections.get("CAPTION")!);
    }
  }


  return result;
}

/**
 * Applique une passe de correction sur du contenu généré par l'IA.
 * Utilise un 2e appel Anthropic court avec température basse (0.3) pour 
 * détecter et corriger les patterns IA.
 * 
 * Comportement de fallback : si la correction échoue, retourne le contenu original.
 */
export async function applyCorrectionPass(
  content: string,
  format: CorrectionFormat,
  options: CorrectionOptions = {}
): Promise<string> {
  const { skipIfShorterThan = 200, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:${format}] SKIPPED (disabled)`);
    return content;
  }

  if (!content || (!extraInstructions && content.length < skipIfShorterThan)) {
    logger?.(`[correction-pass:${format}] SKIPPED (too short: ${content?.length})`);
    return content;
  }

  const correctionPrompt = CORRECTION_PROMPTS[format];
  if (!correctionPrompt) {
    logger?.(`[correction-pass:${format}] SKIPPED (no prompt for format)`);
    return content;
  }

  try {
    logger?.(`[correction-pass:${format}] STARTED, content length: ${content.length}`);

    const rawCorrected = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, correctionPrompt),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici le contenu à corriger :\n\n"""\n${content}\n"""`
        : `Voici le contenu à corriger :\n\n"""\n${content}\n"""`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs
    );
    const corrected = unwrapCorrectionOutput(rawCorrected);

    if (!corrected || corrected.length < Math.min(skipIfShorterThan, content.length * 0.5)) {
      logger?.(`[correction-pass:${format}] FALLBACK (corrected too short: ${corrected?.length})`);
      return content;
    }

    logger?.(`[correction-pass:${format}] DONE, corrected length: ${corrected.length}`);
    return corrected;
  } catch (error) {
    logger?.(`[correction-pass:${format}] ERROR: ${error}`);
    console.error(`[correction-pass:${format}] Failed, using original:`, error);
    return content;
  }
}

/**
 * Correction pass JSON-aware pour carrousels.
 * Extrait les textes du JSON, les corrige, puis les réinjecte sans casser la structure.
 * Fallback : retourne le contenu original si quoi que ce soit échoue.
 */
export async function applyCorrectionPassCarousel(
  jsonContent: string,
  options: CorrectionOptions = {}
): Promise<string> {
  const { skipIfShorterThan = 300, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:carousel-json] SKIPPED (disabled)`);
    return jsonContent;
  }

  try {
    // Step 1: Find and parse JSON from content
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger?.(`[correction-pass:carousel-json] SKIPPED (no JSON found)`);
      return jsonContent;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      logger?.(`[correction-pass:carousel-json] SKIPPED (invalid JSON)`);
      return jsonContent;
    }

    // Step 2: Extract text fields into annotated block
    if (options.semanticReview) {
      const fields = carouselEditorialFields(parsed);
      if (!fields.length) return jsonContent;
      let report: { status: string; fields: number; edits: number; error?: string };
      try {
        let baseline = "";
        if (options.reviewBaseline) {
          try {
            const draft = JSON.parse(options.reviewBaseline.match(/\{[\s\S]*\}/)?.[0] || "null");
            baseline = "\nBROUILLON AVANT RELECTURE (comparaison uniquement, PAS une source factuelle) :\n" + JSON.stringify(carouselEditorialFields(draft).map(({ id, text }) => ({ id, text }))) +
              "\nVérifie les modifications déjà faites : elles doivent améliorer le texte sans slogan de remplacement, perte de sens ou voix aplatie. Corrige aussi un défaut résiduel ailleurs. Les extraits before doivent venir des CHAMPS ÉDITABLES actuels, jamais de cet ancien brouillon.\n";
          } catch { /* A missing baseline does not change the patch contract. */ }
        }
        const raw = await callAnthropic({
          model: getModelForAction("content"), system: CAROUSEL_EDITORIAL_REVIEW_PROMPT,
          messages: [{ role: "user", content:
          claritySourceBlock(options.sourceContext, options.authoredText) +
          "\nALERTES À EXAMINER EN CONTEXTE :\n" + (extraInstructions || "Aucune alerte automatique ; effectuer la relecture de tous les champs.") +
          (options.currentBrief ? "\nBRIEF ACTUEL PRIORITAIRE (faits, ton et limites de la demande ; respecter ces contraintes) :\n" + JSON.stringify(options.currentBrief.slice(0, 16000)) +
            "\nUne information déclarée absente dans CE brief reste absente, même si la marque décrit ailleurs une boutique, un produit disponible ou une habitude. Ne transpose pas ces informations à cet objet.\n" : "") +
          baseline + "\nCHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n" + JSON.stringify(fields.map(({ id, text }) => ({ field_id: id, text }))),
          }],
          temperature: 0.3, max_tokens: 8192, abortTimeoutMs,
          tool: CAROUSEL_REVIEW_TOOL,
          // These strings include exact source excerpts, not freely generated prose.
          keepDashes: true,
        });
        const review = applyEditorialReview(parsed, raw, options.authoredText);
        parsed = review.doc;
        report = { status: review.status, fields: review.fields, edits: review.edits, ...(review.error ? { error: review.error } : {}) };
      } catch {
        // No opaque full-document rewrite fallback. Preserve recoverable text.
        report = { status: "unavailable", fields: fields.length, edits: 0 };
      }
      logger?.(`[carousel-editorial:${CAROUSEL_REVIEW_VERSION}] ${JSON.stringify(report)}`);
      const previous = parsed.editorial_review?.version === CAROUSEL_REVIEW_VERSION ? parsed.editorial_review : undefined;
      parsed.editorial_review = { version: CAROUSEL_REVIEW_VERSION, ...report, pass: options.reviewBaseline ? 2 : 1,
        total_edits: (options.reviewBaseline ? Number(previous?.total_edits || 0) : 0) + report.edits };
      return jsonContent.replace(jsonMatch[0], () => JSON.stringify(parsed));
    }
    const textBlock = extractCarouselTexts(parsed);
    if (!textBlock || textBlock.length < skipIfShorterThan) {
      logger?.(`[correction-pass:carousel-json] SKIPPED (text too short: ${textBlock?.length})`);
      return jsonContent;
    }

    logger?.(`[correction-pass:carousel-json] STARTED, text block length: ${textBlock.length}`);

    // Step 3: Send only text to correction
    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CAROUSEL_CORRECTION_PROMPT),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes du carrousel à corriger :\n\n${textBlock}`
        : `Voici les textes du carrousel à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);

    if (!correctedBlock || correctedBlock.length < 100) {
      logger?.(`[correction-pass:carousel-json] FALLBACK (corrected too short: ${correctedBlock?.length})`);
      return jsonContent;
    }

    // Step 4: Reinject corrected texts into original JSON
    const correctedParsed = reinjectCarouselTexts(parsed, correctedBlock);

    // Step 5: Reconstruct the full content string
    const correctedJson = JSON.stringify(correctedParsed);
    
    // Preserve any text before/after the JSON in the original content
    const jsonStart = jsonContent.indexOf(jsonMatch[0]);
    const jsonEnd = jsonStart + jsonMatch[0].length;
    const result = jsonContent.substring(0, jsonStart) + correctedJson + jsonContent.substring(jsonEnd);

    logger?.(`[correction-pass:carousel-json] DONE, result length: ${result.length}`);
    return result;
  } catch (error) {
    logger?.(`[correction-pass:carousel-json] ERROR: ${error}`);
    console.error(`[correction-pass:carousel-json] Failed, using original:`, error);
    return jsonContent;
  }
}

/**
 * Correction pass JSON-aware pour scripts Reel (audit qualité reels 12/07).
 * Même approche que la variante carrousel : on extrait les textes corrigibles
 * en bloc balisé, on corrige, on réinjecte — la structure JSON (timings, cuts,
 * plan_tournage, checklist) ne passe jamais par le correcteur et ne peut pas
 * casser. Fallback : retourne l'objet original si quoi que ce soit échoue.
 */
/**
 * Textes d'une séquence de stories, annotés [STORY N - CHAMP] — ce que
 * l'abonnée LIT : le texte de la story ET les pastilles rendues sur l'image
 * (title_pill, body_pill, list_pills, quote). Audit stories 07/09/2026 : le
 * gate ne mesurait que `text`, jamais les pastilles, alors que ce sont elles
 * qui portent les slogans passe-partout (« SI ÇA TE PARLE », « POURQUOI JE
 * FAIS ÇA »).
 */
export function extractStoriesTexts(stories: any[]): string {
  const lines: string[] = [];
  if (!Array.isArray(stories)) return "";
  for (let i = 0; i < stories.length; i++) {
    const st = stories[i];
    const num = i + 1;
    if (typeof st?.text === "string" && st.text.trim()) lines.push(`[STORY ${num} - TEXT] ${st.text.trim()}`);
    const v = st?.visual;
    if (v && typeof v === "object") {
      if (typeof v.title_pill === "string" && v.title_pill.trim()) lines.push(`[STORY ${num} - TITLE] ${v.title_pill.trim()}`);
      if (typeof v.body_pill === "string" && v.body_pill.trim()) lines.push(`[STORY ${num} - BODY] ${v.body_pill.trim()}`);
      if (Array.isArray(v.list_pills)) {
        v.list_pills.forEach((it: unknown, k: number) => {
          if (typeof it === "string" && it.trim()) lines.push(`[STORY ${num} - ITEM ${k + 1}] ${it.trim()}`);
        });
      }
      if (typeof v.quote === "string" && v.quote.trim()) lines.push(`[STORY ${num} - QUOTE] ${v.quote.trim()}`);
    }
  }
  return lines.join("\n");
}

/**
 * Même matière que extractStoriesTexts mais SANS marqueurs : c'est ce texte-là
 * qu'on MESURE (les « [STORY 1 - TEXT] » contiennent des chiffres que le
 * détecteur de chiffres inventés compterait à tort).
 */
export function storiesAuditableText(stories: any[]): string {
  return extractStoriesTexts(stories).replace(/^\[STORY \d+ - [A-Z]+(?: \d+)?\] /gm, "");
}

/** Bornes des pastilles (mêmes que le brief stories) : une correction qui les casse est ignorée. */
const STORY_TITLE_MAX_WORDS = 8;
// Le brief et le renderer stories acceptent le texte complet jusqu'à 350 car.
// La passe de correction doit pouvoir le réinjecter sans le tronquer.
const STORY_BODY_MAX_CHARS = 350;
const STORY_ITEM_MAX_WORDS = 12;

/**
 * Réinjecte un bloc annoté corrigé dans la liste de stories. Ne touche QUE
 * les champs présents dans le bloc, avec la garde de fidélité
 * keepUnlessRealEdit ; une ligne absente, vide ou hors gabarit garde
 * l'original. Renvoie une COPIE profonde (l'original n'est jamais muté), plus
 * le nombre de champs réellement changés — 0 = correction sans effet.
 */
export function reinjectStoriesTexts(stories: any[], correctedBlock: string): { stories: any[]; changed: number } {
  const result: any[] = JSON.parse(JSON.stringify(stories));
  const corrections = new Map<string, string>();
  const regex = /\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(correctedBlock)) !== null) {
    corrections.set(match[1].trim(), match[2].trim());
  }
  let changed = 0;
  const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const apply = (holder: any, field: string, key: string, ok: (t: string) => boolean) => {
    if (!holder || !corrections.has(key)) return;
    const candidate = corrections.get(key)!;
    if (!candidate || !ok(candidate)) return;
    const val = keepUnlessRealEdit(holder[field], candidate);
    if (val !== holder[field]) {
      holder[field] = val;
      changed++;
    }
  };
  for (let i = 0; i < result.length; i++) {
    const st = result[i];
    const num = i + 1;
    apply(st, "text", `STORY ${num} - TEXT`, () => true);
    const v = st?.visual;
    if (v && typeof v === "object") {
      apply(v, "title_pill", `STORY ${num} - TITLE`, (t) => wordCount(t) <= STORY_TITLE_MAX_WORDS);
      apply(v, "body_pill", `STORY ${num} - BODY`, (t) => t.length <= STORY_BODY_MAX_CHARS);
      if (Array.isArray(v.list_pills)) {
        for (let k = 0; k < v.list_pills.length; k++) {
          const key = `STORY ${num} - ITEM ${k + 1}`;
          if (!corrections.has(key)) continue;
          const candidate = corrections.get(key)!;
          if (!candidate || wordCount(candidate) > STORY_ITEM_MAX_WORDS) continue;
          const val = keepUnlessRealEdit(v.list_pills[k], candidate);
          if (val !== v.list_pills[k]) {
            v.list_pills[k] = val;
            changed++;
          }
        }
      }
      apply(v, "quote", `STORY ${num} - QUOTE`, () => true);
    }
  }
  return { stories: result, changed };
}

/**
 * Passe de correction d'une séquence de stories, story par story (même
 * mécanique que le carrousel : extraction annotée → Haiku → réinjection par
 * marqueur). Renvoie une nouvelle liste ; l'original n'est jamais muté. En cas
 * d'échec ou de réponse inexploitable, renvoie l'original avec changed = 0.
 */
export async function applyCorrectionPassStories(
  stories: any[],
  options: CorrectionOptions = {},
): Promise<{ stories: any[]; changed: number }> {
  const { skipIfShorterThan = 150, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;
  const unchanged = { stories, changed: 0 };
  if (!enabled || !Array.isArray(stories) || stories.length === 0) return unchanged;
  const textBlock = extractStoriesTexts(stories);
  if (!textBlock || textBlock.length < skipIfShorterThan) {
    logger?.(`[correction-pass:stories] SKIPPED (text too short: ${textBlock?.length})`);
    return unchanged;
  }
  try {
    logger?.(`[correction-pass:stories] STARTED, text block length: ${textBlock.length}`);
    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CORRECTION_PROMPTS.stories),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes de la séquence à corriger :\n\n${textBlock}`
        : `Voici les textes de la séquence à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs,
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);
    if (!correctedBlock || !/\[STORY 1 - /.test(correctedBlock)) {
      logger?.(`[correction-pass:stories] FALLBACK (réponse sans marqueurs: ${correctedBlock?.length})`);
      return unchanged;
    }
    const out = reinjectStoriesTexts(stories, correctedBlock);
    logger?.(`[correction-pass:stories] DONE, ${out.changed} champ(s) modifié(s)`);
    return out;
  } catch (error) {
    logger?.(`[correction-pass:stories] ERROR: ${error}`);
    console.error(`[correction-pass:stories] Failed, using original:`, error);
    return unchanged;
  }
}

export async function applyCorrectionPassReel(
  parsedReel: unknown,
  options: CorrectionOptions = {},
): Promise<unknown> {
  const { skipIfShorterThan = 150, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:reel-json] SKIPPED (disabled)`);
    return parsedReel;
  }

  try {
    const { extractReelTexts, reinjectReelTexts } = await import("./reel-postprocess.ts");
    const textBlock = extractReelTexts(parsedReel);
    if (!textBlock || textBlock.length < skipIfShorterThan) {
      logger?.(`[correction-pass:reel-json] SKIPPED (text too short: ${textBlock?.length})`);
      return parsedReel;
    }

    logger?.(`[correction-pass:reel-json] STARTED, text block length: ${textBlock.length}`);

    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CORRECTION_PROMPTS.reel),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes du reel à corriger :\n\n${textBlock}`
        : `Voici les textes du reel à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs,
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);

    if (!correctedBlock || correctedBlock.length < 100 || !correctedBlock.includes("[SECTION 1")) {
      logger?.(`[correction-pass:reel-json] FALLBACK (corrected block invalid: ${correctedBlock?.length})`);
      return parsedReel;
    }

    const corrected = reinjectReelTexts(parsedReel, correctedBlock);
    logger?.(`[correction-pass:reel-json] DONE`);
    return corrected;
  } catch (error) {
    logger?.(`[correction-pass:reel-json] ERROR: ${error}`);
    console.error(`[correction-pass:reel-json] Failed, using original:`, error);
    return parsedReel;
  }
}

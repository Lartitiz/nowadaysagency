import { callAnthropicSimple, getModelForAction, type AnthropicModel } from "./anthropic.ts";

export type CorrectionFormat = "linkedin" | "carousel" | "newsletter" | "instagram_caption" | "reel" | "stories";

export interface CorrectionOptions {
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
   * Modèle de la correction (défaut : le modèle "content", Sonnet). La correction
   * est une édition mécanique à règles fermées : les appelants sensibles à la
   * latence (carrousel qualité normale) passent Haiku, ~2x plus rapide.
   */
  model?: AnthropicModel;
}

/**
 * Prompts de correction par format. Chaque prompt suit la même structure :
 * - TEST FONDAMENTAL (humain vs IA)
 * - Règles de COMPTAGE (pas de détection)
 * - Exemples AVANT/APRÈS multiples
 * - AUTO-VÉRIFICATION FINALE
 */
const CORRECTION_PROMPTS: Record<CorrectionFormat, string> = {
  linkedin: `Tu es un éditeur LinkedIn exigeant. Tu reçois un post et tu dois le CORRIGER systématiquement. Ton job n'est PAS de juger si c'est "déjà bien", c'est de traquer et corriger TOUS les patterns IA, même subtils.

══ TEST FONDAMENTAL ══
Lis le post à voix haute mentalement. Pose-toi : "Est-ce que ce post pourrait avoir été écrit par une IA bien entraînée ?"
Si oui → réécris les passages qui te font hésiter.
Le critère : INDISTINGUABLE d'un humain.

══ CORRECTIONS OBLIGATOIRES ══

1. PHRASES COURTES CONSÉCUTIVES (compte-les) :
   → 2 phrases consécutives < 10 mots = FUSIONNE.
   → 1 phrase isolée < 10 mots seule = INTÈGRE dans un paragraphe.
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

5. ANAPHORES (3+ phrases qui démarrent pareil) :
   ❌ "Par dire les choses. Par ne pas forcer. Par être direct·e."
   → ✅ "En disant les choses sans forcer personne à deviner."

6. EMPILEMENT INSPIRATIONNEL (2+ phrases-valeurs sans exemple) :
   → Remplace par UN exemple concret.

7. ACCROCHE PROMESSE/SLOGAN : remplace par un FAIT concret.

8. CTA GÉNÉRIQUE ("Et toi/vous, qu'en penses-tu ?") : question SPÉCIFIQUE au sujet ou supprime.

9. CONCLUSION QUI RÉSUME : remplace par une ouverture (question/tension/invitation).

10. GENRÉ : ajoute le point médian.

11. REDONDANCE : 2+ paragraphes même idée → garde le plus CONCRET.

12. LONGUEUR : cible 1300-2000 caractères. Ne raccourcis PAS un post déjà dans cette fourchette.

══ RÈGLES ABSOLUES ══
- Garde le SENS et la CONVICTION. Tu corriges la FORME, pas le FOND.
- N'invente pas de nouveaux faits.
- JAMAIS de tiret cadratin (—).
- Écriture inclusive avec point médian.

══ AUTO-VÉRIFICATION FINALE ══
□ 2 phrases courtes consécutives ? → fusionne
□ Formule manufacturée restante ? → réécris
□ La conclusion ouvre vraiment ? → vérifie
□ INDISTINGUABLE d'un humain ? → si non, recommence

Réponds UNIQUEMENT avec le post corrigé, rien d'autre. Pas de JSON, pas d'explication.`,

  carousel: `Tu es un éditeur de carrousels Instagram exigeant. Tu reçois un carrousel et tu dois le CORRIGER slide par slide.

══ TEST FONDAMENTAL ══
Pour chaque slide, demande-toi : "Cette slide pourrait-elle avoir été écrite par une IA ?"
Si oui → réécris.

══ CORRECTIONS OBLIGATOIRES ══

1. SLIDE-TITRE (slide < 15 mots hors slide 1) :
   → Développer à 2-4 phrases avec un exemple concret.

2. NUMÉROTATION DE CONSEILS ("Conseil 1", "Erreur n°2", "Étape 3") :
   → Reformuler comme moment dans un arc narratif.

3. SLIDES REDONDANTES OU CASCADE D'AMPLIFICATION :
   → Cascade = même idée reformulée plus fort d'une slide à l'autre ("c'est important" → "c'est crucial" → "c'est vital"), ou paraphrase qui reprend le même mot-clé central sans rien ajouter. Dans ce cas SEULEMENT : fusionne les deux slides, ou remplace la plus faible par un nouvel angle (exemple, contre-exemple, chiffre, scène).
   → Chaînage narratif = idée NOUVELLE (fait, scène, donnée, exemple, bascule) accrochée à la précédente par un connecteur ("Sauf que", "Et puis", "C'est là que", "Puis", "Alors", "Résultat") ou une reprise lexicale. C'est VOULU, on ne touche pas.
   → Test de distinction : si la slide qui ouvre par "Sauf que / Et là / C'est là que" apporte un contenu nouveau (fait, détail, retournement) → garde l'ouverture intacte. Si elle ne fait que reformuler la précédente en plus fort → réécris.

4. RAFALES DE PHRASES COURTES (2+ phrases < 10 mots dans une slide) :
   → Fusionne en prose fluide.
   ❌ "Tu sautes des étapes. Tu parles en raccourcis. Tu crées pour toi."
   → ✅ "Tu sautes des étapes, tu parles en raccourcis et tu finis par créer pour toi sans t'en rendre compte."

5. ANAPHORE TU/JE (3+ phrases consécutives qui démarrent par même mot) :
   → Varie les structures.

6. RÈGLE ANTI-TU GLOBALE :
   → Compte les slides où le sujet principal est "TU". Si > 2 slides : convertir en JE ou NOUS.
   → Le "TU" est pour interpellation ponctuelle, pas voix narrative.

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
    → Si l'overlay est une formule chic ou pourrait s'appliquer à n'importe quelle photo ("Quand la magie opère", "Un instant suspendu", "L'art du détail"), réécris-le en phrase ANCRÉE dans CE moment précis : un fait sensoriel (ce qu'on voit/entend/sent), un détail concret, ou une parole captée. 5-15 mots max. Pas d'abstraction décorative.
    → NE JAMAIS supprimer le connecteur narratif ("Sauf que", "Et puis", "C'est là que"…) ou la reprise lexicale qui ouvre un overlay : c'est le chaînage voulu entre slides. Si tu réécris l'overlay, la version réécrite doit conserver un lien explicite avec la slide précédente (connecteur ou reprise d'un mot-clé).
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
Cette newsletter pourrait-elle avoir été écrite par une IA ? Si oui → réécris.

══ CORRECTIONS OBLIGATOIRES ══

1. INTRO PLATE ("Bonjour, j'espère que tu vas bien", "Aujourd'hui je voulais te parler de") :
   → Remplace par une scène concrète, un moment vécu, une phrase entendue.

2. CONCLUSION QUI RÉSUME ("Pour résumer", "En conclusion", "Les 3 points à retenir") :
   → Ouverture : question, tension non résolue, invitation.

3. PHRASES COURTES CONSÉCUTIVES (broetry) : 2+ < 10 mots → fusionne.

4. FORMULES MANUFACTURÉES : voir liste LinkedIn → réécris en plus brut.

5. EMPILEMENT INSPIRATIONNEL : 2+ phrases-valeurs → exemple concret.

6. MANQUE D'APARTÉS PERSONNELS : ajoute 1-2 apartés entre parenthèses (autocorrection humaine). PAS d'italique : l'email part en texte brut.

7. LONGUEUR INSUFFISANTE : si < 1500 caractères, développe avec un exemple supplémentaire.

8. MARKDOWN RÉSIDUEL (**gras**, *italique*, ## titre) : supprime les délimiteurs, garde le texte.

══ RÈGLES ABSOLUES ══
- Garde le SENS et la CONVICTION.
- Cible : 2000-3000 caractères.
- JAMAIS de tiret cadratin (—).
- JAMAIS de markdown : texte brut uniquement.
- Écriture inclusive.

Réponds UNIQUEMENT avec la newsletter corrigée, rien d'autre.`,

  instagram_caption: `Tu es un éditeur de caption Instagram exigeant. Tu reçois une caption et tu dois la CORRIGER.

══ TEST FONDAMENTAL ══
INDISTINGUABLE d'un humain ? Sinon → réécris.

══ CORRECTIONS OBLIGATOIRES ══

1. ACCROCHE FAIBLE (125 premiers car.) : remplace par fait concret/scène vécue.
   ❌ "Tu fais sûrement cette erreur..." → ✅ "J'ai changé 4 mots dans ma bio. Les DM ont doublé."

2. PHRASES COURTES CONSÉCUTIVES : 2+ < 10 mots → fusionne.

3. FORMULES MANUFACTURÉES : réécris en plus brut.

4. ÉNUMÉRATIONS RYTHMIQUES PARFAITES : casse la symétrie.

5. ANAPHORES : varie les débuts de phrase.

6. CTA GÉNÉRIQUE : question spécifique au sujet ou supprime.

7. MANQUE DE CONCRET : ajoute un exemple, un chiffre, une situation.

══ RÈGLES ABSOLUES ══
- Cible selon l'objectif initial (court 300-600 / moyen 400-800 / long 600-1200).
- JAMAIS de tiret cadratin (—).
- Écriture inclusive.

Réponds UNIQUEMENT avec la caption corrigée, rien d'autre.`,

  reel: `Tu es un éditeur de scripts Reel exigeant.

══ CORRECTIONS OBLIGATOIRES ══

1. HOOK FAIBLE (0-3s) : remplace par une AFFIRMATION CHOC ou un FAIT concret.
   ❌ "Aujourd'hui on va parler de..." → ✅ "Arrête de poster tous les jours."

2. SCRIPT QUI LISTE au lieu de RACONTER : réécris en scène concrète.

3. TEXTE OVERLAY qui répète mot pour mot le texte parlé : varie.

4. PHRASES COURTES CONSÉCUTIVES dans le texte parlé : fusionne.

5. CTA GÉNÉRIQUE : question spécifique ou ouverture.

══ RÈGLES ABSOLUES ══
- Garde le format de sortie original (timing, sections, overlay, cuts).
- 150-300 mots de texte parlé total.
- JAMAIS de tiret cadratin (—).

Réponds UNIQUEMENT avec le script corrigé en gardant la structure JSON originale.`,

  stories: `Tu es un éditeur de séquences Stories Instagram exigeant.

══ CORRECTIONS OBLIGATOIRES ══

1. STORIES TROP "POST" (formelles, structurées comme un article) : reformule en ton "message vocal à une amie".

2. SONDAGE GÉNÉRIQUE pour faire interactif ("Quel est ton format préféré ?") : remplace par une vraie question qui révèle quelque chose.

3. CONCLUSION QUI RÉSUME : remplace par une ouverture ou un cliff-hanger.

4. STORIES TROP LONGUES (> 4 lignes) : raccourcis.

5. MANQUE D'INTIMITÉ : ajoute des marqueurs d'oralité ("bon", "en vrai", "attends").

══ RÈGLES ABSOLUES ══
- Garde le format de sortie (texte, type, ambiance visuelle).
- Lecture par story : 3-5 secondes max.
- JAMAIS de tiret cadratin (—).

Réponds UNIQUEMENT avec la séquence corrigée en gardant la structure originale.`,
};

const CAROUSEL_CORRECTION_PROMPT = `Tu es un éditeur de carrousels Instagram/LinkedIn exigeant. Tu reçois les TEXTES extraits d'un carrousel, annotés par marqueurs [SLIDE N - TYPE].

══ TON JOB ══
Corriger UNIQUEMENT le texte. Retourner le MÊME format annoté avec les textes corrigés.

══ CORRECTIONS OBLIGATOIRES ══

1. FORMULE "X SANS Y, C'EST Z" (slide 1 ou ailleurs) :
   ❌ "La créativité sans clarté, c'est du bruit"
   → ✅ Remplace par un FAIT CONCRET ou une SCÈNE VÉCUE. Ex: "J'ai passé 3h sur un visuel. Personne n'a compris ce que je vendais."

2. RÈGLE ANTI-TU (CRITIQUE) :
   → Compte les slides où "tu" est le SUJET PRINCIPAL.
   → Si > 2 slides en mode TU → RÉÉCRIS en JE ou NOUS.
   → Le TU est réservé à 1-2 interpellations ponctuelles, JAMAIS comme voix narrative.
   ❌ "Tu peux avoir le feed le plus beau... tu sais ce que tu proposes..."
   → ✅ "J'ai eu le feed le plus beau... je savais ce que je proposais..."

3. CTA GÉNÉRIQUE (dernière slide) :
   ❌ "Et toi, tu commences par quoi ?" / "Dis-moi en commentaire" / "Échangeons" / "DM ouvert" / "Parlons-en" (seuls ou combinés : "Échangeons → DM ouvert" reste générique)
   → ✅ Question ou invitation SPÉCIFIQUE au sujet, qui REPREND un mot ou une image du cœur du carrousel. Ex: "Quelle est la dernière slide qui t'a fait arrêter de scroller, et pourquoi ?"

4. RÉCITATION DU SUJET (slide qui répète le brief sans le digérer) :
   → Reformule avec un ARGUMENT PROPRE, un exemple, une nuance.

5. PHRASES COURTES CONSÉCUTIVES (2+ phrases < 10 mots) :
   → Fusionne en prose fluide. NE PAS introduire de "tu" pour fluidifier.
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

10. STORYTELLING FABRIQUÉ (CRITIQUE, anti-invention) :
   → Si une slide contient "hier", "ce matin", "la semaine dernière", "lundi", "il y a X jours/semaines", "j'ai reçu un message", "j'ai vu passer", "une cliente m'a dit", "un client m'a écrit" + scène détaillée → c'est probablement une scène fabriquée par l'IA. RÉÉCRIS au présent intemporel généralisant.
   ❌ "Hier, j'ai reçu trois messages quasi identiques. Toutes me demandaient…"
   → ✅ "Ce qui revient en ce moment dans ma pratique : trois messages quasi identiques. Tous me demandent…"
   ❌ "La semaine dernière, une cliente m'a dit : 'je n'ose pas poster'."
   → ✅ "Ce que j'entends souvent : 'je n'ose pas poster'."
   → Exception : laisse intact UNIQUEMENT si le BODY original contient un détail spécifique qui prouve que c'est un vrai vécu (nom de marque, chiffre précis, contexte unique). En cas de doute → généralise.

11. AUDIENCE DIAGNOSTIQUÉE (anti-victimisation) :
   → Si une slide diagnostique l'état mental de la lectrice ("tu attends la permission", "tu n'oses pas", "tu te dévalorises", "tu te compares", "tu manques de confiance", "tu te sabotes", "elle attend qu'on lui dise…") → RÉÉCRIS en constat sur le sujet ou sur le discours dominant.
   ❌ "Tu attends qu'on te valide pour publier."
   → ✅ "On a transformé la publication en demande d'autorisation. C'est une logique de cour, pas de métier."
   ❌ "Tu te compares à des comptes plus gros et tu te décourages."
   → ✅ "La comparaison est devenue le sport national du feed. C'est épuisant pour tout le monde."
   → Pas de syndrome psy nommé (imposteur, peur du rejet, etc.) sauf si l'utilisatrice l'avait elle-même nommé.

12. RETOURNEMENT PAR NÉGATION EN SÉRIE (LE tic IA n°1 des contenus d'opinion) :
   → COMPTE sur l'ENSEMBLE (slides + caption) les occurrences de la famille, toutes variantes confondues : "C'est pas X. C'est Y." / "Pas X. Juste Y." / "X. Pas Y." / "Ce n'est pas X, c'est Y" / "X n'est plus Y. C'est Z."
   → 0 ou 1 occurrence : ne touche à rien. 2+ : garde LA plus forte, réécris chacune des autres en affirmation directe (sans le pivot négatif).
   ❌ (3 occurrences dans le même carrousel) "Des gens. Pas des statistiques." + "Ce n'est pas faux. C'est juste insuffisant." + "Ce n'est plus un symbole. C'est une décision."
   → ✅ garder une seule des trois, et par ex. "Ce n'est pas faux. C'est juste insuffisant." → "C'est vrai, mais ça ne suffit plus quand personne ne sait que le projet existe."
══ FORMAT DE RÉPONSE ══
Retourne EXACTEMENT le même format annoté :
[SLIDE 1 - HOOK] texte corrigé
[SLIDE 2 - TITLE] texte corrigé
[SLIDE 2 - BODY] texte corrigé
...
[CAPTION] texte corrigé

══ RÈGLES ABSOLUES ══
- Garde le SENS et la CONVICTION. Tu corriges la FORME, pas le FOND.
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
□ INDISTINGUABLE d'un humain ? → si non, recommence`;

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
      const val = corrections.get(titleKey)!;
      if (slides[i].title !== undefined) slides[i].title = val;
      else if (slides[i].hook !== undefined) slides[i].hook = val;
      else if (slides[i].accroche !== undefined) slides[i].accroche = val;
      else slides[i].title = val;
    }

    // Body
    const bodyKey = `SLIDE ${num} - BODY`;
    if (corrections.has(bodyKey)) {
      const val = corrections.get(bodyKey)!;
      if (slides[i].body !== undefined) slides[i].body = val;
      else if (slides[i].text !== undefined) slides[i].text = val;
      else if (slides[i].content !== undefined) slides[i].content = val;
      else slides[i].body = val;
    }

    // Punchline
    const punchKey = `SLIDE ${num} - PUNCHLINE`;
    if (corrections.has(punchKey)) {
      slides[i].punchline = corrections.get(punchKey)!;
    }

    // Overlay text (mixte / photo_full)
    const overlayKey = `SLIDE ${num} - OVERLAY`;
    if (corrections.has(overlayKey)) {
      slides[i].overlay_text = corrections.get(overlayKey)!;
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
      if (corrections.has("CAPTION - HOOK")) original.hook = corrections.get("CAPTION - HOOK")!;
      if (corrections.has("CAPTION - BODY")) original.body = corrections.get("CAPTION - BODY")!;
      if (corrections.has("CAPTION - CTA")) original.cta = corrections.get("CAPTION - CTA")!;
    } else if (corrections.has("CAPTION")) {
      // Format string legacy
      result[captionTarget] = corrections.get("CAPTION")!;
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
  const { skipIfShorterThan = 200, enabled = true, logger, model, extraInstructions } = options;

  if (!enabled) {
    logger?.(`[correction-pass:${format}] SKIPPED (disabled)`);
    return content;
  }

  if (!content || content.length < skipIfShorterThan) {
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

    const corrected = await callAnthropicSimple(
      model ?? getModelForAction("content"),
      correctionPrompt,
      extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici le contenu à corriger :\n\n"""\n${content}\n"""`
        : `Voici le contenu à corriger :\n\n"""\n${content}\n"""`,
      0.3,
      4096
    );

    if (!corrected || corrected.length < skipIfShorterThan) {
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
  const { skipIfShorterThan = 300, enabled = true, logger, model, extraInstructions } = options;

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
    const textBlock = extractCarouselTexts(parsed);
    if (!textBlock || textBlock.length < skipIfShorterThan) {
      logger?.(`[correction-pass:carousel-json] SKIPPED (text too short: ${textBlock?.length})`);
      return jsonContent;
    }

    logger?.(`[correction-pass:carousel-json] STARTED, text block length: ${textBlock.length}`);

    // Step 3: Send only text to correction
    const correctedBlock = await callAnthropicSimple(
      model ?? getModelForAction("content"),
      CAROUSEL_CORRECTION_PROMPT,
      extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes du carrousel à corriger :\n\n${textBlock}`
        : `Voici les textes du carrousel à corriger :\n\n${textBlock}`,
      0.3,
      4096
    );

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

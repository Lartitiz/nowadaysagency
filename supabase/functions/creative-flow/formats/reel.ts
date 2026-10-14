// Reel (creative-flow) : normalisation des accroches proposées, passe de
// qualité du script, contrôle tu / vous du script. Extrait À L'IDENTIQUE
// d'index.ts au lot 3 (13/10/2026). Modifier le reel = modifier CE fichier
// (finition du script : _shared/reel-postprocess.ts) ; les briques communes à
// tous les formats sont dans ../shared.ts. Voir docs/creation-contenu/CARTE.md.

import { authoredContentSource, testimonySourceText } from "../../_shared/editorial-voice.ts";
import { enforceAudienceAddress, type AudienceAddress } from "../../_shared/audience-address.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { applyCorrectionPassReel } from "../../_shared/correction-pass.ts";
import { analyzeTextRedac, buildTextFixInstructions, enforceNoInventedTestimonials, enforceResearchNumberSources, fixElisionsInFields, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { countReelSpokenWords, enforceReelNoFaceCam, enforceSelectedReelHook, finalizeReelScript, reelAuditableText, extractReelTexts, reinjectReelTexts, reelTemplateLeaks, reelOverlaysNotFromScript } from "../../_shared/reel-postprocess.ts";
import { recapHooksLine } from "../../_shared/multi-subject.ts";
import { CORRECTION_ABORT_MS, addrOpts, gateNumbers } from "../shared.ts";

// ═══ NORMALISATION HOOKS (lot 7) ═══
// Le tool forcé garantit le JSON de TRANSPORT, pas les types internes : vu en
// live au premier test (12/07), le modèle peut remplir `hooks` avec une STRING
// JSON au lieu du tableau d'objets. On déballe en déterministe — sinon le front
// tombe en fallback « Continuer sans choisir » alors que les hooks existent.
// Mute `parsed` en place ; retourne une Response à court-circuiter si aucun
// hook n'est récupérable (« 200 menteur »), sinon null pour continuer.
export function normalizeHooksResponse(parsed: any, params: { body: any; rawContent: string; corsHeaders: Record<string, string> }): Response | null {
  const { body, rawContent, corsHeaders } = params;
  // Forme reçue AVANT normalisation : c'est la seule trace exploitable le
  // jour où l'écran des angles retombe à zéro (03/08 : aucun log ne disait
  // par quelle branche le tableau s'était vidé).
  const shapeIn = Array.isArray(parsed.hooks)
    ? `array[${parsed.hooks.length}]`
    : typeof parsed.hooks;
  if (typeof parsed.hooks === "string") {
    const inner = tryParseAiJson<any>(parsed.hooks, "creative-flow:hooks-unwrap");
    parsed.hooks = Array.isArray(inner) ? inner : Array.isArray(inner?.hooks) ? inner.hooks : [];
  }
  if (!Array.isArray(parsed.hooks)) parsed.hooks = [];
  // Entrées en simple CHAÎNE : même dérive que le `hooks` stringifié du
  // 12/07, un cran plus bas (le modèle liste les phrases sans les
  // envelopper). Récupérable → on reconstruit l'objet minimal. Le front
  // n'affiche que les champs présents, il ne manquera qu'un badge.
  parsed.hooks = parsed.hooks.map((h: any) =>
    typeof h === "string" && h.trim() ? { text: h.trim() } : h
  );
  // Objets valides uniquement : un hook sans texte parlé est inutilisable.
  parsed.hooks = parsed.hooks.filter((h: any) => h && typeof h === "object" && typeof h.text === "string" && h.text.trim());
  // Élisions déterministes AVANT affichage : le hook choisi est ensuite
  // verrouillé tel quel sur le script (enforceSelectedReelHook) — une
  // coquille née ici se propagerait partout (vécu 21/07 : « qu'on marchand »).
  for (const h of parsed.hooks) fixElisionsInFields(h, ["text", "text_overlay"]);

  // ZÉRO angle récupérable = échec, pas un succès. Un 200 avec `hooks: []`
  // est un « 200 menteur » : le front le lisait comme une réponse valide et
  // n'avait plus qu'un `throw new Error("empty")` illisible à afficher.
  if (parsed.hooks.length === 0) {
    console.warn(JSON.stringify({
      type: "hooks_vides",
      shape_in: shapeIn,
      exclude_count: Array.isArray((body as Record<string, unknown>).exclude_hooks)
        ? ((body as Record<string, unknown>).exclude_hooks as unknown[]).length
        : 0,
      raw: String(rawContent || "").slice(0, 500),
    }));
    return new Response(
      JSON.stringify({ error: "Je n'ai pas réussi à préparer les angles d'attaque. Réessaie, ou laisse l'IA choisir." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
}

// ═══ PASSE QUALITÉ REEL (audit reels 12/07) ═══
// Le reel était le seul format riche sans filet post-génération. Trois étages :
// 1. face_cam=non : enforcement déterministe de la structure (format_type,
//    format_visuel, plan_tournage) — la passe texte ne touche pas ces champs.
// 2. Correction JSON-aware (textes seuls, via bloc balisé) avec instructions
//    ciblées mesurées en code : chiffres sans source (redac-gate) + fuites de
//    gabarit ("SAUVEGARDE", "Nouveau Reel" : 8/8 au corpus d'audit).
// 3. Recalibrage déterministe des durées : la durée affichée découle du texte
//    réel (2,5 mots/s). Mesuré à l'audit : durées déclarées sous-estimées de
//    40-80 % (90 s réelles annoncées "50 sec" = pénalité de distribution).
/** Renvoie les échos d'accroche AVANT correction (undefined = garde non armée, hook verrouillé ou passe échouée). */
export async function applyReelQualityPass(parsed: any, params: { body: any; effectiveObjective?: string | null; fullContext: string; researchSource?: string; brandGuardText?: string; echoSubject?: string; previousHooks?: string[]; audienceAddress?: AudienceAddress | null }): Promise<number | undefined> {
  const { body, effectiveObjective, fullContext, researchSource, brandGuardText, echoSubject, previousHooks } = params;
  let echoesBefore: number | undefined;
  if (body.face_cam === "non" && enforceReelNoFaceCam(parsed)) {
    console.log("[creative-flow] reel face_cam=non : structure convertie en voix off");
  }
  // Hook CHOISI à l'étape hook_selection : verrouillé sur la section 1 AVANT
  // la correction (la génération peut paraphraser, la correction peut « améliorer » —
  // ni l'une ni l'autre ne décide à la place de l'utilisatrice).
  const hasChosenHook = enforceSelectedReelHook(parsed, body.selected_hook);
  try {
    const { allowed: reelAllowed, research: reelResearch } = gateNumbers([
      typeof body.context === "string" ? body.context : "",
      (body.preGenAnswers || body.pre_gen_answers) ? JSON.stringify(body.preGenAnswers || body.pre_gen_answers) : "",
      body.selected_hook ? JSON.stringify(body.selected_hook) : "",
      typeof body.news_context === "string" ? body.news_context : "",
      fullContext || "",
    ], researchSource);
    // 🔑 L'écho d'accroche n'est mesuré QUE si le hook n'est pas verrouillé.
    // Quand l'utilisatrice a choisi son hook à l'étape hook_selection, la passe
    // reçoit déjà l'ordre de le recopier À L'IDENTIQUE : y ajouter « réécris
    // l'accroche » ferait deux consignes contradictoires dans le même prompt,
    // exactement le défaut résorbé par #888. Son choix prime sur notre garde.
    const hookVerrouille =
      hasChosenHook ||
      (typeof body.selected_hook?.text === "string" && body.selected_hook.text.trim() && !body.selected_hook.text.trim().startsWith("("));
    const reelRedac = analyzeTextRedac(
      reelAuditableText(parsed),
      reelAllowed,
      brandGuardText,
      hookVerrouille ? undefined : { previousHooks, subject: echoSubject },
      reelResearch,
      testimonySourceText(body),
    );
    if (!hookVerrouille) echoesBefore = hookEchoesBefore(reelRedac, { previousHooks, subject: echoSubject });
    const extras: string[] = [];
    const redacFix = buildTextFixInstructions(reelRedac);
    if (redacFix) extras.push(redacFix);
    const leaks = reelTemplateLeaks(parsed);
    if (leaks.length) {
      extras.push(`FUITES DE GABARIT DÉTECTÉES (réécris chacune) :\n${leaks.map((l) => `- ${l}`).join("\n")}`);
    }
    // Texte à l'écran = uniquement ses mots (socle, 05/10/2026). Le hook
    // verrouillé n'est pas signalé (son choix prime) ; un overlay encore hors
    // de ses mots après la passe est retiré par finalizeReelScript.
    const offScript = reelOverlaysNotFromScript(parsed).filter((n) => !(n === 1 && hookVerrouille));
    if (offScript.length) {
      extras.push(`TEXTE À L'ÉCRAN HORS DE SES MOTS : ${offScript.map((n) => `[SECTION ${n} - OVERLAY]`).join(", ")} contient des mots que son texte parlé ne dit pas. Remplace chacun par un extrait de 3 à 8 mots recopié tel quel du [SECTION n - PARLE] de la même section (son mot ou son chiffre fort), sans majuscules imposées.`);
    }
    if (body.face_cam === "non") {
      extras.push(`CE REEL EST EN VOIX OFF (l'utilisatrice ne se montre pas) : aucun texte parlé ne doit dire "regarde la caméra" ni supposer qu'on la voit parler.`);
    }
    if (hookVerrouille) {
      extras.push(`LE HOOK ([SECTION 1 - PARLE] et [SECTION 1 - OVERLAY]) A ÉTÉ CHOISI PAR L'UTILISATRICE : recopie-le STRICTEMENT à l'identique, ne le réécris sous aucun prétexte (la règle "hook faible" ne s'applique pas à lui).`);
    }
    // Plafond de mots par objectif (calibrage du brief), mesuré en code :
    // au re-test post-#527, la visibilité sortait encore à ~95 mots (cible
    // 40-80). La durée affichée est honnête (recalibrage), mais un reel
    // reach doit rester court → coupe pilotée par la passe de correction.
    const reelWordCap = effectiveObjective === "visibilite" ? 80
      : (effectiveObjective === "confiance" || effectiveObjective === "vente" || effectiveObjective === "credibilite") ? 190
      : 150;
    const reelWords = countReelSpokenWords(parsed);
    if (reelWords > reelWordCap) {
      extras.push(`TROP LONG POUR L'OBJECTIF "${effectiveObjective || "standard"}" : ${reelWords} mots parlés, plafond ${reelWordCap}. COUPE le texte parlé à ${reelWordCap} mots maximum : supprime les redites, la mise en contexte longue et les exemples secondaires. Ne touche PAS à la couche mécanisme (le POURQUOI) ni au hook. C'est une exception explicite à la règle "±10 %".`);
    }
    // Édition mécanique à règles fermées → Haiku (même choix que LinkedIn/carrousel).
    const corrected = await applyCorrectionPassReel(parsed, {
      logger: (msg) => console.log(msg),
      authoredText: authoredContentSource(body),
      sourceContext: [fullContext, researchSource, authoredContentSource(body)].filter(Boolean).join("\n"),
      model: "claude-haiku-4-5",
      extraInstructions: extras.length ? extras.join("\n\n") : undefined,
      abortTimeoutMs: CORRECTION_ABORT_MS,
    });
    if (corrected && typeof corrected === "object") {
      Object.assign(parsed, corrected);
    }
    // Chiffres de la recherche encore sans source : passe dédiée sur les textes balisés.
    if (reelResearch) {
      const analyzeBlock = (b: string) => analyzeTextRedac(reelAuditableText(reinjectReelTexts(parsed, b)), reelAllowed, undefined, undefined, reelResearch);
      const sourced = await enforceResearchNumberSources(extractReelTexts(parsed), analyzeBlock, reelResearch, {
        logger: (msg) => console.log(msg), abortTimeoutMs: CORRECTION_ABORT_MS,
      });
      if (sourced.applied) Object.assign(parsed, reinjectReelTexts(parsed, sourced.content));
    }
    // Témoignage ou vécu au passé inventé encore présent (« J'ai essayé.
    // Résultat : … ») : passe dédiée sur les textes balisés, relue par le code
    // (même mesure que la relecture, gardée seulement si le compte baisse et
    // qu'aucun autre compteur ne se dégrade). Le hook choisi reste reverrouillé
    // par finalizeReelScript ensuite.
    const analyzeTestimony = (b: string) => analyzeTextRedac(
      reelAuditableText(reinjectReelTexts(parsed, b)),
      reelAllowed,
      brandGuardText,
      hookVerrouille ? undefined : { previousHooks, subject: echoSubject },
      reelResearch,
      testimonySourceText(body),
    );
    const cleaned = await enforceNoInventedTestimonials(extractReelTexts(parsed), analyzeTestimony, {
      logger: (msg) => console.log(msg), abortTimeoutMs: CORRECTION_ABORT_MS,
    });
    if (cleaned.applied) Object.assign(parsed, reinjectReelTexts(parsed, cleaned.content));
  } catch (corrErr) {
    console.error("[creative-flow] correction-pass reel failed:", corrErr);
  }
  // Filets déterministes TOUJOURS appliqués, même si la correction a échoué :
  // - le hook choisi reste verrouillé (l'instruction de la passe est probabiliste) ;
  // - lecture_test = concat des texte_parle FINAUX (sinon le monologue affiché
  //   diverge du script corrigé — faille trouvée à la revue du 12/07) ;
  // - timings recomptés sur la version FINALE du texte.
  // (Ordre et détail : finalizeReelScript, _shared/reel-postprocess.ts.)
  // Tu ou vous (fiche de marque) : script, textes à l'écran, légende,
  // couverture et stories de suite, AVANT les filets finaux (le hook choisi
  // par l'utilisatrice reste reverrouillé tel qu'elle l'a choisi, la lecture
  // test et les durées suivent le texte final).
  await enforceReelAudienceAddress(parsed, params.audienceAddress);
  finalizeReelScript(parsed, body.selected_hook);
  return echoesBefore;
}

// ═══ GARDE PHOTO-D'ABORD + RÉSOLUTION PHOTOS BIBLIOTHÈQUE (stories) ═══
// Déplacées le 04/10/2026 dans _shared/story-formatting.ts
// (applyStoriesPhotoGuardAndResolution), appelées par finalizeStoriesLayout
// APRÈS la mise en forme : le plan visuel n'existe plus avant.

/** Accroches de reel proposées à l'étape « hooks » : ce qu'elle dira et ce qu'on lira. */
export const HOOKS_ADDRESS_FIELDS = ["hooks[].text", "hooks[].text_overlay"];

/** Reel : script parlé, textes à l'écran, légende, couverture, stories de suite (mêmes balises que la relecture). */
export async function enforceReelAudienceAddress(parsed: any, addr: AudienceAddress | null | undefined): Promise<void> {
  if (!addr || !parsed || typeof parsed !== "object") return;
  try {
    const block = extractReelTexts(parsed);
    if (!block) return;
    const o = addrOpts("reel");
    const res = await enforceAudienceAddress(block, addr, o);
    if (res.receipt && res.receipt.wrong_before > 0) console.log(JSON.stringify({ event: "audience_address", scope: o.scope, ...res.receipt }));
    if (res.receipt?.applied) Object.assign(parsed, reinjectReelTexts(parsed, res.content));
  } catch (e) {
    console.error("[creative-flow reel] contrôle tu/vous ignoré (script intact) :", e);
  }
}

// ═══ ÉTAPE « hooks » (lot 7) : outil structuré + consigne ═══
// Déplacés À L'IDENTIQUE depuis index.ts (fiche 3, lot A, 14/10/2026).
// _shared/angle-families_test.ts lit dans ce fichier la liste des types de
// hook (de la déclaration de l'outil jusqu'à la fonction de consigne) : ne pas
// écrire leurs noms exacts dans un commentaire placé avant elles.

// Lot 7 reels : 3 hooks d'ouverture proposés AVANT la génération complète.
// Le schéma reprend la forme exacte de `selected_hook` attendue par reelBrief
// (format-briefs.ts) : le choix de l'utilisatrice repart tel quel au step generate.
export const HOOKS_TOOL = {
  name: "proposer_hooks",
  description: "Retourne 3 hooks d'ouverture de reel, de types différents.",
  input_schema: {
    type: "object",
    properties: {
      hooks: {
        type: "array",
        description: "TABLEAU de 3 objets hook — jamais une chaîne de caractères, jamais du JSON stringifié",
        items: {
          type: "object",
          properties: {
            type: { type: "string", description: "vecu_perso | contre_intuition | objection_retournee | question_choc | fait_brut | scene_coupee" },
            type_label: { type: "string", description: "label court lisible du type, ex. « Vécu perso »" },
            text: { type: "string", description: "le hook PARLÉ, 8-20 mots, 1-2 phrases, tension immédiate" },
            text_overlay: { type: "string", description: "texte à l'écran en muet : extrait de 3 à 8 mots du hook parlé (text), recopié tel quel, qui se comprend seul ; casse normale, pas de majuscules imposées" },
            format_recommande: { type: "string", description: "face_cam_confession | voix_off_broll | hook_loop" },
            format_label: { type: "string", description: "label lisible de la structure, ex. « Voix off + B-roll »" },
            duree_cible: { type: "string", description: "durée estimée du reel avec ce hook, ex. « ~30 sec »" },
          },
          required: ["type", "type_label", "text", "text_overlay", "format_recommande", "format_label", "duree_cible"],
        },
      },
    },
    required: ["hooks"],
  },
};

export function buildHooksPrompt(params: {
  COMMON_PREFIX: string;
  answers?: any[];
  excludeHooksRaw: unknown;
  faceCam?: string | null;
  context: string;
  effectiveObjective?: string | null;
  objective?: string | null;
}): { systemPrompt: string; userPrompt: string } {
  const { COMMON_PREFIX, answers, excludeHooksRaw, faceCam, context, effectiveObjective, objective } = params;
  // Lot 7 reels : proposer 3 angles d'attaque AVANT la génération complète.
  // Étape gratuite (hors BILLED_STEPS) ; le hook choisi repart en selected_hook.
  const answersBlock = answers?.length
    ? "\n\nMATIÈRE DU BRIEF (réponses de l'utilisatrice, sa vraie voix) :\n" +
      answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
    : "";
  const excludeHooks: string[] = Array.isArray(excludeHooksRaw)
    ? excludeHooksRaw.filter((x: unknown): x is string => typeof x === "string").slice(0, 12)
    : [];
  const excludeBlock = excludeHooks.length
    ? `\n\nHOOKS DÉJÀ PROPOSÉS, REFUSÉS PAR L'UTILISATRICE :\n${excludeHooks.map((h) => `- "${h}"`).join("\n")}\nINTERDIT de les reproposer, même reformulés. Change d'angle, pas juste de mots.`
    : "";
  const noFaceCam = faceCam === "non";
  const recapLine = recapHooksLine(context);

  const systemPrompt = `${COMMON_PREFIX}

TA MISSION : proposer 3 HOOKS d'ouverture pour un REEL Instagram sur le sujet donné.
Le hook = les 3 premières secondes. 50 % des viewers scrollent avant la 3e seconde :
c'est LE levier de rétention. L'utilisatrice choisit UN hook, le script complet sera
écrit dessus.${recapLine}

RÈGLES ABSOLUES :
1. Les 3 hooks sont de TYPES DIFFÉRENTS, choisis parmi :
   - vecu_perso (« Vécu perso ») : un moment vécu, raconté en Je. UNIQUEMENT si la
     matière du brief contient un vrai vécu — n'invente JAMAIS une anecdote.
   - contre_intuition (« Contre-intuition ») : affirmation qui renverse une croyance.
   - objection_retournee (« Objection retournée ») : la phrase qu'on lui oppose, puis le retournement.
   - question_choc (« Question choc ») : question qui pique, jamais rhétorique molle.
   - fait_brut (« Fait brut ») : fait concret/chiffre FOURNI (brief ou branding), sec, sans emballage.
   - scene_coupee (« Scène coupée ») : on entre au milieu d'une scène, in medias res.
2. text = ce qu'elle DIT (8-20 mots, 1-2 phrases, oral naturel, tension immédiate).
   ❌ "Aujourd'hui je vais te parler de..." ❌ hook descriptif ❌ slogan LinkedIn.
3. text_overlay = ce qu'on LIT à l'écran en MUET (3-8 mots) : UNIQUEMENT ses mots,
   un extrait du hook parlé (text) recopié tel quel, celui qui fonctionne SEUL sans
   le son et porte son mot ou chiffre fort. Jamais une information que le parlé ne
   dit pas. Casse normale d'une phrase, pas de majuscules imposées.
4. AUCUN chiffre qui ne vient pas du brief, des réponses ou du branding.
5. SINGULARITÉ : pas le hook consensuel de la niche. Ancre dans SON métier, SES mots,
   SA matière (contexte de marque ci-dessus).
5bis. FRANÇAIS IRRÉPROCHABLE — relis chaque hook à voix haute : élisions (« l'avant/après »,
   jamais « le avant/après ») et homophones (« qu'UN marchand de biens, ça… », jamais
   « qu'on marchand de biens ») ; le hook choisi part TEL QUEL dans le script final.
6. format_recommande = la structure que ce hook appelle naturellement
   (face_cam_confession / voix_off_broll / hook_loop) et duree_cible = durée estimée
   cohérente avec l'objectif (visibilité → court ~20-30 s ; confiance/vente → ~40-60 s).${noFaceCam ? `
7. L'UTILISATRICE NE VEUT PAS SE MONTRER : format_recommande ≠ face_cam_confession
   pour les 3 hooks (voix off + b-roll ou hook loop uniquement).` : ""}${recapLine ? `
8. REEL RÉCAP (prime sur les règles 1 à 6) : chacun des 3 hooks ouvre la SÉRIE de sujets (ce qu'ils ont en commun, ou l'annonce de leur nombre), jamais un seul des sujets. Les types restent différents.` : ""}${excludeBlock}`;
  const userPrompt = `SUJET DU REEL : "${context || "?"}"
Objectif : ${effectiveObjective || objective || "non précisé"}${answersBlock}

Propose-moi 3 hooks de types différents pour ce reel.${recapLine ? " C'est un reel récap : chaque hook annonce la série de sujets, pas un seul sujet." : ""}`;
  return { systemPrompt, userPrompt };
}

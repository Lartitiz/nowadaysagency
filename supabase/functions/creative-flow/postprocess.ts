// Chaîne de finition par format de creative-flow, après la lecture de la
// réponse de Claude : accroche LinkedIn fictive, hooks normalisés, tu / vous,
// passe LinkedIn, passe newsletter + retrait du markdown, passe reel, tu / vous
// carrousel / post / Pinterest / photo, puis stories (adopter → retirer →
// corriger → tu / vous → mise en forme). Déplacée À L'IDENTIQUE depuis le
// handler d'index.ts (fiche 3, lot E, 14/10/2026). Touche TOUS les formats.
//
// Le retour anticipé des hooks (aucun hook récupérable) est rendu dans
// `earlyExit` : c'est le handler qui le renvoie, avant télémétrie et crédit.
// stories_secondary_test.ts et _shared/story-formatting_test.ts lisent le texte
// de ce fichier pour vérifier l'ordre de la chaîne stories.
// Voir docs/creation-contenu/CARTE.md.

import { type AudienceAddress } from "../_shared/audience-address.ts";
import { alignLinkedInHookFields } from "../_shared/linkedin-hook.ts";
import { enforceAudienceAddressInFields } from "../_shared/audience-address-fields.ts";
import { stripMarkdownFromNewsletter } from "../_shared/strip-markdown.ts";
import { adoptStructuredStories, finalizeStoriesLayout, stripStoriesWriterLayout } from "../_shared/story-formatting.ts";
import { addrOpts, POST_ADDRESS_FIELDS } from "./shared.ts";
import { applyNewsletterCorrectionPass } from "./formats/newsletter.ts";
import { isFactualFictionalLinkedInBrief, alignFactualLinkedInHook, applyLinkedInCorrectionPass } from "./formats/linkedin.ts";
import { STORIES_ADDRESS_FIELDS, type StoriesGateResult, applyStoriesCorrectionPass } from "./formats/stories.ts";
import { HOOKS_ADDRESS_FIELDS, normalizeHooksResponse, applyReelQualityPass } from "./formats/reel.ts";
import { enforceCarouselObjectAudienceAddress } from "./formats/carousel.ts";

export async function finishGenerated(parsed: any, params: {
  step: string;
  isLinkedIn: boolean;
  isPhotoMode: boolean;
  isNewsletter: boolean;
  isReel: boolean;
  isPinterest: boolean;
  isStories: boolean;
  context: any;
  contentType?: string | null;
  body: any;
  rawContent: string;
  corsHeaders: Record<string, string>;
  audienceAddress: AudienceAddress | null;
  fullContext: string;
  researchSource: string;
  brandGuardText?: string;
  echoSubject?: string;
  previousHooks: string[];
  newsContext?: string | null;
  effectiveObjective?: string | null;
  storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[];
}): Promise<{ earlyExit?: Response; storiesGate: StoriesGateResult | null; textEchoesBefore?: number }> {
  const { step, isLinkedIn, isPhotoMode, isNewsletter, isReel, isPinterest, isStories, context, contentType, body, rawContent, corsHeaders, audienceAddress, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, newsContext, effectiveObjective, storiesPhotoCatalog } = params;
  if (step === "generate" && isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context) && typeof parsed.content === "string") {
    alignFactualLinkedInHook(parsed);
  }

  // (step === "recycle" ne passe plus par ici : pipeline parallèle dédié plus haut.)

  // ═══ NORMALISATION HOOKS (lot 7) ═══
  if (step === "hooks" && parsed && typeof parsed === "object") {
    const hooksEarlyExit = normalizeHooksResponse(parsed, { body, rawContent, corsHeaders });
    if (hooksEarlyExit) return { earlyExit: hooksEarlyExit, storiesGate: null, textEchoesBefore: undefined };
    // Tu ou vous : le hook choisi part tel quel dans le script final.
    await enforceAudienceAddressInFields(parsed, HOOKS_ADDRESS_FIELDS, audienceAddress, addrOpts("hooks", 20_000));
  }

  // Ajustement : le contenu réécrit suit le réglage tu/vous.
  if (step === "adjust" && parsed && typeof parsed === "object") {
    await enforceAudienceAddressInFields(parsed, ["content"], audienceAddress, addrOpts("adjust"));
  }

  // ═══ PASSE DE CORRECTION LinkedIn ═══
  // Échos d'accroche AVANT correction (LinkedIn / reel) : télémétrie de la garde anti-redite.
  let textEchoesBefore: number | undefined;
  if (
    step === "generate" &&
    isLinkedIn &&
    !body.photo_mode &&
    !isFactualFictionalLinkedInBrief(context) &&
    parsed && typeof parsed === "object" &&
    typeof parsed.content === "string" &&
    parsed.content.length >= 200
  ) {
    textEchoesBefore = await applyLinkedInCorrectionPass(parsed, { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks });
  }

  // L'accroche suit le début exact du post FINAL (après correction, photo
  // comprise) : la correction peut avoir changé la première ligne.
  if (step === "generate" && isLinkedIn && parsed && typeof parsed === "object" && typeof parsed.content === "string") {
    // Tu ou vous (non diffusé, photo, exemple fictif) : AVANT l'alignement de l'accroche.
    await enforceAudienceAddressInFields(parsed, ["content"], audienceAddress, addrOpts("linkedin"));
    alignLinkedInHookFields(parsed);
  }

  if (isNewsletter && step === "generate" && parsed && typeof parsed === "object") {
    await applyNewsletterCorrectionPass(parsed, { body, fullContext, researchSource, context, newsContext, brandGuardText, previousHooks, audienceAddress });
    Object.assign(parsed, stripMarkdownFromNewsletter(parsed));
    if (typeof parsed.content === "string") parsed.word_count = parsed.content.split(/\s+/).filter(Boolean).length;
  }

  // ═══ PASSE QUALITÉ REEL (audit reels 12/07) ═══
  if (isReel && step === "generate" && parsed && typeof parsed === "object" && Array.isArray(parsed.script)) {
    textEchoesBefore = await applyReelQualityPass(parsed, { body, effectiveObjective, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, audienceAddress });
  }

  // Tu ou vous des autres textes générés ici : légende Instagram (non
  // streamée), légende photo, épingle, script de reel en mode photo,
  // carrousel. LinkedIn, newsletter, reel et stories ont leur propre place.
  if (
    step === "generate" && parsed && typeof parsed === "object" &&
    !isLinkedIn && !isNewsletter && !isStories && !(isReel && Array.isArray(parsed.script))
  ) {
    if (Array.isArray(parsed.slides ?? parsed.carousel?.slides)) {
      Object.assign(parsed, await enforceCarouselObjectAudienceAddress(parsed, audienceAddress, "carousel"));
    } else {
      await enforceAudienceAddressInFields(parsed, POST_ADDRESS_FIELDS, audienceAddress, addrOpts(isPinterest ? "pinterest" : isPhotoMode ? "photo-caption" : "post"));
    }
  }

  // ═══ STORIES : texte d'abord, mise en forme ensuite (04/10/2026) ═══
  // 1. La rédaction n'écrit que du texte : tout choix de mise en page qu'elle
  //    aurait quand même écrit est retiré (restent le petit titre, du texte,
  //    et la photo à prendre).
  // 2. La correction ne touche que le texte et le petit titre.
  // 3. La mise en forme lit le texte FINAL et pose le plan visuel par code,
  //    puis la garde photo d'abord et les photos de la bibliothèque.
  let storiesGate: StoriesGateResult | null = null;
  if (isStories && step === "generate") {
    // Mode photo (vision) : même séquence structurée que le flux principal,
    // donc même chaîne ci-dessous (04/10/2026).
    if (isPhotoMode) adoptStructuredStories(parsed);
    stripStoriesWriterLayout(parsed);
    storiesGate = await applyStoriesCorrectionPass(parsed, { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks });
    // Tu ou vous : texte, petit titre et sticker, AVANT la mise en forme (les pastilles en sont extraites).
    await enforceAudienceAddressInFields(parsed, STORIES_ADDRESS_FIELDS, audienceAddress, addrOpts("stories"));
    finalizeStoriesLayout(parsed, { storiesPhotoCatalog, logger: (m) => console.log(m) });
  }

  return { storiesGate, textEchoesBefore };
}

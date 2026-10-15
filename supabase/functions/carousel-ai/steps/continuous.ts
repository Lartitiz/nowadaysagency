// carousel-ai : récit continu des carrousels photo ET mixte
// (`continuousCarouselResponse`). Dans steps/ et non dans un mode : les deux
// parcours l'appellent. Fiche 2, lot 5 de docs/robustesse/gros-fichiers.md :
// déplacé à l'identique depuis index.ts.

import { type CarouselRequestContext, stageTimer, _deps, buildPhotoContextRecap, carouselMismatchResponse, echoContext } from "../shared.ts";
import { type UsageSink } from "../../_shared/anthropic.ts";
import { photoMatchReserveMs, photoMatchPhotoCount } from "../final-photo-match.ts";
import { NarrativePhotoMismatch } from "../continuous-narrative.ts";
import { runRedacGate } from "../../_shared/redac-gate.ts";
import { finalizeCarousel } from "./finalize.ts";
import { addOutlineUsage } from "../outline.ts";
import { logContentQuality, threadOutcome, carouselDurations } from "../../_shared/content-quality.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { CAROUSEL_WRITER_VERSION } from "../writer.ts";
import { clientStillThere } from "../../_shared/anthropic-stream.ts";

// ── Mix carousel mode ──
export async function continuousCarouselResponse(ctx: CarouselRequestContext): Promise<Response | null> {
  const usage: UsageSink = {};
  const clock = stageTimer(ctx.startedAt);
  let output;
  // Derniers contenus de la marque : le rédacteur ne les redit pas (bilan
  // hebdo 05/10/2026). Lecture best-effort, [] en cas d'erreur.
  const recentTexts = ctx.recentTexts;
  // Temps gardé pour l'association des photos, selon le nombre de photos
  // (final-photo-match.ts) : le reste va à la rédaction, au juge et à sa réparation.
  const matchReserveMs = photoMatchReserveMs(ctx.body);
  try { output = await _deps.prepareNarrative({
    body:ctx.body, brandingContext:ctx.brandingContext, recentTexts,
    photoContext:buildPhotoContextRecap(ctx.body.photo_contexts || ctx.body.photos),
    newsContext:typeof ctx.newsContext === "string" ? ctx.newsContext : "",
    authoredText:ctx.currentAuthoredText, audienceAddress:ctx.audienceAddress, startedAt:ctx.startedAt, usage,
    emitStatus:ctx.emitStatus, write:_deps.callCarouselWriter, reserveMs:matchReserveMs,
    onDraft:(slides)=>ctx.emitStatus("draft",{slides}), timings:clock.timings,
  }); } catch(error) {
    if(error instanceof NarrativePhotoMismatch) return carouselMismatchResponse(JSON.stringify({photo_mismatch:{reason:error.message}}),ctx.body,usage,ctx.body.carousel_type,ctx.corsHeaders);
    throw error;
  }
  if (!output) return null;
  const measured = await clock.timed("gate_ms", runRedacGate(JSON.stringify(output.doc), {
    isLinkedIn:ctx.isLinkedIn,inputText:ctx.gateInputText,researchText:ctx.researchText,researchNumbersCap:ctx.researchNumbersCap,testimonySource:ctx.testimonySource,
    // Mesure seule (correction coupée, aucun appel IA) : sans la fiche ni les
    // accroches précédentes, recopie de fiche et échos d'accroche comptaient 0.
    brandGuardText:ctx.brandGuardText,echo:echoContext(ctx),
    correction:{enabled:false},
  }));
  // Seul juge du récit photo/mixte (09/10/2026) : il répare si le délai couvre
  // la rédaction mesurée (write_ms), comme pour le texte ; sinon il la saute.
  const written = await clock.timed("thread_ms", finalizeCarousel(measured.content,ctx,{usage,regenerate:output.regenerate,reserveMs:matchReserveMs,timings:clock.timings,expectedRepairMs:clock.timings.write_ms}));
  let matched = await clock.timed("match_ms", _deps.matchPhotos(JSON.parse(written), {body:ctx.body,startedAt:ctx.startedAt,usage,emitStatus:ctx.emitStatus,call:_deps.callAnthropic}));
  // « Tes photos en fond » : les slides posées en ambiance (aucune photo ne
  // montrait le passage) reçoivent une photo libre de droit vérifiée, sans
  // personne ni produit (12/10/2026). L'écran la pose ; la photo d'origine reste en secours.
  if (ctx.body.carousel_type === "photo") {
    matched = await clock.timed("stock_ms", _deps.stockAmbient(matched, {body:ctx.body,startedAt:ctx.startedAt,usage,brandingContext:ctx.brandingContext,call:_deps.callAnthropic}));
    if (matched?.photo_review?.stock_ambient && matched.generation_receipt) matched.generation_receipt = {...matched.generation_receipt,duration_ms:Date.now()-ctx.startedAt};
  }
  const content = JSON.stringify(matched);
  await addOutlineUsage(ctx, usage);
  const timings = clock.done(`continuous_${ctx.body.carousel_type}`);
  if (clientStillThere(ctx.emitStatus, `carousel_${ctx.body.carousel_type}`)) await _deps.logUsage(ctx.userId,ctx.category,`carousel_${ctx.body.carousel_type}`,usage.total_tokens,usage.model,ctx.workspaceId);
  await logContentQuality(ctx.userId,`carousel_${ctx.body.carousel_type}`,measured,usage.model,ctx.workspaceId,ctx.body.subject,threadOutcome(written),
    carouselDurations(`continuous_${ctx.body.carousel_type}`,timings,{content:matched,photos:photoMatchPhotoCount(ctx.body)}));
  return new Response(JSON.stringify({content,writing_version:CAROUSEL_WRITING_VERSION,
    writer:{version:CAROUSEL_WRITER_VERSION,model:usage.model,effort:"medium"},timings}),
    {headers:{...ctx.corsHeaders,"Content-Type":"application/json"}});
}

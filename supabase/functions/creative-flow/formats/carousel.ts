// Carrousel, côté creative-flow : contrôle tu / vous d'un carrousel (recyclage,
// ajustement) et réponse 410 du streaming retiré. La génération des
// carrousels vit dans carousel-ai, pas ici. Extrait À L'IDENTIQUE d'index.ts
// au lot 3 (13/10/2026). Voir docs/creation-contenu/CARTE.md.

import { extractCarouselTexts, reinjectCarouselTexts } from "../../_shared/correction-pass.ts";
import { enforceAudienceAddress, type AudienceAddress } from "../../_shared/audience-address.ts";
import { addrOpts } from "../shared.ts";

/** Carrousel (objet slides + légende) : mêmes balises que la relecture du carrousel. */
export async function enforceCarouselObjectAudienceAddress(doc: any, addr: AudienceAddress | null | undefined, scope: string): Promise<any> {
  if (!addr || !doc || typeof doc !== "object" || !Array.isArray(doc.slides ?? doc.carousel?.slides)) return doc;
  try {
    const block = extractCarouselTexts(doc);
    if (!block) return doc;
    const o = addrOpts(scope);
    const res = await enforceAudienceAddress(block, addr, o);
    if (res.receipt && res.receipt.wrong_before > 0) console.log(JSON.stringify({ event: "audience_address", scope: o.scope, ...res.receipt }));
    return res.receipt?.applied ? reinjectCarouselTexts(doc, res.content) : doc;
  } catch (e) {
    console.error(`[creative-flow ${scope}] contrôle tu/vous ignoré (carrousel intact) :`, e);
    return doc;
  }
}

// Ancien circuit carrousel (génération + passe de correction, en mode
// « stream ») : RETIRÉ. Aucun appelant du front ne l'atteignait plus (le
// streaming n'est demandé que pour post / LinkedIn / newsletter / Pinterest,
// sans format_livraison), les carrousels passent par carousel-ai. Sa passe de
// correction portait en outre une consigne anti-numérotation des conseils,
// même cause que la régression « 1, 2, 3 » perdus. On renvoie une erreur
// claire AVANT tout appel IA (aucun crédit débité), comme carousel-ai-candidate.
export function retiredCarouselStreamResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "carousel_flow_retired",
    message: "Ce circuit de carrousel est retiré. Les carrousels se génèrent avec carousel-ai.",
  }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

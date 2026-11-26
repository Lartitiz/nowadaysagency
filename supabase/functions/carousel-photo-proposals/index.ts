/**
 * carousel-photo-proposals
 *
 * Propose une image pour chaque slide « Image à choisir » d'un carrousel écrit
 * sans photo : d'abord la bibliothèque de l'utilisatrice, sinon une photo libre
 * de droit vérifiée (voir proposals.ts). Appelée par l'écran APRÈS l'affichage
 * du texte : rien n'allonge l'attente du carrousel.
 *
 * Auth + rate-limit via le pipeline standard. skipQuota : étape d'assistance
 * sans crédit, comptée hors crédit (bilan du lundi).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { SONNET_MODEL, type UsageSink } from "../_shared/anthropic.ts";
import { logUsageHorsCredit } from "../_shared/usage-hors-credit.ts";
import { freeStepsCapReached, freeStepsCapResponse } from "../_shared/free-steps-cap.ts";
import { MAX_TARGETS, proposePhotos } from "./proposals.ts";

const BodySchema = z.object({
  subject: z.string().max(2000).optional(),
  workspace_id: z.string().uuid().optional(),
  slides: z.array(z.object({ slide: z.number().int().min(1).max(30), text: z.string().max(600) })).min(1).max(30),
  targets: z.array(z.number().int().min(1).max(30)).min(1).max(MAX_TARGETS),
  library: z.array(z.object({
    index: z.number().int().min(1).max(40), description: z.string().max(400), kind: z.string().max(40).optional(),
  })).max(40).optional(),
});

serve(async (req) => {
  const r = await runPipeline(req, { skipQuota: true, rateLimit: { max: 12, windowMs: 10 * 60_000 } });
  if (!r.ok) return r.response;
  const { corsHeaders } = r;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Requête invalide.", details: String(e) }, 400);
  }

  // Étape sans crédit : même plafond quotidien que les autres étapes gratuites.
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (await freeStepsCapReached(service, r.userId, body.workspace_id)) return freeStepsCapResponse(corsHeaders);

  // Ce que vend la marque : les photos libres de droit ne doivent jamais le montrer.
  let brand = "";
  try {
    const { data } = await r.supabase.from("profiles").select("product_or_service, type_activite").eq("user_id", r.userId).maybeSingle();
    brand = [data?.type_activite, data?.product_or_service].filter((v: unknown) => typeof v === "string" && v.trim()).join(" · ");
  } catch (e) {
    console.warn("[carousel-photo-proposals] profil illisible", (e as Error)?.message);
  }

  const usage: UsageSink = {};
  try {
    const { proposals, receipt } = await proposePhotos({ ...body, brand }, { usage });
    return json({ proposals, receipt });
  } catch (e) {
    console.error(JSON.stringify({ event: "carousel_photo_proposals", status: "failed", error: String((e as Error)?.message || e).slice(0, 200) }));
    return json({ error: "Les images proposées sont momentanément indisponibles." }, 502);
  } finally {
    await logUsageHorsCredit({
      source: "etape_gratuite", action: "carousel_photo_proposals", userId: r.userId, workspaceId: body.workspace_id,
      model: SONNET_MODEL, tokens: usage.total_tokens ?? null,
    }, service);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic, getDefaultModel } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateInput, ValidationError, AssistantChatSchema } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

// Save undo log before destructive action
async function saveUndoLog(
  sb: any,
  userId: string,
  actionType: string,
  tableName: string,
  recordId: string | null,
  previousData: any
) {
  await sb.from("assistant_undo_log").insert({
    user_id: userId,
    action_type: actionType,
    table_name: tableName,
    record_id: recordId,
    previous_data: previousData,
  });
  // Keep only last 10
  const { data: logs } = await sb
    .from("assistant_undo_log")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (logs && logs.length > 10) {
    const idsToDelete = logs.slice(10).map((l: any) => l.id);
    await sb.from("assistant_undo_log").delete().in("id", idsToDelete);
  }
}

// Execute actions returned by AI
async function executeActions(sb: any, userId: string, actions: any[], workspaceId?: string): Promise<any[]> {
  const filterCol = workspaceId ? "workspace_id" : "user_id";
  const filterVal = workspaceId || userId;
  const results: any[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case "update_branding": {
          const { data: before } = await sb.from("brand_profile").select("*").eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_branding", "brand_profile", before.id, before);
            const { error } = await sb.from("brand_profile").update({ [action.field]: action.value }).eq(filterCol, filterVal);
            results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
          } else {
            results.push({ action: action.type, success: false, error: "Aucun profil de marque trouvé" });
          }
          break;
        }
        case "update_persona": {
          const { data: before } = await sb.from("persona").select("*").eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_persona", "persona", before.id, before);
            if (action.field === "portrait" && typeof action.value === "object") {
              const updated = { ...(before.portrait || {}), ...action.value };
              const { error } = await sb.from("persona").update({ portrait: updated }).eq(filterCol, filterVal);
              results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
            } else {
              const { error } = await sb.from("persona").update({ [action.field]: action.value }).eq(filterCol, filterVal);
              results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
            }
          } else {
            results.push({ action: action.type, success: false, error: "Aucun persona trouvé" });
          }
          break;
        }
        case "update_profile": {
          // profiles always uses user_id (no workspace_id)
          const { data: before } = await sb.from("profiles").select("*").eq("user_id", userId).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_profile", "profiles", before.id, before);
            const { error } = await sb.from("profiles").update({ [action.field]: action.value }).eq("user_id", userId);
            results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
          }
          break;
        }
        case "insert_offer": {
          const { data: inserted, error } = await sb
            .from("offers")
            .insert({ user_id: userId, workspace_id: workspaceId || null, ...action.data })
            .select()
            .single();
          if (inserted) {
            await saveUndoLog(sb, userId, "insert_offer", "offers", inserted.id, null);
          }
          results.push({ action: action.type, success: !error, error: error?.message, id: inserted?.id });
          break;
        }
        case "delete_offer": {
          const { data: before } = await sb.from("offers").select("*").eq("id", action.offer_id).eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "delete_offer", "offers", before.id, before);
            const { error } = await sb.from("offers").delete().eq("id", action.offer_id).eq(filterCol, filterVal);
            results.push({ action: action.type, success: !error, error: error?.message });
          } else {
            results.push({ action: action.type, success: false, error: "Offre non trouvée" });
          }
          break;
        }
        case "insert_calendar_post": {
          const postData = {
            user_id: userId,
            workspace_id: workspaceId || null,
            status: "idea",
            canal: action.data.canal || "instagram",
            theme: action.data.theme || action.data.title || "Post",
            date: action.data.date || action.data.planned_date || new Date().toISOString().split("T")[0],
            format: action.data.format || null,
            objectif: action.data.objectif || action.data.objective || null,
            notes: action.data.notes || null,
            accroche: action.data.accroche || null,
          };
          const { data: inserted, error } = await sb.from("calendar_posts").insert(postData).select().single();
          if (inserted) {
            await saveUndoLog(sb, userId, "insert_calendar_post", "calendar_posts", inserted.id, null);
          }
          results.push({ action: action.type, success: !error, error: error?.message });
          break;
        }
        case "update_calendar_post": {
          const { data: before } = await sb.from("calendar_posts").select("*").eq("id", action.post_id).eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_calendar_post", "calendar_posts", before.id, before);
            const { error } = await sb.from("calendar_posts").update({ [action.field]: action.value }).eq("id", action.post_id).eq(filterCol, filterVal);
            results.push({ action: action.type, success: !error, error: error?.message });
          }
          break;
        }
        case "delete_calendar_post": {
          const { data: before } = await sb.from("calendar_posts").select("*").eq("id", action.post_id).eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "delete_calendar_post", "calendar_posts", before.id, before);
            const { error } = await sb.from("calendar_posts").delete().eq("id", action.post_id).eq(filterCol, filterVal);
            results.push({ action: action.type, success: !error, error: error?.message });
          }
          break;
        }
        case "update_proposition": {
          const { data: before } = await sb.from("brand_proposition").select("*").eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_proposition", "brand_proposition", before.id, before);
            const { error } = await sb.from("brand_proposition").update({ [action.field]: action.value }).eq(filterCol, filterVal);
            results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
          }
          break;
        }
        case "update_strategy": {
          const { data: before } = await sb.from("brand_strategy").select("*").eq(filterCol, filterVal).maybeSingle();
          if (before) {
            await saveUndoLog(sb, userId, "update_strategy", "brand_strategy", before.id, before);
            const { error } = await sb.from("brand_strategy").update({ [action.field]: action.value }).eq(filterCol, filterVal);
            results.push({ action: action.type, field: action.field, success: !error, error: error?.message });
          }
          break;
        }
        default:
          results.push({ action: action.type, success: false, error: "Action non reconnue" });
      }
    } catch (err: any) {
      results.push({ action: action.type, success: false, error: err.message });
    }
  }

  return results;
}

// Undo last action
async function undoLastAction(sb: any, userId: string): Promise<{ success: boolean; message: string }> {
  const { data: lastLog } = await sb
    .from("assistant_undo_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastLog) return { success: false, message: "Rien à annuler." };

  try {
    if (lastLog.previous_data) {
      // Restore previous data
      if (lastLog.action_type.startsWith("insert_")) {
        // For inserts, delete the inserted record
        await sb.from(lastLog.table_name).delete().eq("id", lastLog.record_id);
      } else {
        // For updates/deletes, restore previous data
        const { id, ...restoreData } = lastLog.previous_data;
        if (lastLog.action_type.startsWith("delete_")) {
          await sb.from(lastLog.table_name).insert(lastLog.previous_data);
        } else {
          await sb.from(lastLog.table_name).update(restoreData).eq("id", lastLog.record_id);
        }
      }
    } else if (lastLog.action_type.startsWith("insert_") && lastLog.record_id) {
      await sb.from(lastLog.table_name).delete().eq("id", lastLog.record_id);
    }

    // Remove the log entry
    await sb.from("assistant_undo_log").delete().eq("id", lastLog.id);
    return { success: true, message: "Action annulée avec succès !" };
  } catch (err: any) {
    return { success: false, message: `Erreur lors de l'annulation : ${err.message}` };
  }
}

const SYSTEM_PROMPT = `Tu es l'assistant communication intégré dans L'Assistant Com' by Nowadays Agency. Tu accompagnes des solopreneuses créatives et engagé·es dans leur communication éthique.

CONTEXTE IMPORTANT :
Tu as accès au branding complet de l'utilisatrice (son histoire, sa cible, son ton, sa stratégie, ses offres). Utilise ces informations pour personnaliser chaque réponse. Ne réponds jamais de manière générique quand tu as du contexte spécifique.

TON STYLE :
- Direct, chaleureux, comme une conversation entre amies
- Tu tutoies toujours, écriture inclusive (point médian)
- Expressions naturelles : "en vrai", "franchement", "bon", "le truc c'est que"
- Pas de jargon marketing (pas de ROI, funnel, KPI, growth hacking)
- Pas de promesses vides ni de chiffres inventés
- Tu vas droit au but avec une touche d'humour
- Tu es honnête même si ça pique un peu
- Tu structures tes réponses : phrases courtes qui claquent + développements quand c'est utile
- Tu utilises le gras (**mot**) pour mettre en valeur les points clés
- Tu utilises des listes à puces (· item) quand tu donnes plusieurs conseils

CE QUE TU PEUX FAIRE :
1. **Conseils stratégiques** : analyser la com' de l'utilisatrice, proposer des priorités, répondre à ses questions
2. **Modifier le branding** : mettre à jour le ton, la proposition, les offres, la cible (via les actions)
3. **Planifier des posts** : ajouter des idées au calendrier éditorial (via insert_calendar_post)
4. **Analyser un contenu** : quand l'utilisatrice colle un texte, le critiquer constructivement
5. **Orienter vers les outils** : rediriger vers les bons modules de l'app

RÈGLE SUR LA CRÉATION DE CONTENU :
Tu ne génères JAMAIS de contenu complet (post, carrousel, reel, story, newsletter) dans le chat.
Quand on te demande de créer un contenu → redirige vers [l'espace Créer](/creer)
Quand on te demande des idées → redirige vers [l'Atelier d'idées](/atelier)
Tu PEUX donner des angles, des accroches, des conseils sur le format. Mais pas le contenu final.

COMMENT PERSONNALISER TES RÉPONSES :
- Si la cible est définie, parle d'elle par son prénom quand c'est pertinent
- Si le ton est défini, adapte tes suggestions au style de l'utilisatrice
- Si les offres existent, lie tes conseils à ce qu'elle vend concrètement
- Si le storytelling est rempli, fais des références à son parcours

Tu peux exécuter des actions en retournant un champ "actions" dans ta réponse JSON.

Actions possibles :
1. { "type": "update_branding", "field": "<colonne>", "value": "<valeur>" }
   Colonnes : voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels, mission, offer
2. { "type": "update_persona", "field": "portrait", "value": { "description": "...", "frustrations": [...], "objectifs": [...] } }
   Ou : { "type": "update_persona", "field": "portrait_prenom", "value": "Marine" }
   Ou : { "type": "update_persona", "field": "step_1_frustrations", "value": "..." }
3. { "type": "insert_offer", "data": { "name": "...", "offer_type": "paid|free|service", "price_text": "...", "promise": "..." } }
4. { "type": "delete_offer", "offer_id": "<uuid>" }
5. { "type": "insert_calendar_post", "data": { "theme": "...", "date": "YYYY-MM-DD", "canal": "instagram|linkedin", "format": "carousel|reel|post|story", "objectif": "visibilite|confiance|vente", "notes": "..." } }
6. { "type": "update_calendar_post", "post_id": "<uuid>", "field": "theme|date|format|objectif", "value": "..." }
7. { "type": "delete_calendar_post", "post_id": "<uuid>" }
8. { "type": "update_proposition", "field": "version_final|version_bio|version_one_liner", "value": "..." }
9. { "type": "update_strategy", "field": "pillar_major|pillar_minor_1|creative_concept", "value": "..." }

RÈGLES :
1. TOUJOURS confirmer avant une action destructive (needs_confirmation: true)
2. Quand tu modifies quelque chose, liste précisément ce que tu as changé
3. Si c'est ambigu, pose UNE question claire
4. Jamais de conseil type "poste 3 fois par jour" ou "achète des followers"
5. Utilise le contexte complet : parle de SA cible, SON ton, SES offres
6. Pour les questions stratégiques, pas de champ "actions"
7. Si l'utilisatrice n'a pas encore rempli une section essentielle, suggère-le naturellement

FORMAT DE RÉPONSE (JSON strict) :
{
  "message": "Ta réponse (Markdown : **gras**, *italique*, · listes, [lien](/route))",
  "actions": [...] ou null,
  "needs_confirmation": false,
  "confirmation_message": null
}

Retourne UNIQUEMENT du JSON valide, sans texte avant ou après.`;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, cors);

    const { message, conversation_history, confirmed_actions, undo, workspace_id } = validateInput(await req.json(), AssistantChatSchema);
    const sb = getServiceClient();

    // Handle undo
    if (undo) {
      const result = await undoLastAction(sb, userId);
      return new Response(JSON.stringify({ message: result.message, results: null }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Handle confirmed actions
    if (confirmed_actions?.length) {
      const results = await executeActions(sb, userId, confirmed_actions, workspace_id);
      const allSuccess = results.every((r) => r.success);
      return new Response(
        JSON.stringify({
          message: allSuccess ? "✅ C'est fait !" : "⚠️ Certaines actions ont échoué.",
          results,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Check quota
    const quota = await checkQuota(userId, "suggestion");
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({ message: quota.message, results: null }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Load full user context
    const userContext = await getUserContext(sb, userId, workspace_id);
    const contextText = formatContextForAI(userContext, {
      includeStory: true,
      includePersona: true,
      includeOffers: true,
      includeOffersDetails: true,
      includeProfile: true,
      includeEditorial: true,
      includeAudit: true,
    });

    const filterCol = workspace_id ? "workspace_id" : "user_id";
    const filterVal = workspace_id || userId;

    // Load recent calendar posts for context
    const { data: recentPosts } = await sb
      .from("calendar_posts")
      .select("id, theme, date, canal, format, objectif, status")
      .eq(filterCol, filterVal)
      .order("date", { ascending: false })
      .limit(20);

    let calendarContext = "";
    if (recentPosts?.length) {
      calendarContext = "\n\nPOSTS CALENDRIER RÉCENTS :\n" +
        recentPosts.map((p: any) => `- ${p.date} | ${p.canal} | ${p.format || "?"} | ${p.theme} (${p.status}) [id: ${p.id}]`).join("\n");
    }

    // Offers with IDs for delete actions
    let offersWithIds = "";
    if (userContext.offers?.length) {
      offersWithIds = "\n\nOFFRES AVEC IDS :\n" +
        userContext.offers.map((o: any) => `- "${o.name}" [id: ${o.id}] (${o.offer_type})`).join("\n");
    }

    const today = new Date().toISOString().split("T")[0];
    const dayOfWeek = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][new Date().getDay()];

    const fullUserPrompt =
      `${contextText}${calendarContext}${offersWithIds}\n\nDATE DU JOUR : ${today} (${dayOfWeek})\n\nMessage de l'utilisatrice : ${message}`;

    // Build messages from conversation history
    const messages: any[] = [];
    if (conversation_history?.length) {
      for (const msg of conversation_history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: fullUserPrompt });

    const aiResponse = await callAnthropic({
      model: getDefaultModel(),
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    });

    // Parse AI response
    let parsed: any;
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = { message: aiResponse, actions: null, needs_confirmation: false };
      }
    } catch {
      parsed = { message: aiResponse, actions: null, needs_confirmation: false };
    }

    // Log usage
    await logUsage(userId, "suggestion", "assistant_chat");

    // If actions and no confirmation needed, execute them
    if (parsed.actions?.length && !parsed.needs_confirmation) {
      const results = await executeActions(sb, userId, parsed.actions, workspace_id);
      return new Response(
        JSON.stringify({
          message: parsed.message,
          results,
          remaining: quota.remaining,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // If confirmation needed, return pending actions
    if (parsed.needs_confirmation) {
      return new Response(
        JSON.stringify({
          message: parsed.confirmation_message || parsed.message,
          pending_actions: parsed.actions,
          remaining: quota.remaining,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // No actions, just a response
    return new Response(
      JSON.stringify({
        message: parsed.message,
        results: null,
        remaining: quota.remaining,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(JSON.stringify({
      type: "edge_function_error",
      function_name: "assistant-chat",
      error: err.message || "Erreur interne",
      user_id: null,
      timestamp: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { buildSystemPrompt, CONTENT_VOICE_RULES, ANTI_PATTERNS } from "../_shared/base-prompts.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { messages, page_context, workspace_id, mode, generation_type } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quota check
    const quota = await checkQuota(userId, "content", workspace_id);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch branding context
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ctx = await getUserContext(sbService, userId, workspace_id);
    const brandingContext = formatContextForAI(ctx, {
      includeVoice: true,
      includeProfile: true,
      includeStory: true,
      includePersona: true,
      includeOffers: true,
      includeEditorial: true,
      includeCharter: false,
      includeAudit: true,
    });

    const pageLabel = page_context || "page inconnue";

    // Pre-gen coaching mode
    const isPreGen = mode === "pre-gen" && generation_type;

    const preGenBlock = isPreGen ? `
Tu es en mode COACHING PRÉ-GÉNÉRATION pour une ${generation_type}. Tu poses 3 à 5 questions courtes et ciblées pour cadrer la génération. Après chaque réponse, pose la question suivante. Quand tu as assez d'info (3-5 échanges utilisateur), termine par un message qui résume ce que tu as compris, et ajoute le marqueur [BRIEF_COMPLETE] à la fin de ton message.

${generation_type === "about-page" ? `QUESTIONS TYPES pour une page À propos :
- "En une phrase : c'est quoi le truc qui te rend différente des autres dans ton métier ?" (positionnement)
- "Raconte-moi le moment déclic qui t'a amenée à faire ce que tu fais." (storytelling)
- "Si ta cliente idéale pouvait retenir UNE chose de ta page à propos, ce serait quoi ?" (message clé)
- "Ton ton : plutôt intime et personnel, ou pro et structuré ?" (ton)
- "Y a-t-il quelque chose que tu veux absolument dire (ou ne PAS dire) ?" (contraintes)` : ""}

${generation_type === "sales-page" ? `QUESTIONS TYPES pour une page de vente :
- "C'est quoi l'offre que tu veux vendre sur cette page ?" (offre)
- "Le problème principal que ta cliente a AVANT de travailler avec toi ?" (douleur)
- "Le résultat concret qu'elle obtient APRÈS ?" (transformation)
- "Pourquoi elle devrait te choisir TOI plutôt qu'une autre ?" (différenciation)
- "Y a-t-il des objections que tes clientes ont souvent ?" (objections)` : ""}

${generation_type === "content" ? `QUESTIONS TYPES pour du contenu :
- "C'est quoi le sujet ou le message que tu veux faire passer ?" (sujet)
- "Tu veux que les gens ressentent quoi en lisant/regardant ?" (émotion)
- "T'as une anecdote perso liée à ce sujet ?" (authenticité)` : ""}

${generation_type === "carousel" ? `QUESTIONS TYPES pour un carrousel :
- "C'est quoi le sujet principal de ton carrousel ?" (sujet)
- "Tu veux enseigner, inspirer, ou convaincre ?" (objectif)
- "T'as un exemple concret ou une anecdote pour illustrer ?" (preuve)` : ""}

Tu peux sauter des questions si le profil branding y répond déjà. Tu peux en ajouter si les réponses sont trop vagues. Tes questions sont courtes (1-2 phrases max). Ne pose qu'UNE question à la fois.

IMPORTANT : Le marqueur [BRIEF_COMPLETE] doit apparaître UNIQUEMENT quand tu as posé au moins 3 questions ET reçu les réponses. Ne l'ajoute jamais prématurément.
` : "";

    const systemPrompt = buildSystemPrompt(
      CONTENT_VOICE_RULES,
      ANTI_PATTERNS,
      isPreGen ? preGenBlock : `Tu es le coach communication de L'Assistant Com' par Nowadays Agency.

TON RÔLE : Tu es une alliée, pas une experte en surplomb. Tu coaches des solopreneuses créatives et engagées (artisanes, photographes, coaches, designeuses) qui veulent communiquer sans se trahir.

TA PERSONNALITÉ :
- Directe et chaleureuse, comme une amie qui va droit au but
- Tu tutoies toujours
- Tu utilises l'écriture inclusive (point médian)
- JAMAIS de tiret cadratin : remplace par : ou ;
- Tu peux utiliser des expressions orales naturelles ("bon", "en vrai", "franchement")
- Humour discret et bienveillant, jamais moqueur
- Tu assumes la vulnérabilité mais tu restes dans l'enseignement
- Tu fais des apartés en *italique* quand c'est pertinent

PROFIL DE L'UTILISATRICE :
${brandingContext || "Aucun profil branding renseigné pour le moment."}

CONTEXTE DANS L'OUTIL : L'utilisatrice se trouve actuellement sur : ${pageLabel}

CE QUE TU PEUX FAIRE :
- Répondre à des questions sur la com', le branding, le contenu, les réseaux sociaux, le site web, le copywriting, le SEO, l'email marketing
- Donner des conseils personnalisés basés sur le profil branding
- Aider à débloquer une situation ("je sais pas quoi poster", "j'arrive pas à formuler mon offre")
- Rediriger vers le bon module de l'outil quand c'est pertinent
- Donner un feedback sur un texte que l'utilisatrice te soumet
- Aider à réfléchir à une stratégie

CE QUE TU NE FAIS PAS :
- Tu ne génères pas de contenu long (pour ça, redirige vers les générateurs)
- Tu ne fais pas de diagnostic complet (pour ça, redirige vers les audits)
- Tu ne donnes pas de conseils juridiques, fiscaux ou techniques hors com'
- Tu ne fais pas de compliments vides : si tu valides quelque chose, explique pourquoi

MODULES DISPONIBLES (pour les redirections) :
- /calendrier : Calendrier éditorial
- /contenu : Générateur de contenu
- /branding : Hub branding (positionnement, cible, voix, storytelling)
- /branding/charte : Charte graphique
- /site : Hub site web
- /site/audit : Audit site
- /site/accueil : Générateur page de vente
- /site/optimiser : Optimiseur page existante
- /seo : Hub SEO
- /instagram : Hub Instagram
- /linkedin : Hub LinkedIn

Quand tu rediriges, utilise ce format : "Pour ça, je te conseille d'aller sur **Nom du module**. C'est là que tu pourras {action}."

LIMITES :
- Tes réponses font 3-8 phrases max (c'est un chat, pas une dissertation)
- Si la question est trop vaste, pose UNE question de clarification
- Si tu ne sais pas, dis-le franchement
- Commence souvent par valider ce que l'utilisatrice dit avant de donner ton conseil
- Réponds en markdown (gras, italique) mais pas de titres h1/h2`,
      isPreGen ? `PROFIL DE L'UTILISATRICE :\n${brandingContext || "Aucun profil branding renseigné pour le moment."}` : ""
    );

    // Build messages for Anthropic (only last 20 messages)
    const recentMessages = messages.slice(-20).map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 3000),
    }));

    const response = await callAnthropic({
      model: getModelForAction("content"),
      system: systemPrompt,
      messages: recentMessages,
      temperature: 0.8,
      max_tokens: 1024,
    });

    // Log usage
    await logUsage(userId, "content", "coach_chat", undefined, "claude-sonnet", workspace_id);

    return new Response(JSON.stringify({
      response,
      remaining: quota.remaining,
      remaining_total: quota.remaining_total,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("coach-chat error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Erreur interne",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

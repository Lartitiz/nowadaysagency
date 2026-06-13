import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

const STEPS: Record<number, { question: string; topic: string; label: string }> = {
  1: {
    topic: "mood_place",
    label: "Lieu imaginaire de ta marque",
    question: "Si ta marque était un lieu, ce serait quoi ? Un café cosy avec des plantes, une galerie d'art contemporain, un marché artisanal en plein air, un studio de yoga épuré, une boutique vintage colorée, ou autre chose ?",
  },
  2: {
    topic: "colors",
    label: "Tes couleurs",
    question: "Quelles couleurs te font vibrer quand tu penses à ta marque ? Pas celles que tu 'devrais' utiliser : celles qui te PARLENT. Décris-les (ex : rose vif, vert sauge, jaune moutarde, bleu nuit) ou donne des codes HEX si tu les as.",
  },
  3: {
    topic: "visual_style",
    label: "Ton style visuel",
    question: "Comment décrirais-tu le style de tes visuels ? Plutôt minimaliste et épuré ? Coloré et pop ? Artisanal et chaleureux ? Luxe et raffiné ? Donne-moi 3 mots qui décrivent l'ambiance visuelle que tu veux créer.",
  },
  4: {
    topic: "typography",
    label: "Tes polices",
    question: "Pour les polices de caractères : tu préfères un style plutôt classique et élégant (serif type Playfair Display), moderne et clean (sans-serif type Montserrat), ou manuscrit et organique ?",
  },
  5: {
    topic: "logo",
    label: "Ton logo",
    question: "As-tu déjà un logo ? Si oui, décris-le. Si non, pas de panique : on peut travailler sans. L'important c'est d'avoir une identité visuelle cohérente, le logo vient après.",
  },
  6: {
    topic: "visual_donts",
    label: "Ce que tu détestes visuellement",
    question: "Dernière question : qu'est-ce que tu DÉTESTES visuellement ? Les trucs qui te font fuir quand tu les vois sur un compte Instagram ? (Ex : trop de texte sur les visuels, les couleurs flashy, les photos stock, le noir et blanc, les polices manuscrites illisibles...)",
  },
};

const SECTOR_PALETTES: Record<string, string> = {
  photographe: "Pour une photographe, des teintes neutres sophistiquées (gris chaud, crème, noir) ou des tons terreux (terracotta, kaki) mettent en valeur tes images sans les écraser.",
  "mode éthique": "En mode éthique/responsable, les teintes terracotta, vert sauge, lin, et écru évoquent l'authenticité et la nature.",
  "coach bien-être": "Pour le bien-être, les bleus doux, lavande, vert d'eau et beige rosé créent une atmosphère apaisante.",
  "coach business": "Pour le coaching business, un duo contrasté (bleu nuit/doré, noir/corail) donne une image professionnelle et dynamique.",
  artisan: "Pour l'artisanat, des couleurs chaudes et organiques (miel, terracotta, vert olive) renforcent le côté fait-main.",
  "food": "En food/cuisine, les couleurs gourmandes (bordeaux, moutarde, vert olive, crème) stimulent l'appétit et l'envie.",
  default: "",
};

// Suggestions typo par secteur — base déterministe pour le prompt step 4 et fallback de validation
const SECTOR_FONTS: Record<string, { advice: string; fallback: { title: string; body: string } }> = {
  photographe: {
    advice: "Pour une photographe : duo épuré qui ne vole pas la vedette aux images (Cormorant Garamond + Inter, ou Playfair Display + Work Sans).",
    fallback: { title: "Cormorant Garamond", body: "Inter" },
  },
  "mode éthique": {
    advice: "En mode éthique : serif artisanale + sans-serif douce (Cormorant Garamond + Raleway, ou Lora + Nunito).",
    fallback: { title: "Cormorant Garamond", body: "Raleway" },
  },
  "coach bien-être": {
    advice: "Pour le bien-être : serif douce + sans-serif arrondie (Lora + Nunito, ou Libre Baskerville + DM Sans).",
    fallback: { title: "Lora", body: "Nunito" },
  },
  "coach business": {
    advice: "Pour le coaching business : sans-serif affirmée (Space Grotesk + Inter, ou Montserrat + Open Sans).",
    fallback: { title: "Space Grotesk", body: "Inter" },
  },
  artisan: {
    advice: "Pour l'artisanat : serif élégante + sans-serif chaleureuse (Cormorant Garamond + Raleway, ou Playfair Display + Nunito).",
    fallback: { title: "Cormorant Garamond", body: "Raleway" },
  },
  "food": {
    advice: "En food : serif élégante + sans-serif lisible (Playfair Display + Lora, ou Libre Baskerville + Work Sans).",
    fallback: { title: "Playfair Display", body: "Work Sans" },
  },
  default: {
    advice: "",
    fallback: { title: "DM Sans", body: "Inter" },
  },
};

const ALLOWED_FONTS = [
  "Inter", "Poppins", "Montserrat", "Playfair Display", "Libre Baskerville",
  "Lora", "Raleway", "Open Sans", "Nunito", "DM Sans", "Space Grotesk",
  "Outfit", "Cormorant Garamond", "Josefin Sans", "Work Sans",
];

function getSectorAdvice(typeActivite: string | null): string {
  if (!typeActivite) return "";
  const key = Object.keys(SECTOR_PALETTES).find(k => 
    typeActivite.toLowerCase().includes(k)
  );
  return SECTOR_PALETTES[key || "default"] || "";
}

function getSectorFontEntry(typeActivite: string | null) {
  if (!typeActivite) return SECTOR_FONTS.default;
  const key = Object.keys(SECTOR_FONTS).find(k =>
    k !== "default" && typeActivite.toLowerCase().includes(k)
  );
  return SECTOR_FONTS[key || "default"] || SECTOR_FONTS.default;
}

function normalizeFont(name: unknown): string | null {
  if (!name || typeof name !== "string") return null;
  const cleaned = name.trim();
  if (!cleaned) return null;
  const match = ALLOWED_FONTS.find(f => f.toLowerCase() === cleaned.toLowerCase());
  return match || null;
}

function buildPrompt(
  step: number,
  answer: string,
  charterData: any,
  profile: any,
  brandProfile: any,
): string {
  const prenom = profile?.prenom || "toi";
  const typeActivite = profile?.type_activite || null;
  const activite = profile?.activite || null;
  const toneRegister = brandProfile?.tone_register || null;
  const toneStyle = brandProfile?.tone_style || null;

  let contextBlock = `Utilisatrice : ${prenom}`;
  if (activite) contextBlock += `\nActivité : ${activite}`;
  if (typeActivite) contextBlock += `\nType d'activité : ${typeActivite}`;
  if (toneRegister) contextBlock += `\nRegistre de ton : ${toneRegister}`;
  if (toneStyle) contextBlock += `\nStyle de ton : ${toneStyle}`;
  if (charterData) contextBlock += `\nDonnées charte existantes : ${JSON.stringify(charterData)}`;

  let stepInstruction = "";

  switch (step) {
    case 1:
      stepInstruction = `L'utilisatrice décrit le lieu qui correspond à sa marque. Déduis-en 3-5 mots-clés visuels (mood_keywords). Retourne-les dans extracted.mood_keywords.`;
      break;
    case 2: {
      const sectorAdvice = getSectorAdvice(typeActivite);
      stepInstruction = `L'utilisatrice décrit ses couleurs préférées. Interprète les noms de couleurs en codes HEX. ${sectorAdvice ? `Conseil sectoriel : ${sectorAdvice}` : ""} Retourne dans extracted : { color_primary, color_secondary, color_accent } avec les codes HEX.`;
      break;
    }
    case 3:
      stepInstruction = `L'utilisatrice décrit son style visuel en 3 mots. Déduis-en des mood_keywords et un photo_style. Retourne dans extracted : { mood_keywords: [...], photo_style: "..." }.`;
      break;
    case 4: {
      const sectorFont = getSectorFontEntry(typeActivite);
      const toneDesc = [toneRegister, toneStyle].filter(Boolean).join(", ");
      const moodKw: string[] = Array.isArray(charterData?.mood_keywords) ? charterData.mood_keywords : [];
      const photoStyle: string | null = charterData?.photo_style || null;
      const colorPrimary: string | null = charterData?.color_primary || null;

      const contextBits: string[] = [];
      if (sectorFont.advice) contextBits.push(`Secteur → ${sectorFont.advice}`);
      if (toneDesc) contextBits.push(`Ton de marque : "${toneDesc}". Direct/punchy → sans-serif affirmée (Montserrat, Space Grotesk). Doux/poétique → serif élégante (Playfair Display, Cormorant Garamond). Pro/clean → DM Sans, Work Sans.`);
      if (moodKw.length) contextBits.push(`Mood visuel déjà exprimé (PRIORITÉ sur les défauts sectoriels) : ${moodKw.join(", ")}.`);
      if (photoStyle) contextBits.push(`Style photo : ${photoStyle}.`);
      if (colorPrimary) contextBits.push(`Couleur principale choisie : ${colorPrimary}.`);

      stepInstruction = `L'utilisatrice décrit ses préférences typographiques.

${contextBits.join("\n")}

Suggère UN duo titre/corps qui colle au mood visuel et au secteur. Liste autorisée STRICTE (n'invente rien hors liste) :
Inter, Poppins, Montserrat, Playfair Display, Libre Baskerville, Lora, Raleway, Open Sans, Nunito, DM Sans, Space Grotesk, Outfit, Cormorant Garamond, Josefin Sans, Work Sans.

Retourne dans extracted : { font_title: "<exact name>", font_body: "<exact name>", font_rationale: "<1 phrase qui explique pourquoi ce duo colle au mood et au secteur>" }.`;
      break;
    }
    case 5:
      stepInstruction = `L'utilisatrice parle de son logo. Si elle n'en a pas, suggère des outils (Canva Logo Maker, Looka) ou de travailler avec une graphiste. Le champ extracted peut être vide {}. Donne un conseil rassurant.`;
      break;
    case 6:
      stepInstruction = `L'utilisatrice liste ce qu'elle déteste visuellement. Reformule en "visual_donts" clair et actionnable. Retourne dans extracted : { visual_donts: "..." }. Comme c'est la dernière question, génère aussi un "ai_generated_brief" : un paragraphe résumant l'identité visuelle complète de ${prenom} basé sur toutes les réponses.`;
      break;
  }

  return `Tu es l'assistante branding visuel de Nowadays. Tu aides ${prenom} à définir sa charte graphique.

══ CONTEXTE ══
${contextBlock}

══ STEP ${step}/6 ══
Question posée : "${STEPS[step].question}"
Réponse de la personne : "${answer}"

══ INSTRUCTION ══
${stepInstruction}

══ RÈGLES ══
- Ton : chaleureux, direct, comme une conversation entre amies. Tu tutoies.
- Sois spécifique et concrète dans tes suggestions
- N'utilise JAMAIS de jargon design
- Le feedback doit faire 2-4 phrases max

══ FORMAT (JSON strict, rien d'autre) ══
{
  "feedback": "Commentaire bienveillant sur la réponse",
  "suggestion": "Suggestion concrète et actionnable",
  "extracted": { ... champs à pré-remplir }${step === 6 ? ',\n  "ai_generated_brief": "Paragraphe résumant l\'identité visuelle complète"' : ""}
}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { step, answer, charterData, workspace_id } = await req.json();

    if (!step || !answer) {
      return new Response(JSON.stringify({ error: "step et answer requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    {
      const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const membership = await assertWorkspaceMembership(sbGuard, userId, workspace_id);
      if (!membership.ok) {
        console.warn("[workspace-guard] denied", { userId, workspaceId: workspace_id });
        return workspaceDeniedResponse(corsHeaders);
      }
    }

    // Resolve workspace owner for profile-scoped tables
    let profileUserId = userId;
    if (workspace_id) {
      const sbAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: ownerRow } = await sbAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
    }

    // Quota check
    const quota = await checkQuota(userId, "coach", workspace_id);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Fetch profile & brand_profile
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [profileRes, brandRes] = await Promise.all([
      sbService.from("profiles").select("prenom, activite, type_activite").eq("user_id", profileUserId).maybeSingle(),
      sbService.from("brand_profile").select("tone_register, tone_style").eq(workspace_id ? "workspace_id" : "user_id", workspace_id || profileUserId).maybeSingle(),
    ]);

    const prompt = buildPrompt(step, answer, charterData || {}, profileRes.data, brandRes.data);

    const rawResponse = await callAnthropic({
      model: getModelForAction("coaching_light"),
      system: BASE_SYSTEM_RULES + "\n\n" + prompt,
      messages: [{ role: "user", content: answer }],
      temperature: 0.7,
      max_tokens: 4096,
    });

    // Log usage
    await logUsage(userId, "coach", "charter_coaching", undefined, getModelForAction("coaching_light"), workspace_id);

    // Parse response
    let parsed;
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          parsed = { feedback: cleaned, suggestion: "", extracted: {} };
        }
      } else {
        parsed = { feedback: cleaned, suggestion: "", extracted: {} };
      }
    }

    // Validation step 4 : normaliser font_title / font_body contre la liste autorisée,
    // sinon retomber sur le fallback sectoriel pour éviter de sauvegarder une font qui ne charge pas
    if (step === 4 && parsed?.extracted) {
      const sectorFont = getSectorFontEntry(profileRes.data?.type_activite || null);
      const normalizedTitle = normalizeFont(parsed.extracted.font_title);
      const normalizedBody = normalizeFont(parsed.extracted.font_body);
      if (!normalizedTitle || !normalizedBody) {
        console.warn("[charter-coaching step 4] invalid fonts from AI, falling back to sector default", {
          received: { title: parsed.extracted.font_title, body: parsed.extracted.font_body },
          fallback: sectorFont.fallback,
        });
      }
      parsed.extracted.font_title = normalizedTitle || sectorFont.fallback.title;
      parsed.extracted.font_body = normalizedBody || sectorFont.fallback.body;
    }


    return new Response(JSON.stringify({ response: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("charter-coaching error:", error);
    const status = (error as any).status || 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur interne" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

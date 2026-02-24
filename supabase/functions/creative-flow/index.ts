import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

function buildProfileBlock(profile: any): string {
  const lines = [
    `- Prénom : ${profile.prenom || "?"}`,
    `- Activité : ${profile.activite || "?"}`,
    `- Type : ${profile.type_activite || "?"}`,
    `- Cible : ${profile.cible || "?"}`,
    `- Problème qu'elle résout : ${profile.probleme_principal || "?"}`,
    `- Thématiques : ${(profile.piliers || []).join(", ") || "?"}`,
    `- Ton souhaité : ${(profile.tons || []).join(", ") || "?"}`,
  ];
  if (profile.mission) lines.push(`- Mission : ${profile.mission}`);
  if (profile.offre) lines.push(`- Offre : ${profile.offre}`);
  if (profile.expressions_cles) lines.push(`- Expressions clés : ${profile.expressions_cles}`);
  if (profile.ce_quon_evite) lines.push(`- Ce qu'on évite : ${profile.ce_quon_evite}`);
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id } = body;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, user.id, workspace_id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);
    
    // Fetch voice profile (personal, always user_id)
    const { data: voiceData } = await supabase.from("voice_profile").select("*").eq("user_id", user.id).maybeSingle();
    let voiceBlock = "";
    if (voiceData) {
      const vl: string[] = ["PROFIL DE VOIX DE L'UTILISATRICE :"];
      if (voiceData.structure_patterns?.length) vl.push(`- Structure : ${(voiceData.structure_patterns as string[]).join(", ")}`);
      if (voiceData.tone_patterns?.length) vl.push(`- Ton : ${(voiceData.tone_patterns as string[]).join(", ")}`);
      if (voiceData.signature_expressions?.length) vl.push(`- Expressions signature à utiliser : ${(voiceData.signature_expressions as string[]).join(", ")}`);
      if (voiceData.banned_expressions?.length) vl.push(`- Expressions interdites (NE JAMAIS UTILISER) : ${(voiceData.banned_expressions as string[]).join(", ")}`);
      if (voiceData.voice_summary) vl.push(`- Style résumé : ${voiceData.voice_summary}`);
      vl.push("UTILISE ce profil de voix pour TOUT le contenu généré.");
      vl.push("PRIORITÉ VOIX : reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.");
      voiceBlock = "\n" + vl.join("\n") + "\n";
    }

    // Pre-generation personal answers
    let preGenBlock = "";
    if (preGenAnswers) {
      const pl: string[] = [];
      if (preGenAnswers.anecdote) pl.push(`- Anecdote : "${preGenAnswers.anecdote}"`);
      if (preGenAnswers.emotion) pl.push(`- Émotion visée : ${preGenAnswers.emotion}`);
      if (preGenAnswers.conviction) pl.push(`- Conviction/phrase clé : "${preGenAnswers.conviction}"`);
      if (pl.length) {
        preGenBlock = `\nL'UTILISATRICE A PARTAGÉ CES ÉLÉMENTS PERSONNELS :\n${pl.join("\n")}\n\nINTÈGRE CES ÉLÉMENTS dans le contenu généré :\n- L'anecdote doit apparaître naturellement (en accroche ou en illustration)\n- L'émotion visée guide le ton et la structure\n- La conviction doit être présente, formulée dans le style de l'utilisatrice\n- Ne change PAS le sens de ce qu'elle a dit, juste la structure\n`;
      }
    }
    if (!preGenAnswers && step === "generate") {
      preGenBlock = `\nL'utilisatrice n'a pas fourni d'éléments personnels.\nGénère le contenu normalement mais AJOUTE en fin :\n"💡 Ajoute une anecdote perso pour que ça sonne vraiment toi. L'IA structure, toi tu incarnes."\n`;
    }

    const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "") + voiceBlock;

    // Build calendar context block
    let calendarBlock = "";
    if (calendarContext) {
      const cl: string[] = [];
      if (calendarContext.postDate) cl.push(`- Date de publication prévue : ${calendarContext.postDate}`);
      if (calendarContext.theme) cl.push(`- Thème/sujet : "${calendarContext.theme}"`);
      if (calendarContext.notes) cl.push(`- Notes de l'utilisatrice : "${calendarContext.notes}"`);
      if (calendarContext.angleSuggestion) cl.push(`- Angle suggéré : "${calendarContext.angleSuggestion}"`);
      if (calendarContext.launchId) {
        cl.push(`\nCONTEXTE LANCEMENT :`);
        if (calendarContext.contentType) cl.push(`- Type de contenu : ${calendarContext.contentTypeEmoji || ""} ${calendarContext.contentType}`);
        if (calendarContext.category) cl.push(`- Catégorie : ${calendarContext.category}`);
        if (calendarContext.chapter) cl.push(`- Chapitre narratif : ${calendarContext.chapter}. ${calendarContext.chapterLabel || ""}`);
        if (calendarContext.audiencePhase) cl.push(`- Phase mentale de l'audience : ${calendarContext.audiencePhase}`);
        if (calendarContext.objective) cl.push(`- Objectif de ce contenu : "${calendarContext.objective}"`);
      }
      if (cl.length) calendarBlock = `\nCONTEXTE DU POST (depuis le calendrier) :\n${cl.join("\n")}\n`;
    }

    let systemPrompt = "";
    let userPrompt: string | null = "";

    // Format labels (used by recycle, declared here for broader scope)
    const formatLabels: Record<string, string> = {
      carrousel: "Carrousel Instagram (8 slides)",
      reel: "Script Reel (30-60 sec)",
      stories: "Séquence Stories (5 stories)",
      linkedin: "Post LinkedIn",
      newsletter: "Email / Newsletter",
    };

    if (step === "angles") {
      systemPrompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ANTI_BIAS}

${ETHICAL_GUARDRAILS}

${FRAMEWORK_SELECTION}

TYPE DE CONTENU : ${contentType}
CONTEXTE : ${context}

PROFIL DE L'UTILISATRICE :
${fullContext}
${calendarBlock}

Propose exactement 3 angles éditoriaux DIFFÉRENTS.

Pour chaque angle :
1. TITRE : 2-5 mots, évocateur (pas "Option 1")
2. PITCH : 2-3 phrases qui expliquent l'approche et pourquoi ça fonctionne
3. STRUCTURE : le squelette du contenu en 4-5 étapes (utilise les structures par format si le format est connu)
4. TON : l'énergie et le registre émotionnel de cet angle

RÈGLES :
- Les 3 angles doivent être VRAIMENT différents (pas 3 variations du même)
- Chaque angle est basé sur un framework narratif DIFFÉRENT, traduit en angle créatif lisible
- Un angle peut être surprenant ou inattendu
- Pense à des angles que l'utilisatrice n'aurait pas trouvés seule
- Reste cohérent avec son ton & style
- Ne rédige RIEN. Pas d'exemple de phrases. Juste la direction.

Réponds UNIQUEMENT en JSON :
{
  "angles": [
    {
      "title": "...",
      "pitch": "...",
      "structure": ["étape 1", "étape 2", "étape 3", "étape 4"],
      "tone": "..."
    }
  ]
}`;
      userPrompt = `Propose-moi 3 angles éditoriaux pour : ${context}`;

    } else if (step === "questions") {
      systemPrompt = `${CORE_PRINCIPLES}

L'utilisatrice a choisi cet angle pour son contenu :
- Type : ${contentType}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}

PROFIL DE L'UTILISATRICE :
${fullContext}
${calendarBlock}

Pose exactement 3 questions pour récupérer SA matière première. Ces questions doivent extraire des anecdotes, des réflexions, des émotions PERSONNELLES qui rendront le contenu unique et impossible à reproduire par une IA seule.

RÈGLES :
- Questions OUVERTES (pas oui/non)
- Questions SPÉCIFIQUES à l'angle choisi (pas génériques)
- Demande des scènes, des moments, des détails concrets
- Une question peut demander une opinion tranchée ou une conviction
- Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment)
- Chaque question a un placeholder qui donne un mini-exemple de réponse pour inspirer

Réponds UNIQUEMENT en JSON :
{
  "questions": [
    {
      "question": "...",
      "placeholder": "..."
    }
  ]
}`;
      userPrompt = `Pose-moi des questions pour créer mon contenu avec l'angle "${angle.title}".`;

    } else if (step === "follow-up") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      systemPrompt = `${CORE_PRINCIPLES}

L'utilisatrice a répondu à ces questions :
${answersBlock}

Lis ses réponses. Identifie le détail le plus intéressant, le plus singulier, ou le plus émotionnel. Pose 1-2 questions de suivi pour creuser CE détail spécifique.

Le but : aller chercher le truc que personne d'autre ne pourrait dire. L'anecdote, le ressenti, la conviction qui rend ce contenu UNIQUE.

Réponds UNIQUEMENT en JSON :
{
  "follow_up_questions": [
    {
      "question": "...",
      "placeholder": "...",
      "why": "..."
    }
  ]
}`;
      userPrompt = "Pose-moi des questions d'approfondissement basées sur mes réponses.";

    } else if (step === "generate") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      const followUpBlock = followUpAnswers?.length
        ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";

      systemPrompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ANTI_BIAS}

${ETHICAL_GUARDRAILS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}

PROFIL DE L'UTILISATRICE :
${fullContext}
${calendarBlock}
${preGenBlock}

Rédige le contenu en suivant les INSTRUCTIONS DE RÉDACTION FINALE ci-dessus.

Le contenu doit être PRÊT À POSTER (pas un brouillon).
Longueur adaptée au format recommandé.

Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "..."
}`;
      userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

    } else if (step === "adjust") {
      systemPrompt = `${CORE_PRINCIPLES}

CONTENU ACTUEL :
"""
${currentContent}
"""

AJUSTEMENT DEMANDÉ : ${adjustment}

PROFIL DE L'UTILISATRICE :
${fullContext}

Réécris le contenu avec l'ajustement demandé. Garde la structure, les anecdotes et les mots de l'utilisatrice. Change UNIQUEMENT ce qui est lié à l'ajustement.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Ajuste le contenu : ${adjustment}`;

    } else if (step === "recycle") {
      const requestedFormats = (formats || []).map((f: string) => formatLabels[f] || f);

      systemPrompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ANTI_BIAS}

${ETHICAL_GUARDRAILS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

PROFIL DE L'UTILISATRICE :
${fullContext}
${voiceBlock}

${sourceText ? `Voici un contenu existant de l'utilisatrice :\n"""\n${sourceText}\n"""` : ""}

Transforme ce contenu en ces formats : ${requestedFormats.join(", ")}

RÈGLES CRUCIALES :
- Chaque format prend un ANGLE DIFFÉRENT du contenu source
- Le carrousel ne résume PAS la newsletter : il prend 1 idée et la développe
- Le Reel ne lit PAS le carrousel : il prend un autre point en mode oral/punchy
- Les stories ne récitent PAS le Reel : elles ouvrent le sujet de manière intime
- Le post LinkedIn ne copie PAS le post Instagram : ton plus analytique, 1ère personne, storytelling pro
- Pour chaque format, précise l'angle choisi

Réponds UNIQUEMENT en JSON :
{
  "results": {
    ${(formats || []).map((f: string) => `"${f}": "contenu complet ici"`).join(",\n    ")}
  }
}`;
      userPrompt = `Recycle ce contenu en ${requestedFormats.join(", ")}.`;

    } else if (step === "dictation") {
      systemPrompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ANTI_BIAS}

${ETHICAL_GUARDRAILS}

${WRITING_RESOURCES}

PROFIL DE L'UTILISATRICE :
${fullContext}
${voiceBlock}

L'utilisatrice a dicté ceci en mode vocal :
"""
${sourceText}
"""

Transforme en : ${targetFormat}

RÈGLES ABSOLUES :
- Garde SES mots. Si elle dit "le truc c'est que", utilise "le truc c'est que".
- Garde SON rythme. Si elle fait des phrases longues qui déroulent, garde ça.
- Garde SES expressions. Si elle dit "franchement" ou "genre", c'est sa voix.
- NE réécris PAS dans un style "professionnel". Structure, c'est tout.
- Tu peux couper les répétitions et les hésitations.
- Tu peux réorganiser l'ordre pour plus de clarté.
- Tu DOIS garder l'énergie et la personnalité de l'oral.

Le résultat doit sonner comme si ELLE l'avait écrit, pas comme si une IA avait reformulé.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Structure ma dictée vocale en ${targetFormat}.`;

    } else {
      return new Response(JSON.stringify({ error: "Step non reconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Call Anthropic ──
    let rawContent: string;

    if (step === "recycle" && body.fileBase64) {
      // Multimodal: text + file
      const content: any[] = [];

      if (body.fileMimeType === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 },
        });
      } else if (body.fileMimeType?.startsWith("image/")) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: body.fileMimeType, data: body.fileBase64 },
        });
      }

      const requestedFormats = (formats || []).map((f: string) => formatLabels[f] || f);
      const textInstruction = sourceText
        ? `Voici aussi du contexte texte :\n${sourceText}\n\nRecycle le contenu du fichier (et du texte si fourni) en ${requestedFormats.join(", ")}.`
        : `Analyse ce fichier et recycle son contenu en ${requestedFormats.join(", ")}.`;

      content.push({ type: "text", text: textInstruction });

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: systemPrompt,
        messages: [{ role: "user", content }],
        temperature: 0.8,
        max_tokens: 4096,
      });
    } else {
      rawContent = await callAnthropicSimple(getModelForAction("content"), systemPrompt, userPrompt!, 0.85);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = { raw: rawContent }; }
      } else {
        parsed = { raw: rawContent };
      }
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("creative-flow error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

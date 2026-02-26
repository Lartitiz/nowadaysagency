import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock } from "../_shared/user-context.ts";

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

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
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id, deepResearch } = body;

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, user.id, workspace_id, channelFromType);
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
      if (preGenAnswers.anecdote) pl.push(`- Anecdote (UTILISE ses mots exacts, garde le côté brut et authentique) : "${preGenAnswers.anecdote}"`);
      if (preGenAnswers.emotion) pl.push(`- Énergie/émotion visée (guide le ton de TOUT le contenu) : ${preGenAnswers.emotion}`);
      if (preGenAnswers.conviction) pl.push(`- Conviction/phrase clé (doit apparaître TEXTUELLEMENT dans le contenu, c'est SA voix) : "${preGenAnswers.conviction}"`);
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

    // Prepend voice priority instruction
    systemPrompt = BASE_SYSTEM_RULES + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + systemPrompt;

    // ── Deep Research (web search via Anthropic) ──
    if (deepResearch && step === "generate") {
      // Check deep_research quota
      const { checkQuota, logUsage } = await import("../_shared/plan-limiter.ts");
      const drQuota = await checkQuota(user.id, "deep_research");
      if (!drQuota.allowed) {
        return new Response(
          JSON.stringify({ error: "limit_reached", message: drQuota.message, remaining: 0 }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      const theme = calendarContext?.theme || context || contentType || "contenu";
      const activite = profile?.activite || "";

      const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey!,
          "anthropic-version": "2025-01-01",
        },
        body: JSON.stringify({
          model: getModelForAction("content"),
          max_tokens: 2048,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{
            role: "user",
            content: `Recherche des données récentes, statistiques, tendances et exemples concrets sur le sujet suivant : ${theme}. Contexte : ${activite}. Résume les 3-5 points les plus pertinents et intéressants pour créer du contenu social media engageant.`,
          }],
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        // Extract all text blocks from the response
        const textParts: string[] = [];
        for (const block of (searchData.content || [])) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        const researchResult = textParts.join("\n\n");

        if (researchResult.trim()) {
          systemPrompt += `\n\n--- RECHERCHE WEB ---\n${researchResult}\n--- FIN RECHERCHE ---\n\nUtilise ces données pour enrichir le contenu avec des faits concrets, des chiffres, des exemples récents. Ne cite pas les sources directement mais intègre les infos naturellement.`;
        }
      } else {
        console.error("Deep research web search failed:", searchResponse.status);
      }

      // Log deep research usage
      await logUsage(user.id, "deep_research", "web_search", undefined, "claude-sonnet-4-5-20250929", workspace_id);
    }

    // ── Call Anthropic ──
    let rawContent: string;

    // Build files array (backward compatible)
    const filesArray: any[] = body.files || (body.fileBase64 ? [{ base64: body.fileBase64, mimeType: body.fileMimeType, name: "fichier" }] : []);

    if (step === "recycle" && filesArray.length > 0) {
      // Validate total size (~20 Mo max in base64)
      let totalSize = 0;
      for (const f of filesArray) {
        totalSize += (f.base64?.length || 0);
      }
      if (totalSize > 27_000_000) { // ~20 Mo in base64
        return new Response(
          JSON.stringify({ error: "La taille totale des fichiers dépasse 20 Mo. Réduis le nombre ou la taille des fichiers." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Anthropic limit: max 5 PDFs
      let pdfCount = 0;
      let pdfWarning = "";
      const content: any[] = [];

      for (const f of filesArray.slice(0, 10)) {
        if (f.mimeType === "application/pdf") {
          pdfCount++;
          if (pdfCount > 5) {
            pdfWarning = "\n⚠️ Note : seuls les 5 premiers PDFs ont été analysés (limite technique).";
            continue;
          }
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: f.base64 },
          });
        } else if (f.mimeType?.startsWith("image/")) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: f.mimeType, data: f.base64 },
          });
        }
      }

      const requestedFormats = (formats || []).map((f: string) => formatLabels[f] || f);
      const fileNames = filesArray.map((f: any) => f.name || "fichier").join(", ");
      const textInstruction = sourceText
        ? `Voici aussi du contexte texte :\n${sourceText}\n\nRecycle le contenu de ces ${filesArray.length} fichier(s) (${fileNames}) et du texte en ${requestedFormats.join(", ")}. Synthétise les informations clés de tous les fichiers, ne traite pas chaque fichier isolément.${pdfWarning}`
        : `Analyse ces ${filesArray.length} fichier(s) (${fileNames}) et recycle leur contenu en ${requestedFormats.join(", ")}. Synthétise les informations clés de tous les fichiers.${pdfWarning}`;

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

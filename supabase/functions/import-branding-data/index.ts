import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callAnthropic, getDefaultModel } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForPrompt } from "../_shared/user-context.ts";

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { section, text, fields, workspace_id } = await req.json();

    if (!section || !text || !fields || !Array.isArray(fields)) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user context for better AI understanding
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userContext = await getUserContext(adminSupabase, user.id, workspace_id);
    const contextBlock = formatContextForPrompt(userContext);

    const fieldsList = fields
      .map((f: { key: string; label: string }) => `- "${f.key}" : ${f.label}`)
      .join("\n");

    const systemPrompt = `Tu es une experte en branding et communication. Tu reçois du texte brut fourni par une utilisatrice (un brief, des notes, un document). Ta mission est d'en extraire les informations pertinentes et de les répartir dans les champs suivants :

${fieldsList}

Règles strictes :
- Retourne UNIQUEMENT un JSON valide avec les clés correspondant aux champs ci-dessus.
- Si une information n'est pas trouvée dans le texte, mets null pour ce champ.
- Ne modifie PAS le style du texte. Garde les mots et le ton de l'utilisatrice.
- Ne reformule pas, ne résume pas. Copie ou adapte légèrement pour que ça rentre dans le champ.
- Chaque valeur doit être une string ou null.

${contextBlock ? `\nContexte de la marque de l'utilisatrice :\n${contextBlock}` : ""}

Retourne uniquement le JSON, sans aucune explication autour.`;

    const result = await callAnthropic({
      model: getDefaultModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
      temperature: 0.3,
      max_tokens: 4096,
    });

    // Parse JSON from response
    let parsed: Record<string, string | null>;
    try {
      // Try to extract JSON from potential markdown code blocks
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, result];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      return new Response(JSON.stringify({ error: "L'IA n'a pas retourné un format valide. Réessaie." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ extracted: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-branding-data error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = (e as any).status || 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

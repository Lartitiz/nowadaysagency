import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getDefaultModel } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, workspace_id, document_ids } = await req.json();
    if (!user_id || !document_ids?.length) {
      return new Response(JSON.stringify({ error: "Missing user_id or document_ids" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch document records
    const { data: docs, error: docsError } = await supabase
      .from("user_documents")
      .select("id, file_name, file_url, file_type")
      .in("id", document_ids)
      .eq("user_id", user_id);

    if (docsError || !docs?.length) {
      return new Response(JSON.stringify({ error: "No documents found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download and extract text from each document
    const textParts: string[] = [];

    for (const doc of docs) {
      try {
        const filePath = doc.file_url.replace(/^.*onboarding-uploads\//, "");
        const { data: fileData, error: dlError } = await supabase.storage
          .from("onboarding-uploads")
          .download(filePath);

        if (dlError || !fileData) {
          console.error(`Failed to download ${doc.file_name}:`, dlError);
          continue;
        }

        const ext = doc.file_name?.split(".").pop()?.toLowerCase();

        if (ext === "txt" || ext === "md") {
          const text = await fileData.text();
          textParts.push(`--- ${doc.file_name} ---\n${text}`);
        } else if (ext === "pdf" || ext === "docx" || ext === "doc") {
          // For PDF/DOCX, send raw text content - best effort
          const text = await fileData.text();
          if (text.length > 100) {
            textParts.push(`--- ${doc.file_name} ---\n${text.substring(0, 15000)}`);
          } else {
            textParts.push(`--- ${doc.file_name} (binary, couldn't extract text) ---`);
          }
        } else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
          textParts.push(`--- ${doc.file_name} (image uploaded, visual content) ---`);
        }
      } catch (e) {
        console.error(`Error processing ${doc.file_name}:`, e);
      }
    }

    if (textParts.length === 0) {
      // Mark as processed but no data extracted
      for (const doc of docs) {
        await supabase
          .from("user_documents")
          .update({ processed: true, extracted_data: null })
          .eq("id", doc.id);
      }
      return new Response(JSON.stringify({ extracted_data: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const combinedText = textParts.join("\n\n");

    const systemPrompt = `Tu es un assistant spécialisé en branding et communication pour entrepreneures.
Analyse les documents fournis et extrais les informations suivantes au format JSON strict.
Si une information n'est pas trouvée, retourne null pour ce champ.

Retourne UNIQUEMENT un JSON valide, sans texte avant ni après :
{
  "positioning": "le positionnement en 2-3 phrases, ou null",
  "mission": "la mission profonde, ou null",
  "target_description": "description de la cliente idéale, ou null",
  "tone_keywords": ["mot1", "mot2", "mot3"] ou null,
  "offers": [{"name": "nom", "price": "prix", "description": "description"}] ou null,
  "values": ["valeur1", "valeur2", "valeur3"] ou null,
  "story": "éléments de storytelling/parcours, ou null"
}`;

    const result = await callAnthropicSimple(
      getDefaultModel(),
      systemPrompt,
      `Voici les documents de marque à analyser :\n\n${combinedText}`,
      0.3,
      2048
    );

    // Parse JSON from response
    let extracted_data = null;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted_data = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Save extracted data to each document
    for (const doc of docs) {
      await supabase
        .from("user_documents")
        .update({ processed: true, extracted_data })
        .eq("id", doc.id);
    }

    return new Response(JSON.stringify({ extracted_data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-documents error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

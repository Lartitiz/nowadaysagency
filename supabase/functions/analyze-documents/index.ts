import { authenticateRequest, getServiceClient, AuthError } from "../_shared/auth.ts";
import { callAnthropicSimple, getDefaultModel } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { extractFromBlob } from "../_shared/scraping.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate via JWT - no more trusting user_id from body
    const { userId } = await authenticateRequest(req);

    const { workspace_id, document_ids } = await req.json();
    if (!document_ids?.length) {
      return new Response(JSON.stringify({ error: "Missing document_ids" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();

    // Fetch document records using authenticated userId
    const { data: docs, error: docsError } = await supabase
      .from("user_documents")
      .select("id, file_name, file_url, file_type")
      .in("id", document_ids)
      .eq("user_id", userId);

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

        const extracted = await extractFromBlob(fileData, doc.file_name || "file.txt");

        if (extracted && !extracted.startsWith("[")) {
          textParts.push(`--- ${doc.file_name} ---\n${extracted.substring(0, 15000)}`);
        } else if (extracted) {
          textParts.push(`--- ${doc.file_name} ${extracted} ---`);
        } else {
          textParts.push(`--- ${doc.file_name} (format non lisible) ---`);
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
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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

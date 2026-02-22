import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { sheets } = await req.json();
    // sheets: [{ name: string, headers: string[], sampleRows: any[][] }]

    const prompt = `Voici les feuilles d'un fichier Excel de suivi de stats réseaux sociaux / business.

FEUILLES DISPONIBLES :
${sheets.map((s: any) => `- "${s.name}" : ${s.headers.length} colonnes\n  Headers: ${s.headers.map((h: any, i: number) => `[${i}] ${h ?? '(vide)'}`).join(' | ')}\n  Ligne 2: ${(s.sampleRows[0] || []).map((v: any) => v ?? '–').join(' | ')}\n  Ligne 3: ${(s.sampleRows[1] || []).map((v: any) => v ?? '–').join(' | ')}\n  Ligne 4: ${(s.sampleRows[2] || []).map((v: any) => v ?? '–').join(' | ')}`).join('\n\n')}

Identifie quelle colonne correspond à quelle métrique.
Retourne UNIQUEMENT un JSON valide, sans commentaires, sans markdown :

{
  "sheet": "Nom de la feuille à utiliser",
  "date_column": 0,
  "mapping": {
    "objective": null,
    "content_published": null,
    "reach": null,
    "stories_coverage": null,
    "views": null,
    "profile_visits": null,
    "website_clicks": null,
    "interactions": null,
    "accounts_engaged": null,
    "followers_engaged": null,
    "followers": null,
    "followers_gained": null,
    "followers_lost": null,
    "email_signups": null,
    "newsletter_subscribers": null,
    "website_visitors": null,
    "traffic_pinterest": null,
    "traffic_instagram": null,
    "ga4_users": null,
    "traffic_search": null,
    "traffic_social": null,
    "ad_budget": null,
    "page_views_plan": null,
    "page_views_academy": null,
    "page_views_agency": null,
    "discovery_calls": null,
    "clients_signed": null,
    "revenue": null
  },
  "skip_columns": [],
  "date_format": "excel_date",
  "start_row": 2,
  "confidence": "high"
}

Mets l'index 0-based de la colonne pour chaque métrique trouvée, ou null si absente.

Règles :
- "followers" = le TOTAL d'abonnés, pas le gain
- "followers_gained" = les nouveaux abonnés gagnés
- Les colonnes avec "taux", "%", "ratio", "conversion", "moyenne" sont souvent des calculs → mets-les dans skip_columns
- "CA", "chiffre d'affaires", "revenu" = revenue
- "Panier moyen", "CAC" = calculés → skip_columns
- date_format: "excel_date" si dates Excel, "text_french" si noms de mois en français, "iso" si format YYYY-MM-DD
- start_row: première ligne de données (souvent 2, parfois 3 si double header)
- Choisis la feuille qui contient le plus de données de suivi (pas une feuille "OLD" ou vide)
- confidence: "high" si headers clairs, "medium" si ambigus, "low" si très incertain`;

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un expert en analyse de fichiers Excel. Tu retournes UNIQUEMENT du JSON valide, sans markdown, sans commentaires." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Clean markdown wrapping if any
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const mapping = JSON.parse(content);

    return new Response(JSON.stringify(mapping), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-excel-mapping error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

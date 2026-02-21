const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || !url.includes("instagram.com")) {
      return new Response(
        JSON.stringify({ error: true, message: "Lien Instagram invalide." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean URL (remove query params)
    const cleanUrl = url.split("?")[0];

    // Try Instagram oEmbed API first
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}&maxwidth=658`;

    try {
      const response = await fetch(oembedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      });

      if (response.ok) {
        const data = await response.json();
        return new Response(
          JSON.stringify({
            caption: data.title || null,
            author: data.author_name || null,
            thumbnail: data.thumbnail_url || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    } catch (e) {
      console.log("oEmbed failed, trying fallback:", e);
    }

    // Fallback: noembed.com
    try {
      const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`;
      const fallbackResponse = await fetch(noembedUrl);

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.title || fallbackData.author_name) {
          return new Response(
            JSON.stringify({
              caption: fallbackData.title || null,
              author: fallbackData.author_name || null,
              thumbnail: fallbackData.thumbnail_url || null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }
    } catch (e) {
      console.log("noembed fallback failed:", e);
    }

    // Both failed — return graceful error (status 200 to avoid CORS issues)
    return new Response(
      JSON.stringify({
        error: true,
        message: "Impossible de récupérer ce post. Colle le texte directement.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Fetch error:", error);
    return new Response(
      JSON.stringify({
        error: true,
        message: "Impossible de récupérer ce post. Colle le texte directement.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

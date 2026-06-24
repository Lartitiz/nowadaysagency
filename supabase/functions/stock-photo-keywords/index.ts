/**
 * stock-photo-keywords
 *
 * Transforme le CONTENU d'un contenu à venir (sujet + angle + format du carrousel
 * que l'IA va générer) en mots-clés visuels concrets, prêts à chercher sur Pexels.
 *
 * Pourquoi : le sujet brut tapé par l'utilisatrice est souvent abstrait et en
 * français (« ma pire erreur de communication ») → Pexels ne renvoie rien. On
 * demande à l'IA de traduire l'idée en SCÈNES PHOTOGRAPHIABLES en anglais
 * (Pexels a une bien meilleure couverture en anglais), pour des résultats
 * pertinents par rapport à ce que le carrousel raconte.
 *
 * - Auth + rate-limit via le pipeline standard. skipQuota : micro-appel IA
 *   d'assistance (comme les autres suggestions de création), pas de débit crédit.
 * - Ne fait QUE proposer des mots-clés ; la recherche Pexels elle-même reste dans
 *   stock-photo-search. Si cet appel échoue, le front retombe sur le sujet brut.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";

const BodySchema = z.object({
  subject: z.string().min(1).max(2000),
  format: z.string().max(40).optional(),
  angle: z.string().max(300).optional(),
  objective: z.string().max(60).optional(),
  /** Texte des slides déjà générées, si disponible — affine encore les mots-clés. */
  slides: z.array(z.string().max(600)).max(15).optional(),
});

const FORMAT_HINTS: Record<string, string> = {
  carousel: "Instagram carousel (portrait 4:5) — clean, editorial, room for text overlay",
  post: "Instagram single post (portrait 4:5)",
  reel: "Instagram reel cover (vertical 9:16) — dynamic, eye-catching",
  story: "Instagram story (vertical 9:16) — casual, behind-the-scenes feel",
  linkedin: "LinkedIn post — professional, business context",
  newsletter: "Newsletter header — wide, editorial",
  pinterest: "Pinterest pin (tall) — bright, aspirational",
  pinterest_visual: "Pinterest visual pin (tall) — infographic-friendly, clean background",
};

serve(async (req) => {
  // Auth + rate-limit. skipQuota : assistance, pas d'appel facturé.
  const r = await runPipeline(req, { skipQuota: true });
  if (!r.ok) return r.response;
  const { corsHeaders } = r;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Requête invalide.", details: String(e) }, 400);
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("[stock-photo-keywords] LOVABLE_API_KEY manquante");
    return json({ error: "Suggestion de mots-clés indisponible (clé IA manquante)." }, 503);
  }

  const formatHint = body.format ? FORMAT_HINTS[body.format] : undefined;
  const slidesBlock =
    body.slides && body.slides.length
      ? `\n\nTexte des slides du carrousel :\n${body.slides.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

  const prompt = `Une créatrice de contenu prépare un contenu sur les réseaux et veut illustrer avec des photos de banque d'images (Pexels). Pexels marche bien mieux avec des requêtes EN ANGLAIS et CONCRÈTES (des scènes, des objets, des personnes — pas des concepts abstraits).

Ton job : à partir du sujet (souvent abstrait, en français), proposer des mots-clés de recherche photo qui correspondent à des IMAGES RÉELLES et PERTINENTES pour ce contenu.

Sujet : ${body.subject}${body.angle ? `\nAngle éditorial : ${body.angle}` : ""}${body.objective ? `\nObjectif : ${body.objective}` : ""}${formatHint ? `\nFormat visuel : ${formatHint}` : ""}${slidesBlock}

Règles :
- 5 requêtes, EN ANGLAIS, 2 à 4 mots chacune, décrivant une scène photographiable concrète.
- Traduis les concepts abstraits en visuels (ex : "burn-out" → "tired woman desk", "lancement d'offre" → "laptop coffee workspace").
- Varie les angles visuels (gros plan, ambiance, personne, objet, lieu) pour offrir du choix.
- Évite le texte sur image, les logos, les captures d'écran.
- "primary" = la requête la plus sûre pour ramener des résultats pertinents tout de suite.

Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "primary": "best single english search phrase",
  "keywords": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"]
}`;

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Tu aides à trouver des photos de banque d'images. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 300,
      }),
    });
  } catch (e) {
    console.error("[stock-photo-keywords] fetch error", e);
    return json({ error: "Suggestion de mots-clés indisponible." }, 502);
  }

  if (!aiResponse.ok) {
    const status = aiResponse.status;
    console.error("[stock-photo-keywords] AI gateway error", status);
    const msg =
      status === 429
        ? "Trop de requêtes, réessaie dans un moment."
        : "Suggestion de mots-clés indisponible.";
    return json({ error: msg }, 502);
  }

  const aiData = await aiResponse.json().catch(() => ({}));
  const text: string = aiData?.choices?.[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[stock-photo-keywords] réponse IA non parsable", text.slice(0, 200));
    return json({ error: "Suggestion de mots-clés indisponible." }, 502);
  }

  let parsed: { primary?: unknown; keywords?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return json({ error: "Suggestion de mots-clés indisponible." }, 502);
  }

  // Normalisation défensive : on ne renvoie que des chaînes propres, dédupliquées.
  const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
  const rawList = Array.isArray(parsed.keywords) ? parsed.keywords.map(clean) : [];
  const primary = clean(parsed.primary) || rawList[0] || "";
  const keywords = Array.from(new Set([primary, ...rawList].filter(Boolean))).slice(0, 6);

  if (!keywords.length) {
    return json({ error: "Aucun mot-clé proposé." }, 502);
  }

  return json({ primary: primary || keywords[0], keywords });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getDefaultModel } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { validateInput, ValidationError, AuditBrandingSchema } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandingAuditor/1.0)" },
      redirect: "follow",
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return htmlToText(html);
  } catch {
    return "";
  }
}

function findKeyPageLinks(html: string, baseUrl: string): string[] {
  const keywords = [
    "a-propos", "about", "qui-suis-je", "qui-je-suis", "mon-histoire",
    "services", "offres", "prestations", "accompagnement", "coaching",
    "tarifs", "prix", "pricing", "contact", "blog",
  ];
  const linkRegex = /href=["']([^"']+)["']/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (keywords.some((kw) => href.toLowerCase().includes(kw))) {
      try {
        const full = new URL(href, baseUrl).href;
        if (full.startsWith(new URL(baseUrl).origin)) found.add(full);
      } catch { /* skip */ }
    }
  }
  return Array.from(found).slice(0, 6);
}

async function fetchSiteContent(url: string): Promise<string> {
  const homepageResp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandingAuditor/1.0)" },
    redirect: "follow",
  });
  if (!homepageResp.ok) return "";
  const html = await homepageResp.text();
  let text = htmlToText(html);

  const links = findKeyPageLinks(html, url);
  console.log("Sub-pages found:", links);
  const subTexts = await Promise.all(links.map(fetchPageText));
  for (const st of subTexts) {
    if (st.length > 50) text += "\n\n---\n\n" + st;
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    // Quota check
    const quota = await checkQuota(user.id, "audit");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = validateInput(await req.json(), AuditBrandingSchema);
    const { site_url, instagram_username, linkedin_url, document_text, free_text, workspace_id, social_links } = body;

    // Workspace-aware filtering
    const filterCol = workspace_id ? "workspace_id" : "user_id";
    const filterVal = workspace_id || user.id;

    // Collect sources
    const sources: Record<string, string> = {};
    const sourcesUsed: string[] = [];

    // Site web
    if (site_url) {
      console.log("Fetching site:", site_url);
      const siteText = await fetchSiteContent(site_url);
      if (siteText.length > 100) {
        sources.site_web = siteText.slice(0, 8000);
        sourcesUsed.push("site_web");
      }
    }

    // Instagram bio (from existing audit if available)
    if (instagram_username) {
      const sbService = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: audit } = await sbService
        .from("instagram_audit")
        .select("resume, score_bio, score_global, details, content_analysis, editorial_recommendations")
        .eq(filterCol, filterVal)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (audit) {
        sources.instagram = `Résumé d'audit Instagram existant:\n${audit.resume || "Pas de résumé"}\nScore bio: ${audit.score_bio}/100\nScore global: ${audit.score_global}/100\nDétails: ${JSON.stringify(audit.details || {}).slice(0, 2000)}`;
        sourcesUsed.push("instagram");
      } else {
        sources.instagram = `Compte Instagram : @${instagram_username.replace("@", "")} (pas d'audit détaillé disponible, analyse basée sur le nom de compte uniquement)`;
        sourcesUsed.push("instagram");
      }
    }

    // LinkedIn
    if (linkedin_url) {
      const linkedinText = await fetchPageText(linkedin_url);
      if (linkedinText.length > 50) {
        sources.linkedin = linkedinText.slice(0, 4000);
        sourcesUsed.push("linkedin");
      }
    }

    // Document
    if (document_text && document_text.trim().length > 50) {
      sources.document = document_text.trim().slice(0, 6000);
      sourcesUsed.push("document");
    }

    // Free text
    if (free_text && free_text.trim().length > 20) {
      sources.texte_libre = free_text.trim().slice(0, 4000);
      sourcesUsed.push("texte_libre");
    }

    if (sourcesUsed.length === 0) {
      return new Response(JSON.stringify({ error: "Fournis au moins une source à analyser." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build source text for AI
    let sourceText = "";
    for (const [key, val] of Object.entries(sources)) {
      sourceText += `\n\n══ SOURCE : ${key.toUpperCase()} ══\n${val}`;
    }

    const systemPrompt = `Tu es une experte en communication et branding pour solopreneuses et freelances.
L'utilisatrice te donne toutes les sources de sa communication actuelle. Fais un audit complet, bienveillant mais honnête.

RÈGLES :
- Sois honnête mais bienveillante (pas de jugement)
- Chaque recommandation doit être concrète et actionnable
- Le score est réaliste (pas de 90/100 si c'est moyen)
- Valorise ce qui existe avant de pointer ce qui manque
- Si une source manque, ne pas inventer (marquer "non analysé")
- Le plan d'action recommandé est ordonné par priorité
- Écris en français, tutoie l'utilisatrice

TABLE DE MAPPING DES ACTIONS :
Pour chaque point faible, associe UNE action concrète faisable dans l'outil en utilisant cette table.
Le champ "module" DOIT être EXACTEMENT l'une de ces valeurs (liste fermée, pas d'autre valeur autorisée) :
persona, positionnement, offres, bio, storytelling, ton, editorial, contenu, instagram, highlights, linkedin, calendrier, contacts, engagement, seo, branding

| Thème | module | label |
|-------|--------|-------|
| Cible floue/large/mal définie | persona | Retravailler ma cible |
| Positionnement flou/absent | positionnement | Clarifier mon positionnement |
| Offres pas claires/invisibles | offres | Reformuler mes offres |
| Bio pas optimisée | bio | Optimiser ma bio |
| Storytelling absent/faible | storytelling | Écrire mon histoire |
| Ton incohérent/pas défini | ton | Définir mon ton |
| Pas de ligne éditoriale | editorial | Créer ma ligne édito |
| Identité visuelle incohérente | branding | Travailler mon identité |
| Pas de stratégie de contenu | calendrier | Planifier mes contenus |
| Highlights pas organisés | highlights | Structurer mon profil IG |
| Pas de preuve sociale | contenu | Créer un post témoignage |
| Engagement faible | engagement | Lancer ma routine engagement |
| Pas de CTA clair | bio | Ajouter un CTA dans ma bio |
| Cohérence cross-canal manque | branding | Unifier ma communication |
| Fréquence irrégulière | calendrier | Créer mon calendrier |

Le conseil doit être en 1-2 phrases, actionnable, et le label du bouton doit commencer par un verbe.
NE PAS mettre de route dans la réponse — le frontend gère les routes automatiquement.

RETOURNE UNIQUEMENT un objet JSON valide avec cette structure exacte :
{
  "score_global": 72,
  "synthese": "En 2-3 phrases : l'état général de sa com.",
  "points_forts": [
    {"titre": "...", "detail": "...", "source": "site_web"}
  ],
  "points_faibles": [
    {
      "titre": "...", 
      "detail": "...", 
      "source": "instagram + site_web", 
      "priorite": "haute",
      "action": {
        "module": "persona",
        "label": "Retravailler ma cible",
        "conseil": "Redéfinis ta cliente idéale. Concentre-toi sur 1 persona principal."
      }
    }
  ],
  "audit_detail": {
    "positionnement": {"score": 80, "statut": "bon", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "cible": {"score": 60, "statut": "flou", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "ton_voix": {"score": 70, "statut": "bon", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "offres": {"score": 50, "statut": "flou", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "storytelling": {"score": 40, "statut": "absent", "ce_qui_existe": null, "ce_qui_manque": "...", "recommandation": "..."},
    "identite_visuelle": {"score": 75, "statut": "bon", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "coherence_cross_canal": {"score": 55, "statut": "flou", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."},
    "contenu": {"score": 65, "statut": "bon", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "..."}
  },
  "plan_action_recommande": [
    {"priorite": 1, "action": "...", "module": "branding", "temps_estime": "30 min", "conseil": "Conseil court pour cette action."}
  ],
  "extraction_branding": {
    "positioning": {"value": "...", "confidence": "high"},
    "mission": {"value": "...", "confidence": "medium"},
    "voice_description": {"value": "...", "confidence": "..."},
    "values": {"value": "...", "confidence": "..."},
    "for_whom": {"value": "...", "confidence": "..."},
    "target_description": {"value": "...", "confidence": "..."},
    "offers": {"value": "...", "confidence": "..."},
    "story": {"value": "...", "confidence": "..."},
    "content_pillars": {"value": "...", "confidence": "..."}
  }
}

Les statuts possibles : "absent", "flou", "bon", "excellent"
Les priorités possibles : "haute", "moyenne", "basse"
IMPORTANT : retourne UNIQUEMENT le JSON, sans texte avant ni après.`;

    const userPrompt = `Voici les sources de communication de l'utilisatrice :\n${sourceText}`;

    const raw = await callAnthropicSimple(
      getDefaultModel(),
      systemPrompt + "\n\n" + ANTI_SLOP,
      userPrompt,
      0.3,
      6000
    );

    let auditResult: Record<string, any>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      auditResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse AI response:", raw);
      return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to DB
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await sbService.from("branding_audits").insert({
      user_id: user.id,
      workspace_id: workspace_id || null,
      sources_used: sourcesUsed,
      site_url: site_url || null,
      instagram_username: instagram_username || null,
      linkedin_url: linkedin_url || null,
      score_global: auditResult.score_global || null,
      synthese: auditResult.synthese || null,
      points_forts: auditResult.points_forts || null,
      points_faibles: auditResult.points_faibles || null,
      audit_detail: auditResult.audit_detail || null,
      plan_action: auditResult.plan_action_recommande || null,
      extraction_branding: auditResult.extraction_branding || null,
    });

    // Save audit recommendations with enhanced data
    const recommendations = (auditResult.points_faibles || [])
      .filter((pf: any) => pf.action?.route)
      .map((pf: any, idx: number) => ({
        user_id: user.id,
        workspace_id: workspace_id || null,
        audit_id: undefined as string | undefined,
        position: idx + 1,
        titre: pf.titre,
        detail: pf.detail,
        conseil_contextuel: pf.action.conseil,
        module: pf.action.module,
        route: pf.action.route,
        label: pf.action.label,
        label_bouton: pf.action.label,
        conseil: pf.action.conseil,
        priorite: pf.priorite || "moyenne",
        temps_estime: (auditResult.plan_action_recommande || []).find((a: any) => a.module === pf.action.module)?.temps_estime || null,
      }));

    // Get the audit ID we just inserted
    const { data: lastAudit } = await sbService
      .from("branding_audits")
      .select("id")
      .eq(filterCol, filterVal)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAudit && recommendations.length > 0) {
      // Delete old recommendations for this user
      await sbService.from("audit_recommendations").delete().eq(filterCol, filterVal);
      // Insert new ones
      await sbService.from("audit_recommendations").insert(
        recommendations.map((r: any) => ({ ...r, audit_id: lastAudit.id }))
      );
    }

    // Log usage
    await logUsage(user.id, "audit", "audit_branding");

    return new Response(JSON.stringify({ audit: auditResult, sources_used: sourcesUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-branding error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = e instanceof ValidationError ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

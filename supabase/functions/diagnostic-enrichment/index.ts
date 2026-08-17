import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, getModelForAction, type AnthropicTool } from "../_shared/anthropic.ts";
import { parseAiJson } from "../_shared/parse-ai-json.ts";
// (import logUsage retiré — l'enrichissement ne décompte plus de crédit, voir note dans le handler)

/**
 * Phase 2 enrichment for deep-diagnostic.
 * Runs in its own worker to avoid memory limits.
 * Called internally by deep-diagnostic via fetch (fire-and-forget).
 */

// Sortie structurée par tool forcé : le JSON est valide par construction — fini
// le parse texte + rustine regex qui perdait TOUTE la fiche sur une troncature
// (même recette que deep-diagnostic #640/#645). Schéma volontairement souple
// (pas de `required` profond) : le contrat porte sur le TRANSPORT et la
// présence des 7 sections ; le contenu est vérifié par la garde ci-dessous.
const ENRICHMENT_TOOL: AnthropicTool = {
  name: "rendre_enrichissement",
  description: "Renvoie les 7 sections de branding pré-remplies.",
  input_schema: {
    type: "object",
    properties: {
      branding_prefill: { type: "object", description: "positioning, mission, cible, ton, combats, valeurs, piliers, story_draft, offres, proposition de valeur — cf structure du prompt" },
      voice_prefill: { type: "object" },
      charter_prefill: { type: "object" },
      combat_structured: { type: "object" },
      persona_prefill: { type: "object" },
      content_strategy_prefill: { type: "object" },
      starter_ideas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titre: { type: "string" },
            format: { type: "string" },
            canal: { type: "string" },
            objectif: { type: "string" },
            angle: { type: "string" },
          },
          required: ["titre"],
        },
      },
    },
    required: ["branding_prefill", "voice_prefill", "charter_prefill", "persona_prefill", "content_strategy_prefill", "starter_ideas"],
  },
};

/**
 * Sortie « dégénérée » : la fiche est inutilisable si branding_prefill est
 * vide/absent (aucun champ significatif) — vu sur deep-diagnostic le 26/07,
 * le modèle peut techniquement respecter le schéma en laissant tout vide.
 */
function isDegenerateEnrichment(result: Record<string, unknown>): boolean {
  const prefill = result?.branding_prefill as Record<string, unknown> | undefined;
  if (!prefill || typeof prefill !== "object") return true;
  const meaningful = Object.values(prefill).filter((v) =>
    v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0)
  );
  return meaningful.length === 0;
}

// Handler exporté pour les tests (serve() de std/http ouvre un vrai socket,
// non capturable par test-edge-harness — même pattern que creative-flow).
export async function handleEnrichment(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify internal call via service role key
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, workspaceId, userPrompt, savedDiagId, isOnboarding, allowOverwrite } = await req.json();
    // `allowOverwrite` ne vaut true que si l'utilisatrice a répondu « oui,
    // remplacer » à l'écran (Onboarding.tsx) devant le nom de son espace.
    const overwrite = allowOverwrite === true;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ── Collecte des écritures en échec ──────────────────────────────────
    // Chaque écriture DOIT lire son `{ error }` et le signaler ici : la
    // réponse finale liste ce qui n'a PAS été enregistré. Avant, ~15 writes
    // ignoraient l'erreur et la fonction répondait « success: true » quoi
    // qu'il arrive — l'utilisatrice finissait son onboarding en croyant son
    // branding rempli alors que des sections étaient vides (audit succès
    // menteurs 17/08). On n'interrompt PAS au premier échec : les sections
    // suivantes restent tentées (échec partiel > tout perdre), puis la
    // réponse dit précisément ce qui manque.
    const failedWrites: string[] = [];
    const trackWrite = (section: string, error: { message?: string } | null) => {
      if (!error) return;
      failedWrites.push(section);
      console.error(`[diagnostic-enrichment] écriture ${section} en échec:`, error.message ?? error);
    };

    const enrichmentSystemPrompt = `Tu es un·e expert·e en communication et branding. On te donne le contenu en ligne d'une entreprise ou d'un·e solopreneur·e ainsi que ses réponses d'onboarding. Ta mission : analyser tout ça et pré-remplir 7 sections de branding.

Pour chaque section, donne une réponse structurée en JSON. Sois concret·e, précis·e, et utilise les mots que la personne utilise elle-même sur ses supports. Ne sois pas générique.

Si tu n'as pas assez d'infos pour remplir une section, mets "confidence": "low" et explique ce qui manque. Si tu es confiant·e, mets "confidence": "high".

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.

Structure attendue :

{
  "branding_prefill": {
    "positioning": "phrase de positionnement déduite ou null",
    "mission": "mission déduite ou null",
    "target_description": "description de la cible idéale déduite ou null",
    "target_problem": "problème principal de la cible ou null",
    "target_beliefs": "croyances limitantes de la cible ou null",
    "tone_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "tone_style": "description du style de communication ou null",
    "combats": ["conviction 1", "conviction 2"],
    "values": ["valeur 1", "valeur 2", "valeur 3"],
    "content_pillars": ["pilier 1", "pilier 2", "pilier 3"],
    "story_draft": "2-4 phrases résumant le parcours ou null",
    "offers": [{ "name": "nom", "description": "description courte", "price": "prix ou null" }],
    "value_prop_sentence": "phrase de proposition de valeur ou null",
    "value_prop_problem": "problème résolu ou null",
    "value_prop_solution": "solution apportée ou null",
    "value_prop_difference": "différenciateur ou null",
    "value_prop_proof": "preuve ou null"
  },
  "voice_prefill": {
    "voice_summary": "description en 2-3 phrases de comment cette personne écrit ou null",
    "voice_description": "description du ton global (ex: 'Direct et chaleureux, comme une amie experte') ou null",
    "tone_register": "tutoiement ou vouvoiement",
    "tone_level": "accessible, expert, technique ou vulgarisateur",
    "tone_style_chip": "direct, poétique, storytelling, factuel ou autre",
    "tone_humor": "auto-dérision, absurde, pince-sans-rire, pas d'humour ou autre",
    "tone_engagement": "militant, discret ou modéré",
    "tone_patterns": ["pattern 1", "pattern 2"],
    "signature_expressions": ["expression 1", "expression 2"],
    "banned_expressions": ["expression à éviter 1", "expression à éviter 2"],
    "key_expressions": "expressions ou mots récurrents sur le site (séparés par des virgules) ou null",
    "things_to_avoid": "mots ou formulations que cette marque évite visiblement ou null",
    "target_verbatims": "phrases que la cible pourrait dire (déduit du positionnement) ou null",
    "channels": ["canaux de communication détectés"]
  },
  "charter_prefill": {
    "confidence": "high|medium|low",
    "color_primary": "code hex EXACT trouvé dans les données CSS/style_hints fournies, ou null",
    "color_secondary": "code hex EXACT ou null",
    "color_accent": "code hex EXACT ou null",
    "color_background": "code hex EXACT ou null",
    "color_text": "code hex EXACT ou null",
    "font_title": "nom EXACT de la police détectée dans les données CSS/Google Fonts fournies, ou null",
    "font_body": "nom EXACT de la police body détectée, ou null",
    "mood_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "photo_style": "description du style visuel global déduit des images et du ton du site, ou null"
  },
  "combat_structured": {
    "combat_cause": "pourquoi elle fait ça ou null",
    "combat_fights": "contre quoi elle lutte ou null",
    "combat_alternative": "ce qu'elle propose à la place ou null",
    "combat_refusals": "ce qu'elle refuse de faire ou null"
  },
  "persona_prefill": {
    "confidence": "high|medium|low",
    "description": "description courte du persona en une phrase ou null",
    "goals": ["objectif 1", "objectif 2"],
    "frustrations": ["frustration 1", "frustration 2"],
    "desires": ["désir 1", "désir 2"],
    "objections": ["objection ou frein à l'achat 1", "objection 2"],
    "transformation": "la transformation concrète que vit la cliente grâce à cette marque ou null",
    "beautiful_world": "dans un monde idéal, à quoi ressemblerait la situation de cette personne ou null",
    "first_actions": "premières actions concrètes en travaillant avec cette marque ou null"
  },
  "content_strategy_prefill": {
    "confidence": "high|medium|low",
    "pillars": [{"label": "nom du pilier thématique", "description": "de quoi on parle concrètement dans ce pilier"}],
    "hidden_facets": ["facette personnelle ou coulisse que la marque pourrait montrer 1", "facette 2"],
    "creative_twist": "angle créatif unique ou null",
    "formats": ["format 1", "format 2"],
    "rhythm": "rythme de publication détecté ou null",
    "editorial_line": "ligne éditoriale déduite ou null"
  },
  "starter_ideas": [
    { "titre": "sujet de contenu prêt à générer, formulé à la première personne", "format": "post|carousel|reel|story", "canal": "instagram|linkedin", "objectif": "visibilite|confiance|vente", "angle": "angle éditorial en quelques mots" }
  ]
}

Précisions importantes :
- Pour les offres, cherche : pages services, tarifs, accompagnements, formations, produits. Liste TOUTES les offres détectées.
- Pour le story_draft, utilise la page à propos, les réponses libres (uniqueness, positioning).
- Pour les combats, identifie les causes défendues, les refus assumés, les convictions fortes.
- CHARTE GRAPHIQUE — DEUX CAS :

  1. Si des données CSS sont présentes (sections "Couleurs détectées dans le CSS", "CSS variable", "Typographies détectées", "Google Fonts") → utilise les valeurs EXACTES détectées. confidence: "high".

  2. Si AUCUNE donnée CSS n'est présente (cas fréquent avec Squarespace, Wix, Webflow) → propose une palette d'ambiance cohérente avec le positionnement, l'univers et le ton de la marque. Choisis des couleurs qui reflètent l'identité visuelle perçue du site (tons sombres pour un univers luxe/intime, tons chauds pour l'artisanat, pastels pour le bien-être, etc.). confidence: "low". Pour les typos sans données CSS, propose une paire titre/corps cohérente avec l'ambiance (serif élégante pour le luxe, sans-serif ronde pour le friendly, etc.).

  Dans les DEUX cas : mood_keywords et photo_style sont toujours déduits du contenu.
- Pour le persona, déduis à partir du positionnement et du contenu : à qui s'adresse cette personne ? Les objections = ce qui freine cette cible avant d'acheter (prix, légitimité, timing…), formulées comme elle les dirait. La transformation = l'avant/après concret vécu grâce à la marque.
- Pour hidden_facets : 2-3 facettes intimes ou coulisses que cette marque gagnerait à montrer dans sa communication (déduites du à propos, du parcours, des valeurs) — pas des thématiques de contenu, des zones de vulnérabilité ou d'authenticité.
- Pour la stratégie de contenu : les piliers sont des THÉMATIQUES DE CONTENU, pas des conseils génériques. Chaque pilier = un grand sujet dont la marque parle sur ses réseaux. Exemples : pour une céramiste → "Coulisses de l'atelier", "Rituels du quotidien", "L'artisanat comme acte militant". Pour une coach yoga → "Pratiques et postures", "Philosophie du corps", "Témoignages de transformation". Déduis 3-4 piliers CONCRETS à partir de l'activité, du positionnement et du contenu existant de la marque. Ne JAMAIS proposer des piliers génériques comme "Organisation", "Régularité", "Engagement communautaire" ou "Éducation" sans les lier à l'univers spécifique de la marque.
- Pour la proposition de valeur : synthétise en une phrase ce que cette marque apporte, à qui, et pourquoi c'est différent. Utilise le vocabulaire de la marque, pas du jargon marketing.
- Pour la proposition de valeur, synthétise le problème résolu, la solution et le différenciateur.
- Pour starter_ideas : EXACTEMENT 5 idées de premiers contenus, ULTRA-spécifiques à CETTE activité — jamais de générique passe-partout type "Les coulisses de mon travail" sans contexte métier. TEST DU NOM ÉCHANGEABLE : si l'idée fonctionnerait telle quelle pour une concurrente du même secteur, elle est trop vague — ancre-la dans un détail spécifique de CETTE activité. Jamais de sujet sur la communication/les réseaux (sauf si c'est son métier), jamais de chiffre inventé. Chaque titre = un sujet concret prêt à être généré tel quel (10-15 mots max), formulé comme la personne le dirait elle-même. Ancre chaque idée dans les piliers de contenu, l'activité, la cible et les combats détectés (exemple céramiste : "Pourquoi je refuse de produire en série, même quand ça se vend"). Varie les objectifs (visibilité, confiance, vente) et privilégie le canal principal détecté. Formats simples de préférence (post, carousel).`;

    const opusModel = getModelForAction("branding_audit");
    // Pas de logUsage ici : le diagnostic = 1 acte métier = 1 crédit "audit", déjà
    // décompté par deep-diagnostic (le parent). En logger un 2e ici facturait l'audit
    // en double — et même 1 crédit parasite pendant l'onboarding (où le parent skippe).

    const runEnrichmentCall = async (extraInstruction?: string) => {
      const prompt = extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt;
      const raw = await callAnthropic({
        model: opusModel,
        system: enrichmentSystemPrompt,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 8192,
        tool: ENRICHMENT_TOOL,
        abortTimeoutMs: 120_000,
      });
      return parseAiJson(raw, "diagnostic-enrichment"); // JSON valide par construction (tool forcé)
    };

    let enrichmentResult: any = await runEnrichmentCall();
    if (isDegenerateEnrichment(enrichmentResult)) {
      console.warn("Enrichment: sortie dégénérée (branding_prefill vide) — réessai");
      enrichmentResult = await runEnrichmentCall(
        "⚠️ ATTENTION : ta précédente réponse était vide. Remplis CHAQUE section du tool avec du contenu concret tiré des données fournies (branding_prefill ne doit PAS être vide)."
      );
    }
    if (isDegenerateEnrichment(enrichmentResult)) {
      console.error("Enrichment: sortie dégénérée après réessai — abandon");
      return new Response(JSON.stringify({ success: false, reason: "degenerate_after_retry" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prefill = enrichmentResult.branding_prefill;

    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;

    // Update diagnostic_results with branding_prefill.
    // savedDiagId peut être null : depuis la parallélisation (13/08), le parent
    // nous tire AVANT d'avoir inséré sa ligne. L'appel Opus ci-dessus dure bien
    // plus longtemps que la phase 1 du parent → au moment d'écrire, la ligne
    // existe (presque) toujours ; on retrouve la plus récente de l'espace.
    // Si elle manque quand même, on passe : branding_prefill sur
    // diagnostic_results n'est qu'un cache d'affichage, la fiche « à valider »
    // (branding_autofill) reste écrite plus bas.
    let diagRowId = savedDiagId || null;
    if (!diagRowId) {
      const { data: latestDiag } = await supabaseAdmin
        .from("diagnostic_results")
        .select("id")
        .eq(filterCol, filterVal)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      diagRowId = latestDiag?.id || null;
    }
    if (diagRowId) {
      const { error: diagErr } = await supabaseAdmin.from("diagnostic_results")
        .update({ branding_prefill: prefill })
        .eq("id", diagRowId);
      trackWrite("diagnostic_results", diagErr);
    }

    // ── Garde-fou anti-écrasement (étape 2) ───────────────────────────────
    // Le diagnostic ne pré-remplit QUE des espaces vierges (premier onboarding
    // ou juste après un reset scopé qui a vidé l'espace). Si l'espace a déjà un
    // branding RÉEL (mission/positioning renseignés), on n'injecte RIEN — sinon
    // un onboarding lancé par erreur sur le mauvais espace actif (cf incident
    // 30/06 : démo « céramiste » écrite sur un espace Nowadays réel) pollue des
    // données existantes. Pas de race avec `onboarding_completed` (posé en fin
    // d'onboarding) car on teste la présence de contenu, pas le flag.
    // NB : au 1er onboarding, `brand_profile.mission` est encore vide (c'est CE
    // diagnostic qui le remplit), donc le cas légitime passe.
    // ⚠️ Le garde-fou ne doit protéger que de l'ERREUR d'espace, pas d'une
    // reprise VOULUE : tant qu'il sautait dans tous les cas, refaire son
    // onboarding ne rafraîchissait plus rien et l'ancienne identité restait
    // gelée pour toujours (même famille que l'anti-doublon de la palette, #652).
    // D'où `overwrite` : l'écran a nommé l'espace et la réponse a été « oui ».
    const { data: brandedCheck } = await supabaseAdmin
      .from("brand_profile")
      .select("mission, positioning")
      .eq(filterCol, filterVal)
      .maybeSingle();
    if (brandedCheck && (brandedCheck.mission || brandedCheck.positioning) && !overwrite) {
      console.warn(`[diagnostic-enrichment] Espace déjà brandé (mission/positioning présents) — enrichissement IGNORÉ pour ne pas écraser/injecter. workspace=${workspaceId} user=${userId}`);
      return new Response(JSON.stringify({ success: true, skipped: "already_branded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Contexte onboarding : fiche « à valider » (branding_autofill) ──────
    // On ne touche PAS aux tables de marque : l'écran BrandingReview affichera
    // la ligne pending_review et l'utilisateur·ice validera/ajustera avant
    // écriture. Ré-audit hors onboarding : comportement inchangé (bloc en bas).
    if (isOnboarding) {
      const voice = enrichmentResult.voice_prefill || {};
      const personaP = enrichmentResult.persona_prefill || {};
      const strat = enrichmentResult.content_strategy_prefill || {};
      const charter = enrichmentResult.charter_prefill || {};

      const analysisResult = {
        // Voyage jusqu'à BrandingReview : sans ce drapeau, valider une section
        // de la fiche n'écrasait pas l'ancienne marque (fillOnlyEmpty) et la
        // reprise d'onboarding restait sans effet visible.
        allow_overwrite: overwrite,
        story: {
          confidence: "medium",
          full_story: prefill.story_draft || null,
        },
        persona: {
          confidence: personaP.confidence || "medium",
          description: prefill.target_description || personaP.description || null,
          goals: personaP.goals || [],
          frustrations: personaP.frustrations || [],
          desires: personaP.desires || [],
          beautiful_world: personaP.beautiful_world || null,
          first_actions: personaP.first_actions || null,
        },
        value_proposition: {
          confidence: "medium",
          key_phrase: prefill.value_prop_sentence || null,
          problem: prefill.value_prop_problem || null,
          solution: prefill.value_prop_solution || null,
          differentiator: prefill.value_prop_difference || null,
          proofs: prefill.value_prop_proof ? [prefill.value_prop_proof] : [],
        },
        tone_style: {
          confidence: "medium",
          tone_keywords: prefill.tone_keywords || [],
          voice_description: voice.voice_description || prefill.tone_style || null,
          tone_register: voice.tone_register || null,
          tone_level: voice.tone_level || null,
          tone_style_chip: voice.tone_style_chip || null,
          tone_humor: voice.tone_humor || null,
          tone_engagement: voice.tone_engagement || null,
          i_do: voice.tone_patterns || voice.signature_expressions || [],
          i_never_do: voice.banned_expressions || [],
          fights: prefill.combats || [],
          key_expressions: voice.key_expressions || null,
          things_to_avoid: voice.things_to_avoid || null,
          target_verbatims: voice.target_verbatims || null,
          channels: voice.channels || [],
        },
        content_strategy: {
          confidence: strat.confidence || "medium",
          pillars: (strat.pillars || [])
            .map((p: any) => (typeof p === "string" ? p : p?.label))
            .filter(Boolean),
          creative_twist: strat.creative_twist || null,
          formats: strat.formats || [],
          rhythm: strat.rhythm || null,
          editorial_line: strat.editorial_line || null,
        },
        offers: {
          confidence: "medium",
          offers: prefill.offers || [],
        },
        charter: {
          confidence: charter.confidence || "low",
          color_primary: charter.color_primary || null,
          color_secondary: charter.color_secondary || null,
          color_accent: charter.color_accent || null,
          color_background: charter.color_background || null,
          font_title: charter.font_title || null,
          font_body: charter.font_body || null,
          mood_keywords: charter.mood_keywords || [],
          visual_style_description: charter.photo_style || null,
        },
        sources_used: [],
        sources_failed: [],
        overall_confidence: "medium",
      };

      // Idempotence : UNE seule fiche à valider — mais on la RAFRAÎCHIT.
      // Avant, une fiche pending_review existante faisait sauter l'écriture
      // entière : le nouveau résultat (souvent meilleur — cf #644 qui a appris
      // à lire les CSS externes) était calculé puis jeté en silence, et l'UI
      // continuait d'afficher l'ancienne analyse. Une fiche `pending_review`
      // n'est par définition PAS encore appliquée à l'espace : la réécrire ne
      // détruit aucun choix de l'utilisatrice.
      const { data: existingPending } = await supabaseAdmin
        .from("branding_autofill")
        .select("id")
        .eq(filterCol, filterVal)
        .eq("autofill_status", "pending_review")
        .maybeSingle();

      const fichePayload = {
        analysis_result: analysisResult,
        sources_used: [],
        sources_failed: [],
        overall_confidence: "medium",
        autofill_status: "pending_review",
        autofill_pending_review: true,
      };

      if (existingPending) {
        const { error: updErr } = await supabaseAdmin
          .from("branding_autofill")
          .update(fichePayload)
          .eq("id", existingPending.id);
        trackWrite("branding_autofill", updErr);
        if (!updErr) console.log(`[diagnostic-enrichment] fiche pending_review RAFRAÎCHIE (id=${existingPending.id})`);
      } else {
        const { error: insErr } = await supabaseAdmin.from("branding_autofill").insert({
          user_id: userId,
          workspace_id: workspaceId || null,
          ...fichePayload,
        });
        trackWrite("branding_autofill", insErr);
      }

      // starter_ideas → saved_ideas (nécessaire au « 1er contenu »)
      const starterIdeasOnb = Array.isArray(enrichmentResult?.starter_ideas) ? enrichmentResult.starter_ideas : [];
      if (starterIdeasOnb.length > 0) {
        let profileUserIdOnb = userId;
        if (workspaceId) {
          const { data: ownerRow } = await supabaseAdmin
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspaceId)
            .eq("role", "owner")
            .maybeSingle();
          if (ownerRow?.user_id) profileUserIdOnb = ownerRow.user_id;
        }
        const { count: diagIdeasCount } = await supabaseAdmin
          .from("saved_ideas")
          .select("id", { count: "exact", head: true })
          .eq(filterCol, filterVal)
          .eq("source_module", "diagnostic");
        if ((diagIdeasCount || 0) === 0) {
          const IDEA_FORMATS = ["post", "carousel", "reel", "story", "linkedin"];
          const IDEA_OBJECTIFS = ["visibilite", "confiance", "vente"];
          const ideaRows = starterIdeasOnb
            .filter((i: any) => typeof i?.titre === "string" && i.titre.trim().length > 0)
            .slice(0, 5)
            .map((i: any) => ({
              user_id: profileUserIdOnb,
              workspace_id: workspaceId || null,
              titre: i.titre.trim().slice(0, 200),
              angle: typeof i.angle === "string" ? i.angle.slice(0, 200) : "",
              format: IDEA_FORMATS.includes(i.format) ? i.format : "post",
              canal: i.canal === "linkedin" ? "linkedin" : "instagram",
              objectif: IDEA_OBJECTIFS.includes(i.objectif) ? i.objectif : "visibilite",
              status: "to_explore",
              source_module: "diagnostic",
              notes: "✨ Proposée à partir de ton diagnostic",
            }));
          if (ideaRows.length > 0) {
            const { error: ideasError } = await supabaseAdmin.from("saved_ideas").insert(ideaRows);
            trackWrite("saved_ideas", ideasError);
          }
        }
      }

      if (failedWrites.length === 0) {
        console.log("Enrichment phase 2 (onboarding) → pending_review created");
      } else {
        console.error(`Enrichment phase 2 (onboarding) INCOMPLET — sections NON enregistrées: ${failedWrites.join(", ")}`);
      }
      return new Response(JSON.stringify({
        success: failedWrites.length === 0,
        mode: "onboarding_pending_review",
        ...(failedWrites.length > 0 ? { failed_sections: failedWrites } : {}),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // brand_profile upsert — enriched with value proposition, target, tone details
    const { data: existingProfile } = await supabaseAdmin
      .from("brand_profile")
      .select("id, positioning, mission, tone_keywords, tone_style, combats, values, content_pillars, combat_cause, combat_fights, combat_alternative, combat_refusals, value_prop_sentence, value_prop_problem, value_prop_solution, value_prop_difference, value_prop_proof, target_description, target_problem, target_beliefs, voice_description, tone_register, tone_level, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels")
      .eq(filterCol, filterVal)
      .maybeSingle();

    const combatData = prefill.combat_structured || enrichmentResult?.combat_structured;
    const voicePrefill = prefill.voice_prefill || enrichmentResult?.voice_prefill;

    const buildProfileFields = (target: Record<string, unknown>, existing: any) => {
      // En mode `overwrite`, « ne remplir que les trous » ne suffit pas : c'est
      // exactement ce qui gelait champ par champ (positionnement, mission, ton,
      // proposition de valeur…) le résultat du tout premier passage. Confirmation
      // donnée = la nouvelle valeur gagne, quand elle existe.
      const setIfEmpty = (field: string, value: unknown) => {
        if (value && (overwrite || !existing || !existing[field])) target[field] = value;
      };
      const setArrayIfEmpty = (field: string, value: unknown[]) => {
        if (value?.length > 0 && (overwrite || !existing || !existing[field] || (Array.isArray(existing[field]) && existing[field].length === 0))) {
          target[field] = value;
        }
      };

      setIfEmpty("positioning", prefill.positioning);
      setIfEmpty("mission", prefill.mission);
      setIfEmpty("target_description", prefill.target_description);
      setIfEmpty("target_problem", prefill.target_problem);
      setIfEmpty("target_beliefs", prefill.target_beliefs);
      setIfEmpty("tone_style", prefill.tone_style);
      setIfEmpty("value_prop_sentence", prefill.value_prop_sentence);
      setIfEmpty("value_prop_problem", prefill.value_prop_problem);
      setIfEmpty("value_prop_solution", prefill.value_prop_solution);
      setIfEmpty("value_prop_difference", prefill.value_prop_difference);
      setIfEmpty("value_prop_proof", prefill.value_prop_proof);
      setArrayIfEmpty("tone_keywords", prefill.tone_keywords);
      setArrayIfEmpty("values", prefill.values);
      setArrayIfEmpty("content_pillars", prefill.content_pillars);

      if (prefill.combats?.length > 0 && (overwrite || !existing || !existing.combats)) {
        target.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
      }

      if (combatData) {
        setIfEmpty("combat_cause", combatData.combat_cause);
        setIfEmpty("combat_fights", combatData.combat_fights);
        setIfEmpty("combat_alternative", combatData.combat_alternative);
        setIfEmpty("combat_refusals", combatData.combat_refusals);
      }

      // Voice/tone enriched fields from voice_prefill → brand_profile
      if (voicePrefill) {
        setIfEmpty("voice_description", voicePrefill.voice_description);
        setIfEmpty("tone_register", voicePrefill.tone_register);
        setIfEmpty("tone_level", voicePrefill.tone_level);
        setIfEmpty("tone_humor", voicePrefill.tone_humor);
        setIfEmpty("tone_engagement", voicePrefill.tone_engagement);
        setIfEmpty("key_expressions", voicePrefill.key_expressions);
        setIfEmpty("things_to_avoid", voicePrefill.things_to_avoid);
        setIfEmpty("target_verbatims", voicePrefill.target_verbatims);
        if (voicePrefill.channels?.length > 0 && (!existing || !existing.channels || (Array.isArray(existing.channels) && existing.channels.length === 0))) {
          target.channels = voicePrefill.channels;
        }
      }
    };

    if (existingProfile) {
      const updates: Record<string, unknown> = {};
      buildProfileFields(updates, existingProfile);
      if (Object.keys(updates).length > 0) {
        const { error: profErr } = await supabaseAdmin.from("brand_profile").update(updates).eq("id", existingProfile.id);
        trackWrite("brand_profile", profErr);
      }
    } else {
      const newProfile: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId };
      buildProfileFields(newProfile, null);
      const { error: profErr } = await supabaseAdmin.from("brand_profile").insert(newProfile);
      trackWrite("brand_profile", profErr);
    }

    // persona — les 5 étapes du parcours persona (frustrations, transformation,
    // objections, monde idéal, premières actions), mêmes conventions de mapping
    // que BrandingReview (beautiful_world → step_4_beautiful, first_actions → step_5_actions)
    const personaPrefill = enrichmentResult?.persona_prefill;
    const personaDesc = prefill.target_description || personaPrefill?.description;
    if (personaDesc || personaPrefill) {
      // transformation dédiée si fournie, sinon l'ancien fallback beautiful_world
      const personaFields: Record<string, unknown> = {
        description: personaDesc,
        step_1_frustrations: personaPrefill?.frustrations?.length ? personaPrefill.frustrations.join("\n") : null,
        step_2_transformation: personaPrefill?.transformation || personaPrefill?.beautiful_world || null,
        step_3a_objections: personaPrefill?.objections?.length ? personaPrefill.objections.join("\n") : null,
        step_4_beautiful: personaPrefill?.beautiful_world || null,
        step_5_actions: personaPrefill?.first_actions || null,
      };
      const { data: existingPersona } = await supabaseAdmin
        .from("persona").select("id, description, step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions")
        .eq(filterCol, filterVal)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (existingPersona) {
        const pUpdates: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(personaFields)) {
          if (value && !(existingPersona as Record<string, unknown>)[field]) pUpdates[field] = value;
        }
        if (Object.keys(pUpdates).length > 0) {
          const { error: persErr } = await supabaseAdmin.from("persona").update(pUpdates).eq("id", existingPersona.id);
          trackWrite("persona", persErr);
        }
      } else {
        const newPersona: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId, is_primary: true };
        for (const [field, value] of Object.entries(personaFields)) {
          if (value) newPersona[field] = value;
        }
        const { error: persErr } = await supabaseAdmin.from("persona").insert(newPersona);
        trackWrite("persona", persErr);
      }
    }

    // offers
    if (prefill.offers?.length > 0) {
      const { count } = await supabaseAdmin.from("offers").select("id", { count: "exact", head: true }).eq(filterCol, filterVal);
      if ((count || 0) === 0) {
        const offersToInsert = prefill.offers.filter((o: any) => o.name || o.title).slice(0, 5)
          .map((o: any, i: number) => ({ user_id: userId, workspace_id: workspaceId, name: o.name || o.title, promise: o.description || null, price_text: o.price || null, offer_type: "paid", sort_order: i }));
        if (offersToInsert.length > 0) {
          const { error: offersErr } = await supabaseAdmin.from("offers").insert(offersToInsert);
          trackWrite("offers", offersErr);
        }
      }
    }

    // storytelling
    if (prefill.story_draft) {
      const { data: existingStory } = await supabaseAdmin.from("storytelling").select("id").eq(filterCol, filterVal).limit(1).maybeSingle();
      if (!existingStory) {
        const { error: storyErr } = await supabaseAdmin.from("storytelling").insert({ user_id: userId, workspace_id: workspaceId, imported_text: prefill.story_draft, source: "diagnostic_prefill", is_primary: true });
        trackWrite("storytelling", storyErr);
      }
    }

    // Resolve profileUserId for voice_profile and brand_charter
    let profileUserId = userId;
    if (workspaceId) {
      const { data: ownerRow } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
    }

    // voice_profile
    if (voicePrefill && (voicePrefill.voice_summary || voicePrefill.tone_patterns?.length || voicePrefill.signature_expressions?.length)) {
      const { data: existingVoice } = await supabaseAdmin
        .from("voice_profile")
        .select("id, voice_summary, tone_patterns, signature_expressions, banned_expressions")
        .eq("user_id", profileUserId)
        .maybeSingle();

      if (existingVoice) {
        const vUpdates: Record<string, unknown> = {};
        if (!existingVoice.voice_summary && voicePrefill.voice_summary) vUpdates.voice_summary = voicePrefill.voice_summary;
        if ((!existingVoice.tone_patterns || (Array.isArray(existingVoice.tone_patterns) && existingVoice.tone_patterns.length === 0)) && voicePrefill.tone_patterns?.length) vUpdates.tone_patterns = voicePrefill.tone_patterns;
        if ((!existingVoice.signature_expressions || (Array.isArray(existingVoice.signature_expressions) && existingVoice.signature_expressions.length === 0)) && voicePrefill.signature_expressions?.length) vUpdates.signature_expressions = voicePrefill.signature_expressions;
        if ((!existingVoice.banned_expressions || (Array.isArray(existingVoice.banned_expressions) && existingVoice.banned_expressions.length === 0)) && voicePrefill.banned_expressions?.length) vUpdates.banned_expressions = voicePrefill.banned_expressions;
        if (Object.keys(vUpdates).length > 0) {
          const { error: voiceErr } = await supabaseAdmin.from("voice_profile").update(vUpdates).eq("id", existingVoice.id);
          trackWrite("voice_profile", voiceErr);
        }
      } else {
        const newVoice: Record<string, unknown> = { user_id: profileUserId, workspace_id: workspaceId };
        if (voicePrefill.voice_summary) newVoice.voice_summary = voicePrefill.voice_summary;
        if (voicePrefill.tone_patterns?.length) newVoice.tone_patterns = voicePrefill.tone_patterns;
        if (voicePrefill.signature_expressions?.length) newVoice.signature_expressions = voicePrefill.signature_expressions;
        if (voicePrefill.banned_expressions?.length) newVoice.banned_expressions = voicePrefill.banned_expressions;
        const { error: voiceErr } = await supabaseAdmin.from("voice_profile").insert(newVoice);
        trackWrite("voice_profile", voiceErr);
      }
    }

    // brand_charter
    const charterPrefill = prefill.charter_prefill || enrichmentResult?.charter_prefill;
    if (charterPrefill && (charterPrefill.color_primary || charterPrefill.font_title || charterPrefill.mood_keywords?.length)) {
      const { data: existingCharter } = await supabaseAdmin
        .from("brand_charter")
        .select("id, color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, photo_style")
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (existingCharter) {
        const cUpdates: Record<string, unknown> = {};
        if (!existingCharter.color_primary && charterPrefill.color_primary) cUpdates.color_primary = charterPrefill.color_primary;
        if (!existingCharter.color_secondary && charterPrefill.color_secondary) cUpdates.color_secondary = charterPrefill.color_secondary;
        if (!existingCharter.color_accent && charterPrefill.color_accent) cUpdates.color_accent = charterPrefill.color_accent;
        if (!existingCharter.color_background && charterPrefill.color_background) cUpdates.color_background = charterPrefill.color_background;
        if (!existingCharter.color_text && charterPrefill.color_text) cUpdates.color_text = charterPrefill.color_text;
        if (!existingCharter.font_title && charterPrefill.font_title) cUpdates.font_title = charterPrefill.font_title;
        if (!existingCharter.font_body && charterPrefill.font_body) cUpdates.font_body = charterPrefill.font_body;
        if ((!existingCharter.mood_keywords || (Array.isArray(existingCharter.mood_keywords) && existingCharter.mood_keywords.length === 0)) && charterPrefill.mood_keywords?.length) cUpdates.mood_keywords = charterPrefill.mood_keywords;
        if (!existingCharter.photo_style && charterPrefill.photo_style) cUpdates.photo_style = charterPrefill.photo_style;
        if (Object.keys(cUpdates).length > 0) {
          const { error: charterErr } = await supabaseAdmin.from("brand_charter").update(cUpdates).eq("id", existingCharter.id);
          trackWrite("brand_charter", charterErr);
        }
      } else {
        const newCharter: Record<string, unknown> = { user_id: profileUserId, workspace_id: workspaceId };
        if (charterPrefill.color_primary) newCharter.color_primary = charterPrefill.color_primary;
        if (charterPrefill.color_secondary) newCharter.color_secondary = charterPrefill.color_secondary;
        if (charterPrefill.color_accent) newCharter.color_accent = charterPrefill.color_accent;
        if (charterPrefill.color_background) newCharter.color_background = charterPrefill.color_background;
        if (charterPrefill.color_text) newCharter.color_text = charterPrefill.color_text;
        if (charterPrefill.font_title) newCharter.font_title = charterPrefill.font_title;
        if (charterPrefill.font_body) newCharter.font_body = charterPrefill.font_body;
        if (charterPrefill.mood_keywords?.length) newCharter.mood_keywords = charterPrefill.mood_keywords;
        if (charterPrefill.photo_style) newCharter.photo_style = charterPrefill.photo_style;
        const { error: charterErr } = await supabaseAdmin.from("brand_charter").insert(newCharter);
        trackWrite("brand_charter", charterErr);
      }
    }

    // brand_proposition — les 4 jalons de la complétion (quoi, comment/valeurs,
    // pour qui, version finale), mêmes conventions que BrandingReview
    // (solution → step_2a_process) ; update-si-vide au lieu d'insert-only
    const propFields: Record<string, unknown> = {
      step_1_what: prefill.value_prop_sentence || null,
      step_2a_process: prefill.value_prop_solution || null,
      step_2b_values: prefill.values?.length ? prefill.values.join("\n") : null,
      step_3_for_whom: prefill.target_description || prefill.value_prop_problem || null,
      version_final: prefill.value_prop_sentence || null,
    };
    if (Object.values(propFields).some(Boolean)) {
      const { data: existingProp } = await supabaseAdmin
        .from("brand_proposition")
        .select("id, step_1_what, step_2a_process, step_2b_values, step_3_for_whom, version_final")
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (existingProp) {
        const propUpdates: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(propFields)) {
          if (value && !(existingProp as Record<string, unknown>)[field]) propUpdates[field] = value;
        }
        if (Object.keys(propUpdates).length > 0) {
          const { error: propErr } = await supabaseAdmin.from("brand_proposition").update(propUpdates).eq("id", existingProp.id);
          trackWrite("brand_proposition", propErr);
        }
      } else {
        const newProp: Record<string, unknown> = { user_id: userId, workspace_id: workspaceId };
        for (const [field, value] of Object.entries(propFields)) {
          if (value) newProp[field] = value;
        }
        const { error: propErr } = await supabaseAdmin.from("brand_proposition").insert(newProp);
        trackWrite("brand_proposition", propErr);
      }
    }

    // content_strategy → brand_strategy pillars + facettes cachées
    const contentPrefill = enrichmentResult?.content_strategy_prefill;
    if (contentPrefill?.pillars?.length > 0 || contentPrefill?.hidden_facets?.length > 0) {
      const { data: existingStrategy } = await supabaseAdmin
        .from("brand_strategy")
        .select("id, pillar_major, pillar_minor_1, pillar_minor_2, creative_concept, step_1_hidden_facets")
        .eq(filterCol, filterVal)
        .maybeSingle();

      const pillars = contentPrefill.pillars || [];
      const hiddenFacets = contentPrefill.hidden_facets?.length ? contentPrefill.hidden_facets.join("\n") : null;
      if (existingStrategy) {
        // Mettre à jour : écraser le pillar_major générique de l'onboarding
        // et remplir les piliers mineurs, le concept créatif et les facettes s'ils sont vides
        const sUpdates: Record<string, unknown> = {};
        if (pillars[0]?.label) sUpdates.pillar_major = pillars[0].label;
        if (!existingStrategy.pillar_minor_1 && pillars[1]?.label) sUpdates.pillar_minor_1 = pillars[1].label;
        if (!existingStrategy.pillar_minor_2 && pillars[2]?.label) sUpdates.pillar_minor_2 = pillars[2].label;
        if (!existingStrategy.creative_concept && contentPrefill.creative_twist) sUpdates.creative_concept = contentPrefill.creative_twist;
        if (!existingStrategy.step_1_hidden_facets && hiddenFacets) sUpdates.step_1_hidden_facets = hiddenFacets;
        if (Object.keys(sUpdates).length > 0) {
          const { error: stratErr } = await supabaseAdmin.from("brand_strategy").update(sUpdates).eq("id", existingStrategy.id);
          trackWrite("brand_strategy", stratErr);
        }
      } else {
        const { error: stratErr } = await supabaseAdmin.from("brand_strategy").insert({
          user_id: userId,
          workspace_id: workspaceId,
          pillar_major: pillars[0]?.label || null,
          pillar_minor_1: pillars[1]?.label || null,
          pillar_minor_2: pillars[2]?.label || null,
          creative_concept: contentPrefill.creative_twist || null,
          step_1_hidden_facets: hiddenFacets,
        });
        trackWrite("brand_strategy", stratErr);
      }
    }

    // starter_ideas → saved_ideas (L4) : 5 idées personnalisées prêtes à piocher
    // (chips de /creer, CTA welcome, boîte à idées du calendrier). On n'insère
    // que sur un espace encore sans idées de diagnostic (le garde already_branded
    // a déjà filtré les espaces réels ; ceci évite en plus les doublons si le
    // diagnostic est relancé sur un espace vierge).
    const starterIdeas = Array.isArray(enrichmentResult?.starter_ideas) ? enrichmentResult.starter_ideas : [];
    if (starterIdeas.length > 0) {
      const { count: diagIdeasCount } = await supabaseAdmin
        .from("saved_ideas")
        .select("id", { count: "exact", head: true })
        .eq(filterCol, filterVal)
        .eq("source_module", "diagnostic");
      if ((diagIdeasCount || 0) === 0) {
        const IDEA_FORMATS = ["post", "carousel", "reel", "story", "linkedin"];
        const IDEA_OBJECTIFS = ["visibilite", "confiance", "vente"];
        const ideaRows = starterIdeas
          .filter((i: any) => typeof i?.titre === "string" && i.titre.trim().length > 0)
          .slice(0, 5)
          .map((i: any) => ({
            user_id: profileUserId,
            workspace_id: workspaceId || null,
            titre: i.titre.trim().slice(0, 200),
            angle: typeof i.angle === "string" ? i.angle.slice(0, 200) : "",
            format: IDEA_FORMATS.includes(i.format) ? i.format : "post",
            canal: i.canal === "linkedin" ? "linkedin" : "instagram",
            objectif: IDEA_OBJECTIFS.includes(i.objectif) ? i.objectif : "visibilite",
            status: "to_explore",
            source_module: "diagnostic",
            notes: "✨ Proposée à partir de ton diagnostic",
          }));
        if (ideaRows.length > 0) {
          const { error: ideasError } = await supabaseAdmin.from("saved_ideas").insert(ideaRows);
          trackWrite("saved_ideas", ideasError);
        }
      }
    }

    if (failedWrites.length === 0) {
      console.log("Enrichment phase 2 completed successfully");
    } else {
      console.error(`Enrichment phase 2 INCOMPLET — sections NON enregistrées: ${failedWrites.join(", ")}`);
    }
    return new Response(JSON.stringify({
      success: failedWrites.length === 0,
      ...(failedWrites.length > 0 ? { failed_sections: failedWrites } : {}),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Enrichment phase 2 failed:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

serve(handleEnrichment);

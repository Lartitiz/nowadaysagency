/**
 * Centralized user context builder for all AI edge functions.
 * Fetches ALL user data in parallel and formats it for AI prompts.
 * 
 * SINGLE SOURCE OF TRUTH — every generator uses this instead of
 * receiving branding_context from the client.
 */

export interface ContextOptions {
  includeStory?: boolean;
  includePersona?: boolean;
  includeOffers?: boolean;
  includeOffersDetails?: boolean; // testimonials, objections, benefits
  includeProfile?: boolean;
  includeEditorial?: boolean;
  includeAudit?: boolean;
  includeVoice?: boolean;
  includeCharter?: boolean;
  includeMirror?: boolean;
}

// Default: include everything except detailed offer data and audit
const DEFAULT_OPTIONS: ContextOptions = {
  includeStory: true,
  includePersona: true,
  includeOffers: true,
  includeOffersDetails: false,
  includeProfile: true,
  includeEditorial: true,
  includeAudit: false,
  includeVoice: true,
  includeCharter: true,
  includeMirror: false,
};

/**
 * Fetches all user context data from database in parallel.
 * If workspaceId is provided, queries filter by workspace_id instead of user_id.
 */
export async function getUserContext(supabase: any, userId: string, workspaceId?: string, channel?: string) {
  const col = workspaceId ? "workspace_id" : "user_id";
  const val = workspaceId || userId;

  // Resolve the owner's user_id for tables without workspace_id (profiles, voice_profile)
  let profileUserId = userId;
  if (workspaceId) {
    const { data: ownerRow } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerRow?.user_id) {
      profileUserId = ownerRow.user_id;
    }
  }

  // Build persona query: channel-specific → primary → any
  const personaSelect = "step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches, portrait_prenom, portrait, label, is_primary, channels";
  const fetchPersona = async () => {
    // 1. Try channel-specific persona
    if (channel) {
      const { data: channelPersona } = await supabase
        .from("persona")
        .select(personaSelect)
        .eq(col, val)
        .contains("channels", [channel])
        .limit(1)
        .maybeSingle();
      if (channelPersona) return channelPersona;
    }
    // 2. Fallback to primary persona
    const { data: primaryPersona } = await supabase
      .from("persona")
      .select(personaSelect)
      .eq(col, val)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();
    if (primaryPersona) return primaryPersona;
    // 3. Fallback to any persona
    const { data: anyPersona } = await supabase
      .from("persona")
      .select(personaSelect)
      .eq(col, val)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return anyPersona;
  };

  const [
    stRes, persona, toneRes, propRes, stratRes, editoRes,
    profileRes, offersRes, auditRes, voiceRes, charterRes, mirrorRes,
  ] = await Promise.all([
    supabase.from("storytelling").select("step_7_polished").eq(col, val).eq("is_primary", true).maybeSingle(),
    fetchPersona(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels, mission, offer").eq(col, val).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_complete, version_bio, version_one_liner").eq(col, val).maybeSingle(),
    supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept, facet_1, facet_2, facet_3").eq(col, val).maybeSingle(),
    supabase.from("instagram_editorial_line").select("main_objective, objective_details, posts_frequency, stories_frequency, time_available, pillars, preferred_formats, do_more, stop_doing, free_notes").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, mission, offre, croyances_limitantes, verbatims, expressions_cles, ce_quon_evite, style_communication, validated_bio, instagram_display_name, instagram_username, instagram_bio, instagram_followers, instagram_frequency, differentiation_text, bio_cta_type, bio_cta_text").eq("user_id", profileUserId).maybeSingle(),
    supabase.from("offers").select("*").eq(col, val).order("created_at", { ascending: true }),
    supabase.from("instagram_audit").select("score_global, score_bio, score_feed, score_edito, score_stories, score_epingles, resume, combo_gagnant").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("voice_profile").select("voice_summary, signature_expressions, banned_expressions, tone_patterns, structure_patterns, formatting_habits, sample_texts").eq("user_id", profileUserId).maybeSingle(),
    supabase.from("brand_charter").select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, font_accent, photo_style, mood_keywords, visual_donts, icon_style, border_radius, ai_generated_brief, moodboard_description").eq(col, val).maybeSingle(),
    supabase.from("branding_mirror_results").select("coherence_score, summary, alignments, gaps, quick_wins").eq(col, val).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    storytelling: stRes.data,
    persona,
    tone: toneRes.data,
    proposition: propRes.data,
    strategy: stratRes.data,
    editorial: editoRes.data,
    profile: profileRes.data,
    offers: offersRes.data || [],
    audit: auditRes.data,
    voice: voiceRes.data,
    charter: charterRes.data,
    mirror: mirrorRes.data,
  };
}

/**
 * Formats user context into a text block for AI prompts.
 * Uses options to control which sections are included.
 */
export function formatContextForAI(ctx: any, opts: ContextOptions = {}): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const sections: string[] = [];

  // === VOIX PERSONNELLE (PRIORITÉ ABSOLUE — en premier) ===
  if (options.includeVoice && ctx.voice) {
    const v = ctx.voice;
    const voiceLines: string[] = [];

    if (v.voice_summary) voiceLines.push(`- Comment elle écrit : ${v.voice_summary}`);

    if (v.signature_expressions?.length) {
      const exprs = Array.isArray(v.signature_expressions) ? v.signature_expressions : [];
      if (exprs.length) voiceLines.push(`- Expressions signature (À RÉUTILISER) : ${exprs.join(", ")}`);
    }

    if (v.banned_expressions?.length) {
      const banned = Array.isArray(v.banned_expressions) ? v.banned_expressions : [];
      if (banned.length) voiceLines.push(`- Expressions INTERDITES (ne JAMAIS utiliser) : ${banned.join(", ")}`);
    }

    if (v.tone_patterns?.length) {
      const patterns = Array.isArray(v.tone_patterns) ? v.tone_patterns : [];
      if (patterns.length) voiceLines.push(`- Patterns de ton : ${patterns.join(", ")}`);
    }

    if (v.structure_patterns?.length) {
      const structs = Array.isArray(v.structure_patterns) ? v.structure_patterns : [];
      if (structs.length) voiceLines.push(`- Patterns de structure : ${structs.join(", ")}`);
    }

    if (v.formatting_habits?.length) {
      const habits = Array.isArray(v.formatting_habits) ? v.formatting_habits : [];
      if (habits.length) voiceLines.push(`- Habitudes de mise en forme : ${habits.join(", ")}`);
    }

    if (v.sample_texts?.length) {
      const samples = Array.isArray(v.sample_texts) ? v.sample_texts : [];
      const topSamples = samples.slice(0, 2);
      if (topSamples.length) {
        voiceLines.push(`- Exemples de textes validés par l'utilisatrice (INSPIRE-TOI de ce style) :`);
        topSamples.forEach((s: string, i: number) => {
          voiceLines.push(`  Exemple ${i + 1} : "${s.slice(0, 500)}"`);
        });
      }
    }

    if (voiceLines.length) sections.push(`VOIX PERSONNELLE (PRIORITÉ ABSOLUE — tout le contenu doit reproduire ce style) :\n${voiceLines.join("\n")}`);
  }

  // === PROFIL UTILISATRICE ===
  if (options.includeProfile && ctx.profile) {
    const p = ctx.profile;
    const lines: string[] = [];
    if (p.prenom) lines.push(`- Prénom : ${p.prenom}`);
    if (p.activite) lines.push(`- Activité : ${p.activite}`);
    if (p.type_activite) lines.push(`- Type : ${p.type_activite}`);
    if (p.cible) lines.push(`- Cible : ${p.cible}`);
    if (p.probleme_principal) lines.push(`- Problème qu'elle résout : ${p.probleme_principal}`);
    if (p.mission) lines.push(`- Mission : ${p.mission}`);
    if (p.offre) lines.push(`- Offre principale : ${p.offre}`);
    if (p.piliers?.length) lines.push(`- Thématiques : ${p.piliers.join(", ")}`);
    if (p.tons?.length) lines.push(`- Ton souhaité : ${p.tons.join(", ")}`);
    if (p.croyances_limitantes) lines.push(`- Croyances limitantes de sa cible : ${p.croyances_limitantes}`);
    if (p.verbatims) lines.push(`- Verbatims (les mots de ses clientes) : ${p.verbatims}`);
    if (p.expressions_cles) lines.push(`- Expressions clés : ${p.expressions_cles}`);
    if (p.ce_quon_evite) lines.push(`- Ce qu'on évite : ${p.ce_quon_evite}`);
    if (p.style_communication?.length) lines.push(`- Style de communication : ${p.style_communication.join(", ")}`);
    if (p.instagram_username) lines.push(`- Instagram : @${p.instagram_username}`);
    if (p.instagram_followers) lines.push(`- Abonné·es : ${p.instagram_followers}`);
    if (p.instagram_frequency) lines.push(`- Fréquence : ${p.instagram_frequency}`);
    if (p.instagram_bio) lines.push(`- Bio actuelle : ${p.instagram_bio}`);
    if (p.differentiation_text) lines.push(`- Différenciation : ${p.differentiation_text}`);
    if (lines.length) sections.push(`PROFIL DE L'UTILISATRICE :\n${lines.join("\n")}`);
  }

  // === STORYTELLING ===
  if (options.includeStory && ctx.storytelling?.step_7_polished) {
    sections.push(`HISTOIRE :\n${ctx.storytelling.step_7_polished}`);
  }

  // === PERSONA ===
  if (options.includePersona && ctx.persona) {
    const p = ctx.persona;
    const lines: string[] = [];
    if (p.label) lines.push(`- Persona : ${p.label}`);
    if (p.portrait_prenom) lines.push(`- Prénom du persona : ${p.portrait_prenom}`);
    if (p.channels?.length) lines.push(`- Canaux cibles : ${p.channels.join(", ")}`);
    if (p.step_1_frustrations) lines.push(`- Frustrations : ${p.step_1_frustrations}`);
    if (p.step_2_transformation) lines.push(`- Transformation rêvée : ${p.step_2_transformation}`);
    if (p.step_3a_objections) lines.push(`- Objections : ${p.step_3a_objections}`);
    if (p.step_3b_cliches) lines.push(`- Clichés : ${p.step_3b_cliches}`);
    if (lines.length) sections.push(`CLIENTE IDÉALE :\n${lines.join("\n")}`);
  }

  // === TON & STYLE ===
  if (ctx.tone) {
    const t = ctx.tone;
    const toneLines: string[] = [];
    if (t.voice_description) toneLines.push(`- Comment elle parle : ${t.voice_description}`);
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) toneLines.push(`- Registre : ${reg}`);
    if (t.tone_humor) toneLines.push(`- Humour : ${t.tone_humor}`);
    if (t.tone_engagement) toneLines.push(`- Engagement : ${t.tone_engagement}`);
    if (t.key_expressions) toneLines.push(`- Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) toneLines.push(`- Ce qu'on évite : ${t.things_to_avoid}`);
    if (t.target_verbatims) toneLines.push(`- Verbatims de la cible : ${t.target_verbatims}`);
    if (t.channels?.length) toneLines.push(`- Canaux : ${t.channels.join(", ")}`);
    if (toneLines.length) sections.push(`TON & STYLE :\n${toneLines.join("\n")}`);

    // Combats
    const combatLines: string[] = [];
    if (t.combat_cause) combatLines.push(`- Sa cause : ${t.combat_cause}`);
    if (t.combat_fights) combatLines.push(`- Ses combats : ${t.combat_fights}`);
    if (t.combat_alternative) combatLines.push(`- Ce qu'elle propose à la place : ${t.combat_alternative}`);
    if (t.combat_refusals) combatLines.push(`- Ce qu'elle refuse : ${t.combat_refusals}`);
    if (combatLines.length) sections.push(`COMBATS & LIMITES :\n${combatLines.join("\n")}`);

    if (t.mission || t.offer) {
      const idLines: string[] = [];
      if (t.mission) idLines.push(`- Mission : ${t.mission}`);
      if (t.offer) idLines.push(`- Offre : ${t.offer}`);
      sections.push(`IDENTITÉ :\n${idLines.join("\n")}`);
    }
  }

  // === CHARTE GRAPHIQUE ===
  if (options.includeCharter && ctx.charter) {
    const ch = ctx.charter;
    const chLines: string[] = [];
    if (ch.color_primary) chLines.push(`- Couleur principale : ${ch.color_primary}`);
    if (ch.color_secondary) chLines.push(`- Couleur secondaire : ${ch.color_secondary}`);
    if (ch.color_accent) chLines.push(`- Couleur accent : ${ch.color_accent}`);
    if (ch.color_background) chLines.push(`- Fond : ${ch.color_background}`);
    if (ch.color_text) chLines.push(`- Texte : ${ch.color_text}`);
    if (ch.font_title) chLines.push(`- Police titres : ${ch.font_title}`);
    if (ch.font_body) chLines.push(`- Police corps : ${ch.font_body}`);
    if (ch.mood_keywords?.length) {
      const keywords = Array.isArray(ch.mood_keywords) ? ch.mood_keywords : [];
      if (keywords.length) chLines.push(`- Style visuel : ${keywords.join(", ")}`);
    }
    if (ch.photo_style) chLines.push(`- Style photo : ${ch.photo_style}`);
    if (ch.visual_donts) chLines.push(`- Interdits visuels : ${ch.visual_donts}`);
    if (ch.ai_generated_brief) chLines.push(`- Brief IA : ${ch.ai_generated_brief}`);
    if (ch.moodboard_description) chLines.push(`- Ambiance moodboard : ${ch.moodboard_description}`);
    if (chLines.length) sections.push(`CHARTE GRAPHIQUE :\n${chLines.join("\n")}`);
  }

  // === PROPOSITION DE VALEUR ===
  if (ctx.proposition) {
    const propValue = ctx.proposition.version_final || ctx.proposition.version_complete || ctx.proposition.version_bio;
    if (propValue) sections.push(`PROPOSITION DE VALEUR :\n${propValue}`);
    if (ctx.proposition.version_one_liner) sections.push(`ONE-LINER : ${ctx.proposition.version_one_liner}`);
  }

  // === STRATÉGIE ===
  if (ctx.strategy) {
    const s = ctx.strategy;
    const sLines: string[] = [];
    if (s.pillar_major) sLines.push(`- Pilier majeur : ${s.pillar_major}`);
    const minors = [s.pillar_minor_1, s.pillar_minor_2, s.pillar_minor_3].filter(Boolean);
    if (minors.length) sLines.push(`- Piliers mineurs : ${minors.join(", ")}`);
    if (s.creative_concept) sLines.push(`- Concept créatif : ${s.creative_concept}`);
    const facets = [s.facet_1, s.facet_2, s.facet_3].filter(Boolean);
    if (facets.length) sLines.push(`- Facettes : ${facets.join(", ")}`);
    if (sLines.length) sections.push(`STRATÉGIE DE CONTENU :\n${sLines.join("\n")}`);
  }

  // === LIGNE ÉDITORIALE ===
  if (options.includeEditorial && ctx.editorial) {
    const e = ctx.editorial;
    const eLines: string[] = [];
    if (e.main_objective) eLines.push(`- Objectif principal : ${e.main_objective}`);
    if (e.objective_details) eLines.push(`- Détails objectif : ${e.objective_details}`);
    if (e.posts_frequency) eLines.push(`- Rythme : ${e.posts_frequency} posts/semaine${e.stories_frequency ? ` + stories ${e.stories_frequency}` : ""}`);
    const pillars = e.pillars as any[];
    if (pillars?.length) {
      eLines.push(`- Piliers :`);
      pillars.forEach((p: any) => {
        eLines.push(`  • ${p.name} : ${p.percentage}%${p.description ? ` — ${p.description}` : ""}`);
      });
    }
    const formats = e.preferred_formats as string[];
    if (formats?.length) eLines.push(`- Formats préférés : ${formats.join(", ")}`);
    if (e.do_more) eLines.push(`- Faire plus de : ${e.do_more}`);
    if (e.stop_doing) eLines.push(`- Arrêter de : ${e.stop_doing}`);
    if (e.free_notes) eLines.push(`- Notes : ${e.free_notes}`);
    if (eLines.length) sections.push(`LIGNE ÉDITORIALE INSTAGRAM :\n${eLines.join("\n")}`);
  }

  // === OFFRES ===
  if (options.includeOffers && ctx.offers?.length > 0) {
    const offerLines: string[] = [];
    for (const offer of ctx.offers) {
      offerLines.push(`\n· ${offer.name} (${offer.offer_type === "paid" ? "💎 Payante" : offer.offer_type === "free" ? "🎁 Gratuite" : "🎤 Service"}) — ${offer.price_text || "Gratuit"}`);
      if (offer.promise) offerLines.push(`  Promesse : ${offer.promise}`);
      if (offer.sales_line) offerLines.push(`  Phrase de vente : ${offer.sales_line}`);
      if (offer.target_ideal) offerLines.push(`  Pour qui : ${offer.target_ideal}`);
      if (offer.problem_deep || offer.problem_surface) offerLines.push(`  Problème résolu : ${offer.problem_deep || offer.problem_surface}`);
      if (offer.url_sales_page) offerLines.push(`  Lien : ${offer.url_sales_page}`);
      if (offer.url_booking) offerLines.push(`  RDV : ${offer.url_booking}`);

      // Detailed offer data (testimonials, objections, benefits)
      if (options.includeOffersDetails) {
        if (offer.testimonials?.length > 0) {
          offerLines.push(`  Témoignages :`);
          for (const t of offer.testimonials) {
            offerLines.push(`    — ${t.name || "?"} (${t.sector || "?"}) : "${t.quote || ""}" → ${t.result || ""}`);
          }
        }
        if (offer.objections?.length > 0) {
          offerLines.push(`  Objections & réponses :`);
          for (const o of offer.objections) {
            offerLines.push(`    — "${o.objection}" → ${o.response}`);
          }
        }
        if (offer.features_to_benefits?.length > 0) {
          offerLines.push(`  Bénéfices :`);
          for (const fb of offer.features_to_benefits) {
            offerLines.push(`    — ${fb.feature} → ${fb.benefit}`);
          }
        }
        if (offer.emotional_before) offerLines.push(`  Avant : ${offer.emotional_before}`);
        if (offer.emotional_after) offerLines.push(`  Après : ${offer.emotional_after}`);
        if (offer.feelings_after?.length) offerLines.push(`  Sentiments après : ${offer.feelings_after.join(", ")}`);
      }
    }
    if (offerLines.length) sections.push(`MES OFFRES :${offerLines.join("\n")}`);
  }

  // === AUDIT ===
  if (options.includeAudit && ctx.audit) {
    const a = ctx.audit;
    const aLines: string[] = [];
    if (a.score_global != null) aLines.push(`- Score global : ${a.score_global}/100`);
    if (a.score_bio != null) aLines.push(`- Score bio : ${a.score_bio}/20`);
    if (a.score_feed != null) aLines.push(`- Score feed : ${a.score_feed}/20`);
    if (a.score_edito != null) aLines.push(`- Score édito : ${a.score_edito}/20`);
    if (a.score_stories != null) aLines.push(`- Score stories : ${a.score_stories}/20`);
    if (a.score_epingles != null) aLines.push(`- Score épinglés : ${a.score_epingles}/20`);
    if (a.combo_gagnant) aLines.push(`- Combo gagnant : ${a.combo_gagnant}`);
    if (a.resume) aLines.push(`- Résumé : ${a.resume}`);
    if (aLines.length) sections.push(`DERNIER AUDIT INSTAGRAM :\n${aLines.join("\n")}`);
  }

  // === COHÉRENCE DE MARQUE (MIRROR) ===
  if (options.includeMirror && ctx.mirror) {
    const m = ctx.mirror;
    const mLines: string[] = [];
    if (m.coherence_score != null) mLines.push(`- Score de cohérence : ${m.coherence_score}/100`);
    if (m.summary) mLines.push(`- Résumé : ${m.summary}`);
    if (m.alignments?.length) mLines.push(`- Points alignés : ${JSON.stringify(m.alignments)}`);
    if (m.gaps?.length) mLines.push(`- Écarts identifiés : ${JSON.stringify(m.gaps)}`);
    if (m.quick_wins?.length) mLines.push(`- Quick wins suggérés : ${JSON.stringify(m.quick_wins)}`);
    if (mLines.length) sections.push(`COHÉRENCE DE MARQUE (Branding Mirror) :\n${mLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "NOTE : Le profil est très peu rempli. Les résultats seront plus pertinents une fois le Branding et les Offres complétés.\n";
  }

  return `CONTEXTE DE LA MARQUE (utilise ces informations pour personnaliser TOUT le contenu généré) :\n\n${sections.join("\n\n")}\n\nRAPPEL : Si une section VOIX PERSONNELLE est présente ci-dessus, elle prime sur toutes les autres instructions de style. Le contenu doit sonner comme l'utilisatrice, pas comme une IA.\n`;
}

/**
 * Pre-configured context builders for specific generators.
 * Maps the context options table from the architecture doc.
 */
export const CONTEXT_PRESETS: Record<string, ContextOptions> = {
  // Bio: branding ✅, story ❌, persona ✅, offers ✅, profile ✅, editorial ❌, audit ❌
  bio: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: false },

  // Posts/Carrousels: branding ✅, story ✅, persona ✅, offers ✅, profile ❌, editorial ✅
  posts: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: true, includeAudit: false, includeVoice: true, includeCharter: true, includeMirror: true },

  // Reels: same as posts
  reels: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: true, includeAudit: false, includeVoice: true, includeCharter: true },

  // Stories: same as posts
  stories: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: true, includeAudit: false, includeVoice: true, includeCharter: true },

  // Commentaires: branding ✅ only
  comments: { includeStory: false, includePersona: false, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: false, includeCharter: false },

  // DM prospection: branding ✅, persona ✅, offers ✅
  dm: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: false },

  // Audit Instagram: branding ✅, persona ✅, offers ✅, profile ✅, audit ✅
  audit: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: true, includeVoice: true, includeCharter: false },

  // Pages de vente: everything + details
  salesPage: { includeStory: true, includePersona: true, includeOffers: true, includeOffersDetails: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // Offer coaching: branding ✅, story ✅, persona ✅, no offers
  offerCoaching: { includeStory: true, includePersona: true, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true },

  // Creative flow / content generation: full context
  content: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: true, includeAudit: false, includeVoice: true, includeCharter: true, includeMirror: true },

  // Weekly suggestions: lighter context for speed (no story, no mirror, no charter, no editorial)
  weeklySuggestions: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: true, includeAudit: false, includeVoice: true, includeCharter: false, includeMirror: false },

  // Highlights: branding ✅, persona ✅, offers ✅, profile ✅
  highlights: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // Inspire: branding ✅, story ✅, persona ✅, profile ✅
  inspire: { includeStory: true, includePersona: true, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // Launch plan: branding ✅, persona ✅, offers ✅, profile ✅
  launch: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // LinkedIn: branding ✅, story ✅, persona ✅, offers ✅, profile ✅
  linkedin: { includeStory: true, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true, includeMirror: true },

  // LinkedIn audit: branding ✅, persona ✅, offers ✅, profile ✅
  linkedinAudit: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true },

  // Pinterest: branding ✅, persona ✅, profile ✅
  pinterest: { includeStory: false, includePersona: true, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // Website / pages de vente: everything + offer details
  website: { includeStory: true, includePersona: true, includeOffers: true, includeOffersDetails: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true, includeMirror: true },

  // Score content: branding ✅, profile ✅
  score: { includeStory: false, includePersona: false, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: false, includeCharter: false },

  // Website audit diagnostic: persona ✅, offers ✅, profile ✅, voice ✅, charter ✅
  websiteAudit: { includeStory: false, includePersona: true, includeOffers: true, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: true },

  // Mirror: branding ✅, profile ✅, voice ✅
  mirror: { includeStory: false, includePersona: false, includeOffers: false, includeProfile: true, includeEditorial: false, includeAudit: false, includeVoice: true, includeCharter: false, includeMirror: true },
};

export function buildProfileBlock(profile: any): string {
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
  if (profile.offre) lines.push(`- Offre (ce qu'elle vend) : ${profile.offre}`);
  if (profile.croyances_limitantes) lines.push(`- Croyances limitantes de sa cible : ${profile.croyances_limitantes}`);
  if (profile.verbatims) lines.push(`- Verbatims (les mots de ses clientes) : ${profile.verbatims}`);
  if (profile.expressions_cles) lines.push(`- Expressions clés à utiliser : ${profile.expressions_cles}`);
  if (profile.ce_quon_evite) lines.push(`- Ce qu'on évite dans sa com : ${profile.ce_quon_evite}`);
  if (profile.style_communication?.length) lines.push(`- Style de communication : ${profile.style_communication.join(", ")}`);
  return lines.join("\n");
}

/**
 * Builds fallback pre-gen answers from branding context when the user
 * skipped the coaching pre-gen questions. Returns null if branding is
 * also empty (new user).
 */
export function buildPreGenFallback(ctx: any): { anecdote?: string; emotion?: string; conviction?: string; _fromBranding: true } | null {
  const story = ctx.storytelling?.step_7_polished;
  const tone = ctx.tone;
  const profile = ctx.profile;
  const proposition = ctx.proposition;

  const anecdote = story || undefined;

  // Emotion: derive from tone/mission
  let emotion: string | undefined;
  if (tone?.tone_style) emotion = tone.tone_style;
  else if (profile?.tons?.length) emotion = Array.isArray(profile.tons) ? profile.tons.join(", ") : profile.tons;
  else if (profile?.mission) emotion = profile.mission;

  // Conviction: derive from combat/proposition
  let conviction: string | undefined;
  if (tone?.combat_cause) conviction = tone.combat_cause;
  else if (tone?.combat_fights) conviction = tone.combat_fights;
  else if (proposition?.version_one_liner) conviction = proposition.version_one_liner;
  else if (profile?.mission) conviction = profile.mission;

  if (!anecdote && !emotion && !conviction) return null;

  return { anecdote, emotion, conviction, _fromBranding: true };
}

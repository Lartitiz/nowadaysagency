import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Pencil, Loader2, Wand2 } from "lucide-react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";

/* ── Field-level emoji map ── */
const FIELD_EMOJI: Record<string, string> = {
  step_1_frustrations: "😤",
  step_2_transformation: "✨",
  step_3a_objections: "🤔",
  step_3b_cliches: "💭",
  step_4_beautiful: "🌸",
  step_4_inspiring: "💡",
  step_4_repulsive: "🚫",
  step_4_feeling: "❤️",
  step_5_actions: "🎯",
  pitch_short: "💬",
  pitch_medium: "💬",
  pitch_long: "💬",
  step_1_what: "💼",
  step_2a_process: "⚙️",
  step_2b_values: "💎",
  step_2c_feedback: "🗣️",
  step_2d_refuse: "🚫",
  step_3_for_whom: "🎯",
  version_pitch_naturel: "🎤",
  version_bio: "📝",
  version_networking: "🤝",
  version_site_web: "🌐",
  version_engagee: "✊",
  version_one_liner: "⚡",
  version_final: "⭐",
  voice_description: "🗣️",
  combat_cause: "✊",
  combat_fights: "🥊",
  combat_alternative: "🌱",
  combat_refusals: "🚫",
  tone_register: "📖",
  tone_level: "🎚️",
  tone_style: "🎨",
  tone_humor: "😄",
  tone_engagement: "📢",
  key_expressions: "✏️",
  things_to_avoid: "❌",
  target_verbatims: "💬",
  step_1_hidden_facets: "🔮",
  facet_1: "🎭",
  facet_2: "🎭",
  facet_3: "🎭",
  pillar_major: "🏛️",
  pillar_minor_1: "🧱",
  pillar_minor_2: "🧱",
  pillar_minor_3: "🧱",
  creative_concept: "💡",
};

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/* ══════════════════════════════════════════════════════
   STORY SECTION – one card per storytelling
   ══════════════════════════════════════════════════════ */

interface StorytellingRow {
  id: string;
  title?: string | null;
  step_7_polished?: string | null;
  is_primary?: boolean;
  updated_at?: string | null;
}

function StoryCards() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StorytellingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (supabase.from("storytelling" as any) as any)
      .select("id, title, step_7_polished, is_primary, updated_at")
      .eq(column, value)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .then(({ data }: any) => {
        setStories((data as StorytellingRow[]) || []);
        setLoading(false);
      });
  }, [user?.id]);

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (stories.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <p className="text-muted-foreground text-sm mb-3">Aucun storytelling pour l'instant.</p>
        <Button size="sm" className="rounded-pill text-xs" onClick={() => navigate("/branding/coaching?section=story")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Créer mon premier storytelling
        </Button>
      </Card>
    );
  }

  const single = stories.length === 1;

  return (
    <div className="space-y-3">
      {stories.map((s) => {
        const preview = s.step_7_polished
          ? single ? s.step_7_polished : truncate(s.step_7_polished, 80)
          : "Storytelling en cours…";
        const label = s.title || "Mon histoire";

        return (
          <Card
            key={s.id}
            className="p-5 cursor-pointer border-border hover:border-[hsl(var(--primary)/0.3)] hover:shadow-md transition-all"
            onClick={() => navigate(`/branding/storytelling/${s.id}/edit`)}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display text-sm font-bold text-foreground">{label}</h3>
              {s.is_primary && <Badge variant="default" className="text-[10px] shrink-0">Principal</Badge>}
            </div>
            <p className={`text-[13px] text-muted-foreground leading-relaxed ${single ? "" : "line-clamp-3"}`}>
              {preview}
            </p>
            {s.updated_at && (
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                Mis à jour le {format(new Date(s.updated_at), "d MMM yyyy", { locale: fr })}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GENERIC SECTION – field cards with inline editing
   ══════════════════════════════════════════════════════ */

interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
}

interface FieldCardsProps {
  fields: FieldDef[];
  data: Record<string, any>;
  table: string;
  recordId?: string;
  section?: string;
  onFieldUpdate?: (field: string, value: string, oldValue?: string) => void;
}

function FieldCards({ fields, data, table, recordId, section, onFieldUpdate }: FieldCardsProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { column, value: workspaceValue } = useWorkspaceFilter();
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const supportsAutoFill = section === "persona" || section === "content_strategy";

  const emptyNonPitchFields = supportsAutoFill ? fields.filter(f => {
    const v = data[f.key];
    return (!v || (typeof v === "string" && v.trim().length === 0)) && !f.key.startsWith("pitch_");
  }) : [];

  const emptyPitchFields = section === "persona" ? fields.filter(f => {
    const v = data[f.key];
    return (!v || (typeof v === "string" && v.trim().length === 0)) && f.key.startsWith("pitch_");
  }) : [];

  const totalEmpty = emptyNonPitchFields.length + emptyPitchFields.length;

  const handleAutoFillContentStrategy = async () => {
    if (!user || !recordId || isDemoMode) return;
    setIsAutoFilling(true);
    try {
      // Champs ligne édito encore vides
      const stillEmptyFields = fields.filter(f => {
        const v = data[f.key];
        return (!v || (typeof v === "string" && v.trim().length === 0));
      });

      if (stillEmptyFields.length === 0) {
        toast.info("Tous les champs sont déjà remplis ✨");
        setIsAutoFilling(false);
        return;
      }

      const fieldLabels: Record<string, string> = {
        step_1_hidden_facets: "Mes facettes cachées (zones d'intimité de la marque)",
        facet_1: "Facette 1 (phrase courte, 5-12 mots)",
        facet_2: "Facette 2 (phrase courte, 5-12 mots)",
        facet_3: "Facette 3 (phrase courte, 5-12 mots)",
        pillar_major: "Pilier majeur de contenu (4-10 mots)",
        pillar_minor_1: "Pilier mineur 1 (4-10 mots, distinct du majeur)",
        pillar_minor_2: "Pilier mineur 2 (4-10 mots, distinct du majeur)",
        pillar_minor_3: "Pilier mineur 3 (4-10 mots, distinct du majeur)",
        creative_concept: "Concept créatif qui relie les piliers (1-3 phrases)",
      };

      // Récupère TOUT le contexte branding en parallèle
      const [bpRes, propRes, persRes, storyRes, sessRes] = await Promise.all([
        (supabase.from("brand_profile") as any)
          .select("mission, positioning, voice_description, tone_register, tone_level, tone_style, combat_cause, combat_fights, key_expressions, things_to_avoid, target_description, target_verbatims, target_problem")
          .eq(column, workspaceValue).maybeSingle(),
        (supabase.from("brand_proposition") as any)
          .select("version_final, step_1_what")
          .eq(column, workspaceValue).maybeSingle(),
        (supabase.from("persona") as any)
          .select("step_1_frustrations, step_2_transformation, step_4_beautiful, step_4_inspiring")
          .eq(column, workspaceValue).eq("is_primary", true).maybeSingle(),
        (supabase.from("storytelling") as any)
          .select("step_7_polished, pitch_short")
          .eq(column, workspaceValue).order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("branding_coaching_sessions") as any)
          .select("messages")
          .eq(column, workspaceValue).eq("section", "content_strategy").maybeSingle(),
      ]);

      const bp = bpRes?.data || null;
      const prop = propRes?.data || null;
      const pers = persRes?.data || null;
      const story = storyRes?.data || null;
      const conversationMessages = (sessRes?.data?.messages as any[]) || [];

      // Champs déjà remplis (à ne pas écraser, à utiliser comme guide)
      const filledStrategyFields: Record<string, string> = {};
      for (const f of fields) {
        const v = data[f.key];
        if (v && typeof v === "string" && v.trim().length > 0) {
          filledStrategyFields[f.key] = v.trim();
        }
      }

      const hasBrandContext = bp && (bp.mission || bp.positioning || bp.voice_description || bp.target_description);
      const hasContext = hasBrandContext || !!prop || !!pers || !!story || conversationMessages.length > 0 || Object.keys(filledStrategyFields).length > 0;

      if (!hasContext) {
        toast.info("Pas assez de contexte pour compléter automatiquement — remplis manuellement quelques champs ou refais le coaching.");
        setIsAutoFilling(false);
        return;
      }

      const contextBlocks: { role: string; content: string }[] = [];

      if (bp && hasBrandContext) {
        const lines: string[] = [];
        if (bp.mission) lines.push(`Mission : ${bp.mission}`);
        if (bp.positioning) lines.push(`Positionnement : ${bp.positioning}`);
        if (bp.voice_description) lines.push(`Voix de marque : ${bp.voice_description}`);
        if (bp.tone_register || bp.tone_level || bp.tone_style) {
          lines.push(`Ton : ${[bp.tone_register, bp.tone_level, bp.tone_style].filter(Boolean).join(" / ")}`);
        }
        if (bp.combat_cause) lines.push(`Cause défendue : ${bp.combat_cause}`);
        if (bp.combat_fights) lines.push(`Ce contre quoi on se bat : ${bp.combat_fights}`);
        if (bp.key_expressions) lines.push(`Expressions clés : ${bp.key_expressions}`);
        if (bp.things_to_avoid) lines.push(`À éviter : ${bp.things_to_avoid}`);
        if (bp.target_description) lines.push(`Cible : ${bp.target_description}`);
        if (bp.target_problem) lines.push(`Problème de la cible : ${bp.target_problem}`);
        if (bp.target_verbatims) lines.push(`Verbatims cible : ${bp.target_verbatims}`);
        contextBlocks.push({ role: "user", content: `CONTEXTE DE MARQUE :\n${lines.join("\n")}` });
      }

      if (prop && (prop.version_final || prop.step_1_what)) {
        const lines: string[] = [];
        if (prop.version_final) lines.push(`Proposition de valeur (version finale) : ${prop.version_final}`);
        if (prop.step_1_what) lines.push(`Ce que je fais : ${prop.step_1_what}`);
        contextBlocks.push({ role: "user", content: `PROPOSITION :\n${lines.join("\n")}` });
      }

      if (pers) {
        const lines: string[] = [];
        if (pers.step_1_frustrations) lines.push(`Frustrations cliente : ${pers.step_1_frustrations}`);
        if (pers.step_2_transformation) lines.push(`Transformation rêvée : ${pers.step_2_transformation}`);
        if (pers.step_4_beautiful) lines.push(`Ce qu'elle trouve beau : ${pers.step_4_beautiful}`);
        if (pers.step_4_inspiring) lines.push(`Ce qui l'inspire : ${pers.step_4_inspiring}`);
        if (lines.length > 0) contextBlocks.push({ role: "user", content: `PERSONA :\n${lines.join("\n")}` });
      }

      if (story && (story.step_7_polished || story.pitch_short)) {
        const lines: string[] = [];
        if (story.pitch_short) lines.push(`Pitch court : ${story.pitch_short}`);
        if (story.step_7_polished) lines.push(`Storytelling : ${story.step_7_polished.slice(0, 1500)}`);
        contextBlocks.push({ role: "user", content: `STORY :\n${lines.join("\n")}` });
      }

      if (Object.keys(filledStrategyFields).length > 0) {
        const filledStr = Object.entries(filledStrategyFields)
          .map(([k, v]) => `- ${fieldLabels[k] || k} : ${v}`)
          .join("\n");
        contextBlocks.push({ role: "user", content: `CHAMPS LIGNE ÉDITO DÉJÀ REMPLIS (à NE PAS écraser, à utiliser comme guide de cohérence) :\n${filledStr}` });
      }

      const missingList = stillEmptyFields
        .map(f => `- "${f.key}": ${fieldLabels[f.key] || f.label}`)
        .join("\n");

      const { data: fillData } = await invokeWithTimeout("branding-coaching", {
        body: {
          section: "content_strategy_fill",
          messages: [
            ...contextBlocks,
            ...conversationMessages.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: `À partir de TOUT le contexte ci-dessus (marque, proposition, persona, story, champs déjà remplis, conversation), DÉDUIS et remplis ces champs manquants de la ligne éditoriale. Tu DOIS produire une valeur concrète et plausible pour CHAQUE champ demandé. Respecte les règles de cohérence métier (piliers mineurs distincts du majeur, concept créatif qui relie, etc.). Réponds UNIQUEMENT en JSON plat avec ces clés EXACTES :\n${missingList}` },
          ],
          context: {},
          covered_topics: [],
        },
      }, 120000);

      const fillResponse = fillData?.response;
      let fillInsights: Record<string, any> = {};
      if (fillResponse) {
        if (typeof fillResponse === "string") {
          try { fillInsights = JSON.parse(fillResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { /* ignore */ }
        } else if (typeof fillResponse === "object") {
          fillInsights = fillResponse.extracted_insights || fillResponse;
        }
      }

      // Normalisation alias → clés DB
      const aliasMap: Record<string, string> = {
        facettes_cachees: "step_1_hidden_facets",
        facettes: "step_1_hidden_facets",
        hidden_facets: "step_1_hidden_facets",
        intimite: "step_1_hidden_facets",
        facet1: "facet_1",
        facette_1: "facet_1",
        facet2: "facet_2",
        facette_2: "facet_2",
        facet3: "facet_3",
        facette_3: "facet_3",
        pilier_principal: "pillar_major",
        pilier_majeur: "pillar_major",
        axe_majeur: "pillar_major",
        pilier_central: "pillar_major",
        main_pillar: "pillar_major",
        pilier_mineur_1: "pillar_minor_1",
        pilier_mineur_2: "pillar_minor_2",
        pilier_mineur_3: "pillar_minor_3",
        minor_pillar_1: "pillar_minor_1",
        minor_pillar_2: "pillar_minor_2",
        minor_pillar_3: "pillar_minor_3",
        concept: "creative_concept",
        concept_creatif: "creative_concept",
        twist: "creative_concept",
        twist_creatif: "creative_concept",
        axe_editorial: "creative_concept",
        ligne_editoriale: "creative_concept",
      };
      const normalized: Record<string, any> = { ...fillInsights };
      for (const [alias, realKey] of Object.entries(aliasMap)) {
        if (fillInsights[alias] && !normalized[realKey]) {
          normalized[realKey] = fillInsights[alias];
        }
      }

      const validFills: Record<string, string> = {};
      for (const f of stillEmptyFields) {
        const val = normalized[f.key];
        if (val && typeof val === "string" && val.trim().length > 0) {
          validFills[f.key] = val.trim();
        } else if (Array.isArray(val) && val.length > 0) {
          // tolérance : si l'IA renvoie un tableau, on join
          validFills[f.key] = val.filter(Boolean).join(", ");
        }
      }

      if (Object.keys(validFills).length > 0) {
        await (supabase.from(table as any) as any)
          .update({ ...validFills, updated_at: new Date().toISOString() })
          .eq("id", recordId);
        for (const [key, val] of Object.entries(validFills)) onFieldUpdate?.(key, val, "");
        toast.success(`${Object.keys(validFills).length} champ${Object.keys(validFills).length > 1 ? "s" : ""} complété${Object.keys(validFills).length > 1 ? "s" : ""} par l'IA ✨`);
      } else if (fillResponse) {
        console.warn("[ContentStrategyAutoFill] AI responded but no exploitable keys. Received:",
          Object.keys(fillInsights), "Expected:", stillEmptyFields.map(f => f.key));
        toast.info("L'IA a répondu, mais pas dans le format attendu. Réessaie ou remplis manuellement.");
      } else {
        toast.info("Pas assez de contexte pour compléter automatiquement.");
      }
    } catch (e) {
      console.error("[ContentStrategyAutoFill] Error:", e);
      toast.error("Erreur lors de la complétion. Réessaie.");
    }
    setIsAutoFilling(false);
  };

  const handleAutoFill = async () => {
    if (section === "content_strategy") {
      await handleAutoFillContentStrategy();
      return;
    }
    if (!user || !recordId || isDemoMode) return;
    setIsAutoFilling(true);
    try {
      // ─── Étape 0 : Extraire depuis la synthèse portrait (gratuit, instantané) ───
      const portrait = data?.portrait ? (typeof data.portrait === "string" ? (() => { try { return JSON.parse(data.portrait); } catch { return null; } })() : data.portrait) : null;

      let portraitFillsCount = 0;
      if (portrait) {
        const extractedFromPortrait: Record<string, string> = {};
        if (portrait.frustrations?.length > 0) extractedFromPortrait.step_1_frustrations = portrait.frustrations.join("\n");
        if (portrait.objectifs?.length > 0) extractedFromPortrait.step_2_transformation = portrait.objectifs.join("\n");
        if (portrait.blocages?.length > 0) extractedFromPortrait.step_3a_objections = portrait.blocages.join("\n");
        if (portrait.comment_parler?.fuir?.length > 0) extractedFromPortrait.step_4_repulsive = portrait.comment_parler.fuir.join(", ");
        if (portrait.comment_parler?.ton) extractedFromPortrait.step_4_feeling = portrait.comment_parler.ton;
        if (portrait.ses_mots?.length > 0) extractedFromPortrait.step_4_inspiring = portrait.ses_mots.join(", ");
        if (portrait.comment_parler?.convainc) extractedFromPortrait.step_5_actions = portrait.comment_parler.convainc;

        const fillsFromPortrait: Record<string, string> = {};
        for (const [key, val] of Object.entries(extractedFromPortrait)) {
          const currentVal = data[key];
          const isEmpty = !currentVal || (typeof currentVal === "string" && currentVal.trim().length === 0);
          if (isEmpty && val && val.trim().length > 0) fillsFromPortrait[key] = val.trim();
        }

        if (Object.keys(fillsFromPortrait).length > 0) {
          await (supabase.from(table as any) as any)
            .update({ ...fillsFromPortrait, updated_at: new Date().toISOString() })
            .eq("id", recordId);
          for (const [key, val] of Object.entries(fillsFromPortrait)) onFieldUpdate?.(key, val, "");
          portraitFillsCount = Object.keys(fillsFromPortrait).length;
        }
      }

      // ─── Étape 1 : Pour les champs encore vides, appeler l'IA ───
      const updatedData = { ...data };
      if (portrait) {
        const freshFetch = await (supabase.from("persona") as any).select("*").eq("id", recordId).maybeSingle();
        if (freshFetch.data) Object.assign(updatedData, freshFetch.data);
      }

      const stillEmptyFields = fields.filter(f => {
        const v = updatedData[f.key];
        return (!v || (typeof v === "string" && v.trim().length === 0)) && !f.key.startsWith("pitch_");
      });

      let aiFillsCount = 0;
      if (stillEmptyFields.length > 0) {
        const fieldLabels: Record<string, string> = {
          step_1_frustrations: "Ses frustrations profondes",
          step_2_transformation: "Sa transformation rêvée",
          step_3a_objections: "Ses objections principales",
          step_3b_cliches: "Les clichés / croyances à déconstruire",
          step_4_beautiful: "Ce qu'elle trouve beau (direction esthétique)",
          step_4_inspiring: "Ce qui l'inspire (personnes, marques, contenus)",
          step_4_repulsive: "Ce qui la rebute visuellement",
          step_4_feeling: "Ce qu'elle a besoin de ressentir (émotion recherchée)",
          step_5_actions: "Ses premières actions / déclencheurs d'achat",
        };

        // Fetch all available context sources in parallel
        const [sessionRes, brandProfileRes] = await Promise.all([
          (supabase.from("branding_coaching_sessions") as any)
            .select("messages")
            .eq(column, workspaceValue)
            .eq("section", "persona")
            .maybeSingle(),
          (supabase.from("brand_profile") as any)
            .select("mission, positioning, offer, target_description, target_problem, target_beliefs, target_verbatims, voice_description, tone_register, tone_level, tone_style, key_expressions, combat_cause, combat_fights, things_to_avoid")
            .eq(column, workspaceValue)
            .maybeSingle(),
        ]);
        const conversationMessages = (sessionRes?.data?.messages as any[]) || [];
        const brandProfile = brandProfileRes?.data || null;

        // Already-filled persona fields (frustrations, transformation, etc.)
        const filledPersonaFields: Record<string, string> = {};
        for (const f of fields) {
          const v = updatedData[f.key];
          if (v && typeof v === "string" && v.trim().length > 0 && !f.key.startsWith("pitch_")) {
            filledPersonaFields[f.key] = v.trim();
          }
        }

        // Determine if we have ANY usable context
        const hasBrandContext = brandProfile && (
          brandProfile.target_description || brandProfile.target_verbatims ||
          brandProfile.target_problem || brandProfile.mission || brandProfile.positioning
        );
        const hasContext = !!portrait || conversationMessages.length > 0 ||
          hasBrandContext || Object.keys(filledPersonaFields).length > 0;

        if (hasContext) {
          // Build context blocks
          const contextBlocks: { role: string; content: string }[] = [];

          if (brandProfile && hasBrandContext) {
            const bp: string[] = [];
            if (brandProfile.mission) bp.push(`Mission : ${brandProfile.mission}`);
            if (brandProfile.positioning) bp.push(`Positionnement : ${brandProfile.positioning}`);
            if (brandProfile.offer) bp.push(`Offre : ${brandProfile.offer}`);
            if (brandProfile.target_description) bp.push(`Description de la cible : ${brandProfile.target_description}`);
            if (brandProfile.target_problem) bp.push(`Problème principal de la cible : ${brandProfile.target_problem}`);
            if (brandProfile.target_beliefs) bp.push(`Croyances limitantes de la cible : ${brandProfile.target_beliefs}`);
            if (brandProfile.target_verbatims) bp.push(`Verbatims de la cible : ${brandProfile.target_verbatims}`);
            if (brandProfile.voice_description) bp.push(`Voix de marque : ${brandProfile.voice_description}`);
            if (brandProfile.tone_register || brandProfile.tone_level || brandProfile.tone_style) {
              bp.push(`Ton : ${[brandProfile.tone_register, brandProfile.tone_level, brandProfile.tone_style].filter(Boolean).join(" / ")}`);
            }
            if (brandProfile.key_expressions) bp.push(`Expressions clés : ${brandProfile.key_expressions}`);
            if (brandProfile.combat_cause) bp.push(`Cause défendue : ${brandProfile.combat_cause}`);
            if (brandProfile.combat_fights) bp.push(`Ce contre quoi on se bat : ${brandProfile.combat_fights}`);
            if (brandProfile.things_to_avoid) bp.push(`À éviter : ${brandProfile.things_to_avoid}`);
            contextBlocks.push({ role: "user", content: `CONTEXTE DE MARQUE :\n${bp.join("\n")}` });
          }

          if (portrait) {
            contextBlocks.push({ role: "user", content: `SYNTHÈSE PORTRAIT de la cliente idéale :\n${JSON.stringify(portrait, null, 2)}` });
          }

          if (Object.keys(filledPersonaFields).length > 0) {
            const filledStr = Object.entries(filledPersonaFields)
              .map(([k, v]) => `- ${fieldLabels[k] || k} : ${v}`)
              .join("\n");
            contextBlocks.push({ role: "user", content: `CHAMPS PERSONA DÉJÀ REMPLIS :\n${filledStr}` });
          }

          const missingList = stillEmptyFields
            .map(f => `- "${f.key}": ${fieldLabels[f.key] || f.label}`)
            .join("\n");

          const { data: fillData } = await invokeWithTimeout("branding-coaching", {
            body: {
              section: "persona_fill",
              messages: [
                ...contextBlocks,
                ...conversationMessages.map((m: any) => ({ role: m.role, content: m.content })),
                { role: "user", content: `À partir de TOUT le contexte ci-dessus (marque, portrait, champs déjà remplis, conversation), DÉDUIS et remplis ces champs manquants. Tu DOIS produire une valeur concrète et plausible pour CHAQUE champ demandé. Ne refuse jamais sous prétexte de manque d'info — déduis intelligemment. Réponds UNIQUEMENT en JSON avec ces clés :\n${missingList}` }
              ],
              context: {},
              covered_topics: [],
            },
          }, 120000);

          const fillResponse = fillData?.response;
          let fillInsights: Record<string, any> = {};
          if (fillResponse) {
            if (typeof fillResponse === "string") {
              try { fillInsights = JSON.parse(fillResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { /* ignore */ }
            } else if (typeof fillResponse === "object") {
              fillInsights = fillResponse.extracted_insights || fillResponse;
            }
          }

          // Normalize potential AI alias keys → real DB columns
          const aliasMap: Record<string, string> = {
            objections_courantes: "step_3a_objections",
            objections: "step_3a_objections",
            freins_achat: "step_3a_objections",
            freins: "step_3a_objections",
            croyances_limitantes: "step_3b_cliches",
            croyances: "step_3b_cliches",
            cliches: "step_3b_cliches",
            declencheurs_achat: "step_5_actions",
            declencheurs: "step_5_actions",
            premieres_actions: "step_5_actions",
            actions: "step_5_actions",
            frustrations_profondes: "step_1_frustrations",
            frustrations: "step_1_frustrations",
            transformation_revee: "step_2_transformation",
            transformation: "step_2_transformation",
            objectif_principal: "step_2_transformation",
            beau: "step_4_beautiful",
            esthetique: "step_4_beautiful",
            inspirant: "step_4_inspiring",
            inspiration: "step_4_inspiring",
            repoussant: "step_4_repulsive",
            rebute: "step_4_repulsive",
            ressenti: "step_4_feeling",
            emotion: "step_4_feeling",
          };
          const normalized: Record<string, any> = { ...fillInsights };
          for (const [alias, realKey] of Object.entries(aliasMap)) {
            if (fillInsights[alias] && !normalized[realKey]) {
              normalized[realKey] = fillInsights[alias];
            }
          }

          const validFills: Record<string, string> = {};
          for (const f of stillEmptyFields) {
            const val = normalized[f.key];
            if (val && typeof val === "string" && val.trim().length > 0) validFills[f.key] = val.trim();
          }
          if (Object.keys(validFills).length > 0) {
            await (supabase.from(table as any) as any)
              .update({ ...validFills, updated_at: new Date().toISOString() })
              .eq("id", recordId);
            for (const [key, val] of Object.entries(validFills)) onFieldUpdate?.(key, val, "");
            aiFillsCount = Object.keys(validFills).length;
          } else if (fillResponse) {
            console.warn("[PersonaAutoFill] AI responded but no exploitable keys found. Received keys:",
              Object.keys(fillInsights), "Expected:", stillEmptyFields.map(f => f.key));
            toast.info("L'IA a répondu, mais pas dans le format attendu. Réessaie ou remplis manuellement.");
          }
        }
      }
      // Generate pitches
      const { data: freshPersona } = await (supabase.from("persona") as any).select("*").eq("id", recordId).maybeSingle();
      const { data: brandData } = await (supabase.from("brand_profile") as any)
        .select("activite, mission, offer, target_description, tone_register, voice_description, target_verbatims, combat_cause")
        .eq(column, workspaceValue).maybeSingle();
      const { data: pitchData } = await invokeWithTimeout("persona-ai", {
        body: { type: "pitch", persona: freshPersona || data, profile: brandData || {} },
      }, 60000);
      if (pitchData?.content) {
        let pitchParsed: any;
        try {
          pitchParsed = typeof pitchData.content === "string"
            ? JSON.parse(pitchData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
            : pitchData.content;
        } catch { /* ignore */ }
        if (pitchParsed) {
          const pitchUpdate: Record<string, string> = {};
          if (pitchParsed.short) pitchUpdate.pitch_short = pitchParsed.short;
          if (pitchParsed.medium) pitchUpdate.pitch_medium = pitchParsed.medium;
          if (pitchParsed.long) pitchUpdate.pitch_long = pitchParsed.long;
          if (Object.keys(pitchUpdate).length > 0) {
            await (supabase.from("persona") as any).update({ ...pitchUpdate, updated_at: new Date().toISOString() }).eq("id", recordId);
            for (const [key, val] of Object.entries(pitchUpdate)) onFieldUpdate?.(key, val, "");
          }
        }
      }
      const totalFilled = portraitFillsCount + aiFillsCount;
      if (totalFilled > 0) {
        toast.success(`${totalFilled} champ${totalFilled > 1 ? "s" : ""} complété${totalFilled > 1 ? "s" : ""} par l'IA ✨`);
      } else {
        toast.info("Pas assez de contexte pour compléter automatiquement — remplis manuellement quelques champs ou refais le coaching persona.");
      }
    } catch (e) {
      console.error("[PersonaAutoFill] Error:", e);
      toast.error("Erreur lors de la complétion. Réessaie.");
    }
    setIsAutoFilling(false);
  };

  const filled = fields.filter((f) => {
    const v = data[f.key];
    return v && typeof v === "string" && v.trim().length > 0;
  });
  const total = fields.length;

  const handleStartEdit = (field: FieldDef) => {
    setEditingField(field.key);
    setEditValue((data[field.key] as string) || "");
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleSave = async (field: FieldDef) => {
    if (isDemoMode) {
      onFieldUpdate?.(field.key, editValue, data[field.key] || "");
      setEditingField(null);
      toast.success("C'est noté !");
      return;
    }
    if (!user || !recordId) return;
    setIsSaving(true);
    try {
      const oldValue = (data[field.key] as string) || "";
      await (supabase.from(table as any) as any)
        .update({ [field.key]: editValue, updated_at: new Date().toISOString() })
        .eq("id", recordId);
      onFieldUpdate?.(field.key, editValue, oldValue);
      setEditingField(null);
      toast.success("C'est noté !");
    } catch {
      toast.error("Erreur de sauvegarde");
    }
    setIsSaving(false);
  };

  return (
    <div>
      {/* Counter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-foreground">
          {filled.length}/{total} champs remplis
        </span>
        <div className="h-1.5 bg-muted rounded-full flex-1 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${total ? Math.round((filled.length / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Auto-fill button for persona with empty fields */}
      {section === "persona" && totalEmpty > 0 && recordId && (data?.portrait || filled.length > 0) && (
        <div className="mb-4">
          <Button
            variant="outline"
            className="w-full border-primary/30 bg-primary/5 hover:bg-primary/10 text-foreground"
            onClick={handleAutoFill}
            disabled={isAutoFilling}
          >
            {isAutoFilling ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> L'IA complète ta fiche...</>
            ) : (
              <><Wand2 className="h-4 w-4 mr-2" /> Compléter les {totalEmpty} champs manquants avec l'IA</>
            )}
          </Button>
        </div>
      )}

      {/* Cards for ALL fields (filled AND empty) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => {
          const emoji = FIELD_EMOJI[f.key] || "📄";
          const rawValue = (data[f.key] as string)?.trim() || "";
          const isFilled = rawValue.length > 0;
          const isEditing = editingField === f.key;
          const isMultiline = f.multiline !== false;

          return (
            <Card
              key={f.key}
              className="group p-4 border-border hover:border-[hsl(338,100%,71%,0.2)] transition-all"
            >
              {/* Header: emoji + label + pencil */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{emoji}</span>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">{f.label}</h4>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => handleStartEdit(f)}
                    className="text-muted-foreground/40 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Modifier ${f.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Content or Edit mode */}
              {isEditing ? (
                <div className="mt-1">
                  {isMultiline ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 min-h-[100px] bg-card resize-none outline-none"
                      aria-label={f.label}
                      autoFocus
                    />
                  ) : (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 bg-card outline-none"
                      aria-label={f.label}
                      autoFocus
                    />
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => handleSave(f)} disabled={isSaving} className="text-xs rounded-lg">
                      {isSaving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Sauvegarde...</> : "Sauvegarder"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="text-xs text-muted-foreground">
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : isFilled ? (
                <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line">
                  {rawValue}
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground/50 italic">
                  Pas encore renseigné ·{" "}
                  <button onClick={() => handleStartEdit(f)} className="text-primary hover:underline">
                    Remplir manuellement
                  </button>
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════ */

interface BrandingFicheCardsProps {
  section: string;
  fields: FieldDef[];
  data: Record<string, any>;
  table?: string;
  recordId?: string;
  onFieldUpdate?: (field: string, value: string, oldValue?: string) => void;
}

export default function BrandingFicheCards({ section, fields, data, table, recordId, onFieldUpdate }: BrandingFicheCardsProps) {
  if (section === "story") {
    return <StoryCards />;
  }
  return <FieldCards fields={fields} data={data} table={table || ""} recordId={recordId} section={section} onFieldUpdate={onFieldUpdate} />;
}

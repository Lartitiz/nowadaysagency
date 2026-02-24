import { SectionCard, HighlightCard, parseToArray, parseToTags } from "./BrandingRecapCards";
import PersonaBoard from "./PersonaBoard";

type UpdateFn = (field: string, value: string, oldValue?: string) => void;

interface RecapProps {
  data: Record<string, any>;
  table: string;
  onUpdated?: UpdateFn;
  onStartCoaching?: () => void;
}

/* ═══════════════════════════════════════════════════
   FICHE 1 : MON HISTOIRE
   ═══════════════════════════════════════════════════ */

export function StoryRecap({ data, table, onUpdated, onStartCoaching }: RecapProps) {
  return (
    <div className="space-y-0">
      <SectionCard label="Comment tout a commencé" value={data.step_1_raw} field="step_1_raw" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Le contexte" value={data.step_2_location} field="step_2_location" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce que j'ai fait" value={data.step_3_action} field="step_3_action" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Le déclic" value={data.step_4_thoughts} field="step_4_thoughts" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce que je ressentais" value={data.step_5_emotions} field="step_5_emotions" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      {data.step_6_full_story && (
        <SectionCard label="Mon histoire brute" value={data.step_6_full_story} field="step_6_full_story" table={table} onUpdated={onUpdated} />
      )}

      <HighlightCard label="Mon histoire complète" value={data.step_7_polished} field="step_7_polished" table={table} onUpdated={onUpdated} />

      {/* Pitches */}
      {(data.pitch_short || data.pitch_medium || data.pitch_long) && (
        <div className="pt-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 px-1">Mes pitchs</h3>
          <HighlightCard label="Pitch court" value={data.pitch_short} field="pitch_short" table={table} onUpdated={onUpdated} />
          <HighlightCard label="Pitch moyen" value={data.pitch_medium} field="pitch_medium" table={table} onUpdated={onUpdated} />
          <HighlightCard label="Pitch long" value={data.pitch_long} field="pitch_long" table={table} onUpdated={onUpdated} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FICHE 2 : MON CLIENT·E IDÉAL·E
   ═══════════════════════════════════════════════════ */

export function PersonaRecap({ data, table, onUpdated, onStartCoaching }: RecapProps) {
  return (
    <div className="space-y-0">
      <SectionCard label="Ses frustrations" value={parseToArray(data.step_1_frustrations)} field="step_1_frustrations" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Sa transformation rêvée" value={data.step_2_transformation} field="step_2_transformation" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-0">
        <SectionCard label="Ses objections" value={parseToArray(data.step_3a_objections)} field="step_3a_objections" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Ses croyances / clichés" value={parseToArray(data.step_3b_cliches)} field="step_3b_cliches" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      </div>

      <SectionCard label="Ce qu'elle trouve beau" value={data.step_4_beautiful} field="step_4_beautiful" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce qui l'inspire" value={data.step_4_inspiring} field="step_4_inspiring" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-0">
        <SectionCard label="Ce qui la rebute" value={data.step_4_repulsive} field="step_4_repulsive" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Ce qu'elle a besoin de ressentir" value={data.step_4_feeling} field="step_4_feeling" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      </div>

      <SectionCard label="Premières actions" value={parseToArray(data.step_5_actions)} field="step_5_actions" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      {/* Pitches */}
      {(data.pitch_short || data.pitch_medium || data.pitch_long) && (
        <div className="pt-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 px-1">Mes pitchs</h3>
          <HighlightCard label="Pitch court" value={data.pitch_short} field="pitch_short" table={table} onUpdated={onUpdated} />
          <HighlightCard label="Pitch moyen" value={data.pitch_medium} field="pitch_medium" table={table} onUpdated={onUpdated} />
          <HighlightCard label="Pitch long" value={data.pitch_long} field="pitch_long" table={table} onUpdated={onUpdated} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FICHE 3 : MA PROPOSITION DE VALEUR
   ═══════════════════════════════════════════════════ */

export function PropositionRecap({ data, table, onUpdated, onStartCoaching }: RecapProps) {
  return (
    <div className="space-y-0">
      {/* Highlight: the key sentence */}
      <HighlightCard label="La phrase qui résume tout" value={data.version_final || data.version_one_liner} field="version_final" table={table} onUpdated={onUpdated} />

      <SectionCard label="Mon métier, en simple" value={data.step_1_what} field="step_1_what" table={table} multiline={false} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Mon process unique" value={data.step_2a_process} field="step_2a_process" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce qui est important pour moi" value={data.step_2b_values} field="step_2b_values" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce que mes client·es me disent" value={data.step_2c_feedback} field="step_2c_feedback" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Ce que je refuse de faire" value={data.step_2d_refuse} field="step_2d_refuse" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      <SectionCard label="Pour qui je suis la bonne personne" value={data.step_3_for_whom} field="step_3_for_whom" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      {/* Versions */}
      <div className="pt-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 px-1">Mes versions</h3>
        <HighlightCard label="Pitch naturel" value={data.version_pitch_naturel} field="version_pitch_naturel" table={table} onUpdated={onUpdated} />
        <HighlightCard label="Version bio" value={data.version_bio} field="version_bio" table={table} onUpdated={onUpdated} />
        <HighlightCard label="Pitch networking" value={data.version_networking} field="version_networking" table={table} onUpdated={onUpdated} />
        <HighlightCard label="Version site web" value={data.version_site_web} field="version_site_web" table={table} onUpdated={onUpdated} />
        <HighlightCard label="Version engagée" value={data.version_engagee} field="version_engagee" table={table} onUpdated={onUpdated} />
        <HighlightCard label="One-liner" value={data.version_one_liner} field="version_one_liner" table={table} onUpdated={onUpdated} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FICHE 4 : MON TON, MON STYLE & MES COMBATS
   ═══════════════════════════════════════════════════ */

export function ToneRecap({ data, table, onUpdated, onStartCoaching }: RecapProps) {
  return (
    <div className="space-y-0">
      {/* Tone keywords as tags */}
      <SectionCard
        label="Mon ton"
        value={parseToTags(data.tone_style ? `${data.tone_style}, ${data.tone_humor || ""}, ${data.tone_engagement || ""}` : null)}
        field="tone_style"
        table={table}
        type="tags"
        onUpdated={onUpdated}
        onStartCoaching={onStartCoaching}
      />

      <SectionCard label="Comment je parle" value={data.voice_description} field="voice_description" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      {/* Do / Don't grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-0">
        <SectionCard label="✅ Mes expressions clés" value={parseToArray(data.key_expressions)} field="key_expressions" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="❌ Ce que j'évite" value={parseToArray(data.things_to_avoid)} field="things_to_avoid" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-0">
        <SectionCard label="Registre" value={data.tone_register} field="tone_register" table={table} type="short" multiline={false} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Niveau de familiarité" value={data.tone_level} field="tone_level" table={table} type="short" multiline={false} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      </div>

      {/* Combats */}
      <div className="pt-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 px-1">Mes combats</h3>
        <SectionCard label="Ma cause" value={data.combat_cause} field="combat_cause" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Mes combats" value={parseToArray(data.combat_fights)} field="combat_fights" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Mon alternative" value={data.combat_alternative} field="combat_alternative" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
        <SectionCard label="Ce que je refuse" value={parseToArray(data.combat_refusals)} field="combat_refusals" table={table} type="list" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
      </div>

      <SectionCard label="Les mots de ma cible" value={parseToTags(data.target_verbatims)} field="target_verbatims" table={table} type="tags" onUpdated={onUpdated} onStartCoaching={onStartCoaching} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FICHE 5 : MA STRATÉGIE DE CONTENU
   ═══════════════════════════════════════════════════ */

export function StrategyRecap({ data, table, onUpdated, onStartCoaching }: RecapProps) {
  // Collect facets and pillars as tags
  const facets = [data.facet_1, data.facet_2, data.facet_3].filter(Boolean);
  const pillars = [data.pillar_major, data.pillar_minor_1, data.pillar_minor_2, data.pillar_minor_3].filter(Boolean);

  return (
    <div className="space-y-0">
      <SectionCard label="Mes facettes cachées" value={data.step_1_hidden_facets} field="step_1_hidden_facets" table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />

      {/* Facets as tags */}
      {facets.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-4">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Mes facettes</h4>
          <div className="flex flex-wrap gap-2">
            {facets.map((f, i) => (
              <span key={i} className="bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Pillars */}
      {pillars.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-4">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Mes piliers de contenu</h4>
          <div className="space-y-2">
            {pillars.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-primary" : "bg-primary/40"}`} />
                <span className={`text-sm ${i === 0 ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                  {p}{i === 0 ? " (majeur)" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <HighlightCard label="Mon concept créatif" value={data.creative_concept} field="creative_concept" table={table} onUpdated={onUpdated} />
    </div>
  );
}

/* ── Dispatcher ──────────────────────────────────── */

interface BrandingRecapRendererProps {
  section: string;
  data: Record<string, any>;
  table: string;
  onUpdated?: UpdateFn;
  onStartCoaching?: () => void;
}

export default function BrandingRecapRenderer({ section, data, table, onUpdated, onStartCoaching }: BrandingRecapRendererProps) {
  const props = { data, table, onUpdated, onStartCoaching };

  switch (section) {
    case "story": return <StoryRecap {...props} />;
    case "persona": return <PersonaBoard data={data} table={table} onUpdated={onUpdated} onStartCoaching={onStartCoaching} />;
    case "value_proposition": return <PropositionRecap {...props} />;
    case "tone_style": return <ToneRecap {...props} />;
    case "content_strategy": return <StrategyRecap {...props} />;
    default: return null;
  }
}

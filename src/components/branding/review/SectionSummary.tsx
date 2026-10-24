// L'essentiel d'une carte de la relecture en 3 à 5 lignes, le reste derrière
// « Voir le détail » (chantier 5 de plan-onboarding-comprehension.md, 24/10/2026).
// On replie l'affichage seulement : « C'est juste » et « Je valide tout »
// enregistrent toujours toute la section, détail compris.
import type React from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CHARTER_COLOR_SLOTS } from "./CharterSection";
import { offerClashes } from "./OffersSection";
import { Chip } from "./ReviewBits";
import type { AnalysisResult, SectionKey } from "./types";

const filled = (v: unknown) => v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0);
const count = (o: object | undefined, keys?: string[]) =>
  Object.entries(o || {}).filter(([k, v]) => k !== "confidence" && (!keys || keys.includes(k)) && filled(v)).length;

function StorySummary({ data }: { data: AnalysisResult["story"] }) {
  const text = data?.full_story || [data?.origin, data?.trigger, data?.vision].filter(Boolean).join(" ");
  return <p className="text-sm leading-relaxed text-foreground line-clamp-5 whitespace-pre-line">{text}</p>;
}

function PersonaSummary({ data }: { data: AnalysisResult["persona"] }) {
  const who = data?.description || [data?.name, data?.job, data?.age_range && `${data.age_range} ans`].filter(Boolean).join(", ");
  return (
    <div className="space-y-2">
      {who && <p className={`text-sm leading-relaxed text-foreground ${data?.frustrations?.length ? "line-clamp-2" : "line-clamp-4"}`}>{who}</p>}
      {data?.frustrations?.length ? (
        <ul className="text-sm text-foreground space-y-0.5">
          {data.frustrations.slice(0, 3).map((f, i) => <li key={i} className="line-clamp-1">• {f}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function ValuePropSummary({ data }: { data: AnalysisResult["value_proposition"] }) {
  const phrase = data?.key_phrase || data?.solution || data?.problem;
  return <p className="font-display text-lg text-foreground leading-snug line-clamp-4">{phrase}</p>;
}

function ToneSummary({ data }: { data: AnalysisResult["tone_style"] }) {
  return (
    <div className="space-y-2">
      {data?.voice_description && <p className="text-sm leading-relaxed text-foreground italic line-clamp-3">{data.voice_description}</p>}
      {data?.tone_keywords?.length ? <div className="flex flex-wrap gap-1.5">{data.tone_keywords.slice(0, 3).map((k, i) => <Chip key={i}>{k}</Chip>)}</div> : null}
    </div>
  );
}

const MAX_PILLARS = 4;
function StrategySummary({ data }: { data: AnalysisResult["content_strategy"] }) {
  if (!data?.pillars?.length) return <p className="text-sm text-foreground line-clamp-4">{data?.editorial_line || data?.creative_twist}</p>;
  return (
    <div>
      <p className="text-xs font-semibold text-bordeaux mb-1">Tes piliers</p>
      <ul className="text-sm text-foreground space-y-0.5">
        {data.pillars.slice(0, MAX_PILLARS).map((p, i) => <li key={i} className="line-clamp-1">• {p}</li>)}
      </ul>
      {data.pillars.length > MAX_PILLARS && <p className="text-xs text-muted-foreground mt-1">Et {data.pillars.length - MAX_PILLARS} autre{data.pillars.length - MAX_PILLARS > 1 ? "s" : ""}.</p>}
    </div>
  );
}

const MAX_OFFERS = 4;
function OffersSummary({ data, existingOfferNames }: { data: AnalysisResult["offers"]; existingOfferNames?: string[] }) {
  const offers = data?.offers || [];
  const clashes = offerClashes(offers, existingOfferNames);
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {offers.slice(0, MAX_OFFERS).map((o, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground line-clamp-1">{o.name || "Offre"}</span>
            {o.price && <span className="font-semibold text-primary shrink-0">{o.price}</span>}
          </li>
        ))}
      </ul>
      {offers.length > MAX_OFFERS && <p className="text-xs text-muted-foreground">Et {offers.length - MAX_OFFERS} autre{offers.length - MAX_OFFERS > 1 ? "s" : ""}.</p>}
      {/* Un vrai doublon reste visible sans ouvrir le détail : il bloque l'enregistrement de l'offre. */}
      {clashes.length > 0 && (
        <p className="text-xs text-warning">{clashes.map((n) => `« ${n} »`).join(", ")} {clashes.length > 1 ? "existent" : "existe"} déjà dans Mes offres : ouvre le détail pour {clashes.length > 1 ? "les" : "la"} renommer ou {clashes.length > 1 ? "les" : "la"} retirer.</p>
      )}
    </div>
  );
}

function CharterSummary({ data }: { data: AnalysisResult["charter"] }) {
  const colors = CHARTER_COLOR_SLOTS.map((s) => data?.[s.key]).filter((c): c is string => !!c);
  const fonts = [data?.font_title, data?.font_body].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2">
      {colors.length > 0 && (
        <div className="flex items-center gap-2">
          {colors.map((c, i) => <span key={i} className="w-7 h-7 rounded-[8px] border border-border shadow-sm" style={{ backgroundColor: c }} />)}
          {/* Même honnêteté que le détail : une palette proposée ne passe pas pour une lecture du site. */}
          {data?.confidence !== "high" && <span className="text-xs text-muted-foreground">Couleurs proposées</span>}
        </div>
      )}
      {fonts && <p className="text-sm text-foreground line-clamp-1">Polices : {fonts}</p>}
      {!colors.length && !fonts && data?.mood_keywords?.length ? <div className="flex flex-wrap gap-1.5">{data.mood_keywords.slice(0, 3).map((k, i) => <Chip key={i}>{k}</Chip>)}</div> : null}
    </div>
  );
}

/** Le résumé, et s'il cache quelque chose (sinon pas de « Voir le détail »). */
export function sectionSummary(key: SectionKey, a: AnalysisResult, existingOfferNames?: string[]): { node: React.ReactNode; hasMore: boolean } {
  switch (key) {
    case "story": {
      const d = a.story;
      return { node: <StorySummary data={d} />, hasMore: d?.full_story ? d.full_story.length > 280 || count(d, ["origin", "trigger", "struggles", "uniqueness", "vision"]) > 0 : count(d) > 0 };
    }
    case "persona":
      return { node: <PersonaSummary data={a.persona} />, hasMore: count(a.persona, ["goals", "desires", "channels", "brands_they_follow", "beautiful_world", "first_actions"]) > 0 || (a.persona?.frustrations?.length || 0) > 3 || (!!a.persona?.description && count(a.persona, ["name", "job", "age_range"]) > 0) };
    case "value_proposition":
      return { node: <ValuePropSummary data={a.value_proposition} />, hasMore: count(a.value_proposition) > 1 };
    case "tone_style":
      return { node: <ToneSummary data={a.tone_style} />, hasMore: count(a.tone_style, ["voice_description", "tone_keywords"]) < count(a.tone_style) || (a.tone_style?.tone_keywords?.length || 0) > 3 };
    case "content_strategy":
      return { node: <StrategySummary data={a.content_strategy} />, hasMore: count(a.content_strategy) > 1 || (a.content_strategy?.pillars?.length || 0) > MAX_PILLARS };
    case "offers":
      // Toujours un détail : c'est là qu'on corrige ou retire une offre.
      return { node: <OffersSummary data={a.offers} existingOfferNames={existingOfferNames} />, hasMore: true };
    case "charter":
      // Toujours un détail : c'est là qu'on corrige les couleurs et le logo.
      return { node: <CharterSummary data={a.charter} />, hasMore: true };
  }
}

/** Résumé replié par défaut ; « Voir le détail » déplie la section entière. */
export function FoldableSection({ summary, hasMore, full }: { summary: React.ReactNode; hasMore: boolean; full: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!hasMore) return <>{summary}</>;
  return (
    <div>
      {open ? full : summary}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline">
        {open ? <>Replier <ChevronUp className="h-4 w-4" /></> : <>Voir le détail <ChevronDown className="h-4 w-4" /></>}
      </button>
    </div>
  );
}

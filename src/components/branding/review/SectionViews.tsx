import type { AnalysisResult, SectionKey } from "./types";
import { channelLabel } from "@/lib/channel-labels";
import { formatLabel } from "@/lib/idea-state";
import { Chip } from "./ReviewBits";
import { OffersSection } from "./OffersSection";
import { CharterSection } from "./CharterSection";

// ─── Section Renderers ───────────────────────────────────────
export function StorySection({ data }: { data: AnalysisResult["story"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.full_story && <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{data.full_story}</p>}
      {!data.full_story && (
        <div className="space-y-2 text-sm text-foreground">
          {data.origin && <p><span className="font-semibold text-bordeaux">Origine :</span> {data.origin}</p>}
          {data.trigger && <p><span className="font-semibold text-bordeaux">Déclic :</span> {data.trigger}</p>}
          {data.struggles && <p><span className="font-semibold text-bordeaux">Épreuves :</span> {data.struggles}</p>}
          {data.uniqueness && <p><span className="font-semibold text-bordeaux">Ce qui te rend unique :</span> {data.uniqueness}</p>}
          {data.vision && <p><span className="font-semibold text-bordeaux">Vision :</span> {data.vision}</p>}
        </div>
      )}
    </div>
  );
}

export function PersonaSection({ data }: { data: AnalysisResult["persona"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {data.name && <span className="font-body text-base">{data.name}</span>}
        {data.age_range && <Chip>{data.age_range} ans</Chip>}
        {data.job && <Chip>{data.job}</Chip>}
      </div>
      {data.goals?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Objectifs</p><div className="flex flex-wrap gap-1.5">{data.goals.map((g, i) => <Chip key={i}>{g}</Chip>)}</div></div> : null}
      {data.frustrations?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Frustrations</p><div className="flex flex-wrap gap-1.5">{data.frustrations.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.desires?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Désirs</p><div className="flex flex-wrap gap-1.5">{data.desires.map((d, i) => <Chip key={i}>{d}</Chip>)}</div></div> : null}
      {data.channels?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Canaux</p><div className="flex flex-wrap gap-1.5">{data.channels.map((c, i) => <Chip key={i}>{channelLabel(c)}</Chip>)}</div></div> : null}
    </div>
  );
}

export function ValuePropSection({ data }: { data: AnalysisResult["value_proposition"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.key_phrase && <p className="font-display text-lg text-foreground leading-snug">{data.key_phrase}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        {data.problem && <div className="p-3 rounded-[12px] bg-rose-pale"><p className="font-semibold text-bordeaux mb-1">Problème</p><p className="text-foreground">{data.problem}</p></div>}
        {data.solution && <div className="p-3 rounded-[12px] bg-success-bg"><p className="font-semibold text-success mb-1">Solution</p><p className="text-foreground">{data.solution}</p></div>}
        {data.differentiator && <div className="p-3 rounded-[12px] bg-warning-bg"><p className="font-semibold text-warning mb-1">Différenciateur</p><p className="text-foreground">{data.differentiator}</p></div>}
      </div>
      {data.proofs?.length ? <div className="flex flex-wrap gap-1.5">{data.proofs.map((p, i) => <Chip key={i}>{p}</Chip>)}</div> : null}
    </div>
  );
}

export function ToneSection({ data }: { data: AnalysisResult["tone_style"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.voice_description && <p className="text-sm leading-relaxed text-foreground italic bg-muted/30 rounded-[12px] p-3">{data.voice_description}</p>}
      {data.tone_keywords?.length ? <div className="flex flex-wrap gap-1.5">{data.tone_keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}</div> : null}
      {(data.tone_register || data.tone_level || data.tone_style_chip || data.tone_humor || data.tone_engagement) && (
        <div className="flex flex-wrap gap-1.5">
          {data.tone_register && <Chip>{data.tone_register}</Chip>}
          {data.tone_level && <Chip>{data.tone_level}</Chip>}
          {data.tone_style_chip && <Chip>{data.tone_style_chip}</Chip>}
          {data.tone_humor && <Chip>{data.tone_humor}</Chip>}
          {data.tone_engagement && <Chip>{data.tone_engagement}</Chip>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {data.i_do?.length ? <div className="p-3 rounded-[12px] bg-success-bg"><p className="font-semibold text-success mb-2">✅ Je fais</p><ul className="space-y-1">{data.i_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
        {data.i_never_do?.length ? <div className="p-3 rounded-[12px] bg-rose-pale"><p className="font-semibold text-bordeaux mb-2">🚫 Je ne fais jamais</p><ul className="space-y-1">{data.i_never_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
      </div>
      {data.fights?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Combats</p><div className="flex flex-wrap gap-1.5">{data.fights.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.key_expressions && <p className="text-sm"><span className="font-semibold text-bordeaux">Expressions clés :</span> {data.key_expressions}</p>}
      {data.channels?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Canaux</p><div className="flex flex-wrap gap-1.5">{data.channels.map((c, i) => <Chip key={i}>{channelLabel(c)}</Chip>)}</div></div> : null}
      {data.visual_style && <p className="text-sm text-muted-foreground italic">{data.visual_style}</p>}
    </div>
  );
}

export function StrategySection({ data }: { data: AnalysisResult["content_strategy"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.pillars?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Piliers</p><div className="flex flex-wrap gap-1.5">{data.pillars.map((p, i) => <Chip key={i}>{p}</Chip>)}</div></div> : null}
      {data.creative_twist && <p className="text-sm"><span className="font-semibold text-bordeaux">Angle créatif :</span> {data.creative_twist}</p>}
      {data.formats?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Formats</p><div className="flex flex-wrap gap-1.5">{data.formats.map((f, i) => <Chip key={i}>{formatLabel(f)}</Chip>)}</div></div> : null}
      {data.rhythm && <p className="text-sm text-muted-foreground">{data.rhythm}</p>}
      {data.editorial_line && <p className="text-sm"><span className="font-semibold text-bordeaux">Ligne éditoriale :</span> {data.editorial_line}</p>}
    </div>
  );
}

export const RENDERERS: Record<SectionKey, (analysis: AnalysisResult) => React.ReactNode> = {
  story: (a) => <StorySection data={a.story} />, persona: (a) => <PersonaSection data={a.persona} />, value_proposition: (a) => <ValuePropSection data={a.value_proposition} />, tone_style: (a) => <ToneSection data={a.tone_style} />, content_strategy: (a) => <StrategySection data={a.content_strategy} />, offers: (a) => <OffersSection data={a.offers} />, charter: (a) => <CharterSection data={a.charter} />,
};

export function sectionHasData(key: SectionKey, analysis: AnalysisResult): boolean {
  const d = analysis[key];
  if (!d) return false;
  const { confidence, ...rest } = d as any;
  return Object.values(rest).some((v) => v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0));
}

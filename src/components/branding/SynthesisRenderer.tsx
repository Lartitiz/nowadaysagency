import { useState, useEffect, useRef } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, Copy, Sparkles, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import EditableText from "@/components/EditableText";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type Section = "story" | "persona" | "value_proposition" | "tone_style" | "content_strategy";

interface SynthesisRendererProps {
  section: Section;
  data: Record<string, any>;
  table: string;
  onSynthesisGenerated?: () => void;
  lastCoachingUpdate?: string | null;
}

/* ── Helpers ── */
function parseToArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (typeof val === "string") {
    return val.split(/[\n•\-]/).map(s => s.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

function safeJson(val: any): any {
  if (!val) return null;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return null; }
}

/* ── Sub-components ── */
function SynthCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-sm p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ emoji, title }: { emoji: string; title: string }) {
  return (
    <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground flex items-center gap-1.5">
      <span>{emoji}</span> {title}
    </p>
  );
}

function HeroQuote({ text, label, onCopy }: { text: string; label?: string; onCopy?: () => void }) {
  return (
    <div className="rounded-xl p-5 sm:p-6 bg-[#FFF4F8] border border-[#ffa7c6]/30">
      <p className="font-display text-base sm:text-lg font-bold text-foreground italic text-center leading-relaxed">"{text}"</p>
      {(label || onCopy) && (
        <div className="flex items-center justify-between mt-3">
          {label && <span className="font-mono-ui text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>}
          {onCopy && (
            <button onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity">
              <Copy className="h-3 w-3" /> Copier
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditableList({ items, onSave, bulletColor = "#fb3d80" }: { items: string[]; onSave: (i: number, v: string) => Promise<void>; bulletColor?: string }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-1.5 text-[8px] shrink-0" style={{ color: bulletColor }}>●</span>
          <EditableText value={item} onSave={(v) => onSave(i, v)} type="input" className="font-body text-[13px] leading-relaxed" />
        </div>
      ))}
    </div>
  );
}

function TimelineCard({ emoji, label, text, color, onSave }: { emoji: string; label: string; text: string; color: string; onSave: (v: string) => Promise<void> }) {
  return (
    <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: color }}>
      <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground">{emoji} {label}</p>
      <EditableText value={text} onSave={onSave} className="font-body text-[13px] leading-relaxed flex-1" />
    </div>
  );
}

function TagsList({ items, variant = "rose" }: { items: string[]; variant?: "rose" | "green" | "red" | "violet" | "gray" }) {
  if (!items?.length) return null;
  const colors: Record<string, string> = {
    rose: "bg-[#FFF4F8] text-primary border-0",
    green: "bg-emerald-50 text-emerald-700 border-0",
    red: "bg-red-50 text-red-600 border-0",
    violet: "bg-violet-50 text-violet-700 border-0",
    gray: "bg-muted text-muted-foreground border-0",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <Badge key={i} variant="secondary" className={`${colors[variant]} text-xs font-medium px-3 py-1`}>{t}</Badge>
      ))}
    </div>
  );
}

/* ── StaleWarning banner ── */
function StaleBanner({ onRegenerate, generating }: { onRegenerate: () => void; generating: boolean }) {
  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Tes réponses ont évolué depuis la dernière synthèse. On la met à jour ?</span>
      </div>
      <Button size="sm" onClick={onRegenerate} disabled={generating} className="shrink-0 gap-1.5">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Régénérer
      </Button>
    </div>
  );
}

/* ── STORYTELLING SYNTHESIS ── */
function StorySynthesis({ data, onSaveRecap, onSaveDirect, copyText }: {
  data: any; onSaveRecap: (path: string[], value: string) => Promise<void>;
  onSaveDirect: (field: string, value: string) => Promise<void>; copyText: (t: string) => void;
}) {
  const summary = safeJson(data.recap_summary);
  if (!summary) return null;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-[22px] font-bold text-foreground">👑 Mon histoire</h2>
          <Badge className="bg-primary text-primary-foreground text-[11px]">👩 {data.story_type || "Fondatrice"}</Badge>
        </div>
      </div>

      {data.pitch_short && (
        <div className="mx-6 sm:mx-8 mb-6">
          <HeroQuote text={data.pitch_short} label="Pitch court" onCopy={() => copyText(data.pitch_short)} />
        </div>
      )}

      {/* Timeline */}
      <div className="px-6 sm:px-8 mb-6">
        <SectionLabel emoji="🔀" title="Le fil rouge" />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 sm:gap-3 items-stretch">
          <TimelineCard emoji="🔵" label="AVANT" text={summary.before || ""} color="#FFF4F8" onSave={(v) => onSaveRecap(["before"], v)} />
          <div className="hidden sm:flex items-center text-muted-foreground/40 text-lg select-none">→</div>
          <TimelineCard emoji="💥" label="DÉCLIC" text={summary.trigger || ""} color="#FFF4F8" onSave={(v) => onSaveRecap(["trigger"], v)} />
          <div className="hidden sm:flex items-center text-muted-foreground/40 text-lg select-none">→</div>
          <TimelineCard emoji="🌱" label="APRÈS" text={summary.after || ""} color="#E8F5E9" onSave={(v) => onSaveRecap(["after"], v)} />
        </div>
      </div>

      <div className="mx-6 sm:mx-8 border-t border-border my-2" />

      {/* Values + Unique */}
      <div className="px-6 sm:px-8 my-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {summary.values?.length > 0 && (
          <div className="rounded-xl p-5 bg-[#FFF4F8]">
            <p className="font-display text-base font-semibold text-foreground mb-4">❤️ Mes valeurs</p>
            <EditableList items={summary.values} onSave={(i, v) => onSaveRecap(["values", String(i)], v)} />
          </div>
        )}
        {summary.unique?.length > 0 && (
          <div className="rounded-xl p-5 bg-[#FFF4F8]">
            <p className="font-display text-base font-semibold text-foreground mb-4">💪 Ce qui me rend unique</p>
            <EditableList items={summary.unique} onSave={(i, v) => onSaveRecap(["unique", String(i)], v)} />
          </div>
        )}
      </div>

      {summary.mistakes?.length > 0 && (
        <div className="px-6 sm:px-8 mb-6">
          <div className="rounded-xl p-5 bg-[#FFF8F0]">
            <p className="font-display text-base font-semibold text-foreground mb-4">⚡ Mes erreurs qui m'ont construite</p>
            <EditableList items={summary.mistakes} onSave={(i, v) => onSaveRecap(["mistakes", String(i)], v)} bulletColor="#e67e22" />
          </div>
        </div>
      )}

      {/* Pitchs */}
      {(data.pitch_medium || data.pitch_long) && (
        <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 bg-[#FFF4F8]">
          <SectionLabel emoji="🎤" title="Mes pitchs" />
          {data.pitch_medium && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono-ui text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">☕ Naturel</span>
                <button onClick={() => copyText(data.pitch_medium)} className="text-[11px] font-semibold text-primary hover:opacity-70 inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copier</button>
              </div>
              <EditableText value={data.pitch_medium} onSave={(v) => onSaveDirect("pitch_medium", v)} className="font-body text-[14px] italic leading-relaxed" />
            </div>
          )}
          {data.pitch_long && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono-ui text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🎤 Networking</span>
                <button onClick={() => copyText(data.pitch_long)} className="text-[11px] font-semibold text-primary hover:opacity-70 inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copier</button>
              </div>
              <EditableText value={data.pitch_long} onSave={(v) => onSaveDirect("pitch_long", v)} className="font-body text-[14px] italic leading-relaxed" />
            </div>
          )}
        </div>
      )}

      <div className="px-6 sm:px-8 py-4 border-t border-border">
        <p className="text-center font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">L'Assistant Com' × Nowadays Agency</p>
      </div>
    </div>
  );
}

/* ── PERSONA SYNTHESIS ── */
function PersonaSynthesis({ data, onSavePortrait }: {
  data: any; onSavePortrait: (path: string[], value: string) => Promise<void>;
}) {
  const portrait = safeJson(data.portrait);
  if (!portrait) return null;

  const displayName = data.portrait_prenom || portrait.prenom || "Ma cliente idéale";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <SynthCard>
      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-full bg-[#FFF4F8] flex items-center justify-center mb-3">
          <span className="font-display text-3xl font-bold text-primary">{initials}</span>
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">{displayName}</h2>
        {portrait.phrase_signature && (
          <EditableText value={portrait.phrase_signature} onSave={(v) => onSavePortrait(["phrase_signature"], v)} type="input" className="text-sm italic text-muted-foreground text-center max-w-[400px] mt-1" />
        )}
      </div>

      {/* Qui elle est */}
      {portrait.qui_elle_est && (
        <div className="mb-6">
          <SectionLabel emoji="👤" title="Qui elle est" />
          <div className="space-y-2">
            {Object.entries(portrait.qui_elle_est).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-sm text-muted-foreground w-28 shrink-0 capitalize">{key.replace(/_/g, " ")}</span>
                <EditableText value={String(val || "")} onSave={(v) => onSavePortrait(["qui_elle_est", key], v)} type="input" className="text-sm text-foreground" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frustrations */}
      {portrait.frustrations?.length > 0 && (
        <div className="mb-6">
          <SectionLabel emoji="😤" title="Ses frustrations" />
          <EditableList items={portrait.frustrations} onSave={(i, v) => onSavePortrait(["frustrations", String(i)], v)} />
        </div>
      )}

      {/* Objectifs */}
      {portrait.objectifs?.length > 0 && (
        <div className="mb-6">
          <SectionLabel emoji="✨" title="Ce qu'elle veut vraiment" />
          <EditableList items={portrait.objectifs} onSave={(i, v) => onSavePortrait(["objectifs", String(i)], v)} />
        </div>
      )}

      {/* Blocages */}
      {portrait.blocages?.length > 0 && (
        <div className="mb-6">
          <SectionLabel emoji="🚫" title="Ce qui la bloque" />
          <EditableList items={portrait.blocages} onSave={(i, v) => onSavePortrait(["blocages", String(i)], v)} />
        </div>
      )}

      {/* Verbatims */}
      {portrait.ses_mots?.length > 0 && (
        <div className="mb-6">
          <SectionLabel emoji="💬" title="Ce qu'elle dit" />
          <div className="space-y-1.5">
            {portrait.ses_mots.map((m: string, i: number) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-sm text-muted-foreground shrink-0">"</span>
                <EditableText value={m} onSave={(v) => onSavePortrait(["ses_mots", String(i)], v)} type="input" className="text-sm italic text-foreground" />
                <span className="text-sm text-muted-foreground shrink-0">"</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comment lui parler */}
      {portrait.comment_parler && (
        <div>
          <SectionLabel emoji="🗣️" title="Comment lui parler" />
          <div className="space-y-3">
            {portrait.comment_parler.ton && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ton</p>
                <EditableText value={portrait.comment_parler.ton} onSave={(v) => onSavePortrait(["comment_parler", "ton"], v)} type="input" className="text-sm text-foreground" />
              </div>
            )}
            {portrait.comment_parler.canal && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Canal préféré</p>
                <EditableText value={portrait.comment_parler.canal} onSave={(v) => onSavePortrait(["comment_parler", "canal"], v)} type="input" className="text-sm text-foreground" />
              </div>
            )}
            {portrait.comment_parler.convainc && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ce qui la convainc</p>
                <EditableText value={portrait.comment_parler.convainc} onSave={(v) => onSavePortrait(["comment_parler", "convainc"], v)} type="input" className="text-sm text-foreground" />
              </div>
            )}
            <div className="flex gap-4 flex-wrap">
              {portrait.ses_mots?.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">✅ Mots qui résonnent</p>
                  <TagsList items={portrait.ses_mots} variant="green" />
                </div>
              )}
              {portrait.comment_parler.fuir?.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">🚫 Mots à éviter</p>
                  <TagsList items={portrait.comment_parler.fuir} variant="red" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SynthCard>
  );
}

/* ── VALUE PROPOSITION SYNTHESIS ── */
function ValuePropSynthesis({ data, onSaveDirect }: {
  data: any; onSaveDirect: (field: string, value: string) => Promise<void>;
}) {
  const values = parseToArray(data.step_2b_values);
  const proofs = parseToArray(data.step_2c_feedback);

  return (
    <div className="space-y-6">
      {/* Hero */}
      {(data.version_final || data.version_one_liner) && (
        <HeroQuote text={data.version_final || data.version_one_liner} label="Ma proposition de valeur" onCopy={() => { navigator.clipboard.writeText(data.version_final || data.version_one_liner); toast.success("Copié !"); }} />
      )}

      <SynthCard>
        {data.step_1_what && (
          <div className="mb-5">
            <SectionLabel emoji="🎯" title="Ma mission" />
            <EditableText value={data.step_1_what} onSave={(v) => onSaveDirect("step_1_what", v)} className="text-sm text-foreground" />
          </div>
        )}

        {data.step_2a_process && (
          <div className="mb-5">
            <SectionLabel emoji="💎" title="Ce qui me rend unique" />
            <EditableText value={data.step_2a_process} onSave={(v) => onSaveDirect("step_2a_process", v)} className="text-sm text-foreground" />
          </div>
        )}

        {values.length > 0 && (
          <div className="mb-5">
            <SectionLabel emoji="❤️" title="Mes valeurs" />
            <TagsList items={values} variant="rose" />
          </div>
        )}

        {/* Problem + Solution */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {data.step_3_for_whom && (
            <div className="rounded-xl p-4 bg-[#FFF4F8]">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Le problème que je résous</p>
              <EditableText value={data.step_3_for_whom} onSave={(v) => onSaveDirect("step_3_for_whom", v)} className="text-sm text-foreground" />
            </div>
          )}
          {data.step_2d_refuse && (
            <div className="rounded-xl p-4 bg-[#E8F5E9]">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Ma solution</p>
              <EditableText value={data.step_2d_refuse} onSave={(v) => onSaveDirect("step_2d_refuse", v)} className="text-sm text-foreground" />
            </div>
          )}
        </div>

        {proofs.length > 0 && (
          <div>
            <SectionLabel emoji="🏆" title="Mes preuves" />
            <EditableList items={proofs} onSave={async (i, v) => { /* proofs are concatenated, skip individual save */ }} />
          </div>
        )}
      </SynthCard>
    </div>
  );
}

/* ── TONE & STYLE SYNTHESIS ── */
function ToneStyleSynthesis({ data, onSaveDirect }: {
  data: any; onSaveDirect: (field: string, value: string) => Promise<void>;
}) {
  const toneTags = [data.tone_register, data.tone_style, data.tone_level, data.tone_humor, data.tone_engagement].filter(Boolean);
  const doList = parseToArray(data.key_expressions);
  const dontList = parseToArray(data.things_to_avoid);
  const recap = safeJson(data.recap_summary);
  const fightsList = parseToArray(data.combat_fights);
  const refusalsList = parseToArray(data.combat_refusals);

  return (
    <div className="space-y-6">
      {/* Hero — Voice description */}
      {data.voice_description && (
        <div className="rounded-xl p-6 sm:p-8 bg-[#FFF4F8] border border-[#ffa7c6]/30">
          <p className="font-display text-lg sm:text-xl italic text-foreground leading-relaxed text-center">
            "{data.voice_description}"
          </p>
          <p className="font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground text-center mt-3">
            🗣️ Comment je parle
          </p>
        </div>
      )}

      {/* Tone tags */}
      {toneTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {toneTags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="bg-[#FFF4F8] text-primary border-0 text-xs font-medium px-4 py-1.5 rounded-full">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Combats — 3 cards grid */}
      {(data.combat_cause || fightsList.length > 0 || refusalsList.length > 0) && (
        <div>
          <SectionLabel emoji="⚔️" title="Mes combats" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.combat_cause && (
              <div className="rounded-xl p-4 bg-[#FFF4F8] border-l-4 border-l-primary">
                <p className="font-display text-sm font-bold text-foreground mb-2">✊ Ma cause</p>
                <EditableText value={data.combat_cause} onSave={(v) => onSaveDirect("combat_cause", v)} className="text-[13px] text-foreground/80 leading-relaxed" />
              </div>
            )}
            {fightsList.length > 0 && (
              <div className="rounded-xl p-4 bg-[#E8F5E9] border-l-4 border-l-emerald-500">
                <p className="font-display text-sm font-bold text-foreground mb-2">🛡️ Ce que je défends</p>
                <EditableList items={fightsList} onSave={async () => {}} bulletColor="#2E7D32" />
              </div>
            )}
            {refusalsList.length > 0 && (
              <div className="rounded-xl p-4 bg-[#FFF3E0] border-l-4 border-l-orange-400">
                <p className="font-display text-sm font-bold text-foreground mb-2">🚫 Ce que je refuse</p>
                <EditableList items={refusalsList} onSave={async () => {}} bulletColor="#e65100" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Do / Don't */}
      {(doList.length > 0 || dontList.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {doList.length > 0 && (
            <SynthCard>
              <p className="font-display text-base font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <span className="text-lg">✅</span> Mes expressions clés
              </p>
              <EditableList items={doList} onSave={async () => {}} bulletColor="#2E7D32" />
            </SynthCard>
          )}
          {dontList.length > 0 && (
            <SynthCard>
              <p className="font-display text-base font-bold text-red-600 mb-4 flex items-center gap-2">
                <span className="text-lg">❌</span> Ce que j'évite toujours
              </p>
              <EditableList items={dontList} onSave={async () => {}} bulletColor="#e53935" />
            </SynthCard>
          )}
        </div>
      )}

      {/* Recap summary — accordion instead of raw block */}
      {recap && typeof recap === "object" && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="recap" className="border rounded-xl overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline">
              <span className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Voir la synthèse complète
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              {typeof recap === "string" ? (
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{recap}</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(recap).map(([key, val]) => {
                    if (!val) return null;
                    const label = key.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
                    return (
                      <div key={key}>
                        <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                          {typeof val === "string" ? val : JSON.stringify(val, null, 2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

/* ── STRATEGY SYNTHESIS ── */
function ExpandableText({ text, lines = 3 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <p className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-line ${expanded ? "" : `line-clamp-${lines}`}`}>
        {text}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-semibold text-primary mt-1.5 hover:opacity-70 transition-opacity"
      >
        {expanded ? "Réduire" : "Lire la suite →"}
      </button>
    </div>
  );
}

function StrategySynthesis({ data, onSaveRecap }: {
  data: any; onSaveRecap: (path: string[], value: string) => Promise<void>;
}) {
  const summary = safeJson(data.recap_summary);
  const facets = [data.facet_1, data.facet_2, data.facet_3].filter(Boolean);
  const directPillars = [
    { name: data.pillar_major, type: "major" },
    { name: data.pillar_minor_1, type: "minor" },
    { name: data.pillar_minor_2, type: "minor" },
    { name: data.pillar_minor_3, type: "minor" },
  ].filter(p => p.name);

  return (
    <div className="space-y-6">
      {/* Creative concept — hero card */}
      {(summary?.concept_short || data.creative_concept) && (
        <div
          className="rounded-xl border-l-4 p-6 sm:p-8"
          style={{
            borderLeftColor: "#fb3d80",
            background: "linear-gradient(135deg, #FFF4F8 0%, #ffffff 100%)",
          }}
        >
          <SectionLabel emoji="💡" title="Mon concept créatif" />
          <p className="font-display text-xl font-bold text-foreground leading-snug">
            {summary?.concept_short || data.creative_concept}
          </p>
          {summary?.concept_full && (
            <div className="mt-3">
              <ExpandableText text={summary.concept_full} lines={3} />
            </div>
          )}
        </div>
      )}

      {/* Pillars */}
      {(summary?.pillars?.length > 0 || directPillars.length > 0) && (
        <div>
          <SectionLabel emoji="🏛️" title="Mes piliers de contenu" />
          {summary?.pillars ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.pillars.map((p: any, i: number) => (
                <div key={i} className="rounded-xl border border-border p-4 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-display text-sm font-bold text-foreground">{p.name}</p>
                    {p.percentage != null && (
                      <Badge variant={p.type === "major" ? "default" : "secondary"} className="text-[10px]">
                        {p.percentage}%
                      </Badge>
                    )}
                  </div>
                  {p.percentage != null && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${p.percentage}%` }} />
                    </div>
                  )}
                  {p.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                  )}
                  {p.content_ideas?.length > 0 && (
                    <ul className="space-y-1 mt-2">
                      {p.content_ideas.map((idea: string, j: number) => (
                        <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-[8px] text-primary mt-1">●</span> {idea}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {directPillars.map((p, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 border border-border"
                  style={{
                    backgroundColor: p.type === "major" ? "#FFF4F8" : "#FAFAFA",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={p.type === "major" ? "default" : "secondary"} className="text-[10px]">
                      {p.type === "major" ? "🔥 Majeur" : "🌱 Mineur"}
                    </Badge>
                  </div>
                  <p className="font-display text-sm font-bold text-foreground">{p.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Facets as horizontal tags */}
      {(summary?.facets?.length > 0 || facets.length > 0) && (
        <div>
          <SectionLabel emoji="🎭" title="Mes facettes" />
          <div className="flex flex-wrap gap-2">
            {(summary?.facets || facets).map((f: string, i: number) => (
              <Badge key={i} variant="secondary" className="bg-violet-50 text-violet-700 border-0 text-xs font-medium px-4 py-1.5 rounded-full">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Content mix */}
      {summary?.content_mix && (
        <SynthCard>
          <SectionLabel emoji="📊" title="Mon mix de contenu" />
          {["visibility", "trust", "sales"].map((key) => {
            const val = summary.content_mix[key];
            if (val == null) return null;
            const labels: Record<string, { label: string; color: string; emoji: string }> = {
              visibility: { label: "Visibilité", color: "bg-blue-400", emoji: "👀" },
              trust: { label: "Confiance", color: "bg-amber-400", emoji: "🤝" },
              sales: { label: "Vente", color: "bg-emerald-500", emoji: "💰" },
            };
            const c = labels[key];
            const pct = Math.round((val / 10) * 100);
            return (
              <div key={key} className="flex items-center gap-3 mb-2">
                <span className="text-sm w-24 shrink-0">{c.emoji} {c.label}</span>
                <div className="h-2 bg-muted rounded-full flex-1 overflow-hidden">
                  <div className={`h-full ${c.color} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{val}/10</span>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground mt-3 italic">Sur 10 posts : {summary.content_mix.visibility || 0} visibilité, {summary.content_mix.trust || 0} confiance, {summary.content_mix.sales || 0} vente</p>
        </SynthCard>
      )}

      {/* Creative gestures — accordion */}
      {summary?.creative_gestures?.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="gestures" className="border rounded-xl overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline">
              <span className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                📖 Voir l'analyse complète
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-2">
                {summary.creative_gestures.map((g: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="font-display text-sm font-bold text-primary shrink-0">{i + 1}.</span>
                    <p className="text-sm text-foreground">{g}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Recap summary raw text — accordion fallback when no structured gestures */}
      {!summary?.creative_gestures?.length && typeof data.recap_summary === "string" && data.recap_summary.length > 200 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="recap-raw" className="border rounded-xl overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline">
              <span className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> 📖 Voir le texte complet
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{data.recap_summary}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

/* ── MAIN COMPONENT ── */
export default function SynthesisRenderer({ section, data, table, onSynthesisGenerated, lastCoachingUpdate }: SynthesisRendererProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const [generating, setGenerating] = useState(false);
  const [localData, setLocalData] = useState(data);
  const [isStale, setIsStale] = useState(false);
  const synthRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setLocalData(data); }, [data]);

  // Check if stale (coaching updated after recap)
  useEffect(() => {
    if (!lastCoachingUpdate) return;
    const recapUpdated = localData?.recap_summary_updated_at || localData?.updated_at;
    if (recapUpdated && new Date(lastCoachingUpdate) > new Date(recapUpdated)) {
      setIsStale(true);
    }
  }, [lastCoachingUpdate, localData]);

  const hasRecap = section === "story" ? !!safeJson(localData?.recap_summary) :
    section === "persona" ? !!safeJson(localData?.portrait) :
    section === "content_strategy" ? !!(safeJson(localData?.recap_summary) || localData?.pillar_major) :
    section === "value_proposition" ? !!(localData?.version_final || localData?.version_one_liner || localData?.step_1_what) :
    section === "tone_style" ? !!(localData?.tone_register || localData?.voice_description || localData?.combat_cause) :
    false;

  const canGenerate = section === "story" ? !!(localData?.step_7_polished || localData?.imported_text || localData?.step_6_full_story) :
    section === "persona" ? !!(localData?.step_1_frustrations && localData?.step_2_transformation) :
    section === "content_strategy" ? !!(localData?.pillar_major || localData?.step_1_hidden_facets) :
    false;

  const generateSynthesis = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      if (section === "story") {
        const story = localData.step_7_polished || localData.imported_text || localData.step_6_full_story || "";
        const profile = { ...(profileData || {}), ...(brandProfileData || {}) };
        const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
          body: { type: "generate-recap", storytelling: story, profile },
        });
        if (error) throw error;
        const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(raw);
        await supabase.from("storytelling").update({ recap_summary: parsed } as any).eq("id", localData.id);
        setLocalData({ ...localData, recap_summary: parsed });
      } else if (section === "persona") {
        const profile = { ...(profileData || {}), ...(brandProfileData || {}) };
        const { data: fnData, error } = await supabase.functions.invoke("persona-ai", {
          body: { type: "portrait", profile, persona: localData },
        });
        if (error) throw error;
        const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(raw);
        await supabase.from("persona").update({ portrait: parsed as any, portrait_prenom: parsed.prenom }).eq("id", localData.id);
        setLocalData({ ...localData, portrait: parsed, portrait_prenom: parsed.prenom });
      } else if (section === "content_strategy") {
        const profile = { ...(profileData || {}), ...(brandProfileData || {}) };
        const { data: personaData } = await (supabase.from("persona") as any).select("step_1_frustrations, step_2_transformation").eq(column, value).maybeSingle();
        const { data: propositionData } = await (supabase.from("brand_proposition") as any).select("version_final, version_bio").eq(column, value).maybeSingle();
        const { data: editorialData } = await (supabase.from("instagram_editorial_line") as any).select("*").eq(column, value).maybeSingle();
        const { data: fnData, error } = await supabase.functions.invoke("strategy-ai", {
          body: { type: "generate-recap", strategy_data: localData, profile, persona: personaData, proposition: propositionData, tone: brandProfileData, editorial_line: editorialData },
        });
        if (error) throw error;
        const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(raw);
        await supabase.from("brand_strategy").update({ recap_summary: parsed } as any).eq("id", localData.id);
        setLocalData({ ...localData, recap_summary: parsed });
      }
      setIsStale(false);
      toast.success("Synthèse générée !");
      onSynthesisGenerated?.();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la génération");
    }
    setGenerating(false);
  };

  const saveRecapField = async (path: string[], value: string) => {
    if (!localData?.id) return;
    const recapKey = section === "persona" ? "portrait" : "recap_summary";
    const recap = JSON.parse(JSON.stringify(safeJson(localData[recapKey]) || {}));
    let obj = recap;
    for (let i = 0; i < path.length - 1; i++) {
      if (Array.isArray(obj) && !isNaN(Number(path[i]))) obj = obj[Number(path[i])];
      else obj = obj[path[i]];
    }
    const lastKey = path[path.length - 1];
    if (Array.isArray(obj) && !isNaN(Number(lastKey))) obj[Number(lastKey)] = value;
    else obj[lastKey] = value;
    await (supabase.from(table as any) as any).update({ [recapKey]: recap }).eq("id", localData.id);
    setLocalData({ ...localData, [recapKey]: recap });
  };

  const saveDirectField = async (field: string, value: string) => {
    if (!localData?.id) return;
    await (supabase.from(table as any) as any).update({ [field]: value }).eq("id", localData.id);
    setLocalData({ ...localData, [field]: value });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const exportPDF = async () => {
    if (!synthRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(synthRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save(`synthese-${section}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF téléchargé !");
    } catch {
      toast.error("Erreur lors de l'export");
    }
    setExporting(false);
  };

  // Empty state
  if (!hasRecap) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center">
        <Sparkles className="h-10 w-10 text-primary/40 mx-auto mb-4" />
        <h3 className="font-display text-lg font-bold text-foreground mb-2">Ta fiche synthèse n'existe pas encore</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          {canGenerate
            ? "L'IA va analyser tes réponses pour créer une belle fiche synthétique one-pager."
            : "Commence d'abord le coaching pour remplir tes données, puis reviens générer ta synthèse."}
        </p>
        {canGenerate && (
          <Button onClick={generateSynthesis} disabled={generating} className="rounded-full gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            ✨ Générer ma fiche synthèse
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={generateSynthesis} disabled={generating} className="gap-1.5 text-xs">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Régénérer
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { if (synthRef.current) { navigator.clipboard.writeText(synthRef.current.innerText); toast.success("Copié !"); } }} className="gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" /> Copier
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting} className="gap-1.5 text-xs">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </Button>
        </div>
      </div>

      {isStale && <StaleBanner onRegenerate={generateSynthesis} generating={generating} />}

      <div ref={synthRef}>
        {section === "story" && <StorySynthesis data={localData} onSaveRecap={saveRecapField} onSaveDirect={saveDirectField} copyText={copyText} />}
        {section === "persona" && <PersonaSynthesis data={localData} onSavePortrait={saveRecapField} />}
        {section === "value_proposition" && <ValuePropSynthesis data={localData} onSaveDirect={saveDirectField} />}
        {section === "tone_style" && <ToneStyleSynthesis data={localData} onSaveDirect={saveDirectField} />}
        {section === "content_strategy" && <StrategySynthesis data={localData} onSaveRecap={saveRecapField} />}
      </div>
    </div>
  );
}

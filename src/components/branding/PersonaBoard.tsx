import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { parseToArray } from "@/lib/branding-utils";

/* ── Types ────────────────────────────────────── */

interface MotivationItem { label: string; level: number }
interface ChannelItem { name: string; level: number }
interface DailyItem { time: string; activity: string }

interface PersonaBoardProps {
  data: Record<string, any>;
  table: string;
  onUpdated?: (field: string, value: string, oldValue?: string) => void;
  onStartCoaching?: () => void;
}

/* ── Demo data ────────────────────────────────── */

const DEMO_PERSONA = {
  portrait_prenom: "Sophie",
  quote: "Je sais que j'ai besoin de photos pro, mais je repousse toujours parce que je ne me trouve pas photogénique.",
  demographics: {
    age: "30-45 ans",
    situation: "Entrepreneure solo depuis 1-3 ans",
    location: "France, zones urbaines",
    income: "25-50k€/an",
    status: "En couple, souvent 1 enfant",
    profession: "Entrepreneure créative",
  },
  motivations: [
    { label: "Se sentir confiante", level: 9 },
    { label: "Être visible en ligne", level: 7 },
    { label: "Avoir une image pro", level: 6 },
    { label: "Augmenter ses ventes", level: 4 },
  ],
  frustrations_detail: [
    "Ne se trouve pas photogénique",
    "Reporte toujours les photos pro",
    "Passe trop de temps sur les réseaux sans résultat",
    "Se compare aux autres entrepreneures",
  ],
  desires: [
    "Se montrer telle qu'elle est",
    "Avoir des images qui lui ressemblent",
    "Ne plus stresser sur sa com'",
    "Se sentir légitime dans son activité",
  ],
  objections: [
    "C'est trop cher",
    "Je ne suis pas photogénique",
    "Je ferai ça quand j'aurai plus de clients",
  ],
  buying_triggers: [
    "Lancement d'activité",
    "Refonte de site web",
    "Voir le résultat d'une autre cliente",
    "Offre limitée / événement",
  ],
  persona_channels: [
    { name: "Instagram", level: 9 },
    { name: "Pinterest", level: 6 },
    { name: "Podcasts", level: 4 },
    { name: "YouTube", level: 3 },
  ],
  brands: ["Sézane", "Respire", "Canva", "Shine", "Rouje", "Typology"],
  daily_life: [
    { time: "7h", activity: "Se lève, café, scroll Instagram" },
    { time: "9h", activity: "Travaille sur ses projets clients" },
    { time: "12h", activity: "Pause, stories en cuisinant" },
    { time: "14h", activity: "Administratif, devis, mails" },
    { time: "16h", activity: "Cherche des idées de contenu" },
    { time: "18h", activity: "Famille, déconnexion" },
    { time: "21h", activity: "Scroll Pinterest, inspiration" },
  ],
  // Legacy fields for completion calc
  step_1_frustrations: "filled",
  step_2_transformation: "filled",
  step_3a_objections: "filled",
  step_4_feeling: "filled",
};

/* ── Helpers ───────────────────────────────────── */

function ensureArray<T>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
    return parseToArray(val) as any;
  }
  return [];
}

function ensureObj(val: any): Record<string, any> {
  if (!val) return {};
  if (typeof val === "object" && !Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch {}
  }
  return {};
}

/* ── Save helper ──────────────────────────────── */

function useSave(table: string, onUpdated?: PersonaBoardProps["onUpdated"]) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();

  const save = async (field: string, value: any) => {
    if (isDemoMode) {
      onUpdated?.(field, typeof value === "string" ? value : JSON.stringify(value));
      return;
    }
    if (!user) return;
    const { error } = await (supabase.from(table as any) as any)
      .update({ [field]: value })
      .eq(column, value);
    if (error) { toast.error("Erreur de sauvegarde"); return; }
    toast.success("Sauvegardé");
    onUpdated?.(field, typeof value === "string" ? value : JSON.stringify(value));
  };

  return save;
}

/* ── Inline Editable Text ─────────────────────── */

function InlineText({ value, field, save, placeholder, multiline }: {
  value: string; field: string; save: (f: string, v: any) => Promise<void>;
  placeholder?: string; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const commit = async () => {
    setEditing(false);
    if (draft !== (value || "")) await save(field, draft);
  };

  if (editing) {
    const cls = "w-full text-sm bg-transparent border border-primary/30 rounded-lg px-2 py-1 focus:outline-none focus:border-primary";
    return multiline ? (
      <textarea className={cls + " min-h-[60px] resize-none"} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} autoFocus />
    ) : (
      <input className={cls} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} autoFocus />
    );
  }

  return (
    <div className="group/edit cursor-pointer flex items-start gap-1" onClick={() => { setDraft(value || ""); setEditing(true); }}>
      <span className={`text-sm ${value ? "text-foreground" : "text-muted-foreground italic"}`}>
        {value || placeholder || "—"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity mt-0.5 shrink-0" />
    </div>
  );
}

/* ── Editable list (frustrations, desires, etc) ── */

function EditableList({ items, field, save, bulletColor }: {
  items: string[]; field: string; save: (f: string, v: any) => Promise<void>;
  bulletColor: string;
}) {
  const [list, setList] = useState<string[]>(items);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");

  const remove = async (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    setList(next);
    await save(field, next);
  };

  const add = async () => {
    if (!newItem.trim()) return;
    const next = [...list, newItem.trim()];
    setList(next);
    setNewItem("");
    setAdding(false);
    await save(field, next);
  };

  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <div key={i} className="flex items-start gap-2 group/item">
          <span className={`mt-1.5 text-[8px] ${bulletColor}`}>●</span>
          <span className="text-sm text-foreground flex-1">{item}</span>
          <button onClick={() => remove(i)} className="opacity-0 group-hover/item:opacity-100 transition-opacity">
            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex gap-2 items-center">
          <input className="flex-1 text-sm border border-primary/30 rounded-lg px-2 py-1 focus:outline-none" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} autoFocus />
          <button onClick={add}><Check className="h-4 w-4 text-primary" /></button>
          <button onClick={() => setAdding(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 mt-1">
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      )}
    </div>
  );
}

/* ── Editable tags (objections, triggers, brands) ── */

function EditableTags({ items, field, save, className: tagCls }: {
  items: string[]; field: string; save: (f: string, v: any) => Promise<void>;
  className: string;
}) {
  const [list, setList] = useState<string[]>(items);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");

  const remove = async (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    setList(next);
    await save(field, next);
  };

  const add = async () => {
    if (!newItem.trim()) return;
    const next = [...list, newItem.trim()];
    setList(next);
    setNewItem("");
    setAdding(false);
    await save(field, next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((item, i) => (
        <div key={i} className={`${tagCls} group/tag relative`}>
          {item}
          <button onClick={() => remove(i)} className="absolute -top-1 -right-1 bg-card rounded-full opacity-0 group-hover/tag:opacity-100 transition-opacity">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex gap-1 items-center">
          <input className="text-xs border border-primary/30 rounded-full px-2.5 py-1 w-32 focus:outline-none" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} autoFocus />
          <button onClick={add}><Check className="h-3.5 w-3.5 text-primary" /></button>
          <button onClick={() => setAdding(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs border border-dashed border-muted-foreground/30 text-muted-foreground px-2.5 py-1 rounded-full hover:border-primary hover:text-primary transition-colors flex items-center gap-1">
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ── Bar with editable slider ─────────────────── */

function LevelBar({ label, level, barColor, onChange }: {
  label: string; level: number; barColor: string; onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="group/bar">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{level}/10</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-3">
          <Slider
            min={1} max={10} step={1} value={[level]}
            onValueChange={([v]) => onChange(v)}
            className="flex-1"
          />
          <button onClick={() => setEditing(false)}><Check className="h-4 w-4 text-primary" /></button>
        </div>
      ) : (
        <div className="h-2.5 bg-muted rounded-full overflow-hidden cursor-pointer" onClick={() => setEditing(true)}>
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${level * 10}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </div>
  );
}

/* ── Section wrapper ──────────────────────────── */

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="pb-6 border-b border-border last:border-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-4">
        <span className="text-sm">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ── Daily timeline ───────────────────────────── */

function DailyTimeline({ items }: { items: DailyItem[] }) {
  if (!items.length) return null;
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="relative flex gap-3">
            <div className="absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card shadow-sm" />
            <span className="text-[10px] text-muted-foreground font-mono w-8 shrink-0 pt-0.5">{item.time}</span>
            <span className="text-sm text-foreground">{item.activity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PersonaBoard({ data: rawData, table, onUpdated, onStartCoaching }: PersonaBoardProps) {
  const { isDemoMode } = useDemoContext();
  const save = useSave(table, onUpdated);

  // Use demo data if empty & demo
  const d = isDemoMode && !rawData.portrait_prenom ? { ...DEMO_PERSONA, ...rawData } : rawData;

  const demo = ensureObj(d.demographics);
  const motivations = ensureArray<MotivationItem>(d.motivations);
  const frustrations = ensureArray<string>(d.frustrations_detail || d.step_1_frustrations);
  const desires = ensureArray<string>(d.desires || d.step_2_transformation);
  const objections = ensureArray<string>(d.objections || d.step_3a_objections);
  const triggers = ensureArray<string>(d.buying_triggers);
  const channels = ensureArray<ChannelItem>(d.persona_channels);
  const brands = ensureArray<string>(d.brands);
  const dailyItems = ensureArray<DailyItem>(typeof d.daily_life === "string" ? [] : d.daily_life);

  // Completion
  const fieldChecks = [
    d.portrait_prenom, d.quote, demo.age, demo.profession,
    frustrations.length > 0, desires.length > 0,
    objections.length > 0, motivations.length > 0,
    channels.length > 0, triggers.length > 0,
    d.step_1_frustrations, d.step_2_transformation,
    d.step_3a_objections, d.step_4_feeling,
  ];
  const filled = fieldChecks.filter(Boolean).length;
  const pct = Math.round((filled / fieldChecks.length) * 100);

  // Save motivation/channel arrays
  const updateMotivation = async (idx: number, level: number) => {
    const next = [...motivations];
    next[idx] = { ...next[idx], level };
    await save("motivations", next);
  };

  const updateChannel = async (idx: number, level: number) => {
    const next = [...channels];
    next[idx] = { ...next[idx], level };
    await save("persona_channels", next);
  };

  const barColor = (level: number) =>
    level >= 7 ? "hsl(var(--primary))" : level >= 4 ? "hsl(var(--primary-light))" : "hsl(var(--primary-soft))";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">

        {/* ── HEADER ──────────────────────────────── */}
        <div className="bg-gradient-to-r from-[hsl(var(--rose-pale))] to-[hsl(var(--card))] px-6 md:px-8 py-6 border-b border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
            👩‍💻 Mon client·e idéal·e
          </p>

          <div className="mb-1">
            <InlineText value={d.portrait_prenom || ""} field="portrait_prenom" save={save} placeholder="Donner un prénom à mon persona" />
          </div>

          {(demo.profession || demo.age || demo.location) && (
            <p className="text-sm text-muted-foreground mb-3">
              {[demo.profession, demo.age, demo.location].filter(Boolean).join(" · ")}
            </p>
          )}

          {d.quote && (
            <blockquote className="text-sm text-foreground/80 italic border-l-[3px] border-primary/30 pl-4 mb-4">
              "{d.quote}"
            </blockquote>
          )}
          {!d.quote && (
            <div className="mb-4">
              <InlineText value="" field="quote" save={save} placeholder="Ajouter une citation typique de ton persona..." multiline />
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-1.5 bg-muted rounded-full flex-1 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{pct}%</span>
          </div>
        </div>

        {/* ── BODY 2 COLUMNS ──────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[35%_1fr] gap-0">

          {/* LEFT COLUMN */}
          <div className="bg-muted/30 p-6 border-r border-border max-md:border-r-0 max-md:border-b">
            {/* Avatar */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-3xl text-primary/40 border-4 border-card shadow-sm">
                {d.portrait_prenom ? d.portrait_prenom[0].toUpperCase() : "👩"}
              </div>
            </div>

            {/* Demographics */}
            <div className="space-y-4 mb-6">
              <DemoField label="Âge" value={demo.age} field="demographics" subField="age" save={save} fullObj={demo} />
              <DemoField label="Situation" value={demo.situation} field="demographics" subField="situation" save={save} fullObj={demo} />
              <DemoField label="Localisation" value={demo.location} field="demographics" subField="location" save={save} fullObj={demo} />
              <DemoField label="Revenus" value={demo.income} field="demographics" subField="income" save={save} fullObj={demo} />
              <DemoField label="Statut" value={demo.status} field="demographics" subField="status" save={save} fullObj={demo} />
            </div>

            {/* Channels */}
            {channels.length > 0 && (
              <div className="border-t border-border pt-4 mb-4">
                <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
                  Canaux préférés
                </h3>
                <div className="space-y-3">
                  {channels.map((ch, i) => (
                    <LevelBar
                      key={ch.name}
                      label={ch.name}
                      level={ch.level}
                      barColor={barColor(ch.level)}
                      onChange={v => updateChannel(i, v)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Brands */}
            <div className="border-t border-border pt-4">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
                Marques qu'elle aime
              </h3>
              <EditableTags
                items={brands}
                field="brands"
                save={save}
                className="text-xs border border-border text-foreground/70 px-2.5 py-1 rounded-full bg-card"
              />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="p-6 space-y-6">

            {/* Motivations */}
            {motivations.length > 0 && (
              <Section icon="🎯" title="Objectifs & motivations">
                <div className="space-y-3">
                  {motivations.map((m, i) => (
                    <LevelBar
                      key={m.label}
                      label={m.label}
                      level={m.level}
                      barColor={barColor(m.level)}
                      onChange={v => updateMotivation(i, v)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Frustrations */}
            <Section icon="😫" title="Ses frustrations">
              <EditableList
                items={frustrations}
                field="frustrations_detail"
                save={save}
                bulletColor="text-destructive"
              />
            </Section>

            {/* Desires */}
            <Section icon="✨" title="Ses désirs profonds">
              <EditableList
                items={desires}
                field="desires"
                save={save}
                bulletColor="text-[hsl(var(--success))]"
              />
            </Section>

            {/* Objections */}
            <Section icon="🛑" title="Ses objections">
              <EditableTags
                items={objections}
                field="objections"
                save={save}
                className="bg-[hsl(var(--error-bg))] border border-[hsl(var(--error))]/20 rounded-xl px-4 py-3 text-sm text-foreground/80 italic"
              />
            </Section>

            {/* Triggers */}
            <Section icon="⚡" title="Déclencheurs d'achat">
              <EditableTags
                items={triggers}
                field="buying_triggers"
                save={save}
                className="bg-[hsl(var(--warning-bg))] border border-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] text-xs font-medium px-3 py-1.5 rounded-full"
              />
            </Section>

            {/* Daily life */}
            {dailyItems.length > 0 && (
              <Section icon="📅" title="Une journée type">
                <DailyTimeline items={dailyItems} />
              </Section>
            )}

            {/* Legacy text fields as simple sections */}
            {d.step_2_transformation && (
              <Section icon="🌟" title="Sa transformation rêvée">
                <InlineText value={d.step_2_transformation} field="step_2_transformation" save={save} multiline />
              </Section>
            )}

            {d.step_3b_cliches && (
              <Section icon="💭" title="Ses croyances / clichés">
                <InlineText value={d.step_3b_cliches} field="step_3b_cliches" save={save} multiline />
              </Section>
            )}

            {(d.step_4_beautiful || d.step_4_inspiring) && (
              <Section icon="🎨" title="Son univers esthétique">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {d.step_4_beautiful && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ce qu'elle trouve beau</p>
                      <InlineText value={d.step_4_beautiful} field="step_4_beautiful" save={save} multiline />
                    </div>
                  )}
                  {d.step_4_inspiring && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ce qui l'inspire</p>
                      <InlineText value={d.step_4_inspiring} field="step_4_inspiring" save={save} multiline />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {(d.step_4_repulsive || d.step_4_feeling) && (
              <Section icon="💫" title="Ressenti">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {d.step_4_repulsive && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ce qui la rebute</p>
                      <InlineText value={d.step_4_repulsive} field="step_4_repulsive" save={save} multiline />
                    </div>
                  )}
                  {d.step_4_feeling && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ce qu'elle a besoin de ressentir</p>
                      <InlineText value={d.step_4_feeling} field="step_4_feeling" save={save} multiline />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Pitches */}
            {(d.pitch_short || d.pitch_medium || d.pitch_long) && (
              <Section icon="🗣️" title="Mes pitchs">
                <div className="space-y-3">
                  {d.pitch_short && (
                    <div className="bg-gradient-to-r from-[hsl(var(--rose-pale))] to-[hsl(var(--card))] rounded-xl p-4 border border-primary/10">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pitch court</p>
                      <InlineText value={d.pitch_short} field="pitch_short" save={save} multiline />
                    </div>
                  )}
                  {d.pitch_medium && (
                    <div className="bg-gradient-to-r from-[hsl(var(--rose-pale))] to-[hsl(var(--card))] rounded-xl p-4 border border-primary/10">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pitch moyen</p>
                      <InlineText value={d.pitch_medium} field="pitch_medium" save={save} multiline />
                    </div>
                  )}
                  {d.pitch_long && (
                    <div className="bg-gradient-to-r from-[hsl(var(--rose-pale))] to-[hsl(var(--card))] rounded-xl p-4 border border-primary/10">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pitch long</p>
                      <InlineText value={d.pitch_long} field="pitch_long" save={save} multiline />
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Demo field with inline edit of JSONB sub-key ── */

function DemoField({ label, value, field, subField, save, fullObj }: {
  label: string; value: string; field: string; subField: string;
  save: (f: string, v: any) => Promise<void>; fullObj: Record<string, any>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const commit = async () => {
    setEditing(false);
    if (draft !== (value || "")) {
      await save(field, { ...fullObj, [subField]: draft });
    }
  };

  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</dt>
      {editing ? (
        <input className="w-full text-sm bg-transparent border border-primary/30 rounded-lg px-2 py-0.5 focus:outline-none mt-0.5" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} autoFocus />
      ) : (
        <dd className="text-sm text-foreground mt-0.5 group/demo cursor-pointer flex items-center gap-1" onClick={() => { setDraft(value || ""); setEditing(true); }}>
          {value || <span className="text-muted-foreground italic">—</span>}
          <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/demo:opacity-100 transition-opacity shrink-0" />
        </dd>
      )}
    </div>
  );
}

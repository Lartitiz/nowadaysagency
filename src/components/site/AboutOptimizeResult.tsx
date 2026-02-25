import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, Pencil, Check, ChevronDown, RotateCcw, Save, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

interface ValueBlock { title: string; description: string }

interface OptimizeResult {
  diagnostic: string;
  points_forts: string[];
  problemes: string[];
  texte_ameliore: {
    title: string;
    story: string;
    values_blocks: ValueBlock[];
    approach: string;
    for_whom: string;
    cta: string;
  };
  variantes: {
    pitch: string;
    bio_instagram: string;
  };
  score_avant: number;
  score_apres_estime: number;
}

interface Props {
  result: OptimizeResult;
  originalText: string;
  onRetry: () => void;
  userId: string;
}

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-600";
  if (s >= 50) return "text-amber-500";
  return "text-red-500";
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  return (
    <div className="text-center">
      <span className={`text-3xl font-display font-bold ${scoreColor(score)}`}>{score}</span>
      <span className="text-xs text-muted-foreground block">{label}</span>
    </div>
  );
}

export default function AboutOptimizeResult({ result, originalText, onRetry, userId }: Props) {
  const { column, value } = useWorkspaceFilter();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const [variantesOpen, setVariantesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"avant" | "apres">("apres");

  const getText = (field: string, original: string) => editTexts[field] ?? original;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const copyAll = () => {
    const t = result.texte_ameliore;
    const parts = [
      getText("title", t.title),
      getText("story", t.story),
      t.values_blocks?.map((v, i) => `${getText(`val_${i}_title`, v.title)}\n${getText(`val_${i}_desc`, v.description)}`).join("\n\n"),
      getText("approach", t.approach),
      getText("for_whom", t.for_whom),
      getText("cta", t.cta),
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
    toast.success("Toute la page copiée !");
  };

  const saveAsAboutPage = async () => {
    setSaving(true);
    try {
      const t = result.texte_ameliore;
      const aboutData = {
        title: getText("title", t.title),
        story: getText("story", t.story),
        values_blocks: t.values_blocks?.map((v, i) => ({
          title: getText(`val_${i}_title`, v.title),
          description: getText(`val_${i}_desc`, v.description),
        })),
        approach: getText("approach", t.approach),
        for_whom: getText("for_whom", t.for_whom),
        cta: getText("cta", t.cta),
        angle: "optimized",
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await (supabase.from("website_about") as any).select("id").eq(column, value).maybeSingle();
      if (existing) {
        await (supabase.from("website_about") as any).update(aboutData).eq(column, value);
      } else {
        await (supabase.from("website_about") as any).insert({ user_id: userId, ...aboutData });
      }
      toast.success("Sauvegardé comme ta page À propos !");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { key: "title", label: "🎯 Titre d'accroche", text: result.texte_ameliore.title },
    { key: "story", label: "👑 Mon histoire", text: result.texte_ameliore.story },
    { key: "approach", label: "🛠️ Mon approche", text: result.texte_ameliore.approach },
    { key: "for_whom", label: "🎯 Pour qui", text: result.texte_ameliore.for_whom },
    { key: "cta", label: "🔘 CTA", text: result.texte_ameliore.cta },
  ];

  return (
    <div className="space-y-6">
      {/* Header: Scores + Diagnostic */}
      <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-6">
          <ScoreBadge score={result.score_avant} label="Avant" />
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <ScoreBadge score={result.score_apres_estime} label="Après (estimé)" />
        </div>
        {result.score_apres_estime > result.score_avant && (
          <p className="text-sm font-semibold text-primary">
            🎉 +{result.score_apres_estime - result.score_avant} points estimés !
          </p>
        )}
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">{result.diagnostic}</p>
      </div>

      {/* Points forts / Problèmes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {result.points_forts?.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold text-emerald-600 mb-2">✅ Ce qui fonctionne</p>
            <ul className="space-y-1">
              {result.points_forts.map((p, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-emerald-500 shrink-0 mt-0.5">●</span>{p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.problemes?.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold text-amber-600 mb-2">⚠️ Ce qui coince</p>
            <ul className="space-y-1">
              {result.problemes.map((p, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-amber-500 shrink-0 mt-0.5">●</span>{p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Mobile tabs / Desktop side-by-side toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
        <button
          onClick={() => setTab("avant")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "avant" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          📄 Avant
        </button>
        <button
          onClick={() => setTab("apres")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "apres" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          ✨ Après
        </button>
      </div>

      {tab === "avant" && (
        <div className="rounded-2xl border border-border bg-muted/50 p-6">
          <p className="text-xs font-bold text-muted-foreground mb-3">📄 Texte actuel</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{originalText}</p>
        </div>
      )}

      {tab === "apres" && (
        <div className="space-y-4">
          {/* Sections */}
          {sections.map((section) => {
            const isEditing = editingField === section.key;
            const currentText = getText(section.key, section.text);
            return (
              <div key={section.key} className="rounded-2xl border border-primary/20 bg-rose-pale p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-primary/80 uppercase tracking-wider">{section.label}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyText(currentText)} className="text-xs font-semibold text-primary hover:opacity-70 flex items-center gap-1">
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingField(null);
                        } else {
                          setEditingField(section.key);
                          if (!editTexts[section.key]) setEditTexts(prev => ({ ...prev, [section.key]: section.text }));
                        }
                      }}
                      className={`text-xs font-semibold flex items-center gap-1 ${isEditing ? "text-emerald-600" : "text-muted-foreground"} hover:opacity-70`}
                    >
                      {isEditing ? <><Check className="h-3 w-3" /> OK</> : <><Pencil className="h-3 w-3" /> Éditer</>}
                    </button>
                  </div>
                </div>
                {isEditing ? (
                  <Textarea
                    value={editTexts[section.key] || section.text}
                    onChange={(e) => setEditTexts(prev => ({ ...prev, [section.key]: e.target.value }))}
                    className="min-h-[100px] text-sm rounded-xl"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{currentText}</p>
                )}
              </div>
            );
          })}

          {/* Values blocks */}
          {result.texte_ameliore.values_blocks?.length > 0 && (
            <div className="rounded-2xl border border-primary/20 bg-rose-pale p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-primary/80 uppercase tracking-wider">❤️ Mes valeurs</p>
                <button
                  onClick={() => copyText(result.texte_ameliore.values_blocks.map(v => `${getText(`val_${result.texte_ameliore.values_blocks.indexOf(v)}_title`, v.title)}\n${getText(`val_${result.texte_ameliore.values_blocks.indexOf(v)}_desc`, v.description)}`).join("\n\n"))}
                  className="text-xs font-semibold text-primary hover:opacity-70 flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" /> Copier
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.texte_ameliore.values_blocks.map((v, i) => (
                  <div key={i} className="rounded-xl bg-card p-4 border border-border">
                    <p className="font-semibold text-sm text-foreground mb-1">{getText(`val_${i}_title`, v.title)}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{getText(`val_${i}_desc`, v.description)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variantes */}
      {result.variantes && (
        <Collapsible open={variantesOpen} onOpenChange={setVariantesOpen}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all cursor-pointer">
              <span className="text-sm font-medium text-foreground">📝 Versions courtes</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${variantesOpen ? "rotate-180" : ""}`} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-b-2xl border border-t-0 border-border bg-card px-5 pb-5 space-y-4">
              {result.variantes.pitch && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-muted-foreground">🎤 Version pitch (3 phrases)</p>
                    <button onClick={() => copyText(result.variantes.pitch)} className="text-xs font-semibold text-primary hover:opacity-70 flex items-center gap-1">
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{result.variantes.pitch}</p>
                </div>
              )}
              {result.variantes.bio_instagram && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-muted-foreground">📱 Bio Instagram</p>
                    <button onClick={() => copyText(result.variantes.bio_instagram)} className="text-xs font-semibold text-primary hover:opacity-70 flex items-center gap-1">
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                  </div>
                  <p className="text-sm text-foreground">{result.variantes.bio_instagram}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" className="gap-2 rounded-pill" onClick={copyAll}>
          <Copy className="h-4 w-4" /> Copier toute la page améliorée
        </Button>
        <Button className="gap-2 rounded-pill" onClick={saveAsAboutPage} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Sauvegarde..." : "Sauvegarder comme ma page À propos"}
        </Button>
        <Button variant="outline" className="gap-2 rounded-pill" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Relancer avec un autre focus
        </Button>
      </div>
    </div>
  );
}

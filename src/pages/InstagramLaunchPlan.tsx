import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Copy, CalendarPlus, Pencil, RefreshCw, Loader2, Rocket, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanContent {
  id?: string;
  date: string;
  phase: string;
  format: string;
  accroche: string;
  contenu: string;
  objectif: string;
  tip: string;
  is_edited: boolean;
  added_to_calendar: boolean;
  sort_order: number;
}

interface Phase {
  name: string;
  label: string;
  start_date: string;
  end_date: string;
  contents: PlanContent[];
}

const PHASE_STYLES: Record<string, { bg: string; border: string; emoji: string; label: string }> = {
  pre_teasing: { bg: "bg-violet-50", border: "border-violet-200", emoji: "🌱", label: "Pré-teasing" },
  teasing: { bg: "bg-pink-50", border: "border-pink-200", emoji: "👀", label: "Teasing" },
  vente: { bg: "bg-yellow-50", border: "border-yellow-200", emoji: "🔥", label: "Lancement / Vente" },
  post_lancement: { bg: "bg-green-50", border: "border-green-200", emoji: "🌊", label: "Post-lancement" },
};

const FORMAT_LABELS: Record<string, string> = {
  post_carrousel: "Carrousel",
  post_photo: "Post photo",
  reel: "Reel",
  story: "Story",
  story_serie: "Story série",
  live: "Live",
};

export default function InstagramLaunchPlan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [launch, setLaunch] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [addingAllToCalendar, setAddingAllToCalendar] = useState(false);

  // Load launch + existing plan
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: launches } = await supabase
        .from("launches")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!launches?.length) {
        navigate("/instagram/lancement");
        return;
      }

      const l = launches[0];
      setLaunch(l);

      // Check for existing plan
      const { data: existing } = await supabase
        .from("launch_plan_contents")
        .select("*")
        .eq("launch_id", l.id)
        .order("sort_order", { ascending: true });

      if (existing?.length) {
        rebuildPhases(existing, l);
      }

      setLoaded(true);
    })();
  }, [user]);

  function rebuildPhases(contents: any[], l: any) {
    const phaseOrder = ["pre_teasing", "teasing", "vente", "post_lancement"];
    const grouped: Record<string, any[]> = {};
    for (const c of contents) {
      if (!grouped[c.phase]) grouped[c.phase] = [];
      grouped[c.phase].push({ ...c, date: c.content_date });
    }
    const result: Phase[] = phaseOrder
      .filter((p) => grouped[p]?.length)
      .map((p) => ({
        name: p,
        label: PHASE_STYLES[p]?.label || p,
        start_date: grouped[p][0]?.content_date || "",
        end_date: grouped[p][grouped[p].length - 1]?.content_date || "",
        contents: grouped[p],
      }));
    setPhases(result);
  }

  const generatePlan = async () => {
    if (!user || !launch) return;
    setGenerating(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "launch-plan",
          profile: {
            ...(profile || {}),
            launch_name: launch.name,
            launch_promise: launch.promise,
            launch_objections: launch.objections,
            launch_free_resource: launch.free_resource,
            launch_teasing_start: launch.teasing_start,
            launch_teasing_end: launch.teasing_end,
            launch_sale_start: launch.sale_start,
            launch_sale_end: launch.sale_end,
            launch_selected_contents: launch.selected_contents,
          },
        },
      });

      if (res.error) throw new Error(res.error.message);

      const content = res.data?.content || "";
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      // Delete old plan
      await supabase.from("launch_plan_contents").delete().eq("launch_id", launch.id);

      // Insert new contents
      let sortOrder = 0;
      const rows: any[] = [];
      for (const phase of parsed.phases || []) {
        for (const c of phase.contents || []) {
          rows.push({
            user_id: user.id,
            launch_id: launch.id,
            phase: phase.name,
            content_date: c.date,
            format: c.format,
            accroche: c.accroche,
            contenu: c.contenu,
            objectif: c.objectif,
            tip: c.tip,
            sort_order: sortOrder++,
          });
        }
      }

      if (rows.length) {
        const { data: inserted } = await supabase
          .from("launch_plan_contents")
          .insert(rows)
          .select();
        if (inserted) rebuildPhases(inserted, launch);
      }

      toast.success("Plan de lancement généré ! 🚀");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const copyContent = async (c: PlanContent) => {
    await navigator.clipboard.writeText(c.contenu);
    setCopiedId(c.id || c.date + c.sort_order);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const addToCalendar = async (c: PlanContent) => {
    if (!user || !launch) return;
    try {
      await supabase.from("calendar_posts").insert({
        user_id: user.id,
        date: c.date,
        canal: "instagram",
        theme: `🚀 ${launch.name}`,
        angle: c.accroche,
        objectif: c.objectif,
        notes: c.contenu,
        status: "idea",
      });
      // Mark as added
      if (c.id) {
        await supabase.from("launch_plan_contents").update({ added_to_calendar: true }).eq("id", c.id);
      }
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          contents: p.contents.map((x) => (x.id === c.id ? { ...x, added_to_calendar: true } : x)),
        }))
      );
      toast.success("Ajouté au calendrier !");
    } catch {
      toast.error("Erreur");
    }
  };

  const addAllToCalendar = async () => {
    if (!user || !launch) return;
    setAddingAllToCalendar(true);
    try {
      const allContents = phases.flatMap((p) => p.contents).filter((c) => !c.added_to_calendar);
      const calendarRows = allContents.map((c) => ({
        user_id: user.id,
        date: c.date,
        canal: "instagram",
        theme: `🚀 ${launch.name}`,
        angle: c.accroche,
        objectif: c.objectif,
        notes: c.contenu,
        status: "idea",
      }));
      if (calendarRows.length) {
        await supabase.from("calendar_posts").insert(calendarRows);
        const ids = allContents.map((c) => c.id).filter(Boolean);
        if (ids.length) {
          await supabase.from("launch_plan_contents").update({ added_to_calendar: true }).in("id", ids);
        }
        setPhases((prev) =>
          prev.map((p) => ({
            ...p,
            contents: p.contents.map((c) => ({ ...c, added_to_calendar: true })),
          }))
        );
      }
      toast.success(`${calendarRows.length} contenus ajoutés au calendrier !`);
    } catch {
      toast.error("Erreur");
    } finally {
      setAddingAllToCalendar(false);
    }
  };

  const startEdit = (c: PlanContent) => {
    setEditingIdx(c.id || null);
    setEditText(c.contenu);
  };

  const saveEdit = async (c: PlanContent) => {
    if (c.id) {
      await supabase.from("launch_plan_contents").update({ contenu: editText, is_edited: true }).eq("id", c.id);
    }
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        contents: p.contents.map((x) => (x.id === c.id ? { ...x, contenu: editText, is_edited: true } : x)),
      }))
    );
    setEditingIdx(null);
    toast.success("Contenu mis à jour");
  };

  const regenerateSingle = async (c: PlanContent, phaseIdx: number, contentIdx: number) => {
    if (!user || !launch) return;
    const key = c.id || `${phaseIdx}-${contentIdx}`;
    setRegeneratingId(key);
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "raw",
          prompt: `Tu es experte en stratégie de lancement Instagram pour des solopreneuses créatives et éthiques.

Contexte du lancement :
- Offre : "${launch.name}"
- Promesse : "${launch.promise}"
- Phase : ${PHASE_STYLES[c.phase]?.label || c.phase}
- Format : ${FORMAT_LABELS[c.format] || c.format}
- Objectif de ce contenu : ${c.objectif}

Profil : ${profile?.activite || ""}, cible : ${profile?.cible || ""}, ton : ${(profile?.tons || []).join(", ")}

Régénère ce contenu de lancement avec un ANGLE DIFFÉRENT. Le contenu doit être COMPLET et PRÊT À POSTER (min 100 mots pour un post).

Réponds en JSON :
{"accroche": "...", "contenu": "...", "tip": "..."}`,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const raw = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]); else throw new Error("Format inattendu");
      }
      if (c.id) {
        await supabase.from("launch_plan_contents").update({
          accroche: parsed.accroche || c.accroche,
          contenu: parsed.contenu || c.contenu,
          tip: parsed.tip || c.tip,
          is_edited: false,
        }).eq("id", c.id);
      }
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          contents: p.contents.map((x) =>
            x.id === c.id
              ? { ...x, accroche: parsed.accroche || x.accroche, contenu: parsed.contenu || x.contenu, tip: parsed.tip || x.tip }
              : x
          ),
        }))
      );
      toast.success("Contenu régénéré !");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setRegeneratingId(null);
    }
  };

  if (!loaded) return null;

  const totalContents = phases.reduce((s, p) => s + p.contents.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Lancement" parentTo="/instagram/lancement" currentLabel="Plan de contenu" />
        <h1 className="font-display text-[26px] font-bold text-foreground">🚀 Ton plan de lancement</h1>
        <p className="mt-1 text-sm text-muted-foreground italic">
          Tout est prêt. Voici tes contenus, jour par jour, prêts à poster.
        </p>

        {/* Quick recap */}
        {launch && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <span>📦 <strong>{launch.name}</strong></span>
            {launch.teasing_start && launch.teasing_end && (
              <Badge variant="secondary">📅 Teasing : {formatD(launch.teasing_start)} → {formatD(launch.teasing_end)}</Badge>
            )}
            {launch.sale_start && launch.sale_end && (
              <Badge variant="secondary">🔥 Vente : {formatD(launch.sale_start)} → {formatD(launch.sale_end)}</Badge>
            )}
          </div>
        )}

        {/* Generate or show plan */}
        {phases.length === 0 ? (
          <div className="mt-8 text-center space-y-4">
            <p className="text-muted-foreground">L'IA va générer ton plan de contenu complet à partir de toutes les infos de ton lancement.</p>
            <Button onClick={generatePlan} disabled={generating} size="lg" className="rounded-full gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {generating ? "Génération en cours... (30-60s)" : "✨ Générer mon plan de lancement"}
            </Button>
            {generating && (
              <div className="flex items-center gap-3 justify-center animate-fade-in pt-4">
                <div className="flex gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.16s" }} />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.32s" }} />
                </div>
                <span className="text-sm italic text-muted-foreground">L'IA rédige tes contenus de lancement...</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Global actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={addAllToCalendar} disabled={addingAllToCalendar} variant="outline" className="rounded-full gap-2">
                <CalendarPlus className="h-4 w-4" />
                {addingAllToCalendar ? "Ajout en cours..." : `📅 Ajouter tout au calendrier (${totalContents})`}
              </Button>
              <Button onClick={generatePlan} disabled={generating} variant="outline" className="rounded-full gap-2">
                <RefreshCw className={cn("h-4 w-4", generating && "animate-spin")} />
                Regénérer tout le plan
              </Button>
            </div>

            {/* Timeline */}
            <div className="mt-8 space-y-8">
              {phases.map((phase, pi) => {
                const style = PHASE_STYLES[phase.name] || PHASE_STYLES.pre_teasing;
                return (
                  <div key={phase.name}>
                    {/* Phase header */}
                    <div className={cn("rounded-xl border p-4 mb-4", style.bg, style.border)}>
                      <h2 className="text-lg font-bold text-foreground">
                        {style.emoji} {style.label}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {phase.start_date && phase.end_date
                          ? `${formatD(phase.start_date)} → ${formatD(phase.end_date)}`
                          : ""}
                        {" · "}{phase.contents.length} contenu{phase.contents.length > 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Contents */}
                    <div className="space-y-4 pl-4 border-l-2 border-border ml-4">
                      {phase.contents.map((c, ci) => {
                        const key = c.id || `${pi}-${ci}`;
                        const isEditing = editingIdx === c.id;
                        const isCopied = copiedId === (c.id || c.date + c.sort_order);
                        const isRegenerating = regeneratingId === key;

                        return (
                          <Card key={key} className="relative ml-4">
                            <CardContent className="p-4 space-y-3">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    📅 {formatD(c.date)}
                                  </span>
                                  <Badge variant="secondary" className="text-xs">
                                    {FORMAT_LABELS[c.format] || c.format}
                                  </Badge>
                                  {c.added_to_calendar && (
                                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                      <Check className="h-3 w-3 mr-1" /> Calendrier
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Accroche */}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">💬 Accroche</p>
                                <p className="text-sm font-semibold text-foreground">{c.accroche}</p>
                              </div>

                              {/* Contenu */}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">📝 Contenu complet</p>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editText}
                                      onChange={(e) => setEditText(e.target.value)}
                                      className="min-h-[200px] text-sm"
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => saveEdit(c)}>Enregistrer</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setEditingIdx(null)}>Annuler</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{c.contenu}</p>
                                )}
                              </div>

                              {/* Objectif + Tip */}
                              <div className="flex flex-wrap gap-4">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">🎯 Objectif</p>
                                  <p className="text-xs text-foreground">{c.objectif}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">💡 Tip</p>
                                  <p className="text-xs text-foreground">{c.tip}</p>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button variant="outline" size="sm" onClick={() => copyContent(c)} className="rounded-full gap-1.5">
                                  <Copy className="h-3.5 w-3.5" />
                                  {isCopied ? "Copié !" : "Copier"}
                                </Button>
                                {!c.added_to_calendar && (
                                  <Button variant="outline" size="sm" onClick={() => addToCalendar(c)} className="rounded-full gap-1.5">
                                    <CalendarPlus className="h-3.5 w-3.5" />
                                    Ajouter au calendrier
                                  </Button>
                                )}
                                {!isEditing && (
                                  <Button variant="outline" size="sm" onClick={() => startEdit(c)} className="rounded-full gap-1.5">
                                    <Pencil className="h-3.5 w-3.5" />
                                    Modifier
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => regenerateSingle(c, pi, ci)}
                                  disabled={isRegenerating}
                                  className="rounded-full gap-1.5"
                                >
                                  <RefreshCw className={cn("h-3.5 w-3.5", isRegenerating && "animate-spin")} />
                                  {isRegenerating ? "..." : "Regénérer"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="h-16" />
      </main>
    </div>
  );
}

function formatD(d: string) {
  try {
    return format(new Date(d), "d MMM yyyy", { locale: fr });
  } catch {
    return d;
  }
}

import { usePlanningVisit } from "@/hooks/use-planning-visit";
import { useWorkspaceReady } from "@/hooks/use-workspace-query";
import { useRef, useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useNavigate } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useEditorialLine } from "@/hooks/use-branding";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { syncLaunchCalendar, launchSaveError } from "@/lib/launch-persistence";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, Loader2, Rocket, Trash2, Plus, RefreshCw,
  ArrowRight, Check, Save, CalendarPlus, LayoutList, Calendar as CalendarIconFull, GitBranch, Lightbulb
} from "lucide-react";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  LAUNCH_TEMPLATES, PHASE_STYLES, CATEGORY_COLORS, FORMAT_OPTIONS, CONTENT_TYPES,
  TIME_OPTIONS, FALLBACK_TIME_OPTIONS,
  type LaunchTemplate, type LaunchSlot, type LaunchPlan, type LaunchPhase,
} from "@/lib/launch-templates";
import LaunchStoriesPlanning from "@/components/launch/LaunchStoriesPlanning";

interface PhaseConfig {
  name: string;
  label: string;
  emoji: string;
  start_date: string;
  end_date: string;
}

export default function InstagramLaunchPlan() {
  const { user } = useAuth();
  const scope = useWorkspaceId();
  const ready = useWorkspaceReady();
  if (!ready || !user) return null;
  return <InstagramLaunchPlanScreen key={`${user.id}:${scope}`} />;
}

function InstagramLaunchPlanScreen() {
  const visit = usePlanningVisit();
  const loadSequence = useRef(0);
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const { data: editorialLineData } = useEditorialLine();
  const confirm = useConfirm();

  // Step management
  const [currentStep, setCurrentStep] = useState(0); // 0=template, 1=temps, 2=generate, 3=preview
  const [launch, setLaunch] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Step 1: Template
  const [selectedTemplate, setSelectedTemplate] = useState<LaunchTemplate | null>(null);
  const [phaseConfigs, setPhaseConfigs] = useState<PhaseConfig[]>([]);

  // Step 2: Time
  const [editorialTime, setEditorialTime] = useState<number | null>(null);
  const [extraTime, setExtraTime] = useState<string | null>(null);
  const [hasEditorialLine, setHasEditorialLine] = useState(false);

  // Step 3: Plan
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [slots, setSlots] = useState<LaunchSlot[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "timeline" | "calendar">("list");

  // Saving
  const [saving, setSaving] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  const inFlight = useRef(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [proposal, setProposal] = useState<{ slots: LaunchSlot[]; metadata: any; version: string } | null>(null);

  // Load launch
  useEffect(() => {
    if (!user) return;
    const loadRequest = ++loadSequence.current;
    (async () => {
      setLoaded(false);
      setLoadError(false);
      setSlots([]); setSelection(new Set()); setCurrentStep(0);
      const { data: launches, error: launchesError } = await (supabase.from("launches") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!visit.current || loadSequence.current !== loadRequest) return;
      if (launchesError) {
        console.error("Erreur chargement lancement:", launchesError);
        setLoadError(true);
        setLoaded(true);
        return;
      }
      if (!launches?.length) { navigate("/instagram/lancement"); return; }
      const l = launches[0];
      setLaunch(l);
      if (!l.plan_generated && l.launch_model) {
        const template = LAUNCH_TEMPLATES.find(t => t.id === l.launch_model);
        if (template) selectTemplate(template, l);
      }
      if (l.extra_weekly_hours != null) {
        const t = TIME_OPTIONS.find(t => t.hours === l.extra_weekly_hours) ?? FALLBACK_TIME_OPTIONS.find(t => t.hours === l.extra_weekly_hours);
        if (t) setExtraTime(t.id);
      }

      // If plan already generated, load slots
      if (l.plan_generated) {
        const { data: existing, error: existingError } = await supabase
          .from("launch_plan_contents")
          .select("*")
          .eq("launch_id", l.id)
          .is("archived_at" as any, null)
          .order("sort_order", { ascending: true });
        if (!visit.current || loadSequence.current !== loadRequest) return;
        if (existingError) {
          console.error("Erreur chargement plan:", existingError);
          setLoadError(true);
          setLoaded(true);
          return;
        }
        if (existing?.length) {
          const loadedSlots: LaunchSlot[] = existing.map((e: any) => ({
            id: e.id,
            date: e.content_date,
            phase: e.phase,
            format: e.format || "post_carrousel",
            content_type: e.content_type || "",
            content_type_emoji: e.content_type_emoji || "",
            category: e.category || "confiance",
            objective: e.objective || e.objectif || "",
            angle_suggestion: e.angle_suggestion || "",
          }));
          setSlots(loadedSlots);
          setSelection(new Set(loadedSlots.map(s => s.id)));
          // Rebuild phases from launch data
          const phases: PhaseConfig[] = Array.isArray(l.phases) ? [...l.phases] : [];
          for (const name of new Set(loadedSlots.map(slot => slot.phase))) {
            if (!phases.some(phase => phase.name === name)) {
              const dates = loadedSlots.filter(slot => slot.phase === name).map(slot => slot.date).sort();
              phases.push({ name, label: name || "Plan", emoji: "📋", start_date: dates[0], end_date: dates[dates.length - 1] });
            }
          }
          setPhaseConfigs(phases);
          if (l.template_type) {
            const t = LAUNCH_TEMPLATES.find((t) => t.id === l.template_type);
            if (t) setSelectedTemplate(t);
          }
          setCurrentStep(3);
        }
      }

      setLoaded(true);
    })();
  }, [user?.id, column, value, reloadKey]);

  // La ligne éditoriale arrive en async (react-query) : la prendre en compte
  // dès qu'elle est là, pas seulement si elle était déjà chargée au mount.
  useEffect(() => {
    if (editorialLineData?.estimated_weekly_minutes) {
      setEditorialTime(Math.round((editorialLineData as any).estimated_weekly_minutes / 60));
      setHasEditorialLine(true);
    }
  }, [editorialLineData]);

  // ── Step 1: Template selection ──

  const selectTemplate = (t: LaunchTemplate, sourceLaunch = launch) => {
    setSelectedTemplate(t);
    // Auto-fill phase dates based on sale_start or today
    // For classique/gros, phases go backwards from sale date
    // Simple approach: stack phases forward from a start
    const startDate = sourceLaunch?.teasing_start ? new Date(sourceLaunch.teasing_start) : addDays(new Date(), 7);
    let c = new Date(startDate);

    const configs: PhaseConfig[] = t.phases.map((p) => {
      const start = format(c, "yyyy-MM-dd");
      c = addDays(c, p.defaultDurationDays - 1);
      const end = format(c, "yyyy-MM-dd");
      c = addDays(c, 1);
      return { name: p.name, label: p.label, emoji: p.emoji, start_date: start, end_date: end };
    });
    setPhaseConfigs(configs);
  };

  const updatePhaseDate = (idx: number, field: "start_date" | "end_date", val: string) => {
    setPhaseConfigs((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };

  const removePhase = (idx: number) => {
    setPhaseConfigs((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPhase = () => {
    const last = phaseConfigs[phaseConfigs.length - 1];
    const start = last ? format(addDays(new Date(last.end_date), 1), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(start), 6), "yyyy-MM-dd");
    setPhaseConfigs((prev) => [...prev, { name: `phase_${prev.length + 1}`, label: "Nouvelle phase", emoji: "📌", start_date: start, end_date: end }]);
  };

  // ── Step 3: Generate ──

  const generatePlan = async () => {
    if (!user || !launch || inFlight.current) return;
    if (!phaseConfigs.length || phaseConfigs.some(p => !p.start_date || !p.end_date || p.start_date > p.end_date)) {
      toast.error("Vérifie les dates de chaque phase avant de générer le plan."); return;
    }
    inFlight.current = true;
    setGenerating(true);
    try {
      const editoData = editorialLineData as any;

      const extraHours = extraTime ? (TIME_OPTIONS.find((t) => t.id === extraTime)?.hours ?? FALLBACK_TIME_OPTIONS.find((t) => t.id === extraTime)?.hours ?? 0) : 0;

      const res = await invokeWithTimeout("launch-plan-ai", {
        body: {
          launch: {
            name: launch.name,
            promise: launch.promise,
            objections: launch.objections,
            free_resource: launch.free_resource,
            selected_contents: launch.selected_contents,
          },
          phases: phaseConfigs,
          template_type: selectedTemplate?.id || "classique",
          extra_weekly_hours: extraHours,
          editorial_time: editorialTime ?? 3,
          preferred_formats: editoData?.preferred_formats || [],
          rhythm: editoData?.posts_frequency || "3 posts/semaine",
          workspace_id: workspaceId,
        },
      }, 120000);

      if (!visit.current) return;
      if (res.error) throw new Error(res.error.message);

      const parsed: LaunchPlan = res.data;

      // Flatten slots with generated IDs
      const allSlots: LaunchSlot[] = [];
      for (const phase of parsed.phases || []) {
        for (const slot of phase.slots || []) {
          allSlots.push({
            ...slot,
            id: crypto.randomUUID(),
            phase: phase.name,
          });
        }
      }

      setPlan(parsed);

      if (!allSlots.length) throw new Error("L’IA n’a renvoyé aucun contenu.");
      const next = { slots: allSlots, version: launch.updated_at, metadata: {
        template_type: selectedTemplate?.id, extra_weekly_hours: extraHours, phases: phaseConfigs,
      } };
      setProposal(next);
      await persistProposal(next);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      if (visit.current) toast.error(launchSaveError(e));
    } finally {
      inFlight.current = false;
      if (visit.current) setGenerating(false);
    }
  };

  const persistProposal = async (next: NonNullable<typeof proposal>) => {
    if (!launch || !visit.current) return;
    const { data, error } = await supabase.rpc("save_launch_plan" as any, {
      p_launch_id: launch.id, p_workspace_id: launch.workspace_id ?? null,
      p_expected_updated_at: next.version,
      p_slots: next.slots.map((slot, sort_order) => ({ ...slot, sort_order })), p_metadata: next.metadata,
    });
    if (!visit.current) return;
    if (error) throw error;
    if ((data as any)?.launch_id !== launch.id) throw new Error("launch_missing_receipt");
    setProposal(null);
    setReloadKey(k => k + 1);
    toast.success("Plan de lancement enregistré. Les versions précédentes sont conservées.");
  };

  // ── Slot manipulation ──

  const changeSlot = async (slotId: string, date?: string) => {
    if (inFlight.current || !launch) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const patch = date ? { content_date: date } : { archived_at: new Date().toISOString() };
      const { data, error } = await supabase.from("launch_plan_contents").update(patch as any)
        .eq("id", slotId).eq("launch_id", launch.id).eq("content_date", slots.find(slot => slot.id === slotId)!.date).is("archived_at" as any, null).select("id").single();
      if (!visit.current) return;
      if (error || !data) throw error || new Error("missing receipt");
      setSlots(previous => date ? previous.map(s => s.id === slotId ? { ...s, date } : s) : previous.filter(s => s.id !== slotId));
    } catch (error) { if (visit.current) toast.error(launchSaveError(error)); }
    finally { inFlight.current = false; if (visit.current) setSaving(false); }
  };
  const deleteSlot = (id: string) => changeSlot(id);
  const updateSlotDate = (id: string, date: string) => changeSlot(id, date);

  // ── Send to calendar ──

  const sendToCalendar = async () => {
    if (!user || !launch || inFlight.current) return;
    const ids = slots.filter(s => selection.has(s.id)).map(s => s.id);
    if (!ids.length) return;
    inFlight.current = true;
    setSaving(true);
    const confirmReplacement = () => confirm({
      title: "Renvoyer le plan au calendrier ?",
      description: "Les emplacements sélectionnés encore intacts seront actualisés. Les contenus modifiés, rédigés, programmés ou publiés et les anciennes versions seront conservés.",
      confirmText: "Renvoyer et remplacer", cancelText: "Annuler",
    });
    try {
      let replace = false;
      if (launch.plan_sent_to_calendar) {
        replace = await confirmReplacement();
        if (!replace || !visit.current) return;
      }
      let receipt;
      try { receipt = await syncLaunchCalendar(launch.id, launch.workspace_id ?? null, ids, replace); }
      catch (error: any) {
        if (!String(error?.message).includes("launch_replace_confirmation_required")) throw error;
        if (!visit.current || !await confirmReplacement() || !visit.current) return;
        receipt = await syncLaunchCalendar(launch.id, launch.workspace_id ?? null, ids, true);
      }
      if (!visit.current) return;
      setLaunch((prev: any) => ({ ...prev, plan_sent_to_calendar: ids.length === slots.length }));
      toast.success(`${receipt.inserted} ajoutés · ${receipt.refreshed} emplacements actualisés · ${receipt.preserved} contenus conservés.`);
      navigate(`/calendrier?canal=instagram&date=${receipt.items[0].date}`);
    } catch (error) { if (visit.current) toast.error(launchSaveError(error)); }
    finally { inFlight.current = false; if (visit.current) setSaving(false); }
  };

  // « Sauvegarder sans envoyer » : le plan est déjà écrit à la génération,
  // ce bouton VÉRIFIE donc que la base contient bien les contenus (toast honnête).
  const verifySaved = async () => {
    if (!launch) return;
    const { count, error } = await supabase
      .from("launch_plan_contents")
      .select("id", { count: "exact", head: true })
      .eq("launch_id", launch.id).is("archived_at" as any, null);
    if (!visit.current) return;
    if (error || !count) {
      console.error("Erreur vérification plan:", error);
      toast.error("Le plan ne semble pas enregistré. Regénère-le ou réessaie.");
      return;
    }
    toast.success(`Plan sauvegardé (${count} contenus) !`);
  };

  // ── Computed stats ──

  const stats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    slots.forEach((s) => { byCategory[s.category] = (byCategory[s.category] || 0) + 1; });
    const total = slots.length || 1;
    return {
      total: slots.length,
      visibilite: Math.round(((byCategory.visibilite || 0) / total) * 100),
      confiance: Math.round(((byCategory.confiance || 0) / total) * 100),
      vente: Math.round(((byCategory.vente || 0) / total) * 100),
    };
  }, [slots]);

  // ── Slots grouped by phase ──

  const slotsByPhase = useMemo(() => {
    const map: Record<string, LaunchSlot[]> = {};
    slots.forEach((s) => {
      if (!map[s.phase]) map[s.phase] = [];
      map[s.phase].push(s);
    });
    // Sort each phase by date
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [slots]);

  if (!loaded) return null;

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Lancement" parentTo="/instagram/lancement" currentLabel="Planifier mon lancement" />
          <div className="mt-16 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Impossible de charger ton plan de lancement. Vérifie ta connexion, puis réessaie.</p>
            <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)} className="rounded-full">
              Réessayer
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Lancement" parentTo="/instagram/lancement" currentLabel="Planifier mon lancement" />
        <h1 className="font-display text-3xl font-bold text-foreground">🚀 Planifier mon lancement</h1>
        <p className="mt-1 text-sm text-muted-foreground italic">
          Crée ton plan stratégique, contenu par contenu, puis envoie-le dans ton calendrier.
        </p>

        {/* Stepper */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-2">
          {["Template", "Temps", "Générer", "Prévisualiser"].map((label, i) => (
            <button
              key={i}
              onClick={() => i <= currentStep && setCurrentStep(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                i === currentStep
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < currentStep
                    ? "border-primary/30 bg-primary/10 text-primary cursor-pointer"
                    : "border-border bg-card text-muted-foreground"
              )}
            >
              {i < currentStep ? <Check className="h-3 w-3" /> : <span>{["⚡", "⏱️", "✨", "👁️"][i]}</span>}
              {label}
            </button>
          ))}
        </div>

        {/* ═══════ STEP 0: Template ═══════ */}
        {currentStep === 0 && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {LAUNCH_TEMPLATES.map((t) => (
                <Card
                  key={t.id}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/40",
                    selectedTemplate?.id === t.id && "border-primary ring-2 ring-primary/20"
                  )}
                  onClick={() => selectTemplate(t)}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="text-2xl">{t.emoji}</div>
                    <h3 className="font-display font-bold text-foreground">{t.label}</h3>
                    <p className="text-xs text-muted-foreground">{t.duration}</p>
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {t.phases.map((p) => (
                        <div key={p.name}>{p.emoji} {p.label}</div>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-primary">{t.contentRange}</p>
                    <p className="text-xs text-muted-foreground italic">Idéal pour : {t.idealFor}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Phase customization */}
            {selectedTemplate && phaseConfigs.length > 0 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-display text-lg font-bold">
                  {selectedTemplate.emoji} {selectedTemplate.label} — Ajuste tes dates
                </h3>
                {phaseConfigs.map((p, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{p.emoji}</span>
                        <Input
                          value={p.label}
                          onChange={(e) => setPhaseConfigs((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
                          className="h-8 w-40 text-sm font-medium"
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removePhase(idx)} className="text-destructive h-8 w-8" aria-label="Supprimer cette phase">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <DatePicker label="Du" value={p.start_date} onChange={(d) => updatePhaseDate(idx, "start_date", d)} />
                      <DatePicker label="Au" value={p.end_date} onChange={(d) => updatePhaseDate(idx, "end_date", d)} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addPhase} className="rounded-full gap-2">
                  <Plus className="h-4 w-4" /> Ajouter une phase
                </Button>
                <div className="flex justify-end">
                  <Button onClick={() => setCurrentStep(1)} className="rounded-full gap-2">
                    Continuer <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STEP 1: Temps ═══════ */}
        {currentStep === 1 && (
          <div className="mt-6 space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>⏱️</span> Ton temps
                </div>

                {hasEditorialLine ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      D'après ta ligne éditoriale, tu consacres <strong>{editorialTime}h/semaine</strong> à ta communication Instagram habituelle.
                    </p>
                    <p className="text-sm text-muted-foreground">Pendant ce lancement, tu peux ajouter :</p>
                    <div className="space-y-2">
                      {TIME_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setExtraTime(opt.id)}
                          className={cn(
                            "w-full text-left rounded-xl border p-3 text-sm transition-colors",
                            extraTime === opt.id
                              ? "border-primary bg-primary/5 font-medium"
                              : "border-border bg-card hover:border-primary/40"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Combien de temps par semaine tu peux consacrer à ce lancement ?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {FALLBACK_TIME_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setExtraTime(opt.id); setEditorialTime(0); }}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                            extraTime === opt.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card hover:border-primary/40"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <p className="text-xs text-muted-foreground italic">
                  💡 L'IA adaptera le nombre de contenus à ton temps réel.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(0)} className="rounded-full">
                Retour
              </Button>
              <Button onClick={() => setCurrentStep(2)} disabled={!extraTime} className="rounded-full gap-2">
                Continuer <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ═══════ STEP 2: Generate ═══════ */}
        {currentStep === 2 && (
          <div className="mt-8 text-center space-y-4">
            <p className="text-muted-foreground">
              L'IA va générer un plan de <strong>{selectedTemplate?.contentRange}</strong> adapté à ton temps et à ta stratégie.
            </p>
            <Button onClick={generatePlan} disabled={generating || !!proposal} size="lg" className="rounded-full gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {generating ? "Génération en cours..." : "✨ Générer mon plan de lancement"}
            </Button>
            {proposal && <div className="space-y-2"><p>Ta proposition est conservée. Réessaie son enregistrement sans la régénérer.</p><Button disabled={generating} onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true; setGenerating(true);
              try { await persistProposal(proposal); } catch (error) { if (visit.current) toast.error(launchSaveError(error)); }
              finally { inFlight.current = false; if (visit.current) setGenerating(false); }
            }}>Réessayer l’enregistrement</Button></div>}
            {generating && (
              <div className="flex items-center gap-3 justify-center animate-fade-in pt-4">
                <div className="flex gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.16s" }} />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.32s" }} />
                </div>
                <span className="text-sm italic text-muted-foreground">L'IA prépare tes emplacements stratégiques...</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STEP 3: Preview ═══════ */}
        {currentStep === 3 && slots.length > 0 && (
          <div className="mt-6 space-y-6">
            {/* View toggle */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-border overflow-hidden">
                {([
                  { id: "list" as const, icon: LayoutList, label: "Liste" },
                  { id: "timeline" as const, icon: GitBranch, label: "Timeline" },
                  { id: "calendar" as const, icon: CalendarIconFull, label: "Calendrier" },
                ] as const).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setViewMode(v.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === v.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <v.icon className="h-3.5 w-3.5" />
                    {v.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)} className="rounded-full gap-1.5 ml-auto">
                <RefreshCw className="h-3.5 w-3.5" /> Regénérer
              </Button>
            </div>

            {/* ── LIST VIEW ── */}
            {viewMode === "list" && (
              <div className="space-y-6">
                {(phaseConfigs.length ? phaseConfigs : [{ name: "default", label: "Plan", emoji: "📋", start_date: "", end_date: "" }]).map((phase) => {
                  const phaseSlots = slotsByPhase[phase.name] || [];
                  if (!phaseSlots.length) return null;
                  const style = PHASE_STYLES[phase.name] || { bg: "bg-muted/40", border: "border-border", emoji: phase.emoji, label: phase.label };
                  return (
                    <div key={phase.name}>
                      <div className={cn("rounded-xl border p-3 mb-3", style.bg, style.border)}>
                        <h3 className="font-bold text-foreground">{style.emoji} {style.label}</h3>
                        <p className="text-xs text-muted-foreground">
                          {phase.start_date && phase.end_date
                            ? `${formatDate(phase.start_date)} → ${formatDate(phase.end_date)}`
                            : ""}
                          {" · "}{phaseSlots.length} contenu{phaseSlots.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="space-y-3 pl-4 border-l-2 border-border ml-4">
                        {phaseSlots.map((slot) => (
                          <SlotCard key={slot.id} slot={slot} disabled={saving} selected={selection.has(slot.id)} onSelect={(checked) => setSelection(prev => {
                            const next = new Set(prev); if (checked) next.add(slot.id); else next.delete(slot.id); return next;
                          })} onDelete={() => deleteSlot(slot.id)} onDateChange={(d) => updateSlotDate(slot.id, d)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TIMELINE VIEW ── */}
            {viewMode === "timeline" && (
              <div className="space-y-2">
                {/* Phase bar */}
                <div className="flex gap-0.5 rounded-xl overflow-hidden">
                  {(phaseConfigs.length ? phaseConfigs : []).map((phase) => {
                    const count = (slotsByPhase[phase.name] || []).length;
                    const style = PHASE_STYLES[phase.name];
                    return (
                      <div key={phase.name} className={cn("flex-1 p-2 text-center text-xs font-medium", style?.bg || "bg-muted")} style={{ flex: count || 1 }}>
                        {phase.emoji} {phase.label}
                      </div>
                    );
                  })}
                </div>
                {/* Slots flow */}
                <div className="flex gap-3 overflow-x-auto pb-4 pt-2">
                  {[...slots].sort((a, b) => a.date.localeCompare(b.date)).map((slot, i) => {
                    const cat = CATEGORY_COLORS[slot.category];
                    return (
                      <div key={slot.id} className="flex items-center gap-2 shrink-0">
                        <div className={cn("rounded-xl border p-3 w-32 space-y-1", cat?.bg || "bg-card")}>
                          <div className="text-lg">{slot.content_type_emoji}</div>
                          <p className="text-xs font-medium text-foreground truncate">
                            {CONTENT_TYPES.find((c) => c.id === slot.content_type)?.label || slot.content_type}
                          </p>
                          <p className="text-2xs text-muted-foreground">{formatDate(slot.date)}</p>
                          <Badge variant="secondary" className="text-2xs">
                            {FORMAT_OPTIONS.find((f) => f.id === slot.format)?.label || slot.format}
                          </Badge>
                        </div>
                        {i < slots.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── CALENDAR VIEW ── */}
            {viewMode === "calendar" && (
              <CalendarPreview slots={slots} />
            )}

            {/* ── Launch Stories Planning ── */}
            <LaunchStoriesPlanning launchName={launch?.name} />

            {/* ── Recap ── */}
            <Card className="border-primary/20">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-bold text-foreground">📊 Récap du plan</h3>
                <p className="text-sm text-muted-foreground">
                  {stats.total} contenus · Mix : 👀 Visibilité {stats.visibilite}% | 🤝 Confiance {stats.confiance}% | 💰 Vente {stats.vente}%
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button onClick={sendToCalendar} disabled={saving || !slots.some(s => selection.has(s.id))} className="rounded-full gap-2">
                    <CalendarPlus className="h-4 w-4" />
                    {saving ? "Envoi en cours..." : launch?.plan_sent_to_calendar ? "📅 Renvoyer dans mon calendrier" : `📅 Envoyer la sélection (${slots.filter(s => selection.has(s.id)).length})`}
                  </Button>
                  <Button variant="outline" onClick={verifySaved} className="rounded-full gap-2">
                    <Save className="h-4 w-4" /> Sauvegarder sans envoyer
                  </Button>
                  <Button variant="outline" onClick={() => setShowIdeasDialog(true)} className="rounded-full gap-2">
                    <Lightbulb className="h-4 w-4" /> Sauvegarder en idée
                  </Button>
                </div>
                <SaveToIdeasDialog
                  open={showIdeasDialog}
                  onOpenChange={setShowIdeasDialog}
                  contentType="post_instagram"
                  subject={`Lancement : ${launch?.name || "Mon lancement"}`}
                  contentData={{ type: "generated", text: slots.map(s => `${s.date} — ${s.content_type}`).join("\n") }}
                  sourceModule="instagram-launch"
                  format="post"
                />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Helper components ──

function DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (d: string) => void }) {
  const date = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !date && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "d MMM yyyy", { locale: fr }) : "Choisir"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SlotCard({ slot, onDelete, onDateChange, selected, onSelect, disabled }: { slot: LaunchSlot; onDelete: () => void; onDateChange: (d: string) => void; selected: boolean; onSelect: (value: boolean) => void; disabled: boolean }) {
  const cat = CATEGORY_COLORS[slot.category];
  const contentType = CONTENT_TYPES.find((c) => c.id === slot.content_type);
  const formatLabel = FORMAT_OPTIONS.find((f) => f.id === slot.format)?.label || slot.format;

  return (
    <div className={cn("rounded-xl border p-4 ml-4 space-y-2", cat?.bg || "bg-card")}>
      <label className="flex gap-2 items-center text-xs"><Checkbox checked={selected} disabled={disabled} onCheckedChange={value => onSelect(value === true)} />Inclure dans l’envoi</label>
      <DatePicker label="Date prévue" value={slot.date} onChange={onDateChange} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">📅 {formatDate(slot.date)}</span>
          <Badge variant="secondary" className="text-xs">{formatLabel}</Badge>
          {cat && <Badge className={cn("text-2xs", cat.bg, cat.text)}>{cat.label}</Badge>}
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={disabled} className="h-7 w-7 text-destructive shrink-0" aria-label="Supprimer ce contenu">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg">{slot.content_type_emoji}</span>
        <span className="font-medium text-sm text-foreground">{contentType?.label || slot.content_type}</span>
      </div>
      <p className="text-xs text-muted-foreground">🎯 {slot.objective}</p>
      {slot.angle_suggestion && (
        <p className="text-xs text-muted-foreground italic">💡 {slot.angle_suggestion}</p>
      )}
    </div>
  );
}

function CalendarPreview({ slots }: { slots: LaunchSlot[] }) {
  // Group by week
  const slotsByDate = useMemo(() => {
    const map: Record<string, LaunchSlot[]> = {};
    slots.forEach((s) => { if (!map[s.date]) map[s.date] = []; map[s.date].push(s); });
    return map;
  }, [slots]);

  // Get date range
  const sortedDates = Object.keys(slotsByDate).sort();
  if (!sortedDates.length) return null;

  const first = new Date(sortedDates[0] + "T00:00:00");
  const last = new Date(sortedDates[sortedDates.length - 1] + "T00:00:00");

  // Build weeks
  const weeks: Date[][] = [];
  const cursor = new Date(first);
  const dow = cursor.getDay();
  cursor.setDate(cursor.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday

  while (cursor <= last || weeks.length === 0) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const daySlots = slotsByDate[dateStr] || [];
            return (
              <div key={dateStr} className="rounded-lg border border-border bg-card p-1.5 min-h-[60px]">
                <div className="text-2xs text-muted-foreground mb-1">{day.getDate()}</div>
                {daySlots.map((s) => {
                  const cat = CATEGORY_COLORS[s.category];
                  return (
                    <div key={s.id} className={cn("rounded-md px-1 py-0.5 mb-0.5 text-2xs font-medium truncate", cat?.bg || "bg-muted")}>
                      {s.content_type_emoji} {FORMAT_OPTIONS.find((f) => f.id === s.format)?.label || s.format}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr + "T00:00:00"), "d MMM", { locale: fr });
  } catch {
    return dateStr;
  }
}

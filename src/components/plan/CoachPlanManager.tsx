import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { CoachExercise, StepVisibility, PlanData } from "@/lib/plan-engine";

interface CoachPlanManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  plan: PlanData;
  exercises: CoachExercise[];
  hiddenSteps: StepVisibility[];
  onExercisesChange: (exercises: CoachExercise[]) => void;
  onVisibilityChange: (hidden: StepVisibility[]) => void;
}

const ROUTE_OPTIONS = [
  { value: "/branding", label: "Mon identité" },
  { value: "/branding/persona", label: "Persona" },
  { value: "/branding/storytelling", label: "Storytelling" },
  { value: "/branding/proposition", label: "Proposition de valeur" },
  { value: "/branding/ton", label: "Ton & style" },
  { value: "/branding/strategie", label: "Stratégie de contenu" },
  { value: "/branding/offres", label: "Offres" },
  { value: "/instagram/audit", label: "Audit Instagram" },
  { value: "/instagram/profil/bio", label: "Bio Instagram" },
  { value: "/instagram/profil/edito", label: "Ligne éditoriale" },
  { value: "/creer", label: "Atelier créatif" },
  { value: "/linkedin/audit", label: "Audit LinkedIn" },
  { value: "/linkedin/profil", label: "Profil LinkedIn" },
  { value: "/calendrier", label: "Calendrier" },
  { value: "/seo", label: "SEO" },
];

const PHASE_OPTIONS = [
  { value: "foundations", label: "🧱 Les fondations" },
  { value: "channels", label: "📡 Tes canaux" },
  { value: "strategy", label: "🎯 Ta stratégie" },
  { value: "daily", label: "⚡ Ton quotidien" },
  { value: "coach", label: "👩‍🏫 Exercices coach" },
];

interface ExerciseForm {
  title: string;
  description: string;
  deadline: string;
  app_route: string;
  custom_route: string;
  phase_id: string;
}

const emptyForm: ExerciseForm = {
  title: "",
  description: "",
  deadline: "",
  app_route: "",
  custom_route: "",
  phase_id: "coach",
};

export default function CoachPlanManager({
  open,
  onOpenChange,
  workspaceId,
  plan,
  exercises,
  hiddenSteps,
  onExercisesChange,
  onVisibilityChange,
}: CoachPlanManagerProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<ExerciseForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // All standard step IDs from plan (before filtering)
  const allStandardSteps = plan.phases
    .flatMap(p => p.steps.filter(s => !s.isCoachExercise).map(s => ({ ...s, phaseTitle: `${p.emoji} ${p.title}` })));

  const handleSaveExercise = async () => {
    if (!form.title.trim() || !user) return;

    const route = form.app_route === "__custom" ? form.custom_route : form.app_route;
    const payload = {
      workspace_id: workspaceId,
      created_by: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      deadline: form.deadline || null,
      app_route: route || null,
      phase_id: form.phase_id,
      sort_order: editingId ? undefined : exercises.length,
    };

    if (editingId) {
      const { title, description, deadline, app_route, phase_id } = payload;
      await (supabase.from("coach_exercises" as any).update({ title, description, deadline, app_route, phase_id, updated_at: new Date().toISOString() }).eq("id", editingId) as any);
      onExercisesChange(exercises.map(e => e.id === editingId ? { ...e, title, description, deadline, app_route, phase_id } as CoachExercise : e));
      toast({ title: "Exercice modifié" });
    } else {
      const { data } = await (supabase.from("coach_exercises" as any).insert(payload).select().single() as any);
      if (data) onExercisesChange([...exercises, data as CoachExercise]);
      toast({ title: "Exercice ajouté ✅" });
    }

    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await (supabase.from("coach_exercises" as any).delete().eq("id", id) as any);
    onExercisesChange(exercises.filter(e => e.id !== id));
    toast({ title: "Exercice supprimé" });
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const newList = [...exercises];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newList.length) return;
    [newList[index], newList[targetIdx]] = [newList[targetIdx], newList[index]];
    newList.forEach((e, i) => e.sort_order = i);
    onExercisesChange(newList);
    // Persist order
    for (const e of newList) {
      await (supabase.from("coach_exercises" as any).update({ sort_order: e.sort_order }).eq("id", e.id) as any);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await (supabase.from("coach_exercises" as any).update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id) as any);
    onExercisesChange(exercises.map(e => e.id === id ? { ...e, status: newStatus } : e));
  };

  const handleEdit = (ex: CoachExercise) => {
    const isCustom = ex.app_route && !ROUTE_OPTIONS.some(r => r.value === ex.app_route);
    setForm({
      title: ex.title,
      description: ex.description || "",
      deadline: ex.deadline || "",
      app_route: isCustom ? "__custom" : (ex.app_route || ""),
      custom_route: isCustom ? (ex.app_route || "") : "",
      phase_id: ex.phase_id,
    });
    setEditingId(ex.id);
    setShowForm(true);
  };

  const handleToggleVisibility = async (stepId: string, hidden: boolean) => {
    await (supabase.from("plan_step_visibility" as any).upsert({
      workspace_id: workspaceId,
      step_id: stepId,
      hidden,
      hidden_by: user?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,step_id" }) as any);

    const existing = hiddenSteps.find(v => v.step_id === stepId);
    if (existing) {
      onVisibilityChange(hiddenSteps.map(v => v.step_id === stepId ? { ...v, hidden } : v));
    } else {
      onVisibilityChange([...hiddenSteps, { step_id: stepId, hidden }]);
    }
  };

  const hiddenSet = new Set(hiddenSteps.filter(v => v.hidden).map(v => v.step_id));

  const handleToggleAll = async (hide: boolean) => {
    const updates = allStandardSteps.map(s => ({
      workspace_id: workspaceId,
      step_id: s.id,
      hidden: hide,
      hidden_by: user?.id,
      updated_at: new Date().toISOString(),
    }));
    for (const u of updates) {
      await (supabase.from("plan_step_visibility" as any).upsert(u, { onConflict: "workspace_id,step_id" }) as any);
    }
    onVisibilityChange(allStandardSteps.map(s => ({ step_id: s.id, hidden: hide })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚙️ Personnaliser le plan</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="exercises" className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="exercises">Exercices</TabsTrigger>
            <TabsTrigger value="visibility">Visibilité</TabsTrigger>
          </TabsList>

          <TabsContent value="exercises" className="space-y-4 mt-4">
            {/* Exercise list */}
            {exercises.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun exercice custom pour le moment.</p>
            )}

            {exercises.map((ex, idx) => (
              <div key={ex.id} className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{ex.title}</p>
                  {ex.description && <p className="text-xs text-muted-foreground mt-0.5">{ex.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Select value={ex.status} onValueChange={(v) => handleStatusChange(ex.id, v)}>
                      <SelectTrigger className="h-7 text-xs w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">À faire</SelectItem>
                        <SelectItem value="in_progress">En cours</SelectItem>
                        <SelectItem value="done">Fait</SelectItem>
                      </SelectContent>
                    </Select>
                    {ex.deadline && (
                      <span className="text-xs text-muted-foreground">📅 {new Date(ex.deadline).toLocaleDateString("fr-FR")}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReorder(idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReorder(idx, 1)} disabled={idx === exercises.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(ex)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ex.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Add/Edit form */}
            {showForm ? (
              <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div>
                  <Label className="text-xs">Titre *</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Rédiger 3 accroches" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Détails de l'exercice…" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Deadline</Label>
                    <Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Phase</Label>
                    <Select value={form.phase_id} onValueChange={v => setForm(f => ({ ...f, phase_id: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASE_OPTIONS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Lien vers un outil</Label>
                  <Select value={form.app_route} onValueChange={v => setForm(f => ({ ...f, app_route: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Aucun lien" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun</SelectItem>
                      {ROUTE_OPTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                      <SelectItem value="__custom">URL personnalisée…</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.app_route === "__custom" && (
                    <Input className="mt-2" value={form.custom_route} onChange={e => setForm(f => ({ ...f, custom_route: e.target.value }))} placeholder="https://… ou /chemin" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveExercise} disabled={!form.title.trim()} size="sm">
                    {editingId ? "Modifier" : "Ajouter"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" onClick={() => { setShowForm(true); setForm(emptyForm); setEditingId(null); }}>
                <Plus className="h-4 w-4" /> Ajouter un exercice
              </Button>
            )}
          </TabsContent>

          <TabsContent value="visibility" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleToggleAll(false)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Tout afficher
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleAll(true)} className="gap-1.5">
                <EyeOff className="h-3.5 w-3.5" /> Tout masquer
              </Button>
            </div>

            {plan.phases.filter(p => p.id !== "coach").map(phase => (
              <div key={phase.id} className="space-y-1">
                <h4 className="text-sm font-medium text-foreground">{phase.emoji} {phase.title}</h4>
                {phase.steps.filter(s => !s.isCoachExercise).map(step => {
                  const isHidden = hiddenSet.has(step.id);
                  return (
                    <div key={step.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isHidden ? "opacity-50 border-border" : "border-border"}`}>
                      <span className={`text-sm ${isHidden ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {isHidden ? <EyeOff className="h-3.5 w-3.5 inline mr-1.5" /> : null}
                        {step.label}
                      </span>
                      <Switch
                        checked={!isHidden}
                        onCheckedChange={(checked) => handleToggleVisibility(step.id, !checked)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ChevronDown, Trash2, Loader2 } from "lucide-react";

interface ResetTable {
  id: string;
  label: string;
  table: string;
  filterColumn: "user_id" | "workspace_id";
  updateInstead?: Record<string, any>;
}

interface ResetGroup {
  id: string;
  label: string;
  emoji: string;
  tables: ResetTable[];
}

const RESET_GROUPS: ResetGroup[] = [
  {
    id: "onboarding", label: "Onboarding", emoji: "🚀",
    tables: [
      { id: "onboarding", label: "Reset onboarding", table: "profiles", filterColumn: "user_id", updateInstead: { onboarding_completed: false, onboarding_completed_at: null, onboarding_step: null } },
    ],
  },
  {
    id: "branding", label: "Branding", emoji: "🎨",
    tables: [
      { id: "storytelling", label: "Storytelling", table: "storytelling", filterColumn: "user_id" },
      { id: "persona", label: "Persona", table: "persona", filterColumn: "user_id" },
      { id: "proposition", label: "Proposition de valeur", table: "brand_proposition", filterColumn: "user_id" },
      { id: "tone", label: "Ton & voix", table: "brand_profile", filterColumn: "user_id" },
      { id: "strategy", label: "Stratégie éditoriale", table: "brand_strategy", filterColumn: "user_id" },
      { id: "charter", label: "Charte graphique", table: "brand_charter", filterColumn: "user_id" },
      { id: "offers", label: "Offres", table: "offers", filterColumn: "user_id" },
      { id: "branding_audits", label: "Audits branding", table: "branding_audits", filterColumn: "user_id" },
      { id: "branding_coaching", label: "Sessions coaching branding", table: "branding_coaching_sessions", filterColumn: "user_id" },
      { id: "voice_profile", label: "Voice profile", table: "voice_profile", filterColumn: "user_id" },
      { id: "branding_mirror", label: "Branding mirror results", table: "branding_mirror_results", filterColumn: "user_id" },
      { id: "branding_autofill", label: "Autofill branding", table: "branding_autofill", filterColumn: "user_id" },
    ],
  },
  {
    id: "content", label: "Contenus & Calendrier", emoji: "📅",
    tables: [
      { id: "calendar_comments", label: "Commentaires calendrier", table: "calendar_comments", filterColumn: "user_id" },
      { id: "calendar_posts", label: "Posts du calendrier", table: "calendar_posts", filterColumn: "user_id" },
      { id: "saved_ideas", label: "Idées sauvegardées", table: "saved_ideas", filterColumn: "user_id" },
      { id: "generated_posts", label: "Posts générés", table: "generated_posts", filterColumn: "user_id" },
      { id: "generated_carousels", label: "Carrousels générés", table: "generated_carousels", filterColumn: "user_id" },
      { id: "content_drafts", label: "Brouillons", table: "content_drafts", filterColumn: "user_id" },
      { id: "reels_scripts", label: "Scripts reels", table: "reels_scripts", filterColumn: "user_id" },
      { id: "stories_sequences", label: "Séquences stories", table: "stories_sequences", filterColumn: "user_id" },
      { id: "launches", label: "Lancements", table: "launches", filterColumn: "user_id" },
    ],
  },
  {
    id: "plan", label: "Plan de com", emoji: "📋",
    tables: [
      { id: "user_plan_config", label: "Configuration du plan", table: "user_plan_config", filterColumn: "user_id" },
      { id: "plan_tasks", label: "Tâches du plan", table: "plan_tasks", filterColumn: "user_id" },
      { id: "plan_overrides", label: "Overrides manuels", table: "user_plan_overrides", filterColumn: "user_id" },
      { id: "communication_plans", label: "Plans de communication", table: "communication_plans", filterColumn: "user_id" },
    ],
  },
  {
    id: "stats", label: "Stats & engagement", emoji: "📊",
    tables: [
      { id: "monthly_stats", label: "Stats mensuelles", table: "monthly_stats", filterColumn: "user_id" },
      { id: "stats_config", label: "Config stats", table: "stats_config", filterColumn: "user_id" },
      { id: "engagement_logs", label: "Logs engagement", table: "engagement_checklist_logs", filterColumn: "user_id" },
      { id: "engagement_streaks", label: "Streaks", table: "engagement_streaks", filterColumn: "user_id" },
      { id: "routine_completions", label: "Routine completions", table: "routine_completions", filterColumn: "user_id" },
    ],
  },
  {
    id: "chat", label: "Chat & IA", emoji: "💬",
    tables: [
      { id: "chat_messages", label: "Messages chat", table: "chat_guide_messages", filterColumn: "user_id" },
      { id: "chat_conversations", label: "Conversations chat", table: "chat_guide_conversations", filterColumn: "user_id" },
      { id: "ai_usage", label: "Usage IA (compteurs)", table: "ai_usage", filterColumn: "user_id" },
    ],
  },
  {
    id: "social", label: "Profils réseaux", emoji: "🔗",
    tables: [
      { id: "instagram_audit", label: "Audit Instagram", table: "instagram_audit", filterColumn: "user_id" },
      { id: "instagram_editorial", label: "Ligne éditoriale Instagram", table: "instagram_editorial_line", filterColumn: "user_id" },
      { id: "linkedin_profile", label: "Profil LinkedIn", table: "linkedin_profile", filterColumn: "user_id" },
      { id: "linkedin_audit", label: "Audit LinkedIn", table: "linkedin_audit", filterColumn: "user_id" },
    ],
  },
  {
    id: "misc", label: "Divers", emoji: "🏷️",
    tables: [
      { id: "user_badges", label: "Badges", table: "user_badges", filterColumn: "user_id" },
      { id: "notifications", label: "Notifications", table: "notifications", filterColumn: "user_id" },
      { id: "user_documents", label: "Documents importés", table: "user_documents", filterColumn: "user_id" },
      { id: "beta_feedback", label: "Feedback bêta", table: "beta_feedback", filterColumn: "user_id" },
    ],
  },
];

export default function AdminResetTool() {
  const [targetEmail, setTargetEmail] = useState("laetitiamattioli@gmail.com");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResetting, setTotalResetting] = useState(false);

  const allTableIds = RESET_GROUPS.flatMap(g => g.tables.map(t => t.id));
  const allSelected = allTableIds.length > 0 && allTableIds.every(id => selectedTables.includes(id));

  const toggleAll = () => {
    setSelectedTables(allSelected ? [] : [...allTableIds]);
  };

  const toggleGroup = (group: ResetGroup) => {
    const groupIds = group.tables.map(t => t.id);
    const allGroupSelected = groupIds.every(id => selectedTables.includes(id));
    if (allGroupSelected) {
      setSelectedTables(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setSelectedTables(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  const toggleTable = (tableId: string) => {
    setSelectedTables(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  const selectedCount = selectedTables.length;

  const resolveUserId = async (): Promise<string | null> => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", targetEmail)
      .maybeSingle();
    if (!profile) {
      toast.error("Compte non trouvé pour " + targetEmail);
      return null;
    }
    return profile.user_id;
  };

  const resetTables = async (userId: string, tableFilter?: (tableId: string) => boolean) => {
    let deleted = 0;
    const errors: string[] = [];

    for (const group of RESET_GROUPS) {
      for (const table of group.tables) {
        if (tableFilter && !tableFilter(table.id)) continue;
        try {
          if (table.updateInstead) {
            const { error } = await (supabase.from(table.table as any) as any)
              .update(table.updateInstead)
              .eq(table.filterColumn, userId);
            if (error) throw error;
          } else {
            const { error } = await (supabase.from(table.table as any) as any)
              .delete()
              .eq(table.filterColumn, userId);
            if (error) throw error;
          }
          deleted++;
        } catch (e: any) {
          errors.push(`${table.label}: ${e.message || e}`);
        }
      }
    }
    return { deleted, errors };
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const userId = await resolveUserId();
      if (!userId) return;
      const { deleted, errors } = await resetTables(userId, (id) => selectedTables.includes(id));

      if (errors.length > 0) {
        toast.warning(`${deleted} tables reset, ${errors.length} erreurs`, { description: errors.join(" | "), duration: 10000 });
      } else {
        toast.success(`✅ ${deleted} tables réinitialisées pour ${targetEmail}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotalReset = async () => {
    setTotalResetting(true);
    try {
      const userId = await resolveUserId();
      if (!userId) return;

      // Call the edge function which uses service role key (bypasses RLS)
      const session = (await supabase.auth.getSession()).data.session;
      const { data, error } = await supabase.functions.invoke("reset-onboarding", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { targetUserId: userId },
      });

      if (error) {
        toast.error("Erreur lors du reset", { description: error.message });
        return;
      }

      if (data?.errors?.length > 0) {
        toast.warning(`🔥 ${data.tables_cleaned} tables reset, ${data.errors.length} erreurs`, { description: data.errors.join(" | "), duration: 10000 });
      } else {
        toast.success(`🔥 Compte ${targetEmail} remis à zéro. ${data?.tables_cleaned || 0} tables réinitialisées.`);
      }

      // Clear ALL onboarding & dashboard localStorage cache
      localStorage.removeItem("lac_onboarding_step");
      localStorage.removeItem("lac_onboarding_answers");
      localStorage.removeItem("lac_onboarding_branding");
      localStorage.removeItem("lac_onboarding_ts");
      localStorage.removeItem("lac_prenom");
      localStorage.removeItem("lac_activite");
      localStorage.removeItem("lac_welcome_seen");
      localStorage.removeItem("lac_dashboard_tour_seen");
      localStorage.removeItem("branding_skip_import");
      localStorage.removeItem("lac_onboarding_reset");

      // Redirect to onboarding if the reset target is the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === targetEmail) {
        window.location.href = "/onboarding";
      }
    } finally {
      setTotalResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium mb-1 block">Email du compte à reset</label>
        <Input
          value={targetEmail}
          onChange={e => setTargetEmail(e.target.value)}
          placeholder="email@example.com"
          className="max-w-md"
        />
      </div>

      {/* Total reset button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={!targetEmail || totalResetting} className="w-full max-w-md">
            {totalResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            🔥 Reset total du compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset total du compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              TOUTES les données seront supprimées pour <strong>{targetEmail}</strong> : profil (reset onboarding), branding, contenus, calendrier, plan de com, stats, chat, audits, réseaux sociaux, badges, etc. Le compte repartira comme au premier jour. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleTotalReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Oui, tout supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="border-t border-border/50 pt-4">
        <p className="text-sm font-medium text-muted-foreground mb-4">Ou sélectionne des catégories spécifiques :</p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          id="select-all"
        />
        <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
          Tout sélectionner / Tout désélectionner
        </label>
      </div>

      <div className="space-y-2">
        {RESET_GROUPS.map(group => {
          const groupIds = group.tables.map(t => t.id);
          const allGroupSelected = groupIds.every(id => selectedTables.includes(id));
          const someGroupSelected = groupIds.some(id => selectedTables.includes(id));

          return (
            <Collapsible key={group.id} defaultOpen>
              <div className="border border-border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allGroupSelected}
                      onCheckedChange={() => toggleGroup(group)}
                      onClick={e => e.stopPropagation()}
                      className={someGroupSelected && !allGroupSelected ? "opacity-60" : ""}
                    />
                    <span className="text-sm font-semibold">
                      {group.emoji} {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({groupIds.filter(id => selectedTables.includes(id)).length}/{groupIds.length})
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-3 pt-1 space-y-1">
                  {group.tables.map(table => (
                    <div key={table.id} className="flex items-center gap-2 ml-6">
                      <Checkbox
                        checked={selectedTables.includes(table.id)}
                        onCheckedChange={() => toggleTable(table.id)}
                        id={`table-${table.id}`}
                      />
                      <label htmlFor={`table-${table.id}`} className="text-sm cursor-pointer">
                        {table.label}
                      </label>
                    </div>
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={selectedCount === 0 || !targetEmail || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            🗑️ Réinitialiser ({selectedCount} catégories)
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la réinitialisation</AlertDialogTitle>
            <AlertDialogDescription>
              Tu vas effacer <strong>{selectedCount} catégories</strong> pour <strong>{targetEmail}</strong>.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmer la suppression
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Confetti from "@/components/Confetti";
import ProspectPipeline from "./ProspectPipeline";
import ProspectDetailDialog from "./ProspectDetailDialog";
import AddProspectForm from "./AddProspectForm";
import ProspectionReminders from "./ProspectionReminders";
import ProspectionStats from "./ProspectionStats";

export interface Prospect {
  id: string;
  instagram_username: string;
  display_name: string | null;
  activity: string | null;
  strengths: string | null;
  probable_problem: string | null;
  source: string | null;
  note: string | null;
  stage: string;
  decision_phase: string | null;
  relevant_offer: string | null;
  last_interaction_at: string | null;
  next_reminder_at: string | null;
  next_reminder_text: string | null;
  conversion_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectInteraction {
  id: string;
  prospect_id: string;
  interaction_type: string;
  content: string | null;
  ai_generated: boolean;
  responded: boolean | null;
  created_at: string;
}

const STAGES = [
  { key: "to_contact", label: "🌱 À recontacter", color: "bg-emerald-100 text-emerald-800" },
  { key: "in_conversation", label: "💬 En conversation", color: "bg-blue-100 text-blue-800" },
  { key: "resource_sent", label: "🎁 Ressource envoyée", color: "bg-purple-100 text-purple-800" },
  { key: "offer_proposed", label: "🤝 Offre proposée", color: "bg-amber-100 text-amber-800" },
  { key: "converted", label: "✅ Client·e", color: "bg-green-100 text-green-800" },
];

export { STAGES };

export default function ProspectionSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const loadProspects = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setProspects(data as Prospect[]);
  }, [user]);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  const addProspect = async (p: Partial<Prospect>) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("prospects")
      .insert({
        user_id: user.id,
        instagram_username: p.instagram_username!,
        display_name: p.display_name,
        activity: p.activity,
        source: p.source,
        note: p.note,
      })
      .select("*")
      .single();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setProspects(prev => [data as Prospect, ...prev]);
      setAdding(false);
      toast({ title: "🎯 Prospect ajouté·e !" });

      // Create auto-reminder J+2
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 2);
      await supabase.from("prospects").update({
        next_reminder_at: reminderDate.toISOString(),
        next_reminder_text: `Premier contact avec @${(data as Prospect).instagram_username}`,
      }).eq("id", (data as Prospect).id);
    }
  };

  const updateProspect = async (id: string, updates: Partial<Prospect>) => {
    const prevStage = prospects.find(p => p.id === id)?.stage;
    await supabase.from("prospects").update(updates).eq("id", id);
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

    if (updates.stage === "converted" && prevStage !== "converted") {
      setShowConfetti(true);
      toast({ title: "🎉 Bravo ! Nouveau·elle client·e !" });
      setTimeout(() => setShowConfetti(false), 4000);
    }
  };

  const deleteProspect = async (id: string) => {
    await supabase.from("prospects").delete().eq("id", id);
    setProspects(prev => prev.filter(p => p.id !== id));
    setSelectedProspect(null);
  };

  const todayReminders = prospects.filter(p => {
    if (!p.next_reminder_at) return false;
    return new Date(p.next_reminder_at) <= new Date();
  });

  const stageCounts = STAGES.map(s => ({
    ...s,
    count: prospects.filter(p => p.stage === s.key).length,
  }));

  return (
    <div className="space-y-5">
      {showConfetti && <Confetti />}

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-display text-lg font-bold text-foreground">🎯 Prospection douce</h2>
        <p className="text-sm text-muted-foreground">
          Transforme tes abonné·es les plus engagé·es en client·es, sans jamais spammer.
        </p>

        {/* Stage counters */}
        <div className="grid grid-cols-5 gap-2">
          {stageCounts.map(s => (
            <div key={s.key} className={`rounded-lg p-2.5 text-center ${s.color}`}>
              <div className="text-lg font-bold">{s.count}</div>
              <div className="text-[10px] leading-tight">{s.label.split(" ").slice(1).join(" ")}</div>
            </div>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="w-full">
          <Plus className="h-3 w-3 mr-1" /> Ajouter un prospect
        </Button>
      </div>

      {/* Add form */}
      {adding && <AddProspectForm onAdd={addProspect} onCancel={() => setAdding(false)} />}

      {/* Reminders */}
      {todayReminders.length > 0 && (
        <ProspectionReminders
          reminders={todayReminders}
          onSelect={setSelectedProspect}
          onPostpone={async (id) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            await updateProspect(id, { next_reminder_at: tomorrow.toISOString() });
          }}
        />
      )}

      {/* Pipeline */}
      <ProspectPipeline
        prospects={prospects}
        stages={STAGES}
        onSelect={setSelectedProspect}
        onStageChange={(id, stage) => updateProspect(id, { stage })}
      />

      {/* Stats */}
      <ProspectionStats prospects={prospects} />

      {/* Detail dialog */}
      {selectedProspect && (
        <ProspectDetailDialog
          prospect={selectedProspect}
          open={!!selectedProspect}
          onOpenChange={(open) => { if (!open) setSelectedProspect(null); }}
          onUpdate={(updates) => updateProspect(selectedProspect.id, updates)}
          onDelete={() => deleteProspect(selectedProspect.id)}
        />
      )}
    </div>
  );
}

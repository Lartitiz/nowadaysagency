import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { Plus, MessageCircle, SkipForward } from "lucide-react";
import Confetti from "@/components/Confetti";
import ProspectPipeline from "./ProspectPipeline";
import ProspectDetailDialog from "./ProspectDetailDialog";
import AddProspectForm from "./AddProspectForm";
import ProspectionReminders from "./ProspectionReminders";
import ProspectionStats from "./ProspectionStats";
import DmGenerator from "./DmGenerator";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  noted_interest: string | null;
  to_avoid: string | null;
  last_conversation: string | null;
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
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [dmProspect, setDmProspect] = useState<Prospect | null>(null);
  const [dmInteractions, setDmInteractions] = useState<ProspectInteraction[]>([]);

  const loadProspects = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("prospects") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false });
    if (data) setProspects(data as Prospect[]);
  }, [user?.id]);

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
      console.error("Erreur technique:", error);
      toast({ title: "Erreur", description: friendlyError(error), variant: "destructive" });
      return;
    }
    if (data) {
      setProspects(prev => [data as Prospect, ...prev]);
      setAdding(false);
      toast({ title: "🎯 Prospect ajouté·e !" });

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

  const openDmForProspect = async (prospect: Prospect) => {
    setDmProspect(prospect);
    // Load interactions for DM context
    const { data } = await supabase
      .from("prospect_interactions")
      .select("*")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: true });
    setDmInteractions((data || []) as ProspectInteraction[]);
  };

  const handleDmSent = (content: string, approach: string) => {
    if (!dmProspect || !user) return;
    // Log interaction
    supabase.from("prospect_interactions").insert({
      prospect_id: dmProspect.id,
      user_id: user.id,
      interaction_type: "dm_sent",
      content,
      ai_generated: true,
    });

    const nextStage = dmProspect.stage === "to_contact" ? "in_conversation" : dmProspect.stage;
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 3);
    updateProspect(dmProspect.id, {
      stage: nextStage,
      last_interaction_at: new Date().toISOString(),
      next_reminder_at: reminderDate.toISOString(),
      next_reminder_text: `Vérifier si @${dmProspect.instagram_username} a répondu`,
    });
    setDmProspect(null);
    toast({ title: "✅ Message noté dans l'historique !" });
  };

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

      {/* DM du jour section */}
      {(todayReminders.length > 0 || prospects.length > 0) && (
        <div className="rounded-xl border-2 border-primary/20 bg-rose-pale/30 p-4 space-y-3">
          <h3 className="text-sm font-bold">📩 Mes DM du jour</h3>
          
          {todayReminders.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                🔔 {todayReminders.length} message{todayReminders.length > 1 ? "s" : ""} à envoyer aujourd'hui :
              </p>
              {todayReminders.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="font-mono font-semibold text-primary">@{p.instagram_username}</span>
                    {p.next_reminder_text && (
                      <span className="text-muted-foreground text-xs"> · {p.next_reminder_text}</span>
                    )}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => openDmForProspect(p)}>
                    <MessageCircle className="h-3 w-3 mr-1" /> Générer un DM
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={async () => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    await updateProspect(p.id, { next_reminder_at: tomorrow.toISOString() });
                  }}>
                    <SkipForward className="h-3 w-3 mr-1" /> Reporter
                  </Button>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">✅ Aucune relance pour aujourd'hui !</p>
          )}

          {/* Free DM button */}
          <div className="border-t border-primary/10 pt-2">
            <p className="text-[11px] text-muted-foreground mb-2">Ou choisis un prospect dans le pipeline ci-dessous pour lui écrire un DM personnalisé.</p>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <ProspectPipeline
        prospects={prospects}
        stages={STAGES}
        onSelect={setSelectedProspect}
        onStageChange={(id, stage) => updateProspect(id, { stage })}
        onWriteDm={openDmForProspect}
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

      {/* DM Generator Dialog */}
      {dmProspect && (
        <Dialog open={!!dmProspect} onOpenChange={(open) => { if (!open) setDmProspect(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">Générateur de DM</DialogTitle>
            <DialogDescription className="sr-only">Générer un message direct pour ce prospect</DialogDescription>
            <DmGenerator
              prospect={dmProspect}
              interactions={dmInteractions}
              onBack={() => setDmProspect(null)}
              onMessageSent={handleDmSent}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

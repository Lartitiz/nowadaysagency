import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Trash2, Plus, Copy } from "lucide-react";
import InstagramLink, { cleanPseudo } from "@/components/InstagramLink";
import type { Prospect, ProspectInteraction } from "./DmGenerator";
import { STAGES } from "./ProspectionSection";
import DmGenerator from "./DmGenerator";

const PHASES = [
  { key: "unaware", label: "🟣 Inconscience", desc: "Ne sait pas qu'elle a un problème" },
  { key: "aware", label: "🔵 Prise de conscience", desc: "Commence à voir le problème" },
  { key: "exploring", label: "🟡 Explore", desc: "Cherche des solutions" },
  { key: "hesitating", label: "🟠 Hésite", desc: "Compare les options" },
  { key: "ready", label: "🟢 Prête", desc: "Prête à décider" },
];

interface Props {
  prospect: Prospect;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updates: Partial<Prospect>) => void;
  onDelete: () => void;
}

function getUsername(p: Prospect) { return p.instagram_username || p.username || ""; }

export default function ProspectDetailDialog({ prospect, open, onOpenChange, onUpdate, onDelete }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [interactions, setInteractions] = useState<ProspectInteraction[]>([]);
  const [showDmGen, setShowDmGen] = useState(false);
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [newInteractionType, setNewInteractionType] = useState("comment_sent");
  const [newInteractionContent, setNewInteractionContent] = useState("");
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const loadInteractions = useCallback(async () => {
    // Try contact_interactions first, fallback to prospect_interactions
    const { data } = await supabase
      .from("contact_interactions")
      .select("*")
      .eq("contact_id", prospect.id)
      .order("created_at", { ascending: true });
    if (data && data.length > 0) {
      setInteractions(data as unknown as ProspectInteraction[]);
    } else {
      const { data: legacy } = await supabase
        .from("prospect_interactions")
        .select("*")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: true });
      if (legacy) setInteractions(legacy as unknown as ProspectInteraction[]);
    }
  }, [prospect.id]);

  useEffect(() => { loadInteractions(); }, [loadInteractions]);

  const addInteraction = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contact_interactions")
      .insert({
        contact_id: prospect.id,
        user_id: user.id,
        interaction_type: newInteractionType,
        content: newInteractionContent || null,
      } as any)
      .select("*")
      .single();
    if (data) {
      setInteractions(prev => [...prev, data as unknown as ProspectInteraction]);
      setAddingInteraction(false);
      setNewInteractionContent("");
      onUpdate({ last_interaction_at: new Date().toISOString() } as any);
    }
  };

  const saveField = (field: string) => {
    onUpdate({ [field]: editValue || null });
    setEditField(null);
  };

  const interactionLabels: Record<string, string> = {
    comment_sent: "💬 Commentaire envoyé",
    comment_received: "💬 Commentaire reçu",
    story_reply: "📱 Réponse story",
    dm_sent: "📩 DM envoyé",
    dm_received: "📩 DM reçu",
    resource_sent: "🎁 Ressource envoyée",
    call_proposed: "📞 Appel proposé",
    call_done: "✅ Appel réalisé",
    sale: "💰 Vente",
    added: "🌱 Ajouté·e au pipeline",
  };

  const EditableField = ({ field, label, value }: { field: string; label: string; value: string | null }) => (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {editField === field ? (
        <div className="flex gap-1">
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="text-sm h-8"
            autoFocus
            onKeyDown={e => e.key === "Enter" && saveField(field)}
          />
          <Button size="sm" className="h-8" onClick={() => saveField(field)}>OK</Button>
        </div>
      ) : (
        <p
          className="text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
          onClick={() => { setEditField(field); setEditValue(value || ""); }}
        >
          {value || <span className="text-muted-foreground italic">Cliquer pour ajouter...</span>}
        </p>
      )}
    </div>
  );

  if (showDmGen) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Générateur de DM</DialogTitle>
            <DialogDescription>Générer un message direct pour ce prospect</DialogDescription>
          </DialogHeader>
          <DmGenerator
            prospect={prospect}
            interactions={interactions}
            onBack={() => setShowDmGen(false)}
            onMessageSent={async (content, approach, meta) => {
              // Log interaction
              if (user) {
                try {
                  await supabase.from("contact_interactions").insert({
                    contact_id: prospect.id,
                    user_id: user.id,
                    interaction_type: "dm_sent",
                    content,
                    ai_generated: true,
                  } as any);
                  loadInteractions();
                } catch (e) {
                  console.error("[ProspectDetail] Failed to log interaction:", e);
                }
              }
              // Determine next stage & reminder based on approach
              const currentStage = prospect.stage || prospect.prospect_stage;
              let nextStage = currentStage === "to_contact" ? "in_conversation" : currentStage;
              let reminderDays = 3;
              let reminderText = `Vérifier si @${getUsername(prospect)} a répondu`;
              if (approach === "resource") {
                nextStage = "resource_sent";
                reminderDays = 5;
                reminderText = `Vérifier si @${getUsername(prospect)} a regardé la ressource`;
              } else if (approach === "offer") {
                nextStage = "offer_proposed";
                reminderDays = 3;
                reminderText = `Vérifier si @${getUsername(prospect)} a réservé`;
              }
              const reminderDate = new Date();
              reminderDate.setDate(reminderDate.getDate() + reminderDays);
              onUpdate({
                stage: nextStage,
                last_interaction_at: new Date().toISOString(),
                next_reminder_at: reminderDate.toISOString(),
                next_reminder_text: reminderText,
              });
              setShowDmGen(false);
              toast({ title: "✅ Message noté dans l'historique !" });
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>👤 @{cleanPseudo(getUsername(prospect))}</span>
            {prospect.display_name && (
              <span className="text-sm font-normal text-muted-foreground">{prospect.display_name}</span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">Détails et interactions du prospect</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <InstagramLink username={getUsername(prospect)} className="text-xs text-primary hover:underline" showCopy>
            👁️ Profil Instagram
          </InstagramLink>
        </div>

        {/* Editable info fields */}
        <div className="space-y-3 border-t pt-3">
          <h4 className="text-xs font-bold text-foreground">INFOS</h4>
          <EditableField field="activity" label="Activité" value={prospect.activity} />
          <EditableField field="strengths" label="Ce qu'elle fait bien" value={prospect.strengths} />
          <EditableField field="probable_problem" label="Son problème probable" value={prospect.probable_problem} />
          <EditableField field="relevant_offer" label="Offre pertinente" value={prospect.relevant_offer} />
          <p className="text-[10px] text-muted-foreground italic">💡 Plus tu remplis ces infos, plus l'IA personnalisera les messages.</p>
        </div>

        {/* Decision phase */}
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-xs font-bold text-foreground">PHASE DU PARCOURS</h4>
          <div className="flex flex-wrap gap-1.5">
            {PHASES.map(ph => (
              <button
                key={ph.key}
                onClick={() => onUpdate({ decision_phase: ph.key })}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                  prospect.decision_phase === ph.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
                title={ph.desc}
              >
                {ph.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stage */}
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-xs font-bold text-foreground">ÉTAPE DU PIPELINE</h4>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => onUpdate({ stage: s.key })}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                  prospect.stage === s.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {prospect.stage === "converted" && (
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">Montant de la conversion (€)</label>
              {editField === "conversion_amount" ? (
                <div className="flex gap-1 mt-1">
                  <Input
                    type="number"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="text-sm h-8 w-32"
                    autoFocus
                  />
                  <Button size="sm" className="h-8" onClick={() => {
                    onUpdate({ conversion_amount: parseFloat(editValue) || null });
                    setEditField(null);
                  }}>OK</Button>
                </div>
              ) : (
                <p
                  className="text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
                  onClick={() => { setEditField("conversion_amount"); setEditValue(String(prospect.conversion_amount || "")); }}
                >
                  {prospect.conversion_amount ? `${prospect.conversion_amount}€` : <span className="italic text-muted-foreground">Ajouter...</span>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Interaction history */}
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-xs font-bold text-foreground">HISTORIQUE</h4>
          {interactions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Pas encore d'interaction. La première viendra vite 🌱</p>
          )}
          {interactions.map(i => (
            <div key={i.id} className="text-[11px] flex gap-2">
              <span className="text-muted-foreground shrink-0">
                📅 {new Date(i.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
              <span>
                {interactionLabels[i.interaction_type] || i.interaction_type}
                {i.content && <span className="text-muted-foreground"> : {i.content}</span>}
                {i.responded === true && <span className="text-primary ml-1">✅ répondu</span>}
                {i.responded === false && <span className="text-muted-foreground ml-1">⏳ pas de réponse</span>}
              </span>
            </div>
          ))}
          {addingInteraction ? (
            <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
              <select
                value={newInteractionType}
                onChange={e => setNewInteractionType(e.target.value)}
                className="h-8 text-xs rounded-md border border-input bg-card px-2 w-full"
              >
                {Object.entries(interactionLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <Input
                placeholder="Détail (optionnel)"
                value={newInteractionContent}
                onChange={e => setNewInteractionContent(e.target.value)}
                className="text-xs h-8"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs" onClick={addInteraction}>Ajouter</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingInteraction(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAddingInteraction(true)}>
              <Plus className="h-3 w-3 mr-1" /> Ajouter une interaction
            </Button>
          )}
        </div>

        {/* Reminder */}
        {prospect.next_reminder_at && (
          <div className="border-t pt-3">
            <h4 className="text-xs font-bold text-foreground mb-1">🔔 PROCHAIN RAPPEL</h4>
            <p className="text-xs text-muted-foreground">
              {new Date(prospect.next_reminder_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              {prospect.next_reminder_text && ` · "${prospect.next_reminder_text}"`}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t pt-3">
          <Button size="sm" onClick={() => setShowDmGen(true)} className="flex-1">
            💬 Écrire un DM
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

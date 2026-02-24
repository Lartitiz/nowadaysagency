import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Plus, ExternalLink, MessageCircle, SkipForward, Trash2, ArrowRight } from "lucide-react";
import InstagramLink, { cleanPseudo } from "@/components/InstagramLink";
import Confetti from "@/components/Confetti";
import UpgradeGate from "@/components/UpgradeGate";
import ProspectDetailDialog from "@/components/prospection/ProspectDetailDialog";
import DmGenerator from "@/components/prospection/DmGenerator";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/* ─── Types ─── */
export interface Contact {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  activity: string | null;
  platform: string;
  contact_type: "network" | "prospect";
  network_category: string | null;
  prospect_stage: string | null;
  decision_phase: string | null;
  target_offer: string | null;
  potential_value: number | null;
  conversion_amount: number | null;
  source: string | null;
  strengths: string | null;
  probable_problem: string | null;
  noted_interest: string | null;
  to_avoid: string | null;
  last_dm_context: string | null;
  last_conversation: string | null;
  relevant_offer: string | null;
  notes: string | null;
  last_interaction_at: string | null;
  next_followup_at: string | null;
  next_followup_text: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  id: string;
  contact_id: string;
  user_id: string;
  interaction_type: string;
  content: string | null;
  ai_generated: boolean;
  responded: boolean | null;
  created_at: string;
}

/* ─── Constants ─── */
const NETWORK_CATEGORIES = [
  { key: "pair", label: "🏷️ Paire", desc: "Solopreneuses, freelances" },
  { key: "media", label: "📰 Média", desc: "Journalistes, podcasts" },
  { key: "partner", label: "🤝 Partenaire", desc: "Profils complémentaires" },
  { key: "prescriber", label: "📣 Prescriptrice", desc: "Recommandent à leur audience" },
  { key: "inspiration", label: "✨ Inspiration", desc: "Veille, pas d'interaction" },
];

const PROSPECT_STAGES = [
  { key: "to_contact", label: "👀 À contacter", color: "bg-emerald-100 text-emerald-800" },
  { key: "in_conversation", label: "💬 En conversation", color: "bg-blue-100 text-blue-800" },
  { key: "offer_proposed", label: "📩 Offre proposée", color: "bg-amber-100 text-amber-800" },
  { key: "converted", label: "✅ Cliente", color: "bg-green-100 text-green-800" },
];

const CATEGORY_FILTERS = [
  { value: "all", label: "Tous" },
  { value: "pair", label: "🏷️ Paires" },
  { value: "media", label: "📰 Médias" },
  { value: "partner", label: "🤝 Partenaires" },
  { value: "prescriber", label: "📣 Prescriptrices" },
  { value: "inspiration", label: "✨ Inspirations" },
];

function daysSince(dateStr?: string | null) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function interactionDot(days: number) {
  if (days <= 3) return "🟢";
  if (days <= 7) return "🟡";
  return "🔴";
}

/* ─── Main Page ─── */
export default function ContactsPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tab, setTab] = useState("network");
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Contact | null>(null);
  const [dmContact, setDmContact] = useState<Contact | null>(null);
  const [dmInteractions, setDmInteractions] = useState<ContactInteraction[]>([]);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contacts" as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false });
    if (data) setContacts(data as unknown as Contact[]);
  }, [user?.id]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const networkContacts = useMemo(() => contacts.filter(c => c.contact_type === "network"), [contacts]);
  const prospectContacts = useMemo(() => contacts.filter(c => c.contact_type === "prospect"), [contacts]);

  const updateContact = async (id: string, updates: Partial<Contact>) => {
    const prev = contacts.find(c => c.id === id);
    await supabase.from("contacts").update(updates as any).eq("id", id);
    setContacts(prev2 => prev2.map(c => c.id === id ? { ...c, ...updates } : c));

    if (updates.prospect_stage === "converted" && prev?.prospect_stage !== "converted") {
      setShowConfetti(true);
      toast({ title: "🎉 Bravo ! Nouvelle cliente !" });
      setTimeout(() => setShowConfetti(false), 4000);
    }
  };

  const deleteContact = async (id: string) => {
    await supabase.from("contacts").delete().eq("id", id);
    setContacts(prev => prev.filter(c => c.id !== id));
    setSelectedProspect(null);
  };

  const openDm = async (contact: Contact) => {
    setDmContact(contact);
    const { data } = await supabase
      .from("contact_interactions")
      .select("*")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: true });
    setDmInteractions((data || []) as unknown as ContactInteraction[]);
  };

  // Stats
  const inConvo = prospectContacts.filter(c => c.prospect_stage === "in_conversation").length;
  const offerProp = prospectContacts.filter(c => c.prospect_stage === "offer_proposed").length;
  const pipelineValue = prospectContacts
    .filter(c => c.prospect_stage === "offer_proposed")
    .reduce((s, c) => s + (c.potential_value || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 space-y-6">
        <SubPageHeader parentTo="/dashboard" parentLabel="Accueil" currentLabel="Mes contacts" />

        {/* Stats bar */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>👥 <strong>{networkContacts.length}</strong> contacts réseau</span>
            <span>🎯 <strong>{prospectContacts.length}</strong> prospects</span>
            {inConvo > 0 && <span>💬 <strong>{inConvo}</strong> en conversation</span>}
            {offerProp > 0 && <span>📩 <strong>{offerProp}</strong> offre{offerProp > 1 ? "s" : ""} proposée{offerProp > 1 ? "s" : ""}</span>}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="network">👥 Mon réseau</TabsTrigger>
            <TabsTrigger value="prospects">🎯 Mes prospects</TabsTrigger>
          </TabsList>

          <TabsContent value="network" className="mt-4">
            <NetworkTab
              contacts={networkContacts}
              onAdd={async (c) => {
                if (!user) return;
                const { data } = await supabase.from("contacts").insert({
                  user_id: user.id,
                  workspace_id: workspaceId !== user.id ? workspaceId : undefined,
                  username: cleanPseudo(c.username),
                  display_name: c.display_name || null,
                  contact_type: "network",
                  network_category: c.network_category || "pair",
                  platform: "instagram",
                } as any).select("*").single();
                if (data) {
                  setContacts(prev => [data as unknown as Contact, ...prev]);
                  toast({ title: "👥 Contact ajouté !" });
                }
              }}
              onInteract={async (id) => {
                await updateContact(id, { last_interaction_at: new Date().toISOString() });
                toast({ title: "✅ Fait !" });
              }}
              onDelete={deleteContact}
              onPromoteToProspect={async (id) => {
                await updateContact(id, { contact_type: "prospect" as any, prospect_stage: "to_contact" });
                toast({ title: "🎯 Passé en prospect !" });
              }}
            />
          </TabsContent>

          <TabsContent value="prospects" className="mt-4">
            <UpgradeGate feature="prospection">
              <ProspectsTab
                contacts={prospectContacts}
                onAdd={async (c) => {
                  if (!user) return;
                  const { data } = await supabase.from("contacts").insert({
                    user_id: user.id,
                    workspace_id: workspaceId !== user.id ? workspaceId : undefined,
                    username: cleanPseudo(c.username),
                    display_name: c.display_name || null,
                    activity: c.activity || null,
                    contact_type: "prospect",
                    prospect_stage: "to_contact",
                    source: c.source || null,
                    notes: c.notes || null,
                    platform: "instagram",
                  } as any).select("*").single();
                  if (data) {
                    setContacts(prev => [data as unknown as Contact, ...prev]);
                    toast({ title: "🎯 Prospect ajouté !" });
                  }
                }}
                onSelect={setSelectedProspect}
                onUpdateStage={(id, stage) => updateContact(id, { prospect_stage: stage })}
                onWriteDm={openDm}
                pipelineValue={pipelineValue}
              />
            </UpgradeGate>
          </TabsContent>
        </Tabs>
      </main>

      {/* Prospect detail dialog */}
      {selectedProspect && (
        <ProspectDetailDialog
          prospect={selectedProspect as any}
          open={!!selectedProspect}
          onOpenChange={(open) => { if (!open) setSelectedProspect(null); }}
          onUpdate={(updates) => updateContact(selectedProspect.id, updates as any)}
          onDelete={() => deleteContact(selectedProspect.id)}
        />
      )}

      {/* DM Generator */}
      {dmContact && (
        <Dialog open={!!dmContact} onOpenChange={(open) => { if (!open) setDmContact(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">Générateur de message</DialogTitle>
            <DialogDescription className="sr-only">Générer un message direct pour ce contact</DialogDescription>
            <DmGenerator
              prospect={dmContact as any}
              interactions={dmInteractions as any}
              onBack={() => setDmContact(null)}
              onMessageSent={(content, approach) => {
                if (!user || !dmContact) return;
                supabase.from("contact_interactions").insert({
                  contact_id: dmContact.id,
                  user_id: user.id,
                  workspace_id: workspaceId !== user.id ? workspaceId : undefined,
                  interaction_type: "dm_sent",
                  content,
                  ai_generated: true,
                } as any);
                const nextStage = dmContact.prospect_stage === "to_contact" ? "in_conversation" : dmContact.prospect_stage;
                const reminderDate = new Date();
                reminderDate.setDate(reminderDate.getDate() + 3);
                updateContact(dmContact.id, {
                  prospect_stage: nextStage,
                  last_interaction_at: new Date().toISOString(),
                  next_followup_at: reminderDate.toISOString(),
                  next_followup_text: `Vérifier si @${dmContact.username} a répondu`,
                });
                setDmContact(null);
                toast({ title: "✅ Message noté !" });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── NETWORK TAB ─── */
/* ═══════════════════════════════════════════════ */
interface NetworkTabProps {
  contacts: Contact[];
  onAdd: (c: Partial<Contact>) => void;
  onInteract: (id: string) => void;
  onDelete: (id: string) => void;
  onPromoteToProspect: (id: string) => void;
}

function NetworkTab({ contacts, onAdd, onInteract, onDelete, onPromoteToProspect }: NetworkTabProps) {
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("pair");

  // Daily routine: pick 3 oldest-interaction contacts (exclude inspirations)
  const routineContacts = useMemo(() => {
    return [...contacts]
      .filter(c => c.network_category !== "inspiration")
      .sort((a, b) => daysSince(a.last_interaction_at) - daysSince(b.last_interaction_at))
      .reverse()
      .slice(0, 3);
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (filter !== "all") list = list.filter(c => c.network_category === filter);
    return list.sort((a, b) => daysSince(b.last_interaction_at) - daysSince(a.last_interaction_at));
  }, [contacts, filter]);

  const handleAdd = () => {
    if (!newUsername.trim()) return;
    onAdd({ username: newUsername, display_name: newName || null, network_category: newCategory });
    setNewUsername("");
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                filter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Daily routine */}
      {routineContacts.length > 0 && (
        <div className="rounded-xl border-2 border-primary/20 bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">🗓️ Routine du jour</span>
            <span className="text-[10px] text-muted-foreground">⏰ ~10 min</span>
          </div>
          <p className="text-xs text-muted-foreground">Commente 3 comptes aujourd'hui :</p>
          {routineContacts.map(c => {
            const days = daysSince(c.last_interaction_at);
            return (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
                  {c.network_category && (
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {NETWORK_CATEGORIES.find(nc => nc.key === c.network_category)?.label}
                    </span>
                  )}
                  {c.display_name && <span className="text-xs text-muted-foreground ml-1">· {c.display_name}</span>}
                  <br />
                  <span className="text-[10px] text-muted-foreground">
                    Dernière interaction : {days === Infinity ? "jamais" : `il y a ${days} jour${days > 1 ? "s" : ""}`}
                  </span>
                </span>
                <InstagramLink username={c.username} className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground" showCopy>
                  <ExternalLink className="h-3 w-3" /> IG
                </InstagramLink>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onInteract(c.id)}>
                  ✅ Fait
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact list */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold text-foreground">Tous mes contacts</h3>
        {filtered.map(c => {
          const days = daysSince(c.last_interaction_at);
          const dot = interactionDot(days);
          const catLabel = NETWORK_CATEGORIES.find(nc => nc.key === c.network_category)?.label || "";
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 hover:border-primary/30 transition-colors text-sm group">
              <span className="text-xs">{dot}</span>
              <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
              <span className="text-[10px] text-muted-foreground">{catLabel}</span>
              <span className="text-[10px] text-muted-foreground flex-1 truncate">
                {days === Infinity ? "" : `Interagi il y a ${days}j`}
              </span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onInteract(c.id)} title="Marquer interagi">
                  ✅
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onPromoteToProspect(c.id)} title="Passer en prospect">
                  🎯
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive" onClick={() => onDelete(c.id)} title="Supprimer">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 italic">
            Aucun contact. Ajoute ton premier contact pour commencer 🌱
          </p>
        )}
      </div>

      {/* Legend */}
      {contacts.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          🟢 &lt; 3 jours · 🟡 3-7 jours · 🔴 &gt; 7 jours
        </p>
      )}

      {/* Add form */}
      {adding && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h4 className="text-sm font-bold">+ Ajouter un contact</h4>
          <Input placeholder="Username Instagram" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="text-sm" />
          <Input placeholder="Nom (optionnel)" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {NETWORK_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setNewCategory(cat.key)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                  newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>Ajouter</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── PROSPECTS TAB ─── */
/* ═══════════════════════════════════════════════ */
interface ProspectsTabProps {
  contacts: Contact[];
  onAdd: (c: Partial<Contact>) => void;
  onSelect: (c: Contact) => void;
  onUpdateStage: (id: string, stage: string) => void;
  onWriteDm: (c: Contact) => void;
  pipelineValue: number;
}

function ProspectsTab({ contacts, onAdd, onSelect, onUpdateStage, onWriteDm, pipelineValue }: ProspectsTabProps) {
  const [adding, setAdding] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newActivity, setNewActivity] = useState("");

  const todayReminders = contacts.filter(c => {
    if (!c.next_followup_at) return false;
    return new Date(c.next_followup_at) <= new Date();
  });

  const handleAdd = () => {
    if (!newUsername.trim()) return;
    onAdd({ username: newUsername, display_name: newName, activity: newActivity });
    setNewUsername("");
    setNewName("");
    setNewActivity("");
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Reminders */}
      {todayReminders.length > 0 && (
        <div className="rounded-xl border-2 border-primary/20 bg-secondary/30 p-4 space-y-3">
          <h3 className="text-sm font-bold">📩 Relances du jour</h3>
          {todayReminders.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">
                <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
                {c.next_followup_text && <span className="text-xs text-muted-foreground"> · {c.next_followup_text}</span>}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onWriteDm(c)}>
                <MessageCircle className="h-3 w-3 mr-1" /> DM
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Ajouter un prospect
      </Button>

      {/* Add form */}
      {adding && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h4 className="text-sm font-bold">+ Ajouter un prospect</h4>
          <Input placeholder="Username Instagram" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="text-sm" />
          <Input placeholder="Prénom (optionnel)" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
          <Input placeholder="Activité (optionnel)" value={newActivity} onChange={e => setNewActivity(e.target.value)} className="text-sm" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>Ajouter</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {/* Pipeline columns */}
      <div className="space-y-4">
        {PROSPECT_STAGES.map(stage => {
          const stageContacts = contacts.filter(c => c.prospect_stage === stage.key);
          if (stageContacts.length === 0) return null;
          return (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.color}`}>{stage.label}</span>
                <span className="text-[10px] text-muted-foreground">({stageContacts.length})</span>
              </div>
              {stageContacts.map(c => {
                const days = daysSince(c.last_interaction_at);
                const stale = days > 14;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 cursor-pointer hover:border-primary/40 transition-colors ${
                      stale ? "border-amber-300 bg-amber-50/30" : "border-border bg-card"
                    }`}
                    onClick={() => onSelect(c)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">@{cleanPseudo(c.username)}</span>
                          {c.activity && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.activity}</span>
                          )}
                          {stale && <span className="text-[10px]">⚠️</span>}
                        </div>
                        {c.display_name && <p className="text-[11px] text-muted-foreground">{c.display_name}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {c.last_interaction_at
                            ? `Dernier contact : il y a ${days} jour${days > 1 ? "s" : ""}`
                            : "Dernier contact : jamais"}
                        </p>
                        {c.next_followup_at && new Date(c.next_followup_at) <= new Date() && (
                          <p className="text-[10px] text-primary font-semibold mt-0.5">🔔 Relance prévue</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onWriteDm(c)} className="h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> <span className="hidden sm:inline">DM</span>
                        </button>
                        <InstagramLink username={c.username} className="h-7 px-2 text-[11px] rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1" showCopy>
                          <ExternalLink className="h-3 w-3" />
                        </InstagramLink>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {contacts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 italic">
            Aucun prospect. Ajoute ton premier prospect 🌱
          </p>
        )}
      </div>

      {/* Pipeline value */}
      {pipelineValue > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          💰 Pipeline : {contacts.filter(c => c.prospect_stage === "offer_proposed").length} offre{contacts.filter(c => c.prospect_stage === "offer_proposed").length > 1 ? "s" : ""} proposée{contacts.filter(c => c.prospect_stage === "offer_proposed").length > 1 ? "s" : ""} · Valeur potentielle : {pipelineValue}€
        </p>
      )}
    </div>
  );
}

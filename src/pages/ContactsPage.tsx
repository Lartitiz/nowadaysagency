import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { useAuth } from "@/contexts/AuthContext";
import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Plus, ExternalLink, MessageCircle, SkipForward, Trash2, ArrowRight, Tag, Newspaper, Handshake, Megaphone, Sparkles, Eye, Send, CheckCircle2, Users, Target, Circle, CalendarDays, Clock, Check, AlertTriangle, Bell, TrendingUp, type LucideIcon } from "lucide-react";
import InstagramLink, { cleanPseudo } from "@/components/InstagramLink";
import Confetti from "@/components/Confetti";

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
  { key: "pair", label: "Paire", icon: Tag, desc: "Solopreneuses, freelances" },
  { key: "media", label: "Média", icon: Newspaper, desc: "Journalistes, podcasts" },
  { key: "partner", label: "Partenaire", icon: Handshake, desc: "Profils complémentaires" },
  { key: "prescriber", label: "Prescriptrice", icon: Megaphone, desc: "Recommandent à leur audience" },
  { key: "inspiration", label: "Inspiration", icon: Sparkles, desc: "Veille, pas d'interaction" },
];

const PROSPECT_STAGES = [
  { key: "to_contact", label: "À contacter", icon: Eye, color: "bg-success-bg text-success" },
  { key: "in_conversation", label: "En conversation", icon: MessageCircle, color: "bg-info-bg text-info" },
  { key: "resource_sent", label: "Ressource envoyée", icon: Send, color: "bg-info-bg text-info" },
  { key: "offer_proposed", label: "Offre proposée", icon: Send, color: "bg-warning-bg text-warning" },
  { key: "converted", label: "Cliente", icon: CheckCircle2, color: "bg-success-bg text-success" },
];

const CATEGORY_FILTERS: { value: string; label: string; icon?: LucideIcon }[] = [
  { value: "all", label: "Tous" },
  { value: "pair", label: "Paires", icon: Tag },
  { value: "media", label: "Médias", icon: Newspaper },
  { value: "partner", label: "Partenaires", icon: Handshake },
  { value: "prescriber", label: "Prescriptrices", icon: Megaphone },
  { value: "inspiration", label: "Inspirations", icon: Sparkles },
];

function daysSince(dateStr?: string | null) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// Pastille d'interaction : couleur charte (vert < 3 j, jaune 3-7 j, rouge > 7 j)
function interactionDotColor(days: number) {
  if (days <= 3) return "text-success";
  if (days <= 7) return "text-warning";
  return "text-error";
}

/* ─── Main Page ─── */
export default function ContactsPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const ready = useWorkspaceReady();
  // A fresh instance owns every form/dialog/request, including a return A → B → A.
  if (!ready || !user || !value) return null;
  return <ContactsWorkspace key={JSON.stringify([user.id, workspaceId, column, value])} userId={user.id} workspaceId={workspaceId} column={column as "workspace_id" | "user_id"} value={value} />;
}

function ContactsWorkspace({ userId, workspaceId, column, value }: { userId: string; workspaceId: string; column: "workspace_id" | "user_id"; value: string }) {
  const active = useRef(false);
  const writes = useRef(new Set<string>());
  const dmRequest = useRef(0);
  const dmReceipts = useRef(new Set<string>());
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tab, setTab] = useState("network");
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Contact | null>(null);
  const [dmContact, setDmContact] = useState<Contact | null>(null);
  const [dmInteractions, setDmInteractions] = useState<ContactInteraction[]>([]);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        let query = supabase.from("contacts").select("*").eq(column, value);
        if (column === "user_id") query = query.is("workspace_id", null);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (cancelled) return;
        if (error || !data) throw error || new Error("Lecture indisponible");
        setContacts(data as Contact[]);
      } catch {
        if (!cancelled) { setContacts([]); setLoadError(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [column, value, reload]);

  const networkContacts = useMemo(() => contacts.filter(c => c.contact_type === "network"), [contacts]);
  const prospectContacts = useMemo(() => contacts.filter(c => c.contact_type === "prospect"), [contacts]);

  const updateContact = async (id: string, updates: Partial<Contact>): Promise<boolean> => {
    if (!active.current || writes.current.has(id)) return false;
    const prev = contacts.find(c => c.id === id);
    if (!prev) return false;
    writes.current.add(id);
    try {
      let query = supabase.from("contacts").update(updates).eq("id", id).eq(column, value);
      if (column === "user_id") query = query.is("workspace_id", null);
      const { data, error } = await query.select("*").single();
      if (!active.current) return false;
      if (error || !data || data.id !== id) throw error || new Error("Modification non confirmée");
      const saved = data as Contact;
      setContacts(list => list.map(c => c.id === id ? saved : c));
      setSelectedProspect(c => c?.id === id ? saved : c);
      setDmContact(c => c?.id === id ? saved : c);
      if (updates.prospect_stage === "converted" && prev.prospect_stage !== "converted") {
        setShowConfetti(true);
        toast("🎉 Bravo ! Nouvelle cliente !");
        setTimeout(() => { if (active.current) setShowConfetti(false); }, 4000);
      }
      return true;
    } catch (error) {
      if (active.current) toast.error("Erreur", { description: friendlyError(error) });
      return false;
    } finally { writes.current.delete(id); }
  };

  const addContact = async (fields: Omit<TablesInsert<"contacts">, "user_id">): Promise<boolean> => {
    if (!active.current || writes.current.has("add")) return false;
    writes.current.add("add");
    try {
      const { data, error } = await supabase.from("contacts").insert({ ...fields, user_id: userId,
        workspace_id: column === "workspace_id" ? workspaceId : null,
      }).select("*").single();
      if (!active.current) return false;
      if (error || !data) throw error || new Error("Ajout non confirmé");
      setContacts(prev => [data as Contact, ...prev]);
      toast.success(fields.contact_type === "network" ? "👥 Contact ajouté !" : "🎯 Prospect ajouté !");
      return true;
    } catch (error) {
      if (active.current) toast.error("Erreur", { description: friendlyError(error) });
      return false;
    } finally { writes.current.delete("add"); }
  };

  const deleteContact = async (id: string) => {
    if (!active.current || writes.current.has(id)) return;
    writes.current.add(id);
    try {
      let query = supabase.from("contacts").delete().eq("id", id).eq(column, value);
      if (column === "user_id") query = query.is("workspace_id", null);
      const { data, error } = await query.select("id").single();
      if (!active.current) return;
      if (error || data?.id !== id) throw error || new Error("Suppression non confirmée");
      setContacts(prev => prev.filter(c => c.id !== id));
      setSelectedProspect(null);
    } catch (error) {
      if (active.current) toast.error("Erreur", { description: friendlyError(error) });
    } finally { writes.current.delete(id); }
  };

  const closeDm = () => { dmRequest.current++; setDmContact(null); setDmInteractions([]); };
  const openDm = async (contact: Contact) => {
    if (!active.current) return;
    const request = ++dmRequest.current;
    setSelectedProspect(null);
    setDmContact(null);
    setDmInteractions([]);
    try {
      // contact_id keeps legacy history without workspace_id attached to its parent.
      const { data, error } = await supabase.from("contact_interactions").select("*")
        .eq("contact_id", contact.id).order("created_at", { ascending: true });
      if (!active.current || request !== dmRequest.current) return;
      if (error || !data) throw error || new Error("Historique indisponible");
      setDmInteractions(data as ContactInteraction[]);
      setDmContact(contact);
    } catch (error) {
      if (active.current && request === dmRequest.current) toast.error("Historique indisponible", { description: friendlyError(error) });
    }
  };

  // Stats
  const inConvo = prospectContacts.filter(c => c.prospect_stage === "in_conversation").length;
  const offerProp = prospectContacts.filter(c => c.prospect_stage === "offer_proposed").length;
  const pipelineValue = prospectContacts
    .filter(c => c.prospect_stage === "offer_proposed")
    .reduce((s, c) => s + (c.potential_value || 0), 0);

  if (loadError) return <div className="p-8" role="alert">
    <p>Impossible de charger les contacts de cet espace.</p>
    <Button onClick={() => setReload(n => n + 1)}>Réessayer</Button>
  </div>;

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 space-y-6">
        <SubPageHeader parentTo="/dashboard" parentLabel="Accueil" currentLabel="Mes contacts" />

        {/* Stats bar */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> <strong>{networkContacts.length}</strong> contacts réseau</span>
            <span className="inline-flex items-center gap-1.5"><Target className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> <strong>{prospectContacts.length}</strong> prospects</span>
            {inConvo > 0 && <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> <strong>{inConvo}</strong> en conversation</span>}
            {offerProp > 0 && <span className="inline-flex items-center gap-1.5"><Send className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> <strong>{offerProp}</strong> offre{offerProp > 1 ? "s" : ""} proposée{offerProp > 1 ? "s" : ""}</span>}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="network" className="gap-1.5"><Users className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Mon réseau</TabsTrigger>
            <TabsTrigger value="prospects" className="gap-1.5"><Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Mes prospects</TabsTrigger>
          </TabsList>

          <TabsContent value="network" className="mt-4">
            <NetworkTab
              contacts={networkContacts}
              onAdd={(c) => addContact({
                username: cleanPseudo(c.username || ""), display_name: c.display_name || null,
                contact_type: "network", network_category: c.network_category || "pair", platform: "instagram",
              })}
              onInteract={async (id) => {
                if (await updateContact(id, { last_interaction_at: new Date().toISOString() })) toast.success("✅ Fait !");
              }}
              onDelete={deleteContact}
              onPromoteToProspect={async (id) => {
                if (await updateContact(id, { contact_type: "prospect", prospect_stage: "to_contact" })) toast("🎯 Passé en prospect !");
              }}
            />
          </TabsContent>

          <TabsContent value="prospects" className="mt-4">
              <ProspectsTab
                contacts={prospectContacts}
                onAdd={(c) => addContact({
                  username: cleanPseudo(c.username || ""), display_name: c.display_name || null,
                  activity: c.activity || null, contact_type: "prospect", prospect_stage: "to_contact",
                  source: c.source || null, notes: c.notes || null, platform: "instagram",
                })}
                onSelect={setSelectedProspect}
                onUpdateStage={(id, stage) => updateContact(id, { prospect_stage: stage })}
                onWriteDm={openDm}
                pipelineValue={pipelineValue}
              />
          </TabsContent>
        </Tabs>
      </main>

      {/* Prospect detail dialog */}
      {selectedProspect && (
        <ProspectDetailDialog
          key={selectedProspect.id}
          prospect={{ ...selectedProspect, stage: selectedProspect.prospect_stage ?? undefined,
            next_reminder_at: selectedProspect.next_followup_at, next_reminder_text: selectedProspect.next_followup_text }}
          onWriteDm={() => openDm(selectedProspect)}
          open={!!selectedProspect}
          onOpenChange={(open) => { if (!open) setSelectedProspect(null); }}
          onUpdate={(updates) => {
            const { stage, next_reminder_at, next_reminder_text, ...fields } = updates;
            return updateContact(selectedProspect.id, { ...fields,
              ...(stage !== undefined ? { prospect_stage: stage } : {}),
              ...(next_reminder_at !== undefined ? { next_followup_at: next_reminder_at } : {}),
              ...(next_reminder_text !== undefined ? { next_followup_text: next_reminder_text } : {}),
            });
          }}
          onDelete={() => deleteContact(selectedProspect.id)}
        />
      )}

      {/* DM Generator */}
      {dmContact && (
        <Dialog open={!!dmContact} onOpenChange={(open) => { if (!open) closeDm(); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">Générateur de message</DialogTitle>
            <DialogDescription className="sr-only">Générer un message direct pour ce contact</DialogDescription>
            <DmGenerator
              key={dmContact.id}
              prospect={dmContact}
              onSaveContext={(updates) => updateContact(dmContact.id, updates)}
              interactions={dmInteractions}
              onBack={closeDm}
              onMessageSent={async (content, approach) => {
                if (!active.current || !dmContact || writes.current.has("dm")) return;
                writes.current.add("dm");
                const request = dmRequest.current;
                const isCurrentDm = () => active.current && request === dmRequest.current;
                const receipt = JSON.stringify([dmContact.id, content]);
                try {
                  if (!dmReceipts.current.has(receipt)) {
                    const { data, error } = await supabase.from("contact_interactions").insert({
                      contact_id: dmContact.id, user_id: userId,
                      workspace_id: column === "workspace_id" ? workspaceId : null,
                      interaction_type: "dm_sent", content, ai_generated: true,
                    }).select("id").single();
                    if (error || !data) throw error || new Error("Historique non confirmé");
                    if (!active.current) return;
                    // Retain an accepted write even if its dialog was closed meanwhile.
                    dmReceipts.current.add(receipt);
                    if (!isCurrentDm()) return;
                  }
                  const nextStage = approach === "offer" ? "offer_proposed" : dmContact.prospect_stage === "to_contact" ? "in_conversation" : dmContact.prospect_stage;
                  const reminderDate = new Date();
                  reminderDate.setDate(reminderDate.getDate() + (approach === "resource" ? 5 : 3));
                  const saved = await updateContact(dmContact.id, {
                    prospect_stage: nextStage, last_interaction_at: new Date().toISOString(),
                    next_followup_at: reminderDate.toISOString(),
                    next_followup_text: `Vérifier si @${dmContact.username} a répondu`,
                  });
                  if (!isCurrentDm()) return;
                  if (!saved) {
                    toast.error("Message conservé dans l’historique, mais relance non enregistrée. Réessaie pour enregistrer la relance.");
                    return;
                  }
                  closeDm();
                  toast.success("✅ Message noté !");
                } catch (error) {
                  if (isCurrentDm()) toast.error("Le message n’a pas pu être noté", { description: friendlyError(error) });
                } finally { writes.current.delete("dm"); }
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
  onAdd: (c: Partial<Contact>) => Promise<boolean>;
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

  const handleAdd = async () => {
    if (!newUsername.trim()) return;
    if (!await onAdd({ username: newUsername, display_name: newName || null, network_category: newCategory })) return;
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
              className={`text-2xs px-3 py-1 rounded-full border transition-all ${
                filter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {f.icon && <f.icon className="inline h-3 w-3 align-[-2px] mr-1" strokeWidth={1.75} aria-hidden="true" />}{f.label}
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
            <span className="text-sm font-bold inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> Routine du jour</span>
            <span className="text-2xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> ~10 min</span>
          </div>
          <p className="text-xs text-muted-foreground">Commente 3 comptes aujourd'hui :</p>
          {routineContacts.map(c => {
            const days = daysSince(c.last_interaction_at);
            return (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
                  {c.network_category && (
                    <span className="text-2xs text-muted-foreground ml-2">
                      {NETWORK_CATEGORIES.find(nc => nc.key === c.network_category)?.label}
                    </span>
                  )}
                  {c.display_name && <span className="text-xs text-muted-foreground ml-1">· {c.display_name}</span>}
                  <br />
                  <span className="text-2xs text-muted-foreground">
                    Dernière interaction : {days === Infinity ? "jamais" : `il y a ${days} jour${days > 1 ? "s" : ""}`}
                  </span>
                </span>
                <InstagramLink username={c.username} className="inline-flex items-center gap-1 h-7 px-2 text-2xs rounded-md hover:bg-accent text-foreground" showCopy>
                  <ExternalLink className="h-3 w-3" /> IG
                </InstagramLink>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-2xs gap-1" onClick={() => onInteract(c.id)}>
                  <Check className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Fait
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
          const dotColor = interactionDotColor(days);
          const catLabel = NETWORK_CATEGORIES.find(nc => nc.key === c.network_category)?.label || "";
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 hover:border-primary/30 transition-colors text-sm group">
              <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${dotColor}`} strokeWidth={1.75} aria-hidden="true" />
              <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
              <span className="text-2xs text-muted-foreground">{catLabel}</span>
              <span className="text-2xs text-muted-foreground flex-1 truncate">
                {days === Infinity ? "" : `Interagi il y a ${days}j`}
              </span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-2xs" onClick={() => onInteract(c.id)} title="Marquer interagi">
                  <Check className="h-3 w-3" strokeWidth={1.75} />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-2xs" onClick={() => onPromoteToProspect(c.id)} title="Passer en prospect">
                  <Target className="h-3 w-3" strokeWidth={1.75} />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-2xs text-destructive" onClick={() => onDelete(c.id)} title="Supprimer">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState {...MESSAGES.empty.contacts} onAction={() => setAdding(true)} />
        )}
      </div>

      {/* Legend */}
      {contacts.length > 0 && (
        <p className="text-2xs text-muted-foreground flex items-center gap-1 flex-wrap">
          <Circle className="h-2 w-2 fill-current text-success" strokeWidth={1.75} aria-hidden="true" /> &lt; 3 jours ·
          <Circle className="h-2 w-2 fill-current text-warning" strokeWidth={1.75} aria-hidden="true" /> 3-7 jours ·
          <Circle className="h-2 w-2 fill-current text-error" strokeWidth={1.75} aria-hidden="true" /> &gt; 7 jours
        </p>
      )}

      {/* Add form */}
      {adding && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h4 className="text-sm font-bold">+ Ajouter un contact</h4>
          <Input aria-label="Username Instagram" placeholder="Username Instagram" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="text-sm" />
          <Input aria-label="Nom (optionnel)" placeholder="Nom (optionnel)" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {NETWORK_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setNewCategory(cat.key)}
                className={`text-2xs px-3 py-1 rounded-full border transition-all ${
                  newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                }`}
              >
                <cat.icon className="inline h-3 w-3 align-[-2px] mr-1" strokeWidth={1.75} aria-hidden="true" />{cat.label}
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
  onAdd: (c: Partial<Contact>) => Promise<boolean>;
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

  const handleAdd = async () => {
    if (!newUsername.trim()) return;
    if (!await onAdd({ username: newUsername, display_name: newName, activity: newActivity })) return;
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
          <h3 className="text-sm font-bold flex items-center gap-1.5"><Send className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> Relances du jour</h3>
          {todayReminders.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">
                <span className="font-mono font-semibold text-primary">@{cleanPseudo(c.username)}</span>
                {c.next_followup_text && <span className="text-xs text-muted-foreground"> · {c.next_followup_text}</span>}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-2xs" onClick={() => onWriteDm(c)}>
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
          <Input aria-label="Username Instagram" placeholder="Username Instagram" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="text-sm" />
          <Input aria-label="Prénom (optionnel)" placeholder="Prénom (optionnel)" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
          <Input aria-label="Activité (optionnel)" placeholder="Activité (optionnel)" value={newActivity} onChange={e => setNewActivity(e.target.value)} className="text-sm" />
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
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${stage.color}`}><stage.icon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />{stage.label}</span>
                <span className="text-2xs text-muted-foreground">({stageContacts.length})</span>
              </div>
              {stageContacts.map(c => {
                const days = daysSince(c.last_interaction_at);
                const stale = days > 14;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 cursor-pointer hover:border-primary/40 transition-colors ${
                      stale ? "border-warning/30 bg-warning-bg/30" : "border-border bg-card"
                    }`}
                    onClick={() => onSelect(c)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">@{cleanPseudo(c.username)}</span>
                          {c.activity && (
                            <span className="text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.activity}</span>
                          )}
                          {stale && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />}
                        </div>
                        {c.display_name && <p className="text-2xs text-muted-foreground">{c.display_name}</p>}
                        <p className="text-2xs text-muted-foreground mt-0.5">
                          {c.last_interaction_at
                            ? `Dernier contact : il y a ${days} jour${days > 1 ? "s" : ""}`
                            : "Dernier contact : jamais"}
                        </p>
                        {c.next_followup_at && new Date(c.next_followup_at) <= new Date() && (
                          <p className="text-2xs text-primary font-semibold mt-0.5"><Bell className="inline h-3 w-3 align-[-2px] mr-1" strokeWidth={1.75} aria-hidden="true" />Relance prévue</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onWriteDm(c)} className="h-7 px-2 text-2xs rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> <span className="hidden sm:inline">DM</span>
                        </button>
                        <InstagramLink username={c.username} className="h-7 px-2 text-2xs rounded-md hover:bg-accent text-foreground inline-flex items-center gap-1" showCopy>
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
          <EmptyState {...MESSAGES.empty.prospects} onAction={() => setAdding(true)} />
        )}
      </div>

      {/* Pipeline value */}
      {pipelineValue > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          <TrendingUp className="inline h-3.5 w-3.5 align-[-2px] text-primary mr-1" strokeWidth={1.75} aria-hidden="true" />Pipeline : {contacts.filter(c => c.prospect_stage === "offer_proposed").length} offre{contacts.filter(c => c.prospect_stage === "offer_proposed").length > 1 ? "s" : ""} proposée{contacts.filter(c => c.prospect_stage === "offer_proposed").length > 1 ? "s" : ""} · Valeur potentielle : {pipelineValue}€
        </p>
      )}
    </div>
  );
}

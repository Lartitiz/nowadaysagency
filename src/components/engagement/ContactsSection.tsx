import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Trash2, Plus, StickyNote } from "lucide-react";

export interface Contact {
  id: string;
  pseudo: string;
  tag: string;
  description?: string;
  notes?: string;
  last_interaction?: string;
}

interface ContactsSectionProps {
  contacts: Contact[];
  filter: string;
  onFilterChange: (f: string) => void;
  onInteract: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (pseudo: string, tag: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
}

const TAG_LABELS: Record<string, string> = {
  paire: "🏷️ Paire",
  prospect: "🎯 Prospect",
  collab: "🤝 Collab",
  influenceur: "⭐ Influenceur·se",
  client: "💝 Client·e",
};

const TAG_COLORS: Record<string, string> = {
  paire: "bg-secondary text-secondary-foreground",
  prospect: "bg-accent/30 text-accent-foreground",
  collab: "bg-primary/10 text-primary",
  influenceur: "bg-muted text-foreground",
  client: "bg-rose-pale text-foreground",
};

const FILTERS = [
  { value: "all", label: "Tous" },
  { value: "paire", label: "🏷️ Paires" },
  { value: "prospect", label: "🎯 Prospects" },
  { value: "collab", label: "🤝 Collabs" },
  { value: "stale", label: "⚠️ Inactifs" },
];

function daysSince(dateStr?: string) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function ContactsSection({ contacts, filter, onFilterChange, onInteract, onDelete, onAdd, onUpdateNotes }: ContactsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [newPseudo, setNewPseudo] = useState("");
  const [newTag, setNewTag] = useState("paire");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState("");

  const filtered = contacts.filter(c => {
    if (filter === "all") return true;
    if (filter === "stale") return daysSince(c.last_interaction) > 7;
    return c.tag === filter;
  });

  const handleAdd = () => {
    if (!newPseudo.trim()) return;
    onAdd(newPseudo.startsWith("@") ? newPseudo : `@${newPseudo}`, newTag);
    setNewPseudo("");
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">👥 Mes contacts stratégiques</h2>
        <span className="text-xs text-muted-foreground">{contacts.length}/25</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
              filter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Contacts list */}
      <div className="space-y-2">
        {filtered.map(c => {
          const stale = daysSince(c.last_interaction) > 7;
          const isEditingThis = editingNotes === c.id;

          return (
            <div key={c.id} className={`rounded-lg border p-3 space-y-1.5 ${stale ? "border-amber-300 bg-amber-50/30" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-foreground">{c.pseudo}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${TAG_COLORS[c.tag] || "bg-muted text-foreground"}`}>
                      {TAG_LABELS[c.tag] || c.tag}
                    </span>
                    {stale && <span className="text-[10px]">⚠️</span>}
                  </div>
                  {c.description && <p className="text-[11px] text-muted-foreground mt-0.5">{c.description}</p>}
                  {c.last_interaction && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      💬 Dernière interaction : il y a {daysSince(c.last_interaction)} jour{daysSince(c.last_interaction) > 1 ? "s" : ""}
                    </p>
                  )}
                  {c.notes && !isEditingThis && (
                    <p className="text-[11px] text-muted-foreground italic mt-1">📝 {c.notes}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onInteract(c.id)} title="Marquer interaction">
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                    if (isEditingThis) { onUpdateNotes(c.id, tempNotes); setEditingNotes(null); }
                    else { setEditingNotes(c.id); setTempNotes(c.notes || ""); }
                  }} title="Notes">
                    <StickyNote className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(c.id)} title="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {isEditingThis && (
                <div className="flex gap-2 mt-1">
                  <Textarea
                    value={tempNotes}
                    onChange={e => setTempNotes(e.target.value)}
                    placeholder="Notes sur ce contact..."
                    className="text-xs min-h-[50px]"
                  />
                  <Button size="sm" onClick={() => { onUpdateNotes(c.id, tempNotes); setEditingNotes(null); }}>OK</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add contact */}
      {adding ? (
        <div className="flex gap-2 items-end">
          <Input
            placeholder="@pseudo"
            value={newPseudo}
            onChange={e => setNewPseudo(e.target.value)}
            className="flex-1 h-8 text-sm"
          />
          <select
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            className="h-8 text-xs rounded-md border border-input bg-card px-2"
          >
            {Object.entries(TAG_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleAdd}>Ajouter</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>✕</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={contacts.length >= 25}>
          <Plus className="h-3 w-3 mr-1" /> Ajouter un contact
        </Button>
      )}

      {contacts.length >= 20 && (
        <p className="text-[10px] text-muted-foreground italic">💡 15-25 contacts, c'est l'idéal. Au-delà, tu risques de ne plus suivre.</p>
      )}
    </div>
  );
}

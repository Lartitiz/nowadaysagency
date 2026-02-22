import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Prospect } from "./ProspectionSection";
import { cleanPseudo } from "@/components/InstagramLink";

const SOURCE_OPTIONS = [
  { value: "like_regulier", label: "Like régulier" },
  { value: "story_reply", label: "Réponse story" },
  { value: "comment", label: "Commentaire" },
  { value: "dm", label: "DM" },
  { value: "other", label: "Autre" },
];

interface AddProspectFormProps {
  onAdd: (p: Partial<Prospect>) => void;
  onCancel: () => void;
}

export default function AddProspectForm({ onAdd, onCancel }: AddProspectFormProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [activity, setActivity] = useState("");
  const [source, setSource] = useState("other");
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    if (!username.trim()) return;
    onAdd({
      instagram_username: cleanPseudo(username),
      display_name: displayName || null,
      activity: activity || null,
      source,
      note: note || null,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="font-display text-sm font-bold">+ Ajouter un prospect</h3>
      <Input
        placeholder="Username Instagram (ex: marie_artisan)"
        value={username}
        onChange={e => setUsername(e.target.value)}
        className="text-sm"
      />
      <Input
        placeholder="Prénom (optionnel)"
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        className="text-sm"
      />
      <Input
        placeholder="Activité (ex: Créatrice bijoux éthiques)"
        value={activity}
        onChange={e => setActivity(e.target.value)}
        className="text-sm"
      />
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Comment tu l'as repérée :</p>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                source === s.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <Textarea
        placeholder="Note (optionnel)"
        value={note}
        onChange={e => setNote(e.target.value)}
        className="text-sm min-h-[50px]"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit}>✅ Ajouter au pipeline</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CharterReferenceLink = string | {
  url: string;
  kind: "site" | "creation" | "video";
  role: "follow" | "avoid";
  note: string;
};

const normalize = (item: CharterReferenceLink) => typeof item === "string"
  ? { url: item, kind: "site" as const, role: "follow" as const, note: "" }
  : item;

export default function CharterReferenceLinks({ links, onChange }: {
  links: CharterReferenceLink[];
  onChange: (links: CharterReferenceLink[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"site" | "creation" | "video">("site");
  const [error, setError] = useState("");
  const items = (Array.isArray(links) ? links : []).map(normalize);
  const add = () => {
    const candidate = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    try {
      const parsed = new URL(candidate);
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error();
      if (items.some(item => item.url === parsed.href)) { setError("Ce lien figure déjà dans ta fiche."); return; }
      onChange([...items, { url: parsed.href, kind, role: "follow", note: "" }]);
      setUrl(""); setError("");
    } catch { setError("Entre une adresse de site ou de vidéo valide."); }
  };
  return <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="reference-links-title">
    <h2 id="reference-links-title" className="font-body text-base font-bold text-foreground">Sites, créations et vidéos de référence</h2>
    <p className="mt-1 mb-4 text-sm text-muted-foreground">Garde plusieurs liens et explique ce que tu veux en retenir ou éviter. Ils servent de repères consultables dans ta fiche ; aucun outil ne lit automatiquement le contenu de ces pages.</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="reference-kind">Type de référence</label>
      <select id="reference-kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
        <option value="site">Site</option><option value="creation">Création</option><option value="video">Vidéo</option>
      </select>
      <Input aria-label="Adresse de référence" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1" />
      <Button type="button" variant="outline" onClick={add}>Ajouter</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {items.length > 0 && <ul className="mt-4 space-y-3">
      {items.map((item, index) => <li key={`${item.url}-${index}`} className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{item.kind === "site" ? "Site" : item.kind === "video" ? "Vidéo" : "Création"}</span>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary underline">{item.url}</a>
          <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-xs text-muted-foreground underline">Retirer</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="text-xs text-muted-foreground">Rôle
            <select aria-label={`Rôle du lien ${index + 1}`} value={item.role} onChange={e => onChange(items.map((current, i) => i === index ? { ...current, role: e.target.value as typeof item.role } : current))} className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-xs">
              <option value="follow">À suivre</option><option value="avoid">À éviter</option>
            </select>
          </label>
        </div>
        <Input aria-label={`Ce que montre le lien ${index + 1}`} value={item.note || ""} maxLength={300} onChange={e => onChange(items.map((current, i) => i === index ? { ...current, note: e.target.value } : current))} placeholder="Ce que j'aime ou ne veux pas reprendre…" className="mt-2 text-sm" />
      </li>)}
    </ul>}
  </section>;
}

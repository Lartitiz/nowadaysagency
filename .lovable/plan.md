## (a) Ce que tu demandes

### 1. Helper `getIdeaPreview` dans `src/pages/IdeasPage.tsx`

Remplacer les helpers actuels (`cleanSlideMarkers` reste, `buildIdeaPreview` est supprimé) par :

```ts
function getIdeaPreview(idea: SavedIdea): { title?: string; text?: string } {
  // a. content_data (objet ou string JSON)
  let data: any = idea.content_data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (data && typeof data === "object") {
    const title = typeof data.chosen_angle?.title === "string" ? data.chosen_angle.title.trim() : undefined;
    const text =
      (typeof data.chosen_angle?.description === "string" && data.chosen_angle.description.trim()) ||
      (Array.isArray(data.slides) && (data.slides[0]?.hook || data.slides[0]?.text || data.slides[0]?.titre || data.slides[0]?.title || data.slides[0]?.body || data.slides[0]?.caption)) ||
      (typeof data.hook === "object" ? data.hook?.texte_parle : data.hook) ||
      (typeof data.caption === "object" ? (data.caption?.hook || data.caption?.body || data.caption?.text) : data.caption) ||
      data.body || data.content || undefined;
    const cleanText = typeof text === "string" && text.trim() ? cleanSlideMarkers(text) : undefined;
    if (title || cleanText) return { title, text: cleanText };
    // NB : on ne retombe PAS sur les autres champs si content_data existe mais ne livre rien d'exploitable → on continue plus bas
  }
  // b. accroche_short
  if (idea.accroche_short?.trim()) return { text: `🎣 ${idea.accroche_short.trim()}` };
  // c. content_draft nettoyé
  if (idea.content_draft?.trim()) return { text: cleanSlideMarkers(idea.content_draft) };
  // d. rien
  return {};
}
```

Note : si `content_data` est présent mais qu'on n'en tire rien, on continue jusqu'à `accroche_short` / `content_draft` plutôt que de laisser la carte vide. Aucun cas ne retourne `JSON.stringify`.

### 2. Remplacement du bloc Preview (l. 437-441)

```tsx
{(() => {
  const preview = getIdeaPreview(idea);
  if (!preview.title && !preview.text) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {preview.title && <p className="font-semibold text-[13px] text-foreground line-clamp-1">{preview.title}</p>}
      {preview.text && <p className="text-[13px] text-foreground/70 line-clamp-2">{preview.text}</p>}
    </div>
  );
})()}
```

### 3. Invariants

- `ContentPreview.tsx`, Dialog de détail, badges, date, actions, filtres/tri/handlers, interface `SavedIdea` : strictement inchangés.
- `cleanSlideMarkers` est conservé (utilisé par le nouveau helper).
- `buildIdeaPreview` (ajouté au chantier précédent) est supprimé, remplacé par `getIdeaPreview`.

---

## (b) Mes ajouts (à valider)

En lisant `ContentPreview.tsx` et `demo-data.ts`, j'ai trouvé d'autres formes de `content_data` réellement présentes :

1. **Carrousel produit** : `{ slides: [{ title, body, overlay_text, caption }], caption: { hook, body, cta }, carousel_type }`
  → j'ajoute `slides[0].title`, `slides[0].body`, `slides[0].caption` et `caption.{hook,body}` (champs objet) dans la chaîne de fallback. ok
2. **Reel** : `{ script: [{ section, texte_parle, texte_overlay }], caption: { text, cta } }`
  → j'ajoute `script.find(s => s.section === "hook")?.texte_parle` et `caption.text` (cas objet) comme fallbacks. ok

Si tu valides, le helper devient (changements par rapport à ta spec entre `(+)` ) :

```ts
const text =
  data.chosen_angle?.description ||
  (Array.isArray(data.slides) && (data.slides[0]?.hook || data.slides[0]?.text || data.slides[0]?.titre
    /*(+)*/ || data.slides[0]?.title || data.slides[0]?.body || data.slides[0]?.caption)) ||
  /*(+)*/ (Array.isArray(data.script) && data.script.find((s:any) => s?.section === "hook")?.texte_parle) ||
  (typeof data.hook === "object" ? data.hook?.texte_parle : data.hook) ||
  /*(+)*/ (typeof data.caption === "object" ? (data.caption?.hook || data.caption?.body || data.caption?.text) : data.caption) ||
  data.body || data.content || undefined;
```

Si tu préfères t'en tenir strictement à ta liste, dis-le et je l'implémente sans les ajouts.

---

## Validation prévue

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Carte avec `chosen_angle.title` + `description` → titre en gras + 2 lignes lisibles, aucun `{` / `"` JSON.
- Carte sans `content_data` exploitable mais avec `accroche_short` → "🎣 …" sur 2 lignes.
- Carte sans rien → aucun bloc d'aperçu.
- Clic sur la carte → Dialog inchangé, rendu complet via `ContentPreview`.

## Hors scope

- Replier les filtres (chantier B — déjà fait).
- Nettoyer les badges redondants (chantier C).
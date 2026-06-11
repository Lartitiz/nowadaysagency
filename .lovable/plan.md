## Objectif

Aligner le mode Recycler sur Crosspost : chaque format recyclé peut être planifié dans le calendrier ou sauvegardé comme idée, via les mêmes dialogs (`AddToCalendarDialog`, `SaveToIdeasDialog`).

## Fichiers modifiés

1. `**src/components/ContentRecycling.tsx**` — câblage des deux dialogs sur l'onglet actif.
2. `**src/components/SaveToIdeasDialog.tsx**` — extension additive du type `contentType` pour accepter `"newsletter"`.

## Détail des modifications

### 1. `ContentRecycling.tsx`

**Imports ajoutés** (au-dessus de l'existant) :

- `CalendarDays`, `Lightbulb` depuis `lucide-react`
- `AddToCalendarDialog` depuis `@/components/calendar/AddToCalendarDialog`
- `SaveToIdeasDialog` depuis `@/components/SaveToIdeasDialog`

**State ajouté** dans le composant :

- `showCalendarDialog: boolean` (init `false`)
- `showIdeasDialog: boolean` (init `false`)

**Helpers de mapping** basés sur `activeTab` :

- `getCanal(format)` : `linkedin → "linkedin"`, `newsletter → "newsletter"`, sinon `"instagram"`
- `getCalendarFormat(format)` : `carrousel → "carousel"`, `reel → "reel"`, `stories → "story_serie"`, `linkedin → "post"`, `newsletter → "newsletter"`
- `getContentType(format)` : `carrousel → "post_instagram"`, `reel → "reel"`, `stories → "story"`, `linkedin → "post_linkedin"`, `newsletter → "newsletter"`
- `getFormatShortLabel(format)` : libellé court sans emoji pour les titres ("Carrousel", "Reel", "Stories", "Post LinkedIn", "Newsletter")

`**handleAddToCalendar(dateStr)**` : copie fidèle du pattern Crosspost.

```ts
const text = results[activeTab] || "";
const insertData: any = {
  user_id: user.id,
  date: dateStr,
  theme: `Recyclage ${getFormatShortLabel(activeTab)}`,
  canal: getCanal(activeTab),
  format: getCalendarFormat(activeTab),
  content_draft: text,
  accroche: text.split("\n")[0]?.slice(0, 200) || "",
  status: "ready",
};
if (workspaceId && workspaceId !== user.id) insertData.workspace_id = workspaceId;
const { error } = await supabase.from("calendar_posts").insert(insertData);
setShowCalendarDialog(false);
error ? toast({ title: "Erreur lors de la planification", variant: "destructive" })
      : toast({ title: "📅 Planifié dans ton calendrier !" });
```

**Boutons dans la vue résultats** (juste après les boutons "Copier" et "Nouveau recyclage", dans le même flex `gap-2`) :

```tsx
<Button variant="outline" size="sm" onClick={() => setShowCalendarDialog(true)} className="rounded-pill gap-1.5">
  <CalendarDays className="h-3.5 w-3.5" /> Planifier
</Button>
<Button variant="outline" size="sm" onClick={() => setShowIdeasDialog(true)} className="rounded-pill gap-1.5">
  <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
</Button>
```

**Dialogs montés** en fin de bloc résultats (à côté de `<BaseReminder>`) :

```tsx
<AddToCalendarDialog
  open={showCalendarDialog}
  onOpenChange={setShowCalendarDialog}
  onConfirm={handleAddToCalendar}
  contentLabel={`♻️ Recyclage ${getFormatShortLabel(activeTab)}`}
  contentEmoji="♻️"
/>
<SaveToIdeasDialog
  open={showIdeasDialog}
  onOpenChange={setShowIdeasDialog}
  contentType={getContentType(activeTab)}
  subject={`Recyclage : ${getFormatShortLabel(activeTab)}`}
  contentData={{ type: "recycling", format: activeTab, text: results[activeTab] || "" }}
  sourceModule="recycling"
  format={getCalendarFormat(activeTab)}
/>
```

### 2. `SaveToIdeasDialog.tsx` — extension additive

Une seule chose à faire : **autoriser `"newsletter"**` dans le type union, et le gérer dans les deux ternaires internes pour qu'il s'affiche correctement.

- **Interface Props** : `contentType: "story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter"`.
- **Calcul `contentEmoji**` (ligne 69) : ajouter le cas newsletter avant la chaîne actuelle :
  ```ts
  const contentEmoji =
    contentType === "newsletter" ? "📧" :
    contentType === "story" ? "📱" :
    contentType === "reel" ? "🎬" : "📸";
  ```
- **Calcul `formatLabel**` (ligne 70) : ajouter le cas newsletter :
  ```ts
  const formatLabel =
    contentType === "newsletter" ? "newsletter" :
    contentType === "story" ? "story_serie" :
    contentType === "reel" ? "reel" : (format || "post");
  ```
- **Canal** (ligne 78) : actuellement codé en dur `"instagram"`. Le rendre conditionnel uniquement pour les deux nouveaux cas LinkedIn/Newsletter, sans casser l'existant :
  ```ts
  canal:
    contentType === "newsletter" ? "newsletter" :
    contentType === "post_linkedin" ? "linkedin" : "instagram",
  ```
  Note : `post_linkedin` était jusqu'ici aussi écrit en `"instagram"`. **C'est un bug latent** (voir Propositions ci-dessous).

Aucun changement sur le reste du fichier. Les 4 contentType existants conservent leur emoji, leur formatLabel et — sauf pour `post_linkedin` voir ci-dessous — leur canal.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Recycler en 5 formats → l'onglet actif expose "Planifier" + "Sauvegarder en idée".
- Planifier le carrousel → ligne `calendar_posts` avec `canal="instagram"`, `format="carousel"`.
- Planifier la newsletter → `canal="newsletter"`, `format="newsletter"`.
- Sauvegarder la newsletter → carte `saved_ideas` avec emoji 📧.
- CrosspostFlow inchangé fonctionnellement (mêmes dialogs, mêmes inserts).

## Propositions hors demande stricte (validation individuelle)

**(a) Demandé** — tout ce qui précède.

**(b) Propositions** :

1. **Corriger le canal `post_linkedin` dans `SaveToIdeasDialog`.** Aujourd'hui `canal: "instagram"` est codé en dur, donc même une idée sauvegardée depuis Crosspost LinkedIn atterrit avec `canal="instagram"` dans `saved_ideas`. La modification du canal ci-dessus le règle au passage. Si tu préfères ne **pas** toucher ce comportement existant pour limiter le diff, je laisse `post_linkedin → "instagram"` et je ne change le canal que pour `newsletter`. Dis-moi. ok pour moi
2. **Désactiver "Planifier" / "Sauvegarder" si** `!results[activeTab]?.trim()` (sécurité : un format peut être vide si la génération a partiellement échoué). Micro-ajout, zéro risque. ok

Pas d'autres propositions hors périmètre.

## Hors scope (rappel)

- Pas de modification de `handleRecycle`, de l'upload, du RedFlagsChecker, du bouton Copier.
- Pas de modification de `CrosspostFlow.tsx`, `InspireFlow.tsx`, `AddToCalendarDialog.tsx`.
- Pas de modification du calendrier ni de l'Atelier.
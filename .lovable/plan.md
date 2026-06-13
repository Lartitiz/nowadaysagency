## Objectif
Séparer la persistance technique du carrousel (insert dans `generated_carousels`) de l'action "Sauvegarder en idée" (ouverture de `SaveToIdeasDialog`). Aujourd'hui, `handleSave` fait les deux, et comme `handleAddToCalendar` et `handleSaveBackToCalendar` l'appellent pour auto-sauvegarder techniquement le carrousel, ils héritent à tort de l'ouverture du dialog Idées — clic Agenda → dialog Idées par-dessus → photos perdues si l'utilisatrice valide là.

## Fichier impacté
- `src/pages/CreerUnifie.tsx` (uniquement)

## Changements

### 1. Extraire `persistCarousel`
Nouvelle fonction qui contient le corps actuel du bloc carrousel de `handleSave` (lignes ~1543-1570), sans toucher à `setSaveIdeaDialogOpen` :

```ts
const persistCarousel = async () => {
  if (!session?.user?.id || !result?.raw || saving) return;
  const r = result.raw;
  if (selectedFormat === "carousel" && r?.slides) {
    setSaving(true);
    try {
      const hookText = r.slides?.[0]?.title || "";
      const captionText = [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n\n");
      const { data } = await supabase.from("generated_carousels" as any).insert({
        user_id: session.user.id,
        ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        carousel_type: r.carousel_type || "tips",
        subject: ideaText,
        objective: objective || null,
        hook_text: hookText,
        slide_count: r.slides?.length || 7,
        slides: r.slides,
        caption: captionText,
        hashtags: r.caption?.hashtags || [],
        quality_score: r.quality_check?.score || null,
      }).select("id").single();
      if (data) setSavedId((data as any).id);
    } catch (e: any) {
      console.warn("generated_carousels insert failed:", e?.message);
    } finally {
      setSaving(false);
    }
  }
};
```

Insert/champs/guards strictement identiques — déplacement, pas modification.

### 2. Simplifier `handleSave` (bouton "Sauvegarder en idée")
```ts
const handleSave = async () => {
  await persistCarousel();
  setSaveIdeaDialogOpen(true);
};
```
Comportement final du bouton "Sauvegarder en idée" inchangé : persiste le carrousel puis ouvre le dialog Idées.

### 3. `handleAddToCalendar` (ligne 1794)
Remplacer `await handleSave();` par `await persistCarousel();`. Le reste (branch `fromCalendar` → `handleSaveBackToCalendar`, sinon `setCalendarDialogOpen(true)`) reste inchangé.

### 4. `handleSaveBackToCalendar` (ligne 1696)
Remplacer `await handleSave();` par `await persistCarousel();`. Le reste de la fonction (update calendar_posts, uploads photos/visuels, navigate) reste inchangé.

## Ce qui NE bouge pas
- `SaveToIdeasDialog.tsx` — non touché.
- `handleConfirmCalendar`, `uploadPhotosToStorage`, `uploadVisualsToStorage` — non touchés.
- Mapping des champs de l'insert `generated_carousels` — identique.
- Early-returns sur `savedId` chez les appelants — conservés (la fonction `persistCarousel` n'est appelée par les flows agenda que si `!savedId`).

## Validation
1. `npx tsc --noEmit --skipLibCheck` → 0 erreur.
2. Manuel : générer un carrousel → "Ajouter à l'agenda" → SEUL le dialog Calendrier s'ouvre. Valider → post calendrier reçoit les `photo_urls`.
3. Régression : "Sauvegarder en idée" → dialog Idées s'ouvre, ligne créée dans `generated_carousels`.
4. Régression : depuis le calendrier (`fromCalendar`) → "Sauvegarder dans le calendrier" → update OK, pas de dialog Idées.

## Signalement (proposition, non implémenté)
`SaveToIdeasDialog` n'upload pas les photos dans Storage — donc même après ce fix, sauvegarder un carrousel "en idée" ne conserve pas les images. À traiter dans un plan séparé si vous voulez que les idées gardent les visuels.

## Hors scope (plans séparés)
- Bug A : photos perdues + retour à "format" pendant la génération des slides.
- Persistance des photos dans `SaveToIdeasDialog`.
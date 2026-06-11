# Plan — Newsletter côté frontend : sauvegarde calendrier avec objet, copie propre, messages de progression

## Contexte métier

Le backend renvoie désormais un objet d'email (`subject`) et un preview text pour les newsletters. Ce plan couvre trois ajustements frontend pour exploiter proprement ces champs :
- la sauvegarde vers le calendrier doit inclure l'objet et le preview text,
- le bouton "Copier la newsletter complète" ne doit pas préfixer "Objet :" quand l'objet est vide,
- l'écran d'attente doit avoir des messages dédiés newsletter (la génération n'est plus streamée).

## Fichiers impactés et modifications

### 1. `src/pages/CreerUnifie.tsx` — `extractContentForCalendar()`

Ajouter une branche `else if` pour le format `newsletter`, **juste avant** le `else` générique final (ligne ~1614) :

```typescript
} else if (selectedFormat === "newsletter" && (r?.content || r?.body)) {
  const nlBody = r.body || r.content || "";
  accroche = (r.subject || r.accroche || nlBody.split("\n")[0] || "").slice(0, 200);
  contentDraft = r.subject
    ? `Objet : ${r.subject}\n${r.preview_text ? `Preview : ${r.preview_text}\n` : ""}\n${nlBody}`
    : nlBody;
```

Le `else` générique final (`contentDraft = r.content || r.post || r.text || ""`) reste inchangé.
Toutes les autres branches (carousel, linkedin, reel, story, pinterest_visual, pinterest_photo) restent strictement identiques.

### 2. `src/components/creer/formatRenderers/NewsletterResult.tsx` — `copyAll()`

Remplacer le corps de `copyAll` (ligne ~29) pour ne préfixer "Objet :" et "Preview :" que si les valeurs sont non vides :

```typescript
const copyAll = () => {
  const text = [
    subject ? `Objet : ${subject}` : null,
    previewText ? `Preview : ${previewText}` : null,
    body,
    ctaSuggestion ? `---\n${ctaSuggestion}` : null,
  ].filter(Boolean).join("\n\n");
  navigator.clipboard.writeText(text);
  toast.success("Newsletter copiée !");
};
```

Le reste du composant (cartes subject/preview/body/CTA, `copySubject`, `RedFlagsChecker`, `AiGeneratedMention`) reste inchangé.

### 3. `src/components/creer/CreerStepResult.tsx` — `PROGRESS_MESSAGES`

Ajouter une clé `newsletter` dans la constante `PROGRESS_MESSAGES` (après la clé `linkedin`, ligne ~92) :

```typescript
newsletter: [
  "Rédaction de l'objet d'email…",
  "Construction du storytelling…",
  "Développement de la réflexion en profondeur…",
  "Relecture et correction du style…",
  "Dernières retouches…",
],
```

Toutes les autres clés (`carousel`, `reel`, `story`, `pinterest_visual`, `pinterest_photo`, `pinterest_inspiration`, `linkedin`, `default`) et la constante `cleanStreamingContent` restent inchangées.

## Ce qui ne bouge pas

- Signature et arguments de `onNext()` et `extractContentForCalendar()`.
- Toutes les branches existantes d'`extractContentForCalendar` (carousel, linkedin, reel, story, pinterest_visual, pinterest_photo).
- Le `else` générique final d'`extractContentForCalendar`.
- Le reste de `NewsletterResult.tsx` (cartes, `copySubject`, `RedFlagsChecker`, `AiGeneratedMention`).
- Les autres clés de `PROGRESS_MESSAGES` et la clé `default`.
- `cleanStreamingContent`, `handleSaveBackToCalendar`, `handleSave`, `generateStream` dans `CreerStepResult.tsx`.
- Tout code backend (Edge Functions).

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. Test manuel : générer une newsletter depuis un post du calendrier → "Sauvegarder dans le calendrier" → rouvrir le post → le brouillon contient `Objet : ...` en première ligne, et `Preview : ...` si présent.
3. Test manuel : "Copier la newsletter complète" → le presse-papier commence par `Objet : ...` (jamais par `Objet : ` vide) ; si subject vide, le presse-papier commence directement par le body.
4. Test manuel : pendant la génération newsletter, les messages "Rédaction de l'objet d'email…", "Construction du storytelling…", etc. défilent à l'écran.

## Hors scope (plans séparés)

- Le bouton "Sauvegarder en idée" (chantier séparé).
- Toute modification des Edge Functions.

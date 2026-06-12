# Factorisation rendu embedded/standalone — Calendar.tsx

## Objectif

Supprimer la duplication ~150 lignes entre les branches `if (embedded)` (L888-947) et standalone (L949-1066). Une seule implémentation du bloc commun, deux wrappers minimaux.

## (a) Demandé — implémentation

### Étape 1 — Extraire un JSX `body` unique (variable locale dans le composant)

Construit après `calendarContent`, juste avant `if (embedded)`. Contient, dans l'ordre :

1. `<AuditRecommendationBanner />`
2. `<ExportSection ... seriesNameById={seriesNameById} />`
3. Tabs mobile (le bloc `{isMobile && <div className="flex rounded-full…">…</div>}`)
4. Bloc principal `{isMobile ? … : <Suspense><CalendarDndWrapper>…</CalendarDndWrapper></Suspense>}` avec sidebar idées repliable
5. `<LocalErrorBoundary><CalendarPostDialog … /></LocalErrorBoundary>`
6. `<IdeaDetailSheet … />`
7. `<CalendarCoachingDialog … />` — **avec** la prop `existingPosts` (présente en standalone L1054, absente en embedded L944 — bug latent : on garde la version standalone)
8. `<QuickBatchAdd … />` — **présent uniquement en standalone aujourd'hui** (L1057-1063). On l'inclut dans `body` pour que `ExportSection.onQuickBatchOpen` fonctionne aussi en embedded (sinon clic mort). Signalé en (b) pour validation explicite.

Aucun changement de props, de handlers, ni d'ordre.

### Étape 2 — Unifier le bouton "replier"

Garder la version discrète standalone (L1005-1012) :

- conteneur : `<div className="relative border border-border rounded-2xl bg-card p-4 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">`
- bouton : `bg-card border-border shadow-sm text-muted-foreground`, taille `w-6 h-6`, svg strokeWidth 2.5
- Supprimer la variante destructive rouge de la branche embedded (L921-933).

### Étape 3 — Réduire les deux returns à des wrappers

```tsx
if (embedded) {
  return <div>{body}</div>;
}

return (
  <div className="min-h-screen bg-background">
    <AppHeader />
    <main id="main-content" className="mx-auto max-w-[1400px] px-6 py-8 max-md:px-4">
      {isInstagramRoute && (
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Calendrier éditorial" useFromParam />
      )}
      {body}
    </main>
  </div>
);
```

Pas de nouveau fichier ni de nouveau composant exporté : `body` reste une variable JSX locale dans `CalendarPage`, ce qui préserve l'accès direct aux états/handlers/closures sans threading de props.

## (b) Propositions connexes — à valider avant exec

1. **Ajouter `QuickBatchAdd` au mode embedded** (cf. étape 1.8). Aujourd'hui le bouton "Batch rapide" d'`ExportSection` est mort en embedded. C'est un alignement de comportement, pas une régression de l'existant — mais c'est un changement fonctionnel léger. Valider O/N. OUI
2. **Ajouter** `existingPosts` **au** `CalendarCoachingDialog` **du mode embedded** (cf. étape 1.7). Idem, l'embedded est dégradé aujourd'hui. Valider O/N. OUI

Si tu refuses l'un des deux, on conserve la divergence via une prop booléenne sur `body` (peu propre) ou on duplique juste ces deux lignes. Préférable de valider et tout unifier.

## Hors scope respecté

- Aucun handler touché.
- Aucun composant enfant modifié.
- Aucun changement d'URL handling ni de filtres.
- Pas d'extraction en fichier séparé.

## Validation

1. `npx tsc --noEmit --skipLibCheck` clean.
2. Diff comportemental : `/calendrier` standalone + page consommatrice de `<CalendarPage embedded />` — DnD, sidebar repliable (bouton gris discret partout), tabs mobile, tous les dialogs, exports identiques.
3. Bouton replier visuellement identique dans les deux modes.
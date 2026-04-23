

## Plan — UI "Mes séries" : 3e onglet dans la section Ligne éditoriale (final)

### Décisions intégrées

- ✅ Toasts sonner sur update/archive/delete
- ✅ Skeleton de chargement pendant `loading === true`
- ✅ Statu quo sur le hook `useBrandStrategy` (query inline)
- ❌ Pas de drag & drop (Phase 2)
- ❌ Pas de bouton "Nouvelle série manuelle" (Phase 2)
- ✅ État pédagogique dédié si `hasRecap === false` sur l'onglet series — **pas de fallback vers `tab=fiche`**, on reste sur l'onglet avec une card explicative qui oriente vers le coaching combo

### Fichiers créés

**`src/hooks/use-series.ts`**
- Interface `SerieSummary` exactement comme spécifiée.
- `useAuth()` + `useWorkspaceFilter()` pour scoping workspace.
- `fetchSeries` : `SELECT *` filtré par `column/value`, tri client-side : `status` (active → paused → archived) puis `created_at ASC`.
- `useEffect` initial. Démo (`isDemoMode`) → `[]`.
- Expose : `series`, `activeSeries`, `archivedSeries`, `loading`, `refetch`, `updateStatus(id, status)`, `deleteSerie(id)`.
- Toast `sonner` après chaque mutation.

**`src/components/branding/SeriesFicheCards.tsx`**

Props : `{ onLaunchCoaching: () => void; hasRecap: boolean }`.

Constantes en haut :
```ts
const CADENCE_LABELS = { weekly: "Hebdo", biweekly: "Tous les 15 jours", monthly: "Mensuel", irregular: "Irrégulier" };
const CHANNEL_LABELS = { instagram: "Instagram", linkedin: "LinkedIn", pinterest: "Pinterest", newsletter: "Newsletter", website: "Site web" };
```

Structure :
- **Header** : titre "📺 Mes séries signatures" + sous-titre + bouton à droite (variant change selon `activeSeries.length`).

- **Cas A — `hasRecap === false`** (nouveau, état pédagogique dédié) :
  Card centrée bordure `border-primary/20` fond `bg-primary/5` avec :
  > Tu n'as pas encore défini tes piliers éditoriaux.
  > 
  > Pas de souci : le coaching séries peut poser tes piliers et tes séries dans la même session. On commence par les piliers, puis on les incarne en séries signatures.
  
  Bouton primary "✨ Lancer le coaching séries" → `onLaunchCoaching()`.
  Le header (titre + bouton "Affiner") reste masqué dans ce cas pour ne pas créer de double CTA.

- **Cas B — `loading === true`** : 2 skeletons de cards (animate-pulse, hauteur ~180px, fond `bg-muted` arrondi).

- **Cas C — `series.length === 0` ET `hasRecap === true`** : état vide standard avec copie originale ("Tu n'as pas encore défini de série…") + bouton "✨ Lancer le coaching séries".

- **Cas D — Liste séries actives + en pause** : pour chaque série, card avec :
  - Header : nom (font-display bold) + promise (sous-titre) ; à droite `DropdownMenu` shadcn avec Éditer / Pause-Réactiver / Archiver / [séparateur] / Supprimer (rouge → `AlertDialog` shadcn).
  - Corps : badge pilier (mapping `pillar_key` → libellé fetché depuis `brand_strategy` via query inline au montage), chip cadence, chip format, italique signature, chips canaux.
  - Mode édition inline : champs texte via `EditableField` (table=`series`, idField=`id`, recordId=serie.id) pour `name`, `promise`, `format_template`, `signature_description`, `notes`. `pillar_key`, `cadence`, `status`, `channels` via shadcn `Select`/`Checkbox` avec update direct supabase + `refetch()` + toast. Bouton "Terminer".
  - `status === "paused"` → card en `opacity-60` + badge "En pause".

- **Séries archivées** : `Accordion` shadcn fermé par défaut "📦 Séries archivées (N)", cards en `opacity-50`, menu limité à Réactiver + Supprimer.

### Fichier modifié

**`src/pages/BrandingSectionPage.tsx`**
- Import `SeriesFicheCards`.
- Toggle bar : ajout conditionnel d'un 3e bouton "📺 Mes séries" si `section === "content_strategy"`.
- Branche de rendu : ajout `activeTab === "series"` → `<SeriesFicheCards hasRecap={hasRecap} onLaunchCoaching={() => navigate("/branding/coaching?section=content_series")} />`.
- Bouton "Affiner avec l'IA" du header : `onClick` adapté pour cibler `content_series` quand `activeTab === "series"`.
- Garde-fou `useEffect` lignes 347-351 : étendre la condition pour ne PAS court-circuiter `activeTab === "series"` (le composant gère son propre état pédagogique). Donc : `if (!hasRecap && activeTab === "synthese") setActiveTab("fiche")` reste tel quel — pas de redirection forcée pour `series`.
- `defaultTab` (ligne 197) déjà compatible avec `?tab=series`.
- Bloc `!hasRecap` (ligne 586+) intact.

### Hors scope confirmé

Phase 2 (injection prompts IA, tag visuel calendrier, banner dashboard, mode démo séries, vue feuilleton, module dédié, drag & drop, bouton création manuelle, BrandingStatusBanner). Aucune migration DB. Aucun edge function touché.

### Validation

- TypeScript compile sans erreur.
- Sections non-`content_strategy` : toggle bar inchangée (2 boutons).
- `content_strategy` avec recap : 3 boutons.
- `content_strategy` SANS recap + clic sur "Mes séries" : état pédagogique dédié s'affiche, redirige vers coaching combo.
- État vide standard (recap OK, 0 série) : copie originale + CTA.
- Édition inline / changement statut / archivage / accordéon / suppression / isolation workspace / bouton "Affiner avec l'IA" cible `content_series` : tout couvert.


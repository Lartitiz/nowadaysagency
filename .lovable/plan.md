

## Option A — Redesign complet du dialog d'édition

### Layout cible

**Desktop (≥1024px)** — `max-w-6xl`, grid 3 colonnes :
```text
┌──────────────┬─────────────────────┬──────────────────┐
│ MÉTA (220px) │ ÉDITION (1fr)       │ PREVIEW (340px)  │
│              │                     │ sticky top       │
│ Canal        │ Thème               │                  │
│ Statut       │ ✍️ Contenu (full)   │ 📱 Mockup ou    │
│ Date+heure   │ Brief               │ 📑 Slides nav    │
│ Format       │ Notes               │ horizontale      │
│ Objectif     │ Visuels             │                  │
│ Angle        │ Comments            │ [📋][📥][🔍]    │
└──────────────┴─────────────────────┴──────────────────┘
```

**Mobile (<1024px)** — 3 tabs : `✏️ Éditer / 👁️ Preview / 📋 Méta`

### Modifications

**1. `CalendarPostDialog.tsx`** (~80 lignes)
- `DialogContent` → `sm:max-w-6xl` + `max-h-[90vh]`
- Hook `useIsMobile` pour switcher layout
- Desktop : grid 3 colonnes, colonne preview en `sticky top-0`
- Mobile : `Tabs` avec 3 onglets remplaçant le toggle 2-modes actuel
- Retirer le toggle Éditer/Preview sur desktop (les deux visibles)

**2. `CalendarPostPreview.tsx`** (~40 lignes)
- Nouveau prop `compact?: boolean` (largeur réduite ~320px)
- Si slides détectées : navigation horizontale (flèches + dots, style `CarouselSlider`) au lieu de scroll vertical
- Mini-toolbar haut : 📋 Copier · 📥 Télécharger (dropdown) · 🔍 Plein écran
- Auto-detection : slides → mockup slides ; sinon caption → mockup réseau ; sinon texte simple

**3. `CalendarPostContent.tsx`** (~15 lignes)
- Retirer la troncature 200 chars + boutons "voir la suite/réduire"
- Zone éditable scrolle naturellement (max-h + overflow-auto)
- Sur desktop : retirer le bouton "👁️ Voir les slides" (devenu redondant avec preview live)
- Garder ce bouton sur mobile (pas de preview persistant)

**4. Petit polish**
- Badge synchro `🟢 Synchronisé` / `🟡 Modifs en cours` en haut du preview (état dérivé de `contentDraft` vs sauvegardé)
- Footer actions desktop : alignement à droite, sticky bas

### Risque
Faible. Logique métier inchangée, juste réorganisation. Mobile reste proche de l'actuel.

### Test
Sur `/calendrier` viewport 1300px : ouvrir un post avec carrousel mix → preview slides visible à droite avec nav horizontale, contenu plein texte au milieu, méta à gauche. Puis viewport mobile : 3 tabs accessibles.


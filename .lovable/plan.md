

## Diagnostic

À l'étape **format**, quand des photos sont déjà préchargées (via "Partir de photos" à l'étape précédente) et que le sous-mode mix/photo est auto-sélectionné, la `PhotoUploadZone` complète s'affiche quand même :
- Drop zone "Glisse tes photos ici…" (alors qu'on en a déjà)
- Textarea "Ou décris tes photos en quelques mots" (alors qu'on l'a déjà décrite à l'étape idée)
- Bouton "+ Ajouter un contexte par photo"

→ **Redondance cognitive** : on dirait qu'il faut tout refaire, alors qu'on a déjà :
1. ✅ Une bannière de confirmation "📸 X photos chargées — Carrousel mixte" (lignes 494-513)
2. ✅ Les thumbnails dans `PhotoUploadZone`
3. ❌ Mais aussi un drop zone + textarea description **qui font doublon avec l'étape précédente**

Pareil pour le **post avec photo** (lignes 461-478 : bannière OK, puis lignes 481-492 : `PhotoUploadZone` complète).

## Fix proposé — 2 fichiers, mode "compact"

### 1. `PhotoUploadZone.tsx` — nouveau prop `compact`
Ajouter une prop optionnelle `compact?: boolean` qui, quand `true` :
- **Masque le drop zone** (l'utilisateur·ice peut toujours ajouter via "+ Ajouter d'autres photos" discret en bas si pas full)
- **Masque la textarea description** (déjà saisie en amont)
- **Masque le bouton "+ Ajouter un contexte par photo"** (si vraiment besoin, on le déplie depuis un lien discret)
- **Garde** : grille de thumbnails (drag-réorder + suppression + contexte par photo si déplié)
- **Garde** : compteur "X / Y photos"
- **Ajoute** : un petit bouton texte "+ Ajouter d'autres photos" sous la grille (qui ouvre l'input file directement) — visible uniquement si pas full

### 2. `CreerStepFormat.tsx` — activer `compact` quand photos préchargées
Passer `compact={(initialPhotos?.length ?? 0) > 0 && !hasUserChangedFormat.current}` aux deux `PhotoUploadZone` :
- Ligne 483-491 (post photo)
- Ligne 565-575 (carrousel photo/mix)

Dès que l'utilisateur·ice change manuellement de format ou de canal (`hasUserChangedFormat = true`), on revient au mode complet (cas où on repart vraiment de zéro).

### Comportement préservé
- L'utilisateur·ice peut toujours **réorganiser, supprimer, ajouter** des photos
- L'utilisateur·ice peut toujours **ajouter un contexte par photo** (lien discret "Affiner le contexte de chaque photo" qui déplie les inputs)
- La description globale reste éditable côté flow (déjà saisie à l'étape idée, transmise via `initialPhotoDescription` au backend)
- Mode complet utilisé partout ailleurs (Pinterest inspiration, etc.) : aucune régression

### Visuel après fix (carrousel mixte avec photos préchargées)
```text
┌─────────────────────────────────────────────┐
│ 📸 3 photos chargées — Carrousel mixte ...  │  ← bannière (existe déjà)
└─────────────────────────────────────────────┘

[img] [img] [img]                                  ← thumbnails draggables
3 / 10 photos          + Ajouter d'autres photos   ← compteur + lien discret
                       Affiner le contexte par photo

→ Plus de drop zone géant, plus de textarea redondante
```

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Flow "Partir de photos → Insta Carrousel" : pas de drop zone, pas de textarea, juste les vignettes + compteur
3. Flow "Partir de photos → Post simple avec photo" : idem (1 vignette)
4. Flow normal "Partir de zéro → Carrousel photo" : drop zone + textarea visibles comme avant
5. Possibilité d'ajouter/retirer/réorganiser les photos préchargées intacte

## Hors scope
- Refonte du flow d'édition de contexte par photo (reste accessible via lien discret)
- Persistance des contextes par photo entre étapes (déjà géré via `initialPhotos`)


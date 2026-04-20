

## Plan — Clarifier le parcours photos pré-chargées (avec distinction LinkedIn vs Instagram)

### Contexte
Quand l'utilisateur·ice arrive depuis "Partir de photos" avec des photos déjà uploadées, on lui re-demande des sous-choix redondants dans `CreerStepFormat`. Précision importante : **le carrousel mixte existe en 2 saveurs** — LinkedIn (max 10 slides PDF, ratio 1:1 ou 4:5, ton pro) et Instagram (max 10 slides image, ratio 4:5, ton plus visuel). Le bandeau de confirmation doit refléter le bon canal.

### Diagnostic — 3 doublons

1. **Carrousel** — sous-choix `text/photo/mix` re-demandé alors que photos déjà uploadées (mix = seul mode pertinent)
2. **Post** — toggle "Inclure une photo" inutile (forcément ON)
3. **PhotoUploadZone** — pas de titre clair confirmant que les photos précédentes sont bien là

### Fix — 1 seul fichier : `src/components/creer/CreerStepFormat.tsx`

Quand `initialPhotos.length > 0` ET `!hasUserChangedFormat.current` :

**1. Carrousel — bandeau adapté au canal sélectionné**
Masquer le bloc sous-choix `text/photo/mix`. Afficher :
- Si LinkedIn : `📸 5 photos chargées — Carrousel mixte LinkedIn (PDF, photos + slides texte)`
- Si Instagram : `📸 5 photos chargées — Carrousel mixte Instagram (photos + slides texte)`
- Lien discret `[Choisir un autre mode]` qui réaffiche le sélecteur (`hasUserChangedFormat = true`)

→ Récupération du canal via la prop `channel` déjà propagée dans le tour précédent (LinkedIn caption editor). Si la prop n'existe pas encore au niveau de `CreerStepFormat`, je l'ajoute (passage depuis `CreerUnifie` → `CreerStepFormat`).

**2. Post — bandeau de confirmation**
Masquer le toggle "Inclure une photo". Afficher :
- `📸 Post avec photo — 3 photos chargées` + lien `[Retirer les photos]`

**3. PhotoUploadZone — titre explicite**
Passer `title="Vos photos (3)"` au lieu du label générique pour rassurer.

**4. Format incompatible (reel, story, newsletter)**
Bandeau ambre discret : `⚠ Ce format n'utilisera pas tes photos.` + lien `[Revenir au carrousel/post]`

### Comportement préservé
- Clic sur "Choisir un autre mode" / "Retirer les photos" → `hasUserChangedFormat.current = true` → UI normale réapparaît
- Pas de `initialPhotos` → strictement identique à aujourd'hui

### Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Photos → carrousel LinkedIn : bandeau "Carrousel mixte LinkedIn"
3. Photos → carrousel Instagram : bandeau "Carrousel mixte Instagram"
4. Photos → post : pas de toggle, bandeau confirmation
5. Parcours classique sans photos : aucun changement

### Hors scope
- Photo-to-idea (analyse IA des photos)
- Persistance Storage / bibliothèque média
- Pré-sélection auto du canal selon les photos


# Carrousel Instagram : rendre le choix entre 3 modes 100% clair

## Le problème

Aujourd'hui, quand tu pars de photos et choisis **Instagram → Carrousel**, l'app propose bien 2 cartes (📸 Photo / ✨ Mixte), mais :

- Les libellés courts (**"Photo"**, **"Mixte"**) ne disent pas clairement **ce que l'IA va produire**.
- Le mode "Photo" actuel correspond déjà à ce que tu veux (poster les photos brutes en plein écran, l'IA rédige juste la légende), mais ce n'est pas évident à la lecture.
- Résultat : tu as choisi **Mixte** sans réaliser que **Photo** faisait exactement ce que tu voulais.

## Ce qu'on va changer

Une seule zone à retoucher : la grille des sous-modes carrousel dans `src/components/creer/CreerStepFormat.tsx` (lignes ~626-656), plus le chip replié (ligne ~594).

### Renommer les 3 modes avec des libellés explicites

| Avant | Après | Description (sous le titre) |
|---|---|---|
| 📝 Texte | **Carrousel texte** | *L'IA écrit + design 8-10 slides. .pptx téléchargeable.* |
| 📸 Photo | **Carrousel photos seules** | *Tes photos brutes en plein écran. L'IA rédige uniquement la légende qui accompagne le post.* |
| ✨ Mixte | **Carrousel storytelling** | *Alterne tes photos et des slides design avec du texte construit par l'IA.* |

### Améliorer la lisibilité de la grille

- Cartes un peu plus hautes pour accueillir 2-3 lignes de description (au lieu d'une seule tronquée).
- Garder l'emoji en gros (déjà 2xl) + titre en bold + description en `text-[11px]` plus lisible.
- Sur mobile : passer de `grid-cols-2` à `grid-cols-1` pour que chaque carte respire et que la description complète soit lisible (pas de troncature).
- Sur desktop : rester en `sm:grid-cols-3` quand les 3 modes sont visibles, ou `sm:grid-cols-2` quand on part de photos (Texte masqué).

### Mettre à jour le chip replié

Une fois un mode choisi, le chip en haut (ligne 594, `subModeMeta`) doit afficher le **nouveau libellé long** au lieu de "Mixte" / "Photo" tout court :

- `text` → "Carrousel texte"
- `photo` → "Carrousel photos seules"
- `mix` → "Carrousel storytelling"

## Ce qu'on ne touche pas

- La logique de génération côté `CreerUnifie.tsx` et edge function : les valeurs internes restent `text` / `photo` / `mix`, seuls les libellés et descriptions affichés changent.
- Le masquage du mode "Texte" quand `hasPreloadedPhotos` est vrai : on garde ce comportement (logique).
- La zone d'upload photo qui suit (ligne 661) : inchangée.

## Fichier modifié

- `src/components/creer/CreerStepFormat.tsx` (uniquement les libellés et descriptions des cartes + chip)

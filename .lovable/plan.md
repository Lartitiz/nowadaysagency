

## Plan : Fluidifier le coach contenu — de 6 étapes à 3

### Le problème actuel
Le flow demande 6 clics minimum avant de voir des idées : Objectif → Sujet → Canal → Format → Angle éditorial → Ton. C'est trop long. L'utilisatrice décroche avant d'arriver aux résultats.

### La refonte

**Nouveau flow en 3 étapes :**

```text
Étape 1 : Objectif + Sujet (fusionnés)
  ┌─────────────────────────────────┐
  │ Grille 4 objectifs              │
  │ + champ sujet optionnel dessous │
  │ + bouton "Surprise moi" (skip)  │
  └─────────────────────────────────┘

Étape 2 : Canal + Format (fusionnés)
  ┌─────────────────────────────────┐
  │ Grille groupée :                │
  │ 📸 Insta Post | Carrousel |... │
  │ 💼 LinkedIn Post | Carrousel   │
  │ 📌 Pinterest épingle | visuel  │
  │ 📧 Newsletter                  │
  └─────────────────────────────────┘

Étape 3 : Génération immédiate
  → L'angle éditorial et le ton sont choisis par l'IA
    (basés sur le branding + objectif)
  → Résultat : 3 idées comme aujourd'hui
```

### Détails des changements

**Fichier : `src/components/dashboard/ContentCoachingDialog.tsx`**

1. **Étape 1 — Objectif + Sujet fusionnés**
   - Afficher la grille des 4 objectifs
   - Dessous, un champ texte optionnel "Un sujet en tête ? (facultatif)" — plus de sous-étape oui/non
   - Cliquer un objectif passe directement à l'étape 2 (le sujet est pris s'il est rempli)
   - Ajouter un bouton "✨ Surprise — l'IA décide tout" qui skip directement à la génération (objectif = auto, sujet = vide, canal/format = auto)

2. **Étape 2 — Canal + Format fusionnés**
   - Une seule grille groupée par canal avec les formats en sous-items
   - Cliquer un format déclenche immédiatement la génération (plus d'étape angle ni ton)
   - Le sous-choix carrousel (texte/photo/mix) reste affiché inline quand on sélectionne carrousel

3. **Supprimer les étapes 5 (angle) et 6 (ton)**
   - L'angle éditorial est choisi par l'IA côté backend (déjà supporté via `contentType = ""` et le bouton "L'outil choisit pour moi")
   - Le ton est déduit du `brand_profile.tone_keywords` existant — plus besoin de le demander
   - Passer `ton_envie: "auto"` et `content_type: "auto"` au backend

4. **Progress bar** : passer de 6 segments à 2

5. **Type Step** : simplifier de `1|2|3|4|5|6|"loading"|"result"` à `1|2|"loading"|"result"`

### Ce qui ne change pas
- Le backend `content-coaching` (il gère déjà les valeurs nulles/auto)
- L'écran de résultat avec les 3 idées
- Le bouton "Autres idées" pour régénérer
- La redirection vers `/creer` avec les bons params
- Le sous-choix carrousel texte/photo/mix

### Résultat attendu
2 clics au lieu de 6 pour arriver aux idées. L'utilisatrice choisit son objectif, son canal+format, et l'IA fait le reste.


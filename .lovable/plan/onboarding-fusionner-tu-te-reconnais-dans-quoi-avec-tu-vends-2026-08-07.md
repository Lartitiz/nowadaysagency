# Onboarding : fusionner « Tu te reconnais dans quoi ? » avec « Tu vends plutôt… »

## Constat

L'étape 2 propose 11 catégories réparties en 2 familles (« Créatrices & artisanes », « Accompagnantes & prestataires »). La liste déborde de l'écran (zone scrollable interne, peu visible) et enferme des profils qui n'y correspondent pas.

Or l'info est déjà couverte ailleurs :
- l'étape 1 demande déjà le prénom **et** l'activité en texte libre,
- l'étape 3 demande produits / services / les deux.

## Ce qu'on fait

Supprimer l'écran des 11 catégories et le fusionner avec l'écran produits/services en **un seul écran, sans scroll** :

```text
              Tu proposes plutôt quoi ?
        pour adapter les contenus qu'on va créer

     🎁 Des produits    🤝 Des services    ✨ Les deux

   Et concrètement, tu fais quoi ?
   [ céramiste, je vends mes pièces en ligne          ]
   (une phrase suffit — c'est ce qui rend tes contenus justes)
```

- 3 grandes cartes côte à côte (empilées sur mobile).
- Champ de précision **pour tout le monde** (demandé), pré-rempli avec l'activité saisie à l'étape 1 et éditable.
- Tout tient dans la hauteur d'écran : plus de zone scrollable cachée.
- L'onboarding passe de 12 à 11 étapes ; la barre de progression suit.

## Détails techniques

- `ActivityStep.tsx` : supprimé du parcours. `ProductServiceScreen.tsx` devient l'écran fusionné (3 choix + champ précision).
- `Onboarding.tsx` : suppression du `step === 2`, décalage des étapes suivantes, `TOTAL_STEPS` 12 → 11, validateur fusionné (choix requis + précision ≥ 5 caractères).
- Le champ `activity_type` est conservé en base pour ne rien casser côté diagnostic/stats : il est alimenté par le choix produits/services/les deux, et `activity_detail` reçoit la phrase libre — c'est elle qui est envoyée à l'IA (déjà géré par `onboardingLabel`).
- `ACTIVITY_SECTIONS` / `ACTIVITY_SECTIONS_REAL_ESTATE` ne sont plus utilisées pour cet écran ; la variante immobilier garde ses blocages et objectifs spécifiques.
- Aucun changement de schéma SQL, aucune edge function touchée.

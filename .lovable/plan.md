

## Bouton "Compléter avec l'IA" pour Ma ligne éditoriale (content_strategy)

### Le besoin

Sur la fiche **Ma ligne éditoriale** (section `content_strategy`), pouvoir cliquer sur un bouton qui demande à l'IA de remplir d'un coup les champs vides : facettes cachées, facettes 1/2/3, piliers majeur/mineurs, concept créatif. Exactement comme le bouton "Compléter les X champs manquants avec l'IA" qui existe déjà sur **Ma cliente idéale** (persona).

### Comment c'est déjà fait pour persona (rappel)

Dans `BrandingFicheCards.tsx` → composant `FieldCards` :
- Un bouton conditionné à `section === "persona"` apparaît si au moins un champ est vide
- Il appelle `handleAutoFill` qui :
  1. Extrait ce qui est récupérable depuis la synthèse "portrait" déjà en base (gratuit, instantané)
  2. Pour les champs encore vides, appelle l'edge function `branding-coaching` avec `section: "persona_fill"` en agrégeant tout le contexte disponible (brand_profile, conversation de coaching, champs déjà remplis)
  3. Normalise les clés alias renvoyées par l'IA, écrit en base, met à jour l'UI via `onFieldUpdate`

L'edge function a un cas spécial `if (section === "persona_fill")` avec un prompt très strict sur le format de sortie.

### Ce qu'on ajoute

#### 1. Nouveau cas `content_strategy_fill` dans l'edge function

Fichier : `supabase/functions/branding-coaching/index.ts`

Ajout d'un bloc `if (section === "content_strategy_fill")` calqué sur `persona_fill` mais avec :
- Un prompt système spécialisé "ligne éditoriale" qui sait ce qu'est une facette de marque, un pilier majeur/mineur, un concept créatif
- La liste blanche des clés autorisées : `step_1_hidden_facets`, `facet_1`, `facet_2`, `facet_3`, `pillar_major`, `pillar_minor_1`, `pillar_minor_2`, `pillar_minor_3`, `creative_concept`
- L'interdiction d'alias type "pilier_principal", "concept", "axe_editorial", etc.
- Règles de cohérence métier : les 3 facettes mineures doivent être distinctes du pilier majeur, le concept créatif doit relier les piliers entre eux, les piliers doivent rester ancrés dans la voix/cible/mission de la marque (pas du contenu hors-sol)

#### 2. Branchement côté front dans `BrandingFicheCards.tsx`

Dans le composant `FieldCards` :

- Élargir la condition d'apparition du bouton : `section === "persona" || section === "content_strategy"`
- Élargir `emptyNonPitchFields` et `totalEmpty` pour qu'ils fonctionnent aussi avec `content_strategy` (ces tableaux sont aujourd'hui vides si `section !== "persona"`)
- Refactor de `handleAutoFill` en deux variantes (ou une seule fonction qui branche sur `section`) :
  - **Variante persona** : inchangée
  - **Variante content_strategy** :
    1. Récupère en parallèle :
       - `brand_profile` (mission, positioning, voice_description, tone_register/level/style, combat_cause, combat_fights, key_expressions, things_to_avoid, target_description, target_verbatims)
       - `brand_proposition` (version_final, step_1_what)
       - `persona` primaire (step_1_frustrations, step_2_transformation, step_4_beautiful, step_4_inspiring)
       - `storytelling` primaire (step_7_polished, pitch_short)
       - La conversation de coaching `branding_coaching_sessions` section `content_strategy` si elle existe
       - Les champs `content_strategy` déjà remplis pour ne pas les écraser et les utiliser comme guide
    2. Construit des `contextBlocks` similaires à persona (CONTEXTE DE MARQUE / PROPOSITION / PERSONA / STORY / CHAMPS LIGNE ÉDITO DÉJÀ REMPLIS)
    3. Appelle `branding-coaching` avec `section: "content_strategy_fill"` et la liste explicite des clés à remplir
    4. Normalise via un `aliasMap` dédié (ex : `pilier_principal → pillar_major`, `axe_majeur → pillar_major`, `concept → creative_concept`, `facettes_cachees → step_1_hidden_facets`, etc.)
    5. Écrit en base sur `brand_strategy`, met à jour l'UI via `onFieldUpdate`
    6. Toast de succès avec le nombre de champs complétés

- Tooltip / texte du bouton adapté selon la section : "Compléter les X champs manquants avec l'IA" reste valable.

#### 3. Aucune migration DB

Tous les champs existent déjà dans `brand_strategy`. Zéro changement de schéma.

### Comportement attendu

- Le bouton **n'apparaît que** s'il reste au moins un champ vide dans la fiche `content_strategy`
- Le bouton **est désactivé en mode démo** (cohérent avec persona)
- Si aucun contexte exploitable n'est trouvé (cas peu probable vu qu'il y a forcément un brand_profile), toast info "Pas assez de contexte — remplis manuellement quelques champs ou refais le coaching"
- Les champs déjà remplis ne sont **jamais écrasés**
- Les valeurs renvoyées par l'IA passent par la même logique de normalisation d'alias que persona, pour être robustes

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `supabase/functions/branding-coaching/index.ts` | Ajout du cas `section === "content_strategy_fill"` (~50 lignes, calqué sur `persona_fill`) |
| `src/components/branding/BrandingFicheCards.tsx` | Élargir le bouton autofill à `content_strategy`, refactor `handleAutoFill` pour brancher selon la section, ajouter `aliasMap` dédié à la stratégie éditoriale |

### Validation

1. Aller sur `/branding/section?section=content_strategy` avec un compte qui a un brand_profile rempli mais une `brand_strategy` vide ou partielle
2. Vérifier que le bouton "Compléter les X champs manquants avec l'IA" apparaît avec le bon compteur
3. Cliquer → loader → toast de succès → les cartes vides se remplissent
4. Recharger : les valeurs sont bien persistées en DB
5. Cliquer à nouveau quand tout est rempli : le bouton ne doit plus apparaître
6. Vérifier qu'un champ déjà rempli (ex : pilier majeur "Portraits d'artisan·es") n'a PAS été écrasé
7. Mode démo : le bouton est masqué ou désactivé

### Risques

Très faibles. Pattern dupliqué d'un système déjà éprouvé en production (persona). Pas de migration. Pas de changement structurel. Le seul vrai risque est que l'IA renvoie des clés mal nommées — mitigé par l'`aliasMap` et la liste blanche stricte côté prompt.

### Améliorations possibles (à valider avant ou après)

1. **Bouton "régénérer ce champ uniquement"** : sur chaque carte, un petit bouton ✨ qui demande à l'IA de proposer une nouvelle valeur pour ce champ précis, en gardant tous les autres comme contexte. Plus chirurgical que le bouton global. À chiffrer séparément si tu veux.
2. **Étendre le pattern à `tone_style`** : la fiche "Mon ton" a aussi 13 champs souvent vides. Même bouton autofill possible. Hors scope pour ce plan, mais la même fondation servirait.
3. **Mémoriser le dernier autofill** : conserver `last_autofill_at` sur `brand_strategy` pour afficher "Complété par IA il y a 3 jours" et inviter à régénérer si la marque a évolué. Optionnel.

Dis-moi si tu veux qu'on parte sur le scope de base (bouton autofill global pour `content_strategy`) ou si tu valides aussi l'amélioration #1 (bouton ✨ par champ) pour la même livraison.


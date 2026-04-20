
## Pourquoi ça ne complète pas

Ce n’est pas un problème de “champs non connectés” côté fiche. Les champs sont bien câblés dans l’UI :

- `step_3a_objections`
- `step_3b_cliches`
- `step_4_beautiful`
- `step_4_inspiring`
- `step_4_repulsive`
- `step_4_feeling`
- `step_5_actions`

Le vrai bug est plus bas dans la chaîne :

1. Le bouton lance bien l’IA.
   - Le POST `branding-coaching` part bien
   - la fonction répond en `200`
   - les logs backend montrent bien `section=persona_fill`

2. Mais la réponse IA ne respecte pas les clés demandées.
   - au lieu de renvoyer :
     - `step_3a_objections`
     - `step_3b_cliches`
     - `step_4_beautiful`
     - `step_4_inspiring`
     - `step_4_repulsive`
     - `step_4_feeling`
     - `step_5_actions`
   - elle renvoie un autre format de persona, avec des clés du type :
     - `objections_courantes`
     - `croyances_limitantes`
     - `declencheurs_achat`
     - etc.

3. Le front ne sauvegarde que les clés exactes attendues.
   - dans `BrandingFicheCards.tsx`, la boucle fait `fillInsights[f.key]`
   - donc si l’IA renvoie `objections_courantes` au lieu de `step_3a_objections`, la valeur est ignorée
   - résultat : `validFills` reste vide

4. Ensuite seuls les pitchs sont régénérés.
   - le réseau montre un `PATCH persona` réussi
   - mais ce PATCH contient seulement `pitch_short`, `pitch_medium`, `pitch_long`
   - aucun des 7 champs manquants n’est envoyé

En bref : l’IA tourne, mais elle parle le mauvais “dialecte JSON”, donc les champs persona restent vides.

## Ce qu’on corrige

### 1. Forcer `persona_fill` à renvoyer uniquement les vraies clés DB
Fichier : `supabase/functions/branding-coaching/index.ts`

Dans la branche `section === "persona_fill"` :

- renforcer le prompt pour interdire tout autre schéma de sortie
- lister explicitement les seules clés autorisées
- préciser que toute réponse doit être un objet plat avec exactement les clés demandées
- interdire les clés “profil complet” type `objections_courantes`, `croyances_limitantes`, `declencheurs_achat`

Objectif :
```json
{
  "step_3a_objections": "...",
  "step_3b_cliches": "...",
  "step_4_beautiful": "...",
  "step_4_inspiring": "...",
  "step_4_repulsive": "...",
  "step_4_feeling": "...",
  "step_5_actions": "..."
}
```

### 2. Ajouter un garde-fou côté front si l’IA renvoie encore des alias
Fichier : `src/components/branding/BrandingFicheCards.tsx`

Dans `handleAutoFill` :

- garder le parsing actuel
- ajouter une normalisation des alias éventuels vers les vraies colonnes persona

Mapping prévu :

- `objections_courantes` → `step_3a_objections`
- `croyances_limitantes` → `step_3b_cliches`
- `declencheurs_achat` → `step_5_actions`
- `freins_achat` → `step_3a_objections` si le champ est encore vide
- `experience_ideale` → ne pas mapper automatiquement, sauf si on décide explicitement une correspondance
- `frustrations_profondes` → `step_1_frustrations`
- `objectif_principal` / `objectifs_secondaires` → `step_2_transformation` uniquement si utile

Comme ça :
- le backend devient correct
- et le front reste robuste si le modèle dérive encore

### 3. Rendre le diagnostic visible en cas d’échec
Toujours dans `BrandingFicheCards.tsx` :

- si la réponse IA existe mais qu’aucune clé exploitable n’est trouvée :
  - logguer les clés réellement reçues
  - afficher un toast plus honnête du type :
    - “L’IA a répondu, mais pas dans le format attendu”
- ne plus laisser croire à une complétion si seuls les pitchs ont été générés

### 4. Aligner aussi le même correctif dans le flow coaching
Fichier : `src/components/branding/BrandingCoachingFlow.tsx`

Le même parsing existe aussi là-bas pour `persona_fill`.

À corriger aussi pour éviter deux comportements différents :
- même normalisation des alias
- même logique de `validFills`
- même robustesse si le modèle renvoie un objet “persona complet” au lieu des clés DB

## Fichiers concernés

| Fichier | Changement |
|---|---|
| `supabase/functions/branding-coaching/index.ts` | prompt `persona_fill` plus strict, sortie JSON bornée aux clés DB attendues |
| `src/components/branding/BrandingFicheCards.tsx` | normalisation des alias IA, meilleur diagnostic, sauvegarde robuste |
| `src/components/branding/BrandingCoachingFlow.tsx` | appliquer la même normalisation dans le flow coaching |

## Validation

1. Sur la fiche persona, cliquer “Compléter les champs manquants avec l’IA”.
2. Vérifier que les 7 champs ciblés se remplissent réellement :
   - objections
   - croyances / clichés
   - ce qu’elle trouve beau
   - ce qui l’inspire
   - ce qui la rebute
   - ce qu’elle a besoin de ressentir
   - premières actions
3. Vérifier que le `PATCH persona` contient bien ces colonnes, pas seulement les pitchs.
4. Vérifier que si l’IA renvoie encore des alias, ils sont correctement remappés.
5. Vérifier que le flow coaching persona remplit les mêmes champs avec le même comportement.

## Risque

Faible.

- pas de migration base
- pas de changement de schéma
- le bug est un problème de contrat JSON entre frontend et backend IA
- le correctif consiste surtout à réaligner les clés et ajouter un fallback de mapping

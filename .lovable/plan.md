## Problème observé

Dans le carrousel **mixte**, l'IA propose une structure qui :

- N'utilise pas toutes les photos uploadées (certaines restent orphelines)
- Penche fortement vers les **slides texte** (résultat : carrousel "trop texte" qui perd l'intérêt du format mixte)

L'utilisatrice voit bien ses photos non utilisées dans le bandeau (avec un warning orange) mais doit cliquer manuellement pour les ajouter — ce qui n'est pas évident, et beaucoup ne le font pas.

## Cause racine

Dans `supabase/functions/carousel-ai/index.ts`, **deux endroits** permettent à l'IA d'écarter des photos et de pousser vers du texte :

### 1. Étape `structure_proposal` (ligne 303 — la cause principale)

L'instruction envoyée à Claude pour le mode mixte contient **textuellement** :

> *"Tu n'es PAS obligé·e d'utiliser toutes les photos."*

Cette phrase autorise explicitement l'IA à laisser des photos sur la touche. Combinée à l'absence de contrainte minimale sur la proportion photo/texte, l'IA tend à produire ~30-40 % de slides photo et ~60-70 % de slides texte.

### 2. Étape `mix_carousel` (ligne 1585 — règle ignorée car écrasée)

La règle inverse existe ici : *"CHAQUE photo uploadée doit être utilisée AU MOINS une fois"*. Mais elle arrive **trop tard** dans le flow : la `structure_proposal` a déjà fixé le nombre de slides photo en amont, et `mix_carousel` génère le contenu sur cette structure figée. La règle ne sert donc à rien dans le flow réel.

### 3. UX (mineur)

Le warning "X photos non utilisées" est visible mais discret (orange clair, pas de friction au clic "Continuer"). On peut valider la structure même avec des photos orphelines.

## Plan

### Étape 1 — Réécrire l'instruction `structure_proposal` mode mixte (impact principal)

Modifier `supabase/functions/carousel-ai/index.ts` ligne 303 (`photoInstruction` pour `isMixMode`) :

- **Supprimer** la phrase "Tu n'es PAS obligé·e d'utiliser toutes les photos."
- **Ajouter** des règles fortes :
  - "CHAQUE photo fournie DOIT être utilisée au moins une fois" (sauf si 8+ photos pour 7 slides — auquel cas dédoublonner les photos faibles, ne pas en supprimer) ça c'est pas obligatoire
  - "Cible : au minimum **50 % de slides photo** (photo_full ou photo_integrated). Le format mixte n'est pas un carrousel texte avec quelques photos décoratives — c'est un dialogue équilibré entre image et mot." alors ici relancer un plan pour qu'il y'ait des designs mieux avec des schémas etc. faut voir ce qui peut se faire mieux
  - &nbsp;
  - "Pour N photos, propose entre N et N+2 slides au total (pas plus). Le sweet spot : N photos + 1-2 slides texte clés (réflexion charnière, CTA)."
  - "Une slide texte se justifie SEULEMENT si elle apporte un contenu impossible à porter par une photo : chiffre/donnée, prise de position tranchée, transition narrative, CTA. Pas de slide texte 'parce qu'il en faut'."

### Étape 2 — Aligner les règles de composition `mix_carousel` (cohérence)

Modifier `supabase/functions/carousel-ai/index.ts` lignes 1582-1588 :

- Ajuster la fourchette : "Un carrousel de N photos devrait avoir N à N+2 slides au total" (au lieu de N à N+3 actuellement).
- Renforcer : "Au moins **50 % des slides** doivent être de type photo_full ou photo_integrated."
- Garder la règle existante "CHAQUE photo uploadée doit être utilisée AU MOINS une fois".

### Étape 3 — Friction UX douce sur photos orphelines

Modifier `src/components/creer/StructureReviewStep.tsx` :

- Quand `unusedPhotoIndices.length > 0` ET `carouselSubMode === "mix"` : à côté du bouton principal "Valider la structure", afficher une **micro-confirmation inline** ("Tu as N photo(s) non utilisée(s). Continuer quand même ?") avec deux options :
  - "Ajouter une slide pour chaque photo restante" (action préférée, en avant)
  - "Continuer sans ces photos" (action secondaire)
- Pas de modale bloquante — juste un nudge visible.

### Étape 4 — Vérification

- `tsc --noEmit` passe.
- Tester dans le preview avec un carrousel mixte 5 photos :
  - **Avant le fix** : structure proposée ~3 photo + 5 texte, 2 photos orphelines.
  - **Après le fix** : structure ~5 photo + 1-2 texte, 0 photo orpheline.
- Régression : carrousel mixte avec 10 photos → l'IA dédoublonne (utilise les meilleures 2x) plutôt que d'en écarter, on reste à 7-9 slides max.

## Hors-scope

- Pas de modification du flow `deepening_questions` (déjà traité au tour précédent).
- Pas de changement du mode "photo pur" ni du mode "texte pur".
- Pas de migration DB ni de changement de modèle.
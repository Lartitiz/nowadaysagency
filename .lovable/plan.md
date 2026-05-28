# Plus de photos pour les posts LinkedIn

## Contexte

Aujourd'hui le format LinkedIn dans "Créer un contenu → Partir des photos" est plafonné à **2 photos** parce qu'on a câblé le flux autour du cas "avant / après". Du coup quand tu uploades 6 photos d'un chantier, d'un événement ou d'une série, l'IA n'en voit que 2 et le post n'en parle pas.

LinkedIn accepte nativement jusqu'à **20 images** dans un post (mode "document/carrousel d'images"). On peut largement monter la limite côté outil.

## Ce que je propose

**Passer la limite LinkedIn à 10 photos** (sweet spot : ça couvre 99 % des usages réels — chantier, événement, série produit, avant/après — sans noyer l'IA dans 20 images à analyser, ce qui rallongerait beaucoup la génération et la facture tokens). On peut monter à 20 plus tard si besoin.

**Adapter automatiquement le ton du post selon le nombre de photos :**

| Nb photos | Mode narratif détecté |
|-----------|----------------------|
| 1 | Post mono-photo classique (scène unique) |
| 2 | Mode "avant / après" (déjà en place) |
| 3 à 10 | Mode "série / reportage" — l'IA structure le post comme un récit en plusieurs étapes, ou un carrousel narré (ex : "J1, J2, J3" pour un chantier, ou "les coulisses en 5 temps") |

## Détails techniques

1. **`CreerStepFormat.tsx`** : passer `maxPhotos={2}` à `maxPhotos={10}` pour le format `linkedin`. Mettre à jour le hint d'aide ("1 photo = scène, 2 = avant/après, 3+ = série/reportage").

2. **`use-content-generator.ts` + `CreerUnifie.tsx`** : retirer la troncature à 2 photos, envoyer jusqu'à 10 photos (base64 + contexte) à l'edge function.

3. **`supabase/functions/creative-flow/index.ts`** : étendre la logique du prompt vision LinkedIn :
   - 1 photo → prompt actuel mono-photo
   - 2 photos → prompt "avant/après" actuel
   - 3+ photos → nouveau prompt "série/reportage" qui demande à l'IA d'identifier le fil narratif commun et de structurer le post en conséquence (chronologie, étapes, angles complémentaires…)

4. **`CreerStepResult.tsx`** : adapter le badge Sparkles pour refléter le mode détecté :
   - "Généré à partir de ta photo"
   - "Généré à partir de tes 2 photos (mode avant / après)"
   - "Généré à partir de tes N photos (mode série)"

## Hors scope

- Le **publishing réel** vers LinkedIn (avec upload multi-images via l'API) reste hors scope ici — on touche uniquement à la génération du texte du post à partir des photos.
- Les autres formats (Instagram, carrousel, story…) gardent leurs limites actuelles.

## Question rapide avant de coder

10 photos max, ça te va ? Ou tu préfères qu'on monte direct à 20 (= la limite LinkedIn réelle) quitte à ce que la génération soit un peu plus lente sur les gros uploads ?

# Profondeur : carrousel TEXTE vs carrousel MIXTE — analyse comparative

## Verdict en 1 phrase

Le carrousel **texte** est construit pour **provoquer une bascule mentale** ("ah merde, j'avais jamais vu ça comme ça"). Le carrousel **mixte** est construit pour **raconter joliment une scène avec des photos**. Ce sont deux philosophies différentes — et c'est pour ça que tu sens la profondeur dans l'un mais pas dans l'autre.

## Ce que le mode TEXTE fait que le MIXTE ne fait pas

### 1. Un bloc "PROFONDEUR INTELLECTUELLE" obligatoire en amont

Le mode texte (via `buildExpressFullPrompt`, lignes 1195-1202) impose à l'IA d'analyser EN INTERNE 5 questions avant d'écrire la moindre slide :

```text
- Quel est le MESSAGE CENTRAL en 1 phrase ?
- Quel MÉCANISME INVISIBLE est en jeu ? (biais cognitif, conditionnement…)
- Quelle CROYANCE SOUS-JACENTE alimente le problème ?
- Quel RETOURNEMENT DE PERSPECTIVE ferait dire "j'avais jamais vu ça comme ça" ?
- Quelle DONNÉE ou RÉFÉRENCE crédibilise le propos ?
```

Et en plus, il importe le bloc partagé `DEPTH_LAYER` (`copywriting-prompts.ts` ligne 440) qui détaille comment ces 4 couches doivent apparaître DANS les slides finales.

→ **Le mixte n'a NI ce bloc d'analyse interne, NI le DEPTH_LAYER importé.** Il a un "ARC NARRATIF" générique (situation → tension → développement → résolution) mais aucune injonction à nommer un mécanisme, une croyance, ou un retournement.

### 2. Une exigence de DENSITÉ avec exemple concret

Mode texte (lignes 1296-1309) :

```text
Chaque slide doit contenir AU MOINS 1 de ces éléments :
- Une DONNÉE chiffrée sourcée
- Une ANALOGIE originale
- Un EXEMPLE CONCRET et spécifique
- Un MÉCANISME NOMMÉ (concept psycho/socio + auteur)
- Un VERBATIM réel ou vraisemblable

Exemple DENSE : "73% des comptes actifs publient 2-3 fois/semaine 
(Later 2024). Pas parce que la quantité compte. Parce que la régularité 
entraîne l'algorithme. C'est le biais de simple exposition (Zajonc)…"

Exemple GÉNÉRIQUE (refusé) : "La régularité est plus importante que 
la quantité. Publie quand tu as quelque chose à dire."
```

→ **Le mixte demande seulement** "1 exemple concret OU 1 analogie du quotidien dans le carrousel" (ligne 1658). Pas par slide. Pas de mécanisme. Pas d'auteur. Pas d'exemple contre-exemple pour calibrer.

### 3. Un TEST DE PROFONDEUR auto-appliqué par l'IA

Mode texte (`buildSlidesPrompt`, lignes 847-851) :

```text
TEST DE PROFONDEUR à appliquer à chaque slide AVANT de retourner le JSON :
- Si on peut remplacer le sujet par un autre et que la slide fonctionne 
  encore → GÉNÉRIQUE → RÉÉCRIS
- Si la slide dit ce que tout le monde sait déjà → RÉÉCRIS
- Si la slide pourrait être écrite sans expertise sur le sujet → RÉÉCRIS
```

→ **Le mixte n'a aucun test équivalent.** Le seul "test" qu'il applique (ligne 1684) c'est "les slides text_only ont toutes un body d'au moins 30 mots". C'est un test de quantité, pas de profondeur.

### 4. Un quality_check final qui mesure la densité

Mode texte (lignes 1407-1408) inclut dans le JSON de retour :
`"density_check": "chaque slide a au moins 1 élément de densité"`

→ Le mixte a un quality_check (lignes 1755-1766) qui compte le nombre de slides photo/texte, mais aucune dimension qualitative.

## Le résultat dans les sorties générées

| Critère | Mode TEXTE | Mode MIXTE |
|---|---|---|
| Mécanisme nommé (biais, concept) | Exigé ≥1× | Pas évoqué |
| Croyance sous-jacente formulée | Exigée explicitement | Pas évoquée |
| Retournement de perspective | "Moment fort du milieu" | Pas évoqué |
| Donnée chiffrée sourcée | Encouragée | Optionnelle |
| Exemple hyper-spécifique | Exigé par slide | "Au moins 1 dans tout le carrousel" |
| Test anti-générique | Oui, par slide | Non |
| Quality check de densité | Oui | Non |

## Pourquoi cette divergence existe

Historiquement, `buildMixCarouselPrompt` a été pensé comme un **carrousel photo enrichi de quelques slides texte**, avec une posture "directrice artistique éditoriale" (ligne 1593) — orienté composition visuelle, overlay, layouts. Toute l'attention va à la qualité formelle et à la cohérence photo↔texte.

`buildExpressFullPrompt` (le mode texte, ligne 1157) est lui pensé comme un **carrousel intellectuel** : posture analyste, sujet creusé, mécanique cognitive. Quand on a corrigé récemment la profondeur du mixte (ajout de DEPTH_LAYER dans `photoInstruction` de `structure_proposal`, ligne 330), on a modifié le prompt **de la phase structure** mais PAS le prompt **de la phase génération de contenu** (`buildMixCarouselPrompt`). Donc la structure proposée mentionne le mécanisme mais le contenu généré l'ignore.

## Recommandations

### 1. Importer le bloc d'analyse interne dans `buildMixCarouselPrompt`
Recopier le bloc "AVANT D'ÉCRIRE, analyse ce sujet en interne" (lignes 1195-1202) au début du prompt mixte, juste après le `channelBlock`. Coût : ~7 lignes de prompt. Bénéfice : l'IA arrive en zone d'écriture avec le mécanisme/croyance/retournement déjà identifiés.

### 2. Importer `DEPTH_LAYER` dans le mode mixte
Ajouter `${DEPTH_LAYER}` dans le prompt mixte (comme dans le mode texte ligne 658). Le bloc précise comment les 4 couches doivent apparaître DANS les slides finales — c'est l'injonction qui transforme l'analyse interne en sortie visible.

### 3. Renforcer la règle "QUAND UNE SLIDE TEXTE EST INDISPENSABLE"
Aujourd'hui (lignes 1619-1620) le mode mixte dit juste que les slides texte servent au "développement narratif, tips, prise de position, contexte, CTA". À enrichir : "elles doivent porter le mécanisme nommé, la croyance retournée, ou le moment de bascule. Si une slide texte n'est qu'un commentaire de la photo précédente, elle ne sert à rien — supprime-la ou réécris-la."

### 4. Ajouter le TEST DE PROFONDEUR par slide texte
Importer le test "si on peut remplacer le sujet par un autre…" (lignes 847-851) en l'appliquant spécifiquement aux slides `text_only` du mixte.

### 5. Étendre le quality_check du mixte
Ajouter dans le JSON de retour mixte :
- `mecanisme_nomme: true/false`
- `croyance_retournee: true/false`
- `slide_pivot_identifiee: numero_de_slide`

Force l'IA à vérifier que ces éléments existent avant de répondre.

## Hors scope (mais à noter)

- Le mode `photo` pur (`buildPhotoCarouselPrompt`) souffre du même angle "directrice artistique" sans profondeur — mais c'est cohérent avec l'usage (carrousel sensoriel/lifestyle). On ne le touche pas.
- Le mode "structure_proposal" pour le mixte (lignes 315-341) mentionne déjà DEPTH_LAYER → l'écart vient bien de la phase de génération de contenu.

## Fichiers à modifier (plan d'implémentation, pas exécuté)

- `supabase/functions/carousel-ai/index.ts` — `buildMixCarouselPrompt` (lignes 1533-1768) : ajouter bloc analyse interne + import DEPTH_LAYER + test de profondeur + quality_check étendu.
- `mem://preference/carousels` — noter que le mode mixte applique désormais DEPTH_LAYER au même niveau que le mode texte.

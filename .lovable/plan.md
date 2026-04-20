

## Refonte scripts Reels — profondeur de réflexion + monologue parlé

### Ce que tu veux vraiment

Pas juste rajouter des "alors", "tu vois", "en vrai" pour faire oral. Ça, c'est cosmétique. Tu veux ce qu'on a déjà dans les **carrousels** : une **vraie profondeur de pensée**, une réflexion qui creuse, qui amène une nuance, qui retourne le sujet. Et que cette profondeur soit dite **à l'oral**, comme tu parlerais à une amie en visio.

Donc deux exigences cumulées (pas l'une OU l'autre) :
1. **Profondeur** — niveau de réflexion comparable aux carrousels (couches, nuances, contre-pieds, mécanismes expliqués)
2. **Oralité** — tout ça dit comme un monologue face cam fluide, pas un essai lu à voix haute

### Ce qui manque aujourd'hui dans `reelBrief()`

Diagnostic après lecture des prompts (`format-briefs.ts > reelBrief` vs `carouselBrief`) :

| Critère | Carrousel | Reel actuel |
|---|---|---|
| Couches de réflexion exigées | Oui (règle "depth layer" : symptôme → mécanisme → reformulation) | Non |
| Nuance ou contre-pied obligatoire | Oui ("ajoute toujours un retournement ou une nuance") | Non |
| Profondeur thématique | "Va au bout de l'idée, ne raccourcis pas" | "2-4 phrases COMPLÈTES par section" → bride la profondeur |
| Mécanisme expliqué (le POURQUOI) | Oui | Non — le reel reste au niveau du symptôme |
| Anti-slogan | Oui ("pas de punchline plaquée, on déroule") | Non (au contraire, encourage les phrases qui claquent) |

Résultat : les scripts reels sonnent comme des **listicles filmés** ("constat → mini-conseil → CTA") sans jamais creuser le mécanisme sous-jacent. Aucune profondeur.

### La solution — fusionner profondeur (carrousel) + oralité (monologue)

#### 1. Importer la **règle de profondeur** des carrousels dans le brief reel

Ajouter en tête de `reelBrief()`, juste après la règle "UN REEL = UNE SEULE IDÉE", un bloc nouveau :

> **══ PROFONDEUR DE RÉFLEXION OBLIGATOIRE ══**
>
> Un reel n'est PAS une liste de constats filmée. C'est une réflexion qui CREUSE un sujet en 30-60s, comme une amie qui prend le temps de t'expliquer ce qu'elle a compris.
>
> **3 couches obligatoires dans le script** (peuvent se chevaucher entre sections) :
>
> 1. **LE SYMPTÔME** — ce qu'on observe, ce qui coince, le constat de surface (1 section, souvent le hook)
> 2. **LE MÉCANISME** — POURQUOI ça se passe comme ça : le rouage caché, le truc psychologique, la croyance de fond, la mécanique économique/sociale derrière (1-2 sections, le cœur du reel)
> 3. **LA REFORMULATION** — comment on regarde ça AUTREMENT, le déplacement de regard, la nuance, le contre-pied (1 section, souvent le CTA ou avant)
>
> **Test décisif** : si on enlève la couche "mécanisme", il reste un constat + un conseil = listicle. C'est cassé.

#### 2. Bannir le mode "listicle filmé" explicitement

> **CE QU'ON BANNIT (anti-listicle) :**
> - Sections juxtaposées qui énumèrent ("d'abord X, puis Y, puis Z") sans creuser le pourquoi
> - Conseil parachuté sans explication du mécanisme ("la solution c'est de faire X" → mais pourquoi ça marche ?)
> - Hook constat → body conseil → CTA. C'est plat. Il manque le "POURQUOI personne ne le voit".
> - Phrases qui sonnent comme des slogans LinkedIn ("Le secret c'est X", "Voilà la vérité")
> - Conclusion qui répète le hook au lieu de le retourner

#### 3. Marqueurs de profondeur orale (différents des marqueurs cosmétiques)

Au-delà des "alors", "tu vois", il faut des **marqueurs de réflexion en cours** qui signalent qu'on est en train de creuser :

> **MARQUEURS DE PROFONDEUR (utilise-en au moins 2) :**
> - Bascule de regard : "et en vrai, le truc qu'on voit pas c'est que...", "ce qu'il se passe vraiment c'est...", "le vrai problème c'est pas X, c'est Y"
> - Mécanisme révélé : "tu sais pourquoi ? parce que...", "ce qui se joue là-dessous c'est...", "la mécanique c'est..."
> - Contre-pied assumé : "sauf que...", "et c'est là que ça devient intéressant...", "en fait on s'est trompé d'endroit..."
> - Nuance honnête : "alors attention, je dis pas que...", "c'est pas aussi simple, mais..."
>
> Ces marqueurs ≠ remplisseurs. Ils introduisent une vraie idée nouvelle à chaque fois.

#### 4. Recalibrer la densité de mots vers le HAUT

Aujourd'hui : 150-300 mots pour 30-60s. Trop souple → l'IA tape souvent dans le bas (180-200 mots) → résultat squelettique.

Nouveau cadre :
- **Reel court (15-30s)** : 80-150 mots, mais la couche mécanisme reste obligatoire (en condensé)
- **Reel moyen (30-60s)** : **220-320 mots** (vs 150-300 avant — on remonte le plancher)
- **Reel long (60-90s)** : **350-500 mots**, profondeur pleine sur 3 couches étalées

Et règle : si tu es sous le plancher → **développe la couche "mécanisme"**, ne resserre pas le reste.

#### 5. Continuité orale entre sections (le levier oralité)

Garder ce qu'on avait prévu :
- Chaque section body commence par un connecteur qui enchaîne ("Et là...", "Sauf que...", "Le truc c'est que...")
- Pas de section autonome qu'on pourrait poster seule
- Hook + body 1 = paire question/réponse, pas 2 affirmations indépendantes

#### 6. Champ JSON `lecture_test` (auto-vérification)

Ajouter au schéma de sortie :
```json
"lecture_test": "Concatène ici tous les texte_parle dans l'ordre, sans coupure, comme un seul paragraphe. Doit pouvoir être lu d'une traite et contenir les 3 couches (symptôme, mécanisme, reformulation)."
```

Bénéfices :
- L'IA s'auto-vérifie en relisant
- Le rendu UI peut afficher cette version en haut → l'utilisatrice voit directement si la profondeur y est
- Test qualité immédiat

#### 7. Exemple AVANT / APRÈS dans le prompt (few-shot)

Ajouter dans `reelBrief()` un exemple verbatim qui montre la différence. Sujet : "tarifer ses prestations".

**AVANT (listicle filmé actuel)** :
> Hook : "Tu n'oses pas augmenter tes prix ?"
> Body 1 : "Tu te dis que tes clients vont fuir."
> Body 2 : "Mais en vrai, c'est l'inverse : les bons clients respectent les prix justes."
> CTA : "Augmente, tu verras."
> → 4 affirmations plates, aucun mécanisme expliqué.

**APRÈS (avec profondeur orale)** :
> Hook : "Tu sais le truc bizarre avec les prix ? On pense que c'est une question de calcul. C'est pas ça."
> Body 1 : "En vrai, quand tu galères à fixer tes tarifs, c'est rarement un problème de marché. Le marché il s'en fout, il s'aligne. Le truc c'est que TOI, tu te demandes en boucle si tu vaux ça. Et cette question-là, elle se voit dans ta voix au moment où tu annonces le prix."
> Body 2 : "Et c'est ÇA que les clients captent. Pas le chiffre. L'hésitation derrière le chiffre. Ils achètent ta certitude, pas ton tarif."
> CTA : "Donc avant de toucher à tes prix, regarde plutôt comment tu les dis. C'est là que tout se joue."
> → Symptôme (galère à tarifer) → Mécanisme (c'est l'hésitation perçue, pas le chiffre) → Reformulation (regarde comment tu les dis). Profondeur + oralité.

### Modifications UI

Dans `ReelResult.tsx` (le fichier que tu sélectionnes souvent), ajouter en haut un bloc **"📖 Lecture face cam"** qui affiche le `lecture_test` (monologue continu) AVANT le découpage section par section. Tu vois d'abord ce que tu vas LIRE, puis le découpage technique pour le tournage en dessous.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `supabase/functions/_shared/format-briefs.ts` | Refonte de `reelBrief()` : règle des 3 couches (symptôme/mécanisme/reformulation), anti-listicle, marqueurs de profondeur orale, recalibrage densité (220-320 mots cible), continuité entre sections, exemple AVANT/APRÈS, champ `lecture_test` (~+130 lignes) |
| `src/components/creer/formatRenderers/ReelResult.tsx` | Bloc "Lecture face cam" en haut affichant `lecture_test` (~+15 lignes) |
| `mem://preference/reels` | Mise à jour : ajouter règle "3 couches obligatoires" + "anti-listicle" pour que ça reste appliqué dans le futur |

### Ce qu'on NE touche PAS

- Découpage en sections (timing, overlay, cut, format_visuel) reste — utile pour le tournage
- Schéma JSON rétro-compatible (on ajoute `lecture_test`, on ne casse rien)
- Calendrier, sauvegarde, autres champs (`caption`, `hashtags`) — inchangés
- Autres formats (carrousel, stories, linkedin) — inchangés (le carrousel a déjà la profondeur, c'est le reel qui rattrape)

### Validation

1. Générer 2 reels sur `/creer` (un sujet "doute intérieur", un sujet "business/tarifs")
2. Lire à voix haute le `lecture_test` → doit sonner comme une vraie réflexion fluide, pas une lecture robotique
3. Vérifier que les 3 couches sont identifiables : symptôme + mécanisme + reformulation/contre-pied
4. Vérifier qu'on trouve au moins 2 marqueurs de profondeur ("le vrai truc c'est...", "ce qui se joue là-dessous...", "sauf que...")
5. Vérifier qu'on n'a PAS un format "constat → conseil → CTA" (= listicle = échec)
6. Densité parlée entre 220 et 320 mots pour un reel 30-60s

### Risque

Faible. Refonte de prompt + 1 champ JSON additionnel + 1 bloc UI optionnel + 1 update mémoire. Pas de migration DB, pas de changement d'edge function ni de routing. Si ça déplaît, revert d'1 fichier suffit.


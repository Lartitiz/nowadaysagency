# Plan — Profondeur, modèle Opus, et fix audience pour le Coach Contenu

## Réponses à tes questions

### 1. Quel modèle utilise actuellement le Coach Contenu ?

**Tu n'es PAS sur Opus.** Le code utilise `getModelForAction("coaching_light")` qui mappe sur **`claude-sonnet-4-5-20250929`** (cf. `_shared/anthropic.ts` ligne 27). Seul le coaching "lourd" (assistant chat, audit branding, stratégie) est sur **`claude-opus-4-6`** (Opus 4.6 = bien le dernier Opus de la famille 4.x).

Donc deux options :
- **Passer le Coach Contenu sur Opus 4.6** : raisonnement plus profond, distinction "audience que JE sers" vs "audience qui me ressemble" mieux gérée, analogies plus justes. Coût ~5x Sonnet, latence +3-5s.
- **Rester sur Sonnet et compenser par le prompt** : moins cher, plus rapide, mais le bug d'audience peut revenir si le prompt n'est pas blindé.

Recommandation : **bascule sur Opus 4.6** pour le Coach Contenu. C'est l'endroit où la justesse compte le plus (un mauvais hook démolit la confiance), et la latence supplémentaire est tolérable car c'est un acte volontaire de l'utilisatrice (elle attend un résultat travaillé, pas instant).

### 2. Pourquoi ça parlait d'agences de com alors que TU ES une agence ?

J'ai inspecté le contexte injecté (`formatContextForAI` + preset `content`). Le profil contient bien :
- `activite` (ce que tu fais)
- `type_activite` (statut / forme)
- `cible` (à qui tu parles)
- `persona` (cliente idéale détaillée)

Mais **rien dans le prompt actuel ne dit explicitement à l'IA "ne confonds pas TON métier avec TA cible"**. Quand `activite = "agence de communication"` et `cible = "petites marques de luxe"`, l'IA peut basculer dans des angles type "les agences font cette erreur" parce qu'elle pioche dans le champ le plus saillant (activite) au lieu de cibler `cible`.

C'est exactement le pattern miroir du fix précédent : "ne confonds pas l'utilisatrice avec sa cible".

### 3. Comment ajouter de la profondeur ?

Le Sonnet actuel produit du "tiède intelligent" : structures bien tournées mais idées de surface (les 3 erreurs, le top 5, le contre-pied facile). Pour aller plus profond :

**a) Modèle Opus** = capacité de raisonnement multi-étapes naturelle.

**b) Banir explicitement les structures "de surface"** dans le prompt :
- Plus de "Les 3 erreurs que…"
- Plus de "Top 5 / Top 3"
- Plus de "Voici pourquoi X marche / ne marche pas"
- Plus de "La vérité sur…"

**c) Imposer une "couche d'analyse" dans le brief** :
Chaque idée doit contenir DANS le brief :
- Soit une TENSION précise (pas une généralité : "le marché du luxe se massifie" → ok ; "la com est partout" → flou)
- Soit un MÉCANISME nommé (effet psychologique, dynamique de marché, biais perceptif)
- Soit une OBSERVATION DE TERRAIN (un détail vu chez ses propres clientes/dans son secteur)

**d) "Test de profondeur" avant sortie** : si l'idée tient en une punchline sans rien apprendre de neuf après le hook, elle est rejetée.

**e) Diversifier les angles éditoriaux par OBLIGATION explicite** : forcer 3 axes radicalement différents parmi : observation de terrain / contre-pied factuel / mécanisme nommé / micro-scène / archive personnelle / question ouverte sans réponse.

## Périmètre d'exécution

**1 fichier : `supabase/functions/content-coaching/index.ts`**

### Fix 1 — Bascule modèle vers Opus 4.6
Remplacer `getModelForAction("coaching_light")` par `getModelForAction("coaching")` (qui mappe déjà sur Opus). Une seule ligne.

### Fix 2 — Bloc "AUDIENCE vs UTILISATRICE" (anti-confusion)
Ajouter en haut du prompt, juste après la RÈGLE DE VÉRITÉ :
```
═══════════════════════════════════════════════
AUDIENCE vs UTILISATRICE — ne JAMAIS confondre
═══════════════════════════════════════════════
- L'utilisatrice EXERCE l'activité : ${activite}
- L'utilisatrice s'ADRESSE À : ${cibleTxt}
- Les idées parlent À ${cibleTxt}, PAS aux personnes qui exercent ${activite}.
- Si activite = "agence de communication" et cible = "petites marques de luxe" : 
  les hooks parlent AUX petites marques de luxe (leurs problèmes, leur quotidien, 
  leurs blocages), JAMAIS aux agences de com.
- Test : remplace mentalement le "tu/vous/on" du hook par le profil de la cible. 
  Si ça ne colle pas, l'angle est faux.
```

### Fix 3 — Bloc "PROFONDEUR" (anti-tiède)
Ajouter juste après le TEST DE VALIDITÉ :
```
═══════════════════════════════════════════════
EXIGENCE DE PROFONDEUR — anti-tiède
═══════════════════════════════════════════════
INTERDIT (structures de surface qui ont l'air malines mais n'apprennent rien) :
- "Les 3 erreurs que…", "Top 3 / Top 5 / Les 5 trucs…"
- "Voici pourquoi X marche", "La vérité sur Y", "Ce que personne ne dit sur Z"
- "Le piège du…", "Le mythe du…" sans démonstration concrète derrière
- Toute liste numérotée dans un hook

OBLIGATOIRE — chaque brief contient AU MOINS UN de ces 3 éléments :
1. Une TENSION précise et localisée (pas "le marché change" ; plutôt 
   "depuis [période/événement], dans [niche précise], on observe [phénomène 
   contradictoire]")
2. Un MÉCANISME nommé (biais cognitif identifié, dynamique de marché 
   spécifique, ressort psychologique précis) — et PAS juste invoqué : 
   expliqué dans le brief
3. Une OBSERVATION DE TERRAIN ancrée (un détail concret du secteur de 
   l'utilisatrice ou de sa cible — pas "j'ai remarqué que" générique, mais 
   "dans [contexte précis], [phénomène observable]")

TEST DE PROFONDEUR : si l'idée tient ENTIÈREMENT dans son hook (pas de 
révélation/argumentation à venir dans le contenu), elle est rejetée. 
Le hook doit OUVRIR sur quelque chose à dire, pas RÉSUMER l'idée.
```

### Fix 4 — Diversification forte des angles
Modifier la phrase qui demande "3 idées radicalement différentes" pour imposer un mix précis :
```
Les 3 idées doivent piocher dans 3 catégories DIFFÉRENTES parmi :
A. Observation de terrain ancrée (vu chez ses clientes / dans son secteur)
B. Mécanisme/biais nommé et décortiqué
C. Contre-pied factuel d'un conseil mainstream précis
D. Micro-scène / archive personnelle (un moment, un détail)
E. Question ouverte sans réponse (qui invite la cible à formuler la sienne)
F. Décryptage d'un mot/concept galvaudé du secteur
```

### Fix 5 — Ajuster temperature pour Opus
Opus tolère mieux une température un peu plus haute sans dériver. Garder 0.75 ou monter légèrement à 0.8. Je recommande 0.8 pour ne pas brider le côté créatif sur Opus.

## Hors périmètre (à valider plus tard)

- Propager Opus + ces blocs aux autres générateurs (carousel-ai, linkedin-ai). Commençons par valider l'effet sur content-coaching d'abord.
- Pas de changement frontend.

## Test après application

Re-générer 3 idées sur le profil "agence de communication s'adressant à petites marques de luxe" :
- ✅ Aucun hook ne doit s'adresser aux agences de com
- ✅ Aucun hook ne doit commencer par "Les 3 erreurs", "Top X", "La vérité sur"
- ✅ Chaque brief doit contenir une tension/mécanisme/observation NOMMÉE
- ✅ Aucun chiffre inventé ni faux retex
- ✅ Aucune marque géante citée comme modèle direct
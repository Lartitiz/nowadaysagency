# Plan — Améliorer la qualité des angles du Coach Contenu

## Diagnostic des 3 propositions ratées

Tu as cité :
1. **« Hermès ne poste pas sur Instagram et pourtant liste d'attente de 2 ans »** → référence d'une marque mastodonte non transposable à des PETITES marques de luxe. L'IA pioche un exemple "luxe" sans vérifier l'échelle ni la posture. En plus, ça véhicule un mépris des réseaux qui n'est PAS l'angle voulu pour quelqu'un qui justement les utilise.
2. **« J'ai viré 3 mots de mon vocabulaire, mes prix ont grimpé de 40% »** → storytelling avec chiffre inventé. C'est exactement le pattern "fake guru / faux retex" que ta marque de voix anti-slop bannit. L'IA a pondu un hook "qui marche en théorie" mais qui demande à mentir.
3. **« Les solopreneuses communiquent comme Netflix recommande. Résultat : personne ne clique »** → analogie qui ne tient pas (Netflix recommande très bien). L'IA force l'analogie pour cocher la case "comparaison inattendue" sans vérifier que le parallèle est juste.

### Causes racines dans le prompt actuel (`content-coaching/index.ts`)

| # | Cause | Impact |
|---|---|---|
| A | **Pas de garde-fou "vérité factuelle"** : le prompt encourage chiffres, retex, analogies (`CREATIVE_SEEDS`, `HOOK_STRUCTURES`) sans exiger que ce soit vrai/vérifiable. → hallucination de chiffres ("+40%"), faux storytelling. | Critique |
| B | **Pas de notion d'échelle / scale-match** : aucun cadrage sur "exemples de marques comparables à la cible" → l'IA cite Hermès, Patagonia, Netflix au lieu de petites marques. | Élevé |
| C | **Seeds créatifs forcent un angle même s'il ne tient pas** : "analogie cuisine/sport/jardinage", "parallèle film/série" → l'IA pond une analogie boiteuse plutôt que de dire "rien ne colle". | Élevé |
| D | **Pas de validation logique de l'analogie / du contre-pied** : aucun test "est-ce que ce contre-pied est vrai ou juste contrarian pour le buzz ?". → "Netflix recommande mal" alors que c'est faux. | Élevé |
| E | **L'objectif "surprise" prime sur la justesse** : "pas d'idées tièdes, des angles qui surprennent", température 0.9 → l'IA optimise le punch au détriment du fond. | Moyen |
| F | **Aucune injection de la cible/contre-cible précise** : `cible` et `audience` ne sont pas surfacés explicitement avec interdiction de contredire la posture (ici : pro-réseaux, petites marques). | Élevé |
| G | **`HOOK_STRUCTURES` poussent au "chiffre choc" et "contradiction"** sans vérification → favorise les retex inventés et les contre-pieds boiteux. | Élevé |

## Solutions proposées (ordonnées par impact)

### Fix 1 — Règle d'or "Vérité non négociable" (cause A, critique)
Ajouter en TÊTE du prompt un bloc dur : interdiction de chiffres inventés, de retex non factualisable, de citations ou exemples de marques non vérifiables. Si l'IA veut un chiffre, soit elle l'extrait du contexte branding (vrai retex de l'utilisatrice si présent), soit elle utilise une formulation qualitative ("nettement plus", "une majorité"), soit elle change d'angle.

```
RÈGLE DE VÉRITÉ (non négociable) :
- AUCUN chiffre inventé dans hooks/briefs ("+40% de prix", "3x plus de clients", "82% des gens"). 
  Si chiffre nécessaire : soit factuel et sourçable, soit reformulation qualitative.
- AUCUN faux retex à la 1re personne ("j'ai viré X et il s'est passé Y") sauf si 
  l'événement est attesté dans le contexte branding (story, retex, témoignage existant).
- AUCUN exemple de marque/personnalité qui contredit un fait vérifiable 
  ("Netflix recommande mal" → faux ; "Hermès ne fait pas de réseaux" → fausse simplification).
- En cas de doute : reformule en JE narratif générique sans chiffre, ou en observation 
  3e personne sans nommer de marque.
```

### Fix 2 — Scale-match et alignement de posture (causes B + F, élevé)
Injecter explicitement `cible` + `voix` + `combat_cause` AVANT le bloc créatif, et imposer une règle "exemples de marques cohérentes avec l'échelle de la cible".

```
ALIGNEMENT D'ÉCHELLE ET DE POSTURE :
- Cible de l'utilisatrice : ${cible}
- Si tu cites une marque/exemple, elle doit être de TAILLE COMPARABLE à la cible 
  (pas Hermès si la cible vise des petites marques de luxe ; pas Patagonia si solopreneuse).
- Exemples préférés : créateurs indépendants, petites marques de niche, artisanat, 
  studios de 1-10 personnes, success stories d'échelle humaine.
- INTERDIT : citer Hermès, LVMH, Apple, Netflix, Tesla, Patagonia, Glossier comme modèle 
  à imiter SAUF si l'angle est explicitement "ce que les géants font et qu'on peut 
  adapter à petite échelle" (et pas en hook seul).
- Ne JAMAIS contredire la posture de l'utilisatrice : si elle utilise les réseaux 
  pour vivre de son activité, ne pas pondre des angles type "les vraies marques 
  ne postent pas".
```

### Fix 3 — Garde-fou logique sur analogies et contre-pieds (causes C + D + G, élevé)
Avant de finaliser une idée qui contient une analogie, contradiction ou chiffre, l'IA doit passer un test interne explicité dans le prompt.

```
TEST DE VALIDITÉ (à appliquer sur chaque idée AVANT de la sortir) :
1. Si l'idée contient une ANALOGIE ("X est comme Y") → est-ce que Y fonctionne 
   vraiment de cette manière ? Si non, change d'analogie ou supprime-la.
2. Si l'idée contient un CONTRE-PIED ("contrairement à ce qu'on croit, X") → 
   est-ce que la croyance énoncée est vraiment répandue ET est-ce que le contre-pied 
   est vrai ? Si l'un des deux est faux, change d'angle.
3. Si l'idée contient un CHIFFRE → applique la RÈGLE DE VÉRITÉ ci-dessus.
4. Si l'idée contient un RETEX en JE → est-ce qu'il pourrait être vrai pour cette 
   personne précise (cohérent avec son parcours, son métier) ? Si non, reformule.
```

### Fix 4 — Assouplir les seeds créatifs (cause C, moyen)
Rendre les `CREATIVE_SEEDS` optionnels ("si l'angle s'y prête naturellement") plutôt qu'obligatoires ("Une idée DOIT…"). Ça évite que l'IA force une analogie boiteuse pour cocher la case.

```
- "Une idée DOIT utiliser une analogie cuisine/sport/jardinage" 
+ "Si l'angle s'y prête naturellement, une idée peut utiliser une analogie 
   avec la cuisine, le sport ou le jardinage. Sinon, ignore cette suggestion."
```

### Fix 5 — Rééquilibrer température + focus qualité (cause E, moyen)
Baisser légèrement la température (0.9 → 0.75) et changer la phrase d'ouverture du prompt pour mettre la JUSTESSE au même niveau que la SURPRISE.

```
- "Tu trouves THE idée qui fait dire 'c'est exactement ça que je veux poster'. 
   Pas d'idées tièdes. Des angles qui surprennent."
+ "Tu trouves THE idée qui fait dire 'c'est exactement ça que je veux poster'. 
   Surprenante MAIS juste. Une idée surprenante mais fausse, malhonnête ou 
   bancale est PIRE qu'une idée tiède : elle décrédibilise. Vise la justesse 
   d'abord, la surprise ensuite."
```

### Fix 6 — Mémoire projet (mem://preference/brand-voice)
Ajouter au memory existant une ligne anti-faux-retex et anti-exemples-géants pour que ça percole dans tous les modules de génération (pas que content-coaching).

## Périmètre d'exécution

**Backend uniquement, 1 fichier :**
- `supabase/functions/content-coaching/index.ts`
  - Insérer "RÈGLE DE VÉRITÉ" en haut du prompt (Fix 1)
  - Insérer "ALIGNEMENT D'ÉCHELLE" juste après le bloc CONTEXTE BRANDING (Fix 2)
  - Insérer "TEST DE VALIDITÉ" juste avant le bloc JSON de sortie (Fix 3)
  - Reformuler les `CREATIVE_SEEDS` en suggestions optionnelles (Fix 4)
  - Reformuler la phrase d'ouverture + baisser temperature 0.9 → 0.75 (Fix 5)

**Memory :**
- `mem://preference/brand-voice` : ajouter "Pas de faux retex en JE, pas de chiffres inventés, pas d'exemples de géants (Hermès, Apple, Netflix) sauf transposition explicite à petite échelle."

**Hors périmètre (à ne pas toucher) :**
- Frontend `ContentCoachingDialog.tsx` : la qualité vient du prompt, pas de l'UI.
- Autres edge functions de génération : on commence par valider l'effet sur content-coaching, puis on propagera si tu valides.

## Test après application

1. Re-générer 3 idées sur le même profil "petite marque de luxe" :
   - Aucun hook ne doit citer Hermès/LVMH/Apple comme modèle direct.
   - Aucun hook ne doit contenir un chiffre type "+40% de prix" non sourçable.
   - Aucun hook ne doit énoncer une fausseté factuelle ("Netflix recommande mal").
2. Si OK, propager les blocs RÈGLE DE VÉRITÉ + ALIGNEMENT D'ÉCHELLE + TEST DE VALIDITÉ en helper partagé `_shared/quality-guards.ts` pour les autres générateurs (carousel-ai, linkedin-ai, etc.) — ticket suivant.

## Question pour toi

Tu valides les 6 fixes en bloc, ou tu veux que je commence par les 3 critiques (Fix 1 + 2 + 3) pour mesurer l'effet avant de toucher température + seeds ?
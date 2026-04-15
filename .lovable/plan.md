

## Plan révisé : Anti-fabrication — version concise

### Le problème reste le même
L'IA invente des anecdotes quand l'utilisatrice n'en a pas fourni.

### La solution, en plus simple

**Fichier : `supabase/functions/creative-flow/index.ts`**

Une seule règle ajoutée dans le prompt `generate`, après le bloc des réponses utilisatrice :

```text
RÈGLE ANTI-FABRICATION :
N'invente JAMAIS une anecdote, un cas client ou un chiffre que l'utilisatrice n'a pas écrit.
Pas de vécu fourni → angle expert : décryptage, constat décalé, prise de position.
```

C'est tout. Deux lignes au lieu d'un pavé. Le self-check et l'anti-slop ne bougent pas : ils traquent déjà les patterns IA, pas besoin de les alourdir.

### Ce qui change
- 2 lignes ajoutées dans le prompt de génération de `creative-flow`

### Ce qui ne change pas
- Tout le reste


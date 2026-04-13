

## Plan : Renforcer la règle "hook en JE" dans le prompt Reel

### Constat
Le hook actuel du depth mandate Reel (ligne 424) dit juste "1 phrase max. TENSION." sans contrainte sur le point de vue narratif. L'IA génère donc parfois des hooks impersonnels ("Une com' complète en une minute chrono"). Les exemples ✅ existants utilisent déjà "Ma cliente..." ou "Je lui ai demandé..." mais il manque une règle explicite.

### Changement prévu

**Fichier** : `supabase/functions/creative-flow/index.ts`

**1. Ligne 424** — Enrichir la ligne hook :

Remplacer :
```
- Hook (0-3s) : texte à l'écran + ce que tu dis. 1 phrase max. TENSION.
```
Par :
```
- Hook (0-3s) : texte à l'écran + ce que tu dis. 1 phrase max. TENSION.
  PRÉFÉRENCE FORTE : commencer par "Je" ou "Ma/Mon" (vécu personnel).
  Le hook doit ancrer le spectateur dans une expérience, pas dans un concept.
  ❌ "Une com' complète en une minute" → ✅ "J'ai créé une com' complète en une minute"
```

**2. Ligne 488** — Ajouter un interdit :

Après `- Hook descriptif ("Aujourd'hui on va parler de...")`, ajouter :
```
- Hook impersonnel sans sujet humain ("Une stratégie simple", "3 étapes pour...")
```

### Ce qui ne change pas
- Les règles overlay / frame 1 / pattern interrupt
- Les exemples ❌/✅ existants (déjà cohérents avec cette règle)
- Le format JSON de sortie
- Aucun autre fichier

### Impact
~4 lignes ajoutées. Déploiement de la fonction `creative-flow`.


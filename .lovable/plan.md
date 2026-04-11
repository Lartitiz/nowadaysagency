

## Plan — Ajout règle 10 (Punchlines manufacturées) dans creative-flow

### Contexte
Le `correctionPrompt` LinkedIn (ligne ~1223-1226) contient 9 règles de correction. La règle 10 doit s'insérer entre la règle 9 (LONGUEUR EXCESSIVE, L1223-1226) et le bloc "RÈGLES :" (L1228).

### Modification unique

**Fichier** : `supabase/functions/creative-flow/index.ts`

Après la ligne 1226 (`→ Cible : 1300-1700 caractères...`) et avant la ligne vide + "RÈGLES :" (L1228), insérer le bloc suivant :

```
10. PUNCHLINES-FORMULES MANUFACTURÉES (phrases trop bien tournées qui sentent le copywriting) :
   → Détecte ces patterns :
   - Constructions parallèles trop propres ("X c'est pas Y. C'est Z." ou "Pas X. Pas Y. C'est Z.")
   - Mots-valises marketing ("bruit joli", "vitrine sans produit", "maison aux fondations bancales", "habiller un message")
   - Antithèses trop parfaites (impeccable/confus, beau/vide, structure/créativité)
   - Métaphores empruntées aux manuels (fondations, vitrine, squelette, ADN, pilier, socle)
   - Triple anaphore subtile ("habille un message qui existe déjà, amplifie ce qui est déjà compris, rend désirable ce qui est déjà clair")
   → Réécris en plus brut, plus parlé, moins "punchline".
   Exemple : "Un visuel impeccable avec un message confus, c'est juste du bruit joli."
   → "Un visuel parfait avec un message flou, ça reste flou. Le beau ne sauve pas le confus."
   Exemple : "La clarté c'est pas l'ennemi de la créativité. C'est sa condition."
   → "La clarté ne tue pas la créativité. Elle la rend possible."
```

### Rien d'autre ne change
- Règles 1-9 intactes
- Bloc "RÈGLES :" et structure JSON inchangés
- `carouselCorrectionPrompt` non touché
- Aucun autre fichier modifié

### Vérification
TypeScript check + grep pour confirmer la présence de la règle 10 et l'intégrité de la règle 9.


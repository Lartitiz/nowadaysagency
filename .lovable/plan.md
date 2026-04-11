

## Plan — Ajout règle 7 (Punchlines manufacturées) dans generate-content

### Modification unique

**Fichier** : `supabase/functions/generate-content/index.ts`

**Insertion** : Après la ligne 694 (`→ Supprimer le paragraphe le plus faible. Cible : 1300-1700 caractères.`) et avant la ligne 696 (`RÈGLES :`), ajouter le bloc suivant :

```
7. PUNCHLINES-FORMULES MANUFACTURÉES (phrases trop bien tournées qui sentent le copywriting) :
   → Détecte ces patterns :
   - Constructions parallèles trop propres ("X c'est pas Y. C'est Z." ou "Pas X. Pas Y. C'est Z.")
   - Mots-valises marketing ("bruit joli", "vitrine sans produit", "maison aux fondations bancales")
   - Antithèses trop parfaites (impeccable/confus, beau/vide)
   - Métaphores empruntées aux manuels (fondations, vitrine, squelette, ADN, pilier, socle)
   → Réécris en plus brut, plus parlé, moins "punchline".
   Exemple : "Un visuel impeccable avec un message confus, c'est juste du bruit joli."
   → "Un visuel parfait avec un message flou, ça reste flou. Le beau ne sauve pas le confus."
```

### Vérification
- `grep -c "PUNCHLINES-FORMULES MANUFACTURÉES"` → 1
- `grep -c "7\. PUNCHLINES"` → 1  
- `grep -c "6\. LONGUEUR EXCESSIVE"` → 1 (intact)
- Règles 1-6, bloc RÈGLES, structure try/catch inchangés


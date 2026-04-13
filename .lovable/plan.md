

## Plan : Calibrage durée Reel selon objectif (reach vs nurture)

### Fichier modifié
`supabase/functions/creative-flow/index.ts` — un seul fichier

### Contexte vérifié
- `effectiveObjective` est défini ligne 155 (valeurs : `visibilite`, `engagement`, `vente`, `credibilite`, ou null)
- Le depth mandate Reel se termine ligne 495 par `` - One-liners enchaînés sans lien narratif`; ``
- Ligne 496 : `} else if (isStories) {`

### Action
Remplacer les lignes 495-496 pour insérer entre la fin du depthMandate Reel et le bloc Stories :

1. Fermer la template string existante (inchangé)
2. Ajouter un bloc conditionnel `if (effectiveObjective === "visibilite")` qui concatène à `depthMandate` les contraintes format court (15-25s, 40-80 mots)
3. Ajouter un `else if` pour les 3 autres objectifs (engagement/vente/credibilite) qui concatène les contraintes format long (45-75s, 110-190 mots)
4. Si `effectiveObjective` est null ou autre valeur, le format standard 30-60s du depth mandate de base s'applique (pas de concaténation)

### Contenu inséré
Le bloc exact fourni par l'utilisateur, tel quel.

### Ce qui ne change PAS
- Le depthMandate Reel principal (lignes 386-495)
- Le `objectiveBlock` existant (lignes 154-168) — complémentaire, pas redondant
- Les autres formats (Stories, Carrousel, etc.)
- Le format JSON de sortie
- Aucun autre fichier

### Vérifications
- TypeScript compile sans erreur
- `grep "CALIBRAGE DURÉE"` retourne 2 occurrences (VISIBILITÉ + NURTURE)
- Déploiement de la Edge Function `creative-flow`


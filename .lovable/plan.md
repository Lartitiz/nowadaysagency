

## Plan : Ajouter le véhicule 5 "BUG CRÉATIF" à EMBEDDED_EDUCATION

### Fichier modifié
`supabase/functions/_shared/copywriting-prompts.ts` — un seul fichier

### Action
Insérer le bloc VÉHICULE 5 tel que fourni, après la ligne 584 (`Signal algorithmique : watch time élevé, saves, partages visuels.`) et avant le séparateur `═══` (ligne 586).

### Vérifications
- TypeScript compile sans erreur
- 5 véhicules présents dans EMBEDDED_EDUCATION
- Les 4 véhicules existants sont intacts
- Aucun autre fichier modifié
- Déploiement automatique via les imports existants

### Détails techniques
- Insertion pure entre lignes 585 et 586, aucune ligne existante modifiée
- Le bloc fait ~40 lignes avec lignes vides de formatage
- Pas de redéploiement nécessaire des Edge Functions — elles importent EMBEDDED_EDUCATION dynamiquement


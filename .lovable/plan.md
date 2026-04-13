

## Plan : Rollback correction pass dans carousel-ai

### Problème
Les 3 blocs `applyCorrectionPass` dans `carousel-ai/index.ts` cassent la structure JSON des carrousels → erreur "Session expirée" côté frontend.

### Modification
**Fichier** : `supabase/functions/carousel-ai/index.ts`

Commenter les 3 blocs correction (lignes 159-172, 221-234, 436-451) en les wrappant avec `// DISABLED` + `// TODO`, tout en gardant l'import intact.

- **Bloc 1 (L.159-172)** — mode mix
- **Bloc 2 (L.221-234)** — mode photo  
- **Bloc 3 (L.436-451)** — chemin partagé (express_full/slides/hooks)

Chaque bloc sera commenté ligne par ligne avec `//` préfixé.

### Vérifications
- `grep -c "DISABLED: Correction pass"` → 3
- `grep -c "await applyCorrectionPass"` → 0 (tous commentés)
- L'import reste en place pour réactivation future
- Aucun autre fichier touché


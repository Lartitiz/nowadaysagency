# La scène créée rejoint les photos de référence

## Ce qui ne va pas aujourd'hui
- Le Studio sait déjà joindre une image créée aux photos de référence. Mais il lui donne toujours le rôle « Inspiration », qui ne sert qu'à l'ambiance. Pour une scène, il faut au contraire que le décor soit conservé.
- Une scène qui vient d'être créée n'apparaît pas dans « Photos de référence ». Il faut penser à l'y mettre soi-même.
- L'arrêt de tout à l'heure venait d'un manque de mémoire, qui est déjà corrigé. Mais une scène jointe comme simple inspiration peut aussi donner des propositions qui ne gardent pas le décor.

## Ce qui change (sans ligne ni bouton en plus)
1. Dès qu'une scène est prête, elle entre automatiquement dans « Photos de référence » avec le rôle « Décor à conserver ».
2. Si tu joins toi-même une scène, elle prend aussi ce rôle. Les autres images créées gardent le rôle « Inspiration », comme aujourd'hui.
3. On peut toujours changer son rôle ou la retirer, comme les autres photos.
4. Rien n'est créé ni décompté : ta réponse produit toujours une proposition à confirmer.

## Hors périmètre
- Pas de nouvelle ligne ni de nouveau bouton.
- Pas de changement pour les crédits ni pour la création des images.
- Le site public n'est pas publié sans ta demande.

## Détails techniques
- `src/pages/VisualStudioPage.tsx`, dans `attachVersionAsReference` : utiliser `reference_role: "scene"` quand `version.proposal.scene_workflow?.phase === "scene"`, sinon `"style"`.
- Quand une version de phase `scene` passe à `ready`, appeler une fois `attachVersionAsReference` (garde par id de version, limite de 8 photos respectée). Garder la scène sélectionnée.
- Ajouter la tâche à `roadmap.md`, et un test dans `src/test/visual-studio.test.tsx` : la scène prête apparaît dans l'accordéon avec « Décor à conserver ». Lancer ensuite les tests du Studio et le typage.

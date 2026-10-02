# Studio : l'intégration du mannequin et de la bague n'a pas eu lieu

## Ce qui s'est passé (vérifié dans ta session)
- La dernière image (14:09) a bien été créée. C'est un fichier différent de la précédente, mais c'est une simple retouche de la scène.
- Elle a été traitée comme une **correction de la scène** et pas comme une **intégration**. Pendant l'étape « scène », tes photos originales restent de côté. Le créateur d'images n'a donc reçu que la scène et un texte : ni la photo du mannequin, ni celle de la bague. Il a renvoyé presque la même image.
- Le texte de la proposition annonçait pourtant l'intégration du visage et de la bague exacts. La proposition promettait donc une chose que la création ne pouvait pas faire.
- Les deux images d'avant (13:37 et 13:41) ont eu le même problème. Leur texte disait « Scène déjà intégrée », alors qu'aucune intégration n'avait été faite.
- Précision : ces images passent par Higgsfield (choix déjà en place pour les retouches photo), pas par ChatGPT. Ce n'est pas la cause.

## Cause
Quand tu réponds sur une scène sélectionnée et que l'assistant ne précise pas l'étape, le Studio reprend automatiquement l'étape de la scène, donc « scène ». Une demande d'intégration retombe ainsi en « correction de scène », sans tes photos originales.

## Correctif proposé
1. Si la demande porte sur une scène et vise à remplacer le visage ou le produit provisoires par tes originaux (mannequin, personne ou produit), elle passe en **intégration**. Tes photos originales sont alors envoyées avec la scène.
2. Garde-fou : une proposition ne peut plus annoncer « visage / bague exacts » si elle reste une simple correction de scène. Soit elle passe en intégration, soit son texte dit clairement qu'il s'agit seulement d'une correction de cadrage ou de pose.
3. Les vraies corrections de scène (pose, cadrage, lumière) restent inchangées. Elles continuent de garder tes originaux de côté.
4. Toujours une proposition à confirmer avant toute création. Rien n'est lancé ni décompté automatiquement, et les images déjà créées ne sont pas touchées.

## Détails techniques
- `supabase/functions/visual-studio/index.ts` (~1114-1119) : avant d'hériter de `parent.proposal.scene_workflow` (phase `scene`), passer à `phase: "integration"` quand le parent est une scène, que `operation` vaut `edit`/`product`, que la source est la scène sélectionnée et que `intent.change`/`targets` visent des références exactes (casting/person/product présentes dans `reference_use`) avec un remplacement d'identité ou de produit. Reprendre `targets` et `camera_match` du parent, et ajouter `scene_version_id`/`scene_path` = parent.
- Même règle quand l'assistant renvoie explicitement `phase=scene` + `edit` alors que `change` annonce une intégration exacte.
- `sceneInputs` reste inchangé : en phase `integration`, les originaux arrivent dans `references`/`reference_snapshot`. Vérifier que `reference_snapshot` n'est pas vide pour ce cas.
- Ajouter une règle dans `SCENE_METHOD` (scene-workflow.ts) : « remplacer le provisoire par l'original = phase integration ».
- Tests Deno dans `index_test.ts` : (a) réponse « intégrer mannequin + bague » sur une scène → integration, avec les originaux envoyés ; (b) « rapproche le cadrage » sur une scène → reste scene. Puis redéploiement ciblé de `visual-studio`, sans publier le site.

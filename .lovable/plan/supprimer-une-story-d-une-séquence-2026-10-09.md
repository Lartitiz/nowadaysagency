# Supprimer une story d'une séquence

## Ce que tu verras

Sur chaque carte de story (à côté de « Me filmer »), un petit bouton « Supprimer ». Un clic demande confirmation (« Supprimer la story 3 ? Cette action est définitive. »), puis la story disparaît et les suivantes se renumérotent toutes seules (Story 1, 2, 3…). L'aperçu, l'export images et l'export PowerPoint suivent la nouvelle liste.

## Règles de sécurité

- Impossible de supprimer la dernière story restante : le bouton est masqué quand il n'y a qu'une seule story (une séquence vide casserait les exports).
- La suppression passe par le même canal que toutes les autres modifications (`onStoriesUpdate`), donc le résultat sauvegardé dans le brouillon est à jour, comme quand tu modifies un texte.
- Si la story supprimée utilisait une photo de ta bibliothèque, la photo n'est pas touchée : elle reste disponible ailleurs.

## Détails techniques

- Fichier principal : `src/components/creer/formatRenderers/StoryResult.tsx`
  - Ajout d'un `removeStory(index)` : filtre la liste, appelle `onStoriesUpdate`, ferme le sélecteur de photo s'il visait cette story, toast de confirmation.
  - Bouton « Supprimer » (icône poubelle + mot, style discret) dans l'en-tête de carte, affiché seulement si `stories.length > 1`.
  - Confirmation via une petite boîte de dialogue (AlertDialog existant en shadcn), pas de suppression au premier clic.
- Aucun changement de numérotation à gérer : l'affichage (« Story {i+1} ») et les exports (`story_number: i + 1`) sont déjà calculés depuis la position dans la liste.
- Aucune modification côté serveur, aucune migration, aucun quota concerné (action purement locale).

## Tests

- Ajout de cas dans `src/test/story-result-editing.test.tsx` : suppression d'une story du milieu (renumérotation + remontée `onStoriesUpdate`), bouton absent sur une séquence d'une seule story, annulation de la confirmation.
- Lancement de la suite de tests stories existante + `tsc --noEmit` pour vérifier l'absence de régression.

## Hors périmètre

- Pas de « annuler » après confirmation (la régénération reste possible).
- Pas de réordonnancement des stories (demande séparée si tu le souhaites).

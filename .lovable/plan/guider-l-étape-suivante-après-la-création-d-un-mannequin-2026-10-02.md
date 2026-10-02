# Guider l'étape suivante après la création d'un mannequin

## Ce qui se passe aujourd'hui
Dans ta discussion, le Studio crée d'abord la planche du mannequin (visage, allure). Ensuite, il affiche seulement « Voilà l'image. Qu'est-ce que tu veux faire maintenant ? ». C'est donc toi qui dois penser à demander la scène avec la bague.

## Ce qui va changer
Quand l'image créée est une planche de mannequin, le chat affiche un message de suite clair, adapté à ta demande de départ :

> « Voilà ton mannequin. Prochaine étape : la photo portée, avec elle qui porte ta bague. Tu veux que je prépare la scène ? »

Juste dessous, trois petites réponses cliquables, dans le même style que les questions déjà présentes dans le chat :
- **Préparer la scène avec [nom du produit]** : envoie la demande pour toi. Le Studio prépare alors la proposition de scène, que tu confirmes comme d'habitude (rien n'est créé ni décompté sans ta confirmation).
- **Ajuster le mannequin** : place le curseur dans le champ avec « Modifie le mannequin : » pour que tu précises.
- **Le garder pour ma marque** : ouvre l'enregistrement du mannequin (remplace la phrase actuelle « Ce mannequin te plaît ? »).

Le nom du produit vient des photos jointes avec le rôle « produit » (ici, ta bague). S'il n'y en a pas, le texte dit « ton produit » et la réponse cliquable devient « Préparer la scène ».

Pour les autres images (scène, intégration, retouche), les messages actuels ne changent pas.

## Hors périmètre
- Aucun changement dans la façon dont les images sont créées, ni dans le décompte.
- Aucun lancement automatique : cliquer sur « Préparer la scène » produit seulement une proposition à confirmer.

## Détails techniques
- `src/pages/VisualStudioPage.tsx` : dans le calcul de `readyFollowUp`, nouveau cas quand `version.proposal.person_reference` existe, sans `scene_workflow` ou avec une phase autre que `scene`/`integration` (planche d'identité). Afficher les réponses cliquables (boutons `studio-link`/outline existants) dans le bloc `readyFollowUp` (ligne ~1193). « Préparer la scène » appelle `send()` avec un brouillon pré-rempli qui reprend le produit et la direction ; « Ajuster » prérenseigne `draft` et met le focus sur le champ ; « Garder » appelle `openCastingRef.current?.()`. Supprimer la phrase isolée « Ce mannequin te plaît ? » au-dessus du champ (ligne ~1516) pour éviter le doublon.
- Boutons désactivés si `!writable || busy || generating`.
- Tests dans `src/test/visual-studio.test.tsx` : la planche affiche les trois réponses ; « Préparer la scène » envoie `action: "message"` contenant le nom du produit ; une scène garde l'ancien message.
- Typage et tests du Studio. Frontend seulement : aucune fonction backend redéployée. Publication du site sur demande.

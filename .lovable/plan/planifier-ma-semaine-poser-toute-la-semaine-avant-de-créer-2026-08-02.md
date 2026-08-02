# « Planifier ma semaine » : poser toute la semaine avant de créer

## Le problème

Dans la fenêtre de coaching calendrier, les propositions (Mardi, Jeudi, Vendredi…) s'affichent bien toutes ensemble, mais dès que tu cliques sur « Créer ce contenu », la fenêtre se ferme et t'emmène dans le générateur : les autres jours proposés sont perdus. Résultat, on ne pose jamais la semaine entière — on part créer un seul contenu.

Deuxième irritant : le jour est imposé par l'IA. Si Mardi ne t'arrange pas, il n'y a aucun moyen de le déplacer avant l'ajout.

## Ma recommandation

Séparer clairement les deux temps : **1) je pose ma semaine → 2) je crée les contenus un par un**.

1. **Récap semaine en haut des résultats** — une petite bande Lun → Dim qui se remplit au fur et à mesure des ajouts (jour vide = point discret, jour posé = pastille rose avec l'emoji du format). On voit sa semaine se construire.
2. **Le jour devient modifiable** — la pastille « Mardi » de chaque carte devient un petit sélecteur (les 7 jours) avant l'ajout. Tu peux déplacer une idée sur jeudi si mardi est pris.
3. **« Tout ajouter à ma semaine »** en bouton principal, bien visible sous les cartes (aujourd'hui il n'existe pas ici, seulement dans le chat).
4. **« Créer ce contenu » ne ferme plus tout par surprise** — le bouton ajoute d'abord l'idée au calendrier si ce n'est pas déjà fait, puis prévient : la carte passe en « ✅ posé », et la création se lance depuis là. Un contenu créé n'est jamais perdu du planning.
5. **Barre de fin de parcours** — une fois au moins une idée posée : « 3 contenus posés cette semaine » + « Voir mon calendrier » + « Fermer ». On sort quand on a fini de planifier, pas quand on a cliqué une fois.

Le flux devient : je génère → j'ajuste les jours → je pose tout → je vais dans le calendrier créer chaque contenu quand je veux.

## Détails techniques

Un seul fichier concerné : `src/components/calendar/CalendarCoachingDialog.tsx` (bloc `{result && ...}`).

- Ajout d'un état `dayOverrides: Record<number, string>` ; `getNextDayDate` reçoit le jour choisi au lieu de `item.day`.
- Sélecteur de jour : `Popover` + liste des 7 jours, désactivé une fois la carte ajoutée.
- Bande récap : dérivée de `result.planning` + `addedItems` + `dayOverrides`, aucun appel réseau.
- `handleAddAll` : boucle sur les cartes non ajoutées en réutilisant `handleAddToCalendar` (garde `dropAlreadyPlanned` conservée, donc pas de doublons).
- `handleCreateContent` : `await handleAddToCalendar(...)` si pas déjà posé, puis navigation comme aujourd'hui.
- Aucun changement de schéma, d'edge function ni du prompt `calendar-coaching`.

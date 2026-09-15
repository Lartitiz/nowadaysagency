# F1 — continuité du brouillon de création

Correction préparée depuis `1c2421dbfb70d19a768d2a9eb305f6b85099927a` le 14 septembre 2026. Ce lot ne modifie ni GA4, ni les maquettes, ni le serveur. F2 assure seul la fusion et la publication combinées.

## Contrat de conservation

- La saisie du premier écran rejoint immédiatement le state du créateur et son stockage existant. Les textes exacts, y compris les champs vidés, survivent à une navigation, un rafraîchissement et une fermeture/réouverture d’onglet dans le même profil de navigateur.
- Le même stockage hybride reste utilisé : manifeste photo léger dans sessionStorage/localStorage par compte et espace ; octets locaux dans IndexedDB ; références de photothèque relues côté serveur. Aucun deuxième autosave ni nouveau schéma serveur.
- Sujet texte et sujet photo restent distincts. Le retour au texte conserve les photos et leur description ; retirer explicitement les photos persiste une liste vide. Les références momentanément indisponibles restent présentes, avec avertissement.
- Le canal demandé est conservé au retour sans paramètres. Les identifiants d’idée, brief, création, calendrier et les résultats structurés existants continuent de voyager avec le brouillon.
- Une nouvelle intention sur la route déjà montée passe par le dialogue de conflit. Le dialogue ne modifie pas l’identité du brouillon avant le choix. Les sauvegardes auxiliaires et leurs commandes, même conservées par un ancien callback, restent suspendues pendant ce choix. Le suivi d’un succès social déjà obtenu garde son contrat de reçu A3.
- « Reprendre » revient au même brouillon. Une nouvelle création explicitement choisie et le reset interne effacent l’ancien flux et ses identifiants. Les reçus de publication et médias Reel existants ne sont pas réimplémentés.
- Les callbacks de la visite précédente et les chargements photo tardifs ne peuvent pas réécrire la visite courante après A → B → A ou reset. Les effets photo se réarment correctement sous StrictMode.

## Mise de côté depuis le dialogue

La sauvegarde texte existante conserve maintenant la totalité du texte initial, au lieu du seul titre tronqué, et le canal. **Ce chemin ne sait pas archiver les médias d’un départ photo encore en préparation.** Il refuse donc de déclarer une sauvegarde complète et d’effacer le brouillon : l’utilisatrice peut reprendre sa préparation ou décocher explicitement l’enregistrement pour l’abandonner. Cela couvre aussi les photos à l’étape format/questions et les descriptions sans import. Aucun archivage photo serveur supplémentaire n’est revendiqué.

## Vérifications

Les tests montent les vrais `CreerUnifie`, `CreerStepIdea`, dialogue de conflit et hooks de persistance/calendrier. Authentification, génération et frontière d’acquisition photo sont des fixtures ; les étapes format/résultat ont des doubles pour isoler les transitions. Les suites existantes vérifient séparément formats, questions, édition, calendrier, idées et Reel.

Les trois reproductions initiales échouent sur main : premiers mots absents du stockage, brouillon historique `step=idea` effacé, texte vidé non persisté. Elles passent avec la correction. Les scénarios supplémentaires couvrent A → B → A, autre compte, initialisation différée, StrictMode, premier texte/vidage, canal, aller-retour, rafraîchissement/fermeture, reprise du dialogue, nouvelle intention, abandon explicite, reset interne, ancien résultat/IDs, photos/description, références manquantes et réponses tardives.

Chromium contrôlé à 1280 et 390 px : vrais écrans, vrai `window.location.replace`, navigation/reload, fermeture réelle de l’onglet, copie locale, restauration des octets IndexedDB, aucun plantage JS ni débordement horizontal. Les captures représentent la fixture, dont le sélecteur photo est simulé.

Limites : pas de recette authentifiée en production, de génération IA, d’upload serveur réel ni de publication sociale. La persistance locale dépend du profil de navigateur et de son stockage ; elle n’est pas une sauvegarde serveur ou entre appareils. Un stockage indisponible déclenche un avertissement. Une première suite globale locale a été interrompue sous contention ; F2 exécute la suite complète sur la combinaison des lots. Les journaux et preuves navigateur sont joints au reçu de coordination F1.

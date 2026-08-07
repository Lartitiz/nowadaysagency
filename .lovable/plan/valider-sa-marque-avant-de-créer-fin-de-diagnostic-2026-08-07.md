# Valider sa marque avant de créer (fin de diagnostic)

## Ce qui se passe aujourd'hui

À la fin du diagnostic d'onboarding, le bouton principal dit « ✨ Générer mon premier contenu ». Il n'envoie pourtant pas vers la création : la navigation passe déjà par l'écran de validation de la fiche de marque (`/branding?from=onboarding&next=creer`) quand une fiche captée attend d'être relue. Le bouton promet donc une chose et en fait une autre.

L'écran de bienvenue (`/welcome`) gère déjà correctement ce cas : son bouton devient « 📋 Valider ma fiche de marque » quand une fiche est en attente. Le diagnostic doit s'aligner.

## Ce qu'on change

Sur le dernier écran du diagnostic (bloc « Maintenant, tu sais d'où tu pars ») :

- Quand une fiche de marque attend une relecture :
  - Bouton principal : « 📋 Valider ce que j'ai capté sur ta marque »
  - Sous-texte : « Une minute de relecture, et tes contenus parleront vraiment de toi. »
  - Lien secondaire inchangé : « Découvrir mon espace d'abord → »
- Quand il n'y a pas de fiche en attente : le bouton reste « ✨ Générer mon premier contenu » (comportement actuel).
- Pendant la vérification (très courte), le bouton reste actif avec le libellé neutre — on ne bloque jamais le parcours.

Après validation de la fiche, l'enchaînement vers la première création est déjà en place (`next=creer`) : rien à changer de ce côté.

## Détails techniques

- Fichier : `src/components/onboarding/DiagnosticView.tsx`, composant `FinalSection`.
- Utiliser le hook existant `usePendingBrandReview({ pollMs: 5000 })` (même hook que `WelcomePage`) : l'enrichissement est asynchrone, la fiche peut arriver pendant la lecture du diagnostic, donc on poll jusqu'à la trouver.
- Le hook renvoie `pending: false` en mode démo, sans workspace ou en cas d'erreur réseau : aucun risque de bloquer une inscription.
- Aucune modification de la navigation (`handleDiagnosticComplete(true)` dans `use-onboarding.ts`) ni des edge functions.
